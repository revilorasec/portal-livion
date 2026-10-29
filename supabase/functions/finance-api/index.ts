import { createClient } from 'jsr:@supabase/supabase-js@2.57.4';

const APP = 'painel-financeiro', MAX_BYTES = 12 * 1024 * 1024;
const BASE = Deno.env.get('SUPABASE_URL')!;
const db = createClient(BASE, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const ORIGIN = 'https://portal.livionsolutions.com.br';
function headers() {
  return { 'Access-Control-Allow-Origin': ORIGIN, 'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'authorization,content-type,x-snapshot-date,x-snapshot-sha256',
    'Access-Control-Expose-Headers': 'x-snapshot-sha256,x-snapshot-date',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Cache-Control': 'private, no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'" };
}
function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers(), 'Content-Type': 'application/json' } });
}
const fail = (code: string): never => { throw new Error(code); };
async function access(req: Request) {
  const authorization = req.headers.get('authorization') || '';
  if (!/^Bearer [^\s]{20,9000}$/.test(authorization)) fail('UNAUTHENTICATED');
  const response = await fetch(`${BASE}/functions/v1/portal-api/context`, {
    headers: { authorization }, signal: AbortSignal.timeout(15000), cache: 'no-store'
  });
  if (response.status === 401) fail('UNAUTHENTICATED');
  if (response.status === 403) fail('FORBIDDEN');
  if (!response.ok) fail('AUTH_UNAVAILABLE');
  const ctx = await response.json();
  // Existing global administrator rule only. No implicit finance/payroll grants.
  if (ctx?.authenticated !== true || ctx.administrator !== true || ctx.profile !== 'ADMINISTRADOR' ||
      ctx.userType !== 'INTERNO' || !Array.isArray(ctx.apps) || !ctx.apps.includes(APP) ||
      !ctx.user?.email) fail('FORBIDDEN');
  return ctx;
}
async function boundedBody(req: Request) {
  if (Number(req.headers.get('content-length') || 0) > MAX_BYTES) fail('TOO_LARGE');
  if (!req.body) fail('INVALID_SNAPSHOT');
  const reader = req.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) { await reader.cancel(); fail('TOO_LARGE'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}
async function digest(bytes: Uint8Array) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), x => x.toString(16).padStart(2, '0')).join('');
}
async function latest(includeHtml = false) {
  const result = await db.from('finance_snapshots')
    .select(includeHtml ? 'sha256,snapshot_date,byte_length,imported_at,html' : 'sha256,snapshot_date,byte_length,imported_at')
    .order('snapshot_date', { ascending: false }).order('imported_at', { ascending: false }).limit(1).maybeSingle();
  if (result.error) fail('DATA_UNAVAILABLE');
  return result.data;
}
Deno.serve(async (req: Request) => {
  if (req.headers.get('origin') && req.headers.get('origin') !== ORIGIN) return json(403, { error: 'FORBIDDEN' });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: headers() });
  try {
    const path = new URL(req.url).pathname.split('/finance-api')[1] || '/';
    if (path === '/health' && req.method === 'GET') return json(200, { service: 'finance-api', version: 1 });
    const ctx = await access(req);
    if (path === '/access' && req.method === 'GET') return json(200, { authorized: true, canImport: true });
    if (path === '/snapshot' && req.method === 'GET') {
      const row = await latest(true);
      if (!row) return json(404, { error: 'NO_SNAPSHOT' });
      return new Response(row.html, { headers: { ...headers(), 'Content-Type': 'text/plain; charset=utf-8',
        'X-Snapshot-Sha256': row.sha256, 'X-Snapshot-Date': row.snapshot_date } });
    }
    if (path === '/snapshots' && req.method === 'POST') {
      if (!(req.headers.get('content-type') || '').startsWith('text/html')) fail('INVALID_SNAPSHOT');
      const date = req.headers.get('x-snapshot-date') || '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date + 'T12:00:00Z')) || new Date(date + 'T12:00:00Z').toISOString().slice(0, 10) !== date) fail('INVALID_DATE');
      const expected = req.headers.get('x-snapshot-sha256') || '';
      if (!/^[a-f0-9]{64}$/.test(expected)) fail('INVALID_HASH');
      const bytes = await boundedBody(req), sha256 = await digest(bytes);
      if (sha256 !== expected) fail('HASH_MISMATCH');
      const html = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      if (!/^\s*<!doctype html/i.test(html) || !html.includes('dashboard:4d7a3151-8d62-4c70-9031-e1bc4e03c9c7')) fail('INVALID_SNAPSHOT');
      const previous = await latest();
      if (previous && previous.snapshot_date > date) return json(409, { error: 'OLDER_SNAPSHOT' });
      const result = await db.from('finance_snapshots').insert({ sha256, snapshot_date: date,
        byte_length: bytes.byteLength, html, imported_by: ctx.user.email }).select('sha256,snapshot_date,byte_length').single();
      if (result.error?.code === '23505') return json(200, { ok: true, duplicate: true, sha256 });
      if (result.error) fail('DATA_UNAVAILABLE');
      const audit = await db.from('access_audit').insert({ actor_email: ctx.user.email, action: 'FINANCE_SNAPSHOT_IMPORT',
        target: APP, detail: { sha256, snapshot_date: date, byte_length: bytes.byteLength } });
      if (audit.error) console.error('finance-audit-unavailable');
      return json(201, { ok: true, ...result.data });
    }
    return json(404, { error: 'NOT_FOUND' });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'ERROR';
    const status = code === 'UNAUTHENTICATED' ? 401 : code === 'FORBIDDEN' ? 403 :
      code === 'TOO_LARGE' ? 413 : ['INVALID_SNAPSHOT','INVALID_DATE','INVALID_HASH','HASH_MISMATCH'].includes(code) ? 400 : 503;
    return json(status, { error: status === 503 ? 'SERVICE_UNAVAILABLE' : code });
  }
});
