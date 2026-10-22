import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { monthDays, plannedHours, closing, teamClosing, comparison } from '../lib/hours-calculations.mjs';

const days = monthDays('2026-07');
const empty = new Map();
const config = { bonus_cents: 50000, piece_cents: 200, weekday_hours: 0, saturday_hours: 0 };
const official = { amount_cents: 15000 };

test('fecha o exemplo do usuário em centavos exatos', () => {
  // A programação diária tem limite de 24 h no banco; 74 h são distribuídas em quatro dias.
  const overrides = new Map([['2026-07-01', 20], ['2026-07-02', 20], ['2026-07-03', 20], ['2026-07-04', 14]]);
  const entries = new Map([
    ['gian|2026-07-01', { actual_hours: 20, pieces: 18 }],
    ['gian|2026-07-02', { actual_hours: 20, pieces: 18 }],
    ['gian|2026-07-03', { actual_hours: 20, pieces: 18 }],
    ['gian|2026-07-04', { actual_hours: 10, pieces: 0 }]
  ]);
  const value = closing('gian', days, config, overrides, entries, official);
  assert.deepEqual([value.planned, value.actual, value.pieces], [74, 70, 54]);
  assert.deepEqual([value.bonus, value.production, value.subtotal, value.official, value.total], [47297, 10800, 58097, 15000, 73097]);
});

test('não limita bônus acima de 100% e diferencia extra pendente de zero confirmado', () => {
  const overrides = new Map([['2026-07-01', 5]]);
  const entries = new Map([['a|2026-07-01', { actual_hours: 6, pieces: 1 }]]);
  const pending = closing('a', days, config, overrides, entries, null);
  const zero = closing('a', days, config, overrides, entries, { amount_cents: 0 });
  assert.equal(pending.bonus, 60000);
  assert.equal(pending.total, null);
  assert.ok(pending.pending.includes('Aguardando valor do contador'));
  assert.equal(zero.total, 60200);
  assert.equal(zero.official, 0);
  assert.equal(teamClosing([pending, zero]).complete, false);
});

test('mês sem horas previstas fica parcial; sábado pode ser ajustado e domingo nunca entra', () => {
  const july = monthDays('2026-07');
  const overrides = new Map([['2026-07-04', 6], ['2026-07-05', 8]]);
  assert.equal(plannedHours(july[3], config, overrides), 6);
  assert.equal(plannedHours(july[4], config, overrides), 0);
  const entries = new Map([['a|2026-07-05', { actual_hours: 8, pieces: 10 }]]);
  const value = closing('a', july, config, empty, entries, { amount_cents: 0 });
  assert.equal(value.planned, 0);
  assert.equal(value.actual, 0);
  assert.equal(value.pieces, 0);
  assert.equal(value.total, null);
  assert.equal(monthDays('2028-02').length, 29);
  assert.equal(monthDays('2027-02').length, 28);
});

test('peças sem horas recebem alerta e não entram na produtividade; grupo usa média ponderada', () => {
  const overrides = new Map([['2026-07-01', 4]]);
  const entries = new Map([
    ['a|2026-07-01', { actual_hours: 2, pieces: 8 }],
    ['b|2026-07-01', { actual_hours: 4, pieces: 4 }],
    ['c|2026-07-01', { actual_hours: 0, pieces: 5 }]
  ]);
  const results = ['a', 'b', 'c'].map(id => closing(id, days, config, overrides, entries, { amount_cents: 0 }));
  assert.equal(results[2].productivity, null);
  assert.equal(results[2].piecesWithoutHours, 5);
  assert.equal(comparison(results).groupProductivity, 2);
  assert.equal(comparison(results).piecesWithoutHours, 5);
  assert.equal(comparison(results, 3).groupProductivity, 1);
  assert.equal(closing('a', days, config, overrides, entries, official, 1).pieces, 8);
});

test('bônus e valor por peça são compartilhados, sem dividir o bônus entre pessoas', () => {
  const overrides = new Map([['2026-07-01', 4]]);
  const entries = new Map([
    ['a|2026-07-01', { actual_hours: 4, pieces: 2 }],
    ['b|2026-07-01', { actual_hours: 2, pieces: 1 }]
  ]);
  const a = closing('a', days, config, overrides, entries, { amount_cents: 0 });
  const b = closing('b', days, config, overrides, entries, { amount_cents: 0 });
  assert.equal(a.bonus, 50000);
  assert.equal(b.bonus, 25000);
  assert.equal(a.production, 400);
  assert.equal(b.production, 200);
});

test('app usa sessão do Portal, armazenamento remoto e arquivamento com histórico', () => {
  const ui = readFileSync(new URL('../horas-producao.js', import.meta.url), 'utf8');
  const api = readFileSync(new URL('../supabase/functions/hours-api/index.ts', import.meta.url), 'utf8');
  const schema = readFileSync(new URL('../supabase/migrations/20261022170000_hours_production_payments.sql', import.meta.url), 'utf8');
  assert.match(ui, /__PORTAL_GET_TOKEN__/);
  assert.doesNotMatch(ui, /localStorage|sessionStorage/);
  assert.match(api, /portal-api\/context/);
  assert.match(api, /archived_at:/);
  assert.doesNotMatch(api, /from\('hours_employees'\)\.delete/);
  assert.match(schema, /amount_cents integer check/);
  assert.match(schema, /revoke all on public\.hours_employees/);
});
