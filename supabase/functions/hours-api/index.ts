import { createClient } from 'jsr:@supabase/supabase-js@2';

const APP = 'horas-producao';
const URL_BASE = Deno.env.get('SUPABASE_URL')!;
const db = createClient(URL_BASE, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false }
});
const origins = new Set([
  'https://portal.livionsolutions.com.br',
  'https://revilorasec.github.io',
  'http://localhost:3000',
  'http://localhost:5173'
]);

function headers(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': origin && origins.has(origin) ? origin : 'https://portal.livionsolutions.com.br',
    'Access-Control-Allow-Headers': 'authorization,content-type',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json',
    'Vary': 'Origin'
  };
}
const reply = (origin: string | null, status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: headers(origin) });
const fail = (code: string): never => { throw new Error(code); };

async function access(req: Request) {
  const authorization = req.headers.get('authorization') || '';
  if (!/^Bearer [^ ]{20,9000}$/.test(authorization)) fail('UNAUTHENTICATED');
  const response = await fetch(`${URL_BASE}/functions/v1/portal-api/context`, {
    headers: { authorization },
    signal: AbortSignal.timeout(10000)
  });
  if (response.status === 401) fail('UNAUTHENTICATED');
  if (response.status === 403) fail('FORBIDDEN');
  if (!response.ok) fail('AUTH_UNAVAILABLE');
  const ctx = await response.json();
  if (!ctx?.authenticated || ctx.userType !== 'INTERNO' ||
      !Array.isArray(ctx.apps) || !ctx.apps.includes(APP) ||
      (!ctx.administrator && !ctx.companies?.includes('LIVION') && !ctx.companies?.includes('*'))) {
    fail('FORBIDDEN');
  }
  const actions = Array.isArray(ctx.actions) ? ctx.actions : [];
  const can = (action: string) => Boolean(ctx.administrator || actions.includes(action));
  if (!can(`${APP}.visualizar`)) fail('FORBIDDEN');
  return {
    email: String(ctx.user?.email || '').toLowerCase(),
    edit: can(`${APP}.editar`),
    archive: can(`${APP}.excluir`)
  };
}
function need(value: boolean) { if (!value) fail('FORBIDDEN'); }
function monthKey(value: unknown) {
  const month = String(value || '');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) fail('INVALID_MONTH');
  return month + '-01';
}
function dayKey(value: unknown, month: string) {
  const day = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !day.startsWith(month.slice(0, 7) + '-')) fail('INVALID_DAY');
  const date = new Date(day + 'T12:00:00Z');
  if (!Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== day ||
      date.getUTCDay() === 0) fail('INVALID_DAY');
  return day;
}
function uuid(value: unknown) {
  const result = String(value || '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result)) fail('INVALID_EMPLOYEE');
  return result;
}
function integer(value: unknown, max: number, code = 'INVALID_VALUE') {
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > max) fail(code);
  return Number(value);
}
function decimal(value: unknown) {
  const number = Number(value);
  if (value === '' || value === null || !Number.isFinite(number) || number < 0 || number > 24 ||
      Math.abs(number * 100 - Math.round(number * 100)) > 1e-7) fail('INVALID_HOURS');
  return number;
}
function note(value: unknown, max = 500) {
  if (typeof value !== 'string' || value.length > max) fail('INVALID_NOTE');
  return value.trim();
}
function name(value: unknown) {
  if (typeof value !== 'string') fail('INVALID_NAME');
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (!trimmed || trimmed.length > 120) fail('INVALID_NAME');
  return trimmed;
}
function revision(value: unknown) { return integer(value, 2147483646, 'INVALID_REVISION'); }
async function query(promise: any) {
  const result = await promise;
  if (result.error) throw result.error;
  return result.data;
}
async function audited(actor: string, action: string, target: string, detail: Record<string, unknown> = {}) {
  const result = await db.from('access_audit').insert({
    actor_email: actor, action, target, detail
  });
  if (result.error) console.error('hours-audit-failed', result.error.code);
}
async function employee(id: string, active = false) {
  let request = db.from('hours_employees').select('id,name,archived_at,revision').eq('id', id);
  if (active) request = request.is('archived_at', null);
  const row = await query(request.maybeSingle());
  if (!row) fail('EMPLOYEE_NOT_FOUND');
  return row;
}
async function saveVersioned(table: string, keys: Record<string, string>, values: Record<string, unknown>,
                             expected: number, actor: string) {
  const now = new Date().toISOString();
  if (expected === 0) {
    const result = await db.from(table).insert({
      ...keys, ...values, revision: 1, updated_at: now, updated_by: actor
    }).select('*').single();
    if (result.error?.code === '23505') fail('CONFLICT');
    if (result.error) throw result.error;
    return result.data;
  }
  let request = db.from(table).update({
    ...values, revision: expected + 1, updated_at: now, updated_by: actor
  }).eq('revision', expected);
  for (const [key, value] of Object.entries(keys)) request = request.eq(key, value);
  const result = await request.select('*').maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) fail('CONFLICT');
  return result.data;
}
async function bootstrap(month: string, permissions: any) {
  const end = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0))
    .toISOString().slice(0, 10);
  const [employees, settings, plans, entries, overtime] = await Promise.all([
    query(db.from('hours_employees').select('id,name,archived_at,revision').order('name')),
    query(db.from('hours_months').select('*').eq('month', month).maybeSingle()),
    query(db.from('hours_plans').select('*').eq('month', month).order('day')),
    query(db.from('hours_entries').select('*').eq('month', month).order('day')),
    query(db.from('hours_overtime').select('*').eq('month', month))
  ]);
  return {
    month: month.slice(0, 7), employees,
    settings: settings || {
      month, bonus_cents: 0, piece_cents: 0, weekday_hours: 0,
      saturday_hours: 0, revision: 0
    },
    plans, entries, overtime,
    permissions: { edit: permissions.edit, archive: permissions.archive },
    through: end
  };
}
async function impact(id: string) {
  await employee(id, true);
  const [entries, overtime] = await Promise.all([
    db.from('hours_entries').select('employee_id', { count: 'exact', head: true }).eq('employee_id', id),
    db.from('hours_overtime').select('employee_id', { count: 'exact', head: true }).eq('employee_id', id)
  ]);
  if (entries.error) throw entries.error;
  if (overtime.error) throw overtime.error;
  return { entries: entries.count || 0, overtime: overtime.count || 0 };
}
async function body(req: Request) {
  if (Number(req.headers.get('content-length') || 0) > 10000) fail('INVALID_BODY');
  try {
    const value = await req.json();
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_BODY');
    return value;
  } catch { return fail('INVALID_BODY'); }
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: headers(origin) });
  const path = new URL(req.url).pathname.replace(/^.*\/hours-api\/?/, '');
  if (req.method === 'GET' && path === 'health')
    return reply(origin, 200, { ok: true, service: 'hours-api', version: 1 });
  try {
    const actor = await access(req);
    const url = new URL(req.url);
    if (req.method === 'GET' && path === 'bootstrap') {
      return reply(origin, 200, await bootstrap(monthKey(url.searchParams.get('month')), actor));
    }
    if (req.method === 'GET' && /^employees\/[0-9a-f-]+\/impact$/i.test(path)) {
      need(actor.archive);
      return reply(origin, 200, await impact(uuid(path.split('/')[1])));
    }
    if (req.method === 'POST' && path === 'employees') {
      need(actor.edit);
      const input = await body(req);
      const result = await query(db.from('hours_employees').insert({
        name: name(input.name), created_by: actor.email, updated_by: actor.email
      }).select('id,name,archived_at,revision').single());
      await audited(actor.email, 'HOURS_EMPLOYEE_CREATE', result.id);
      return reply(origin, 201, result);
    }
    if (req.method === 'PATCH' && /^employees\/[0-9a-f-]+$/i.test(path)) {
      need(actor.edit);
      const id = uuid(path.split('/')[1]), input = await body(req);
      await employee(id, true);
      const expected = revision(input.revision);
      if (expected === 0) fail('INVALID_REVISION');
      const result = await query(db.from('hours_employees').update({
        name: name(input.name), revision: expected + 1,
        updated_at: new Date().toISOString(), updated_by: actor.email
      }).eq('id', id).eq('revision', expected).is('archived_at', null)
        .select('id,name,archived_at,revision').maybeSingle());
      if (!result) fail('CONFLICT');
      await audited(actor.email, 'HOURS_EMPLOYEE_RENAME', id);
      return reply(origin, 200, result);
    }
    if (req.method === 'DELETE' && /^employees\/[0-9a-f-]+$/i.test(path)) {
      need(actor.archive);
      const id = uuid(path.split('/')[1]), input = await body(req);
      await employee(id, true);
      const expected = revision(input.revision);
      if (expected === 0) fail('INVALID_REVISION');
      const counts = await impact(id);
      const result = await query(db.from('hours_employees').update({
        archived_at: new Date().toISOString(), revision: expected + 1,
        updated_at: new Date().toISOString(), updated_by: actor.email
      }).eq('id', id).eq('revision', expected).is('archived_at', null)
        .select('id,name,archived_at,revision').maybeSingle());
      if (!result) fail('CONFLICT');
      await audited(actor.email, 'HOURS_EMPLOYEE_ARCHIVE', id, counts);
      return reply(origin, 200, { ...result, preserved: counts });
    }
    if (req.method === 'PUT' && path === 'settings') {
      need(actor.edit);
      const input = await body(req), month = monthKey(input.month);
      const result = await saveVersioned('hours_months', { month }, {
        bonus_cents: integer(input.bonus_cents, 1000000000),
        piece_cents: integer(input.piece_cents, 100000000),
        weekday_hours: decimal(input.weekday_hours),
        saturday_hours: decimal(input.saturday_hours)
      }, revision(input.revision), actor.email);
      await audited(actor.email, 'HOURS_MONTH_SETTINGS', month);
      return reply(origin, 200, result);
    }
    if (req.method === 'PUT' && path === 'plan') {
      need(actor.edit);
      const input = await body(req), month = monthKey(input.month), day = dayKey(input.day, month);
      const result = await saveVersioned('hours_plans', { month, day }, {
        planned_hours: decimal(input.planned_hours)
      }, revision(input.revision), actor.email);
      await audited(actor.email, 'HOURS_DAY_PLAN', day);
      return reply(origin, 200, result);
    }
    if (req.method === 'PUT' && path === 'entry') {
      need(actor.edit);
      const input = await body(req), month = monthKey(input.month), day = dayKey(input.day, month);
      const id = uuid(input.employee_id);
      await employee(id, true);
      const result = await saveVersioned('hours_entries', { month, day, employee_id: id }, {
        actual_hours: decimal(input.actual_hours),
        pieces: integer(input.pieces, 100000),
        note: note(input.note)
      }, revision(input.revision), actor.email);
      await audited(actor.email, 'HOURS_DAY_ENTRY', id, { day });
      return reply(origin, 200, result);
    }
    if (req.method === 'PUT' && path === 'overtime') {
      need(actor.edit);
      const input = await body(req), month = monthKey(input.month), id = uuid(input.employee_id);
      await employee(id, true);
      const result = await saveVersioned('hours_overtime', { month, employee_id: id }, {
        amount_cents: input.amount_cents === null ? null : integer(input.amount_cents, 1000000000),
        note: note(input.note)
      }, revision(input.revision), actor.email);
      await audited(actor.email, 'HOURS_OFFICIAL_OVERTIME', id, { month, informed: result.amount_cents !== null });
      return reply(origin, 200, result);
    }
    return reply(origin, 404, { error: 'NOT_FOUND' });
  } catch (error) {
    const code = (error as { code?: string })?.code === '23505' ? 'CONFLICT' :
      error instanceof Error ? error.message : 'ERROR';
    const status = code === 'UNAUTHENTICATED' ? 401 : code === 'FORBIDDEN' ? 403 :
      code === 'CONFLICT' ? 409 : code.startsWith('INVALID_') || code === 'EMPLOYEE_NOT_FOUND' ? 400 :
      code === 'AUTH_UNAVAILABLE' ? 503 : 500;
    if (status === 500) console.error('hours-api-error', error);
    return reply(origin, status, { error: status === 500 ? 'SERVER_ERROR' : code });
  }
});
