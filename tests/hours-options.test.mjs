import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { closing, monthDays } from '../lib/hours-calculations.mjs';
import { simulateOptions } from '../lib/hours-simulation.mjs';

test('opção ativa usa apenas o valor escolhido, mantém o anterior e distingue zero de pendência', () => {
  const days = monthDays('2026-10'), settings = { bonus_cents: 50000, piece_cents: 200, weekday_hours: 2, saturday_hours: 8 };
  const official = { amount_cents: 77700, mon_sat_cents: 200000, mon_fri_cents: 100000, saturday_cents: 0 };
  const entries = new Map(days.filter(day => day.weekday > 0 && day.weekday < 6).map(day => [`a|${day.date}`, { actual_hours: 2, pieces: 1 }]));
  assert.equal(closing('a', days, settings, new Map(), entries, official).official, 77700);
  const weekday = closing('a', days, settings, new Map(), entries, { ...official, active_option: 'mon_fri' });
  assert.equal(weekday.official, 100000);
  assert.equal(weekday.bonus, 50000);
  assert.equal(weekday.total, 150000 + weekday.pieces * 200);
  assert.equal(closing('a', days, settings, new Map(), entries, { ...official, active_option: 'saturday' }).official, 0);
  const pending = closing('a', days, settings, new Map(), entries, { ...official, active_option: 'mon_sat', mon_sat_cents: null });
  assert.equal(pending.official, null);
  assert.equal(pending.total, null);
  assert.equal(official.amount_cents, 77700);
});

test('simulação separa os dias das três opções e não modifica configurações ou registros', () => {
  const days = monthDays('2026-10'), settings = { bonus_cents: 50000, piece_cents: 200, weekday_hours: 2, saturday_hours: 8 };
  const entries = new Map(days.filter(day => day.weekday).map(day => [`a|${day.date}`, { actual_hours: day.weekday === 6 ? 8 : 2, pieces: 1 }]));
  const rates = { mon_sat_cents: 200000, mon_fri_cents: 100000, saturday_cents: 50000 };
  const before = JSON.stringify({ settings, rates, entries: [...entries] });
  const results = simulateOptions('a', days, settings, new Map(), entries, rates);
  assert.deepEqual(results.map(row => row.bonus), [50000, 50000, 50000]);
  assert.equal(results[0].pieces, results[1].pieces + results[2].pieces);
  for (const row of results) assert.equal(row.total, row.official + 50000 + row.pieces * 200);
  assert.equal(JSON.stringify({ settings, rates, entries: [...entries] }), before);
});

test('API real atualiza só o campo enviado e rejeita revisão antiga sem apagar os outros valores', async () => {
  const id = '11111111-1111-4111-8111-111111111111';
  let record = { employee_id: id, month: '2026-10-01', amount_cents: 77700, mon_sat_cents: null, mon_fri_cents: null, saturday_cents: null, active_option: null, note: 'Preservar', revision: 1 };
  class Query {
    constructor(table) { this.table = table; this.filters = {}; }
    select() { return this; } eq(key, value) { this.filters[key] = value; return this; } is() { return this; }
    insert(values) { this.operation = 'insert'; this.values = values; return this; }
    update(values) { this.operation = 'update'; this.values = values; return this; }
    run() {
      if (this.table === 'hours_employees') return { data: { id, archived_at: null }, error: null };
      if (this.table === 'access_audit') return { data: null, error: null };
      if (this.operation === 'update' && Object.entries(this.filters).some(([key, value]) => record[key] !== value)) return { data: null, error: null };
      if (this.operation) record = { ...record, ...this.values };
      return { data: { ...record }, error: null };
    }
    maybeSingle() { return Promise.resolve(this.run()); } single() { return this.maybeSingle(); }
    then(resolve) { return Promise.resolve(this.run()).then(resolve); }
  }
  let handler;
  const context = vm.createContext({ createClient: () => ({ from: table => new Query(table) }),
    Deno: { env: { get: () => 'https://example.test' }, serve: callback => { handler = callback; } },
    fetch: async () => new Response(JSON.stringify({ authenticated: true, userType: 'INTERNO', apps: ['horas-producao'], administrator: true, user: { email: 'test@example.test' } })),
    Response, Request, URL, AbortSignal, console });
  const source = readFileSync(new URL('../supabase/functions/hours-api/index.ts', import.meta.url), 'utf8').replace(/^import[^\n]+\n/, '');
  vm.runInContext(stripTypeScriptTypes(source), context);
  const call = async body => {
    const response = await handler(new Request('https://example.test/functions/v1/hours-api/overtime', { method: 'PUT', headers: { authorization: 'Bearer ' + 'x'.repeat(30), 'content-type': 'application/json' }, body: JSON.stringify({ month: '2026-10', employee_id: id, ...body }) }));
    return { status: response.status, body: await response.json() };
  };
  assert.equal((await call({ revision: 1, mon_sat_cents: 200000 })).status, 200);
  assert.equal((await call({ revision: 2, mon_fri_cents: 100000 })).status, 200);
  assert.equal((await call({ revision: 3, active_option: 'mon_fri' })).status, 200);
  assert.deepEqual([record.amount_cents, record.mon_sat_cents, record.mon_fri_cents, record.note], [77700, 200000, 100000, 'Preservar']);
  const before = { ...record };
  assert.equal((await call({ revision: 1, mon_sat_cents: null })).status, 409);
  assert.deepEqual(record, before);
  assert.equal((await call({ revision: 4, active_option: 'invalid' })).status, 400);
  assert.deepEqual(record, before);
});

test('PostgreSQL preserva valores anteriores na migração e registra alterações com histórico protegido', async () => {
  const { PGlite } = await import(pathToFileURL(resolve(import.meta.dirname, '../../../EXPEDIÇÃO E ROMANEIOS/Testes-Runtime/node_modules/@electric-sql/pglite/dist/index.js')));
  const db = new PGlite();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
    const base = readFileSync(new URL('../supabase/migrations/20261022170000_hours_production_payments.sql', import.meta.url), 'utf8').split('insert into public.portal_apps')[0];
    await db.exec(base);
    const id = (await db.query("insert into public.hours_employees(name,created_by,updated_by) values('Técnico fictício','test','test') returning id")).rows[0].id;
    await db.query("insert into public.hours_overtime(employee_id,month,amount_cents,note,updated_by) values($1,'2026-10-01',77700,'Preservar','test')", [id]);
    await db.exec(readFileSync(new URL('../supabase/migrations/20261022223325_hours_official_options_history.sql', import.meta.url), 'utf8'));
    await db.exec('set role service_role;');
    assert.equal((await db.query('select amount_cents from public.hours_overtime')).rows[0].amount_cents, 77700);
    await db.query('update public.hours_overtime set mon_sat_cents=200000,revision=2 where employee_id=$1', [id]);
    const history = (await db.query("select old_row,new_row from public.hours_record_history where operation='UPDATE'")).rows[0];
    assert.equal(history.old_row.amount_cents, 77700);
    assert.equal(history.new_row.amount_cents, 77700);
    assert.equal(history.new_row.mon_sat_cents, 200000);
    await assert.rejects(() => db.query('delete from public.hours_record_history'), /permission denied/);
    await db.exec('reset role; set role anon;');
    await assert.rejects(() => db.query('select * from public.hours_record_history'), /permission denied/);
    await assert.rejects(() => db.query('select * from public.hours_overtime'), /permission denied/);
  } finally { await db.close(); }
});
