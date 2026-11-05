import { createClient } from 'jsr:@supabase/supabase-js@2.57.4';
import { validateCatalog, validateOperation } from './transceivers.mjs';
import {validateBankNote} from './bank-notes.mjs';

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
  // Respect explicit Portal app/action grants; a profile alone never grants financial data.
  if (ctx?.authenticated !== true || !['INTERNO','PARCEIRO'].includes(ctx.userType) ||
      !Array.isArray(ctx.apps) || !ctx.apps.includes(APP) ||
      !ctx.user?.email) fail('FORBIDDEN');
  const administrator = ctx.administrator === true && ctx.profile === 'ADMINISTRADOR';
  const actions = Array.isArray(ctx.actions) ? ctx.actions : [];
  const companies = Array.isArray(ctx.companies) ? ctx.companies : [];
  if (!administrator && (!actions.includes(`${APP}.visualizar`) ||
      !companies.some((company: string) => ['LIVION', 'RHCS', '*'].includes(company)))) fail('FORBIDDEN');
  return { ...ctx, canImport: administrator };
}
async function boundedBody(req: Request, maxBytes = MAX_BYTES) {
  if (Number(req.headers.get('content-length') || 0) > maxBytes) fail('TOO_LARGE');
  if (!req.body) fail('INVALID_SNAPSHOT');
  const reader = req.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { await reader.cancel(); fail('TOO_LARGE'); }
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
async function transceiverRows(table: string, columns: string, order: string, maximum: number) {
  const rows = [];
  for (let offset = 0; offset <= maximum; offset += 500) {
    const result = await db.from(table).select(columns).order(order).range(offset, offset + 499);
    if (result.error) fail('DATA_UNAVAILABLE');
    rows.push(...result.data);
    if (rows.length > maximum) fail('LIMIT_REACHED');
    if (result.data.length < 500) return rows;
  }
  return rows;
}
Deno.serve(async (req: Request) => {
  if (req.headers.get('origin') && req.headers.get('origin') !== ORIGIN) return json(403, { error: 'FORBIDDEN' });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: headers() });
  try {
    const path = new URL(req.url).pathname.split('/finance-api')[1] || '/';
    if (path === '/health' && req.method === 'GET') return json(200, { service: 'finance-api', version: 3 });
    const ctx = await access(req);
    if(path==='/bank-notes'&&req.method==='GET'){
      const notes=await transceiverRows('finance_bank_notes','account_id,transaction_id,note,revision,updated_at,updated_by','transaction_id',10000);
      return json(200,{notes,canEdit:ctx.canImport});
    }
    if(path==='/bank-notes'&&req.method==='POST'){
      if(!ctx.canImport)fail('FORBIDDEN');
      if(!(req.headers.get('content-type')||'').startsWith('application/json'))fail('INVALID_BANK_NOTE');
      const bytes=await boundedBody(req,16000);
      let input;try{input=JSON.parse(new TextDecoder().decode(bytes));}catch{fail('INVALID_BANK_NOTE');}
      const value=validateBankNote(input);
      const previous=await db.from('finance_bank_notes').select('*').eq('account_id',value.account_id).eq('transaction_id',value.transaction_id).maybeSingle();
      if(previous.error)fail('DATA_UNAVAILABLE');
      const old=previous.data;
      if((old?.revision??0)!==value.revision)return json(409,{error:'REVISION_CONFLICT'});
      const row={...value,revision:value.revision+1,updated_at:new Date().toISOString(),updated_by:ctx.user.email,
        history:old?[...old.history,{note:old.note,revision:old.revision,updated_at:old.updated_at,updated_by:old.updated_by}]:[]};
      const columns='account_id,transaction_id,note,revision,updated_at,updated_by';
      const saved=old?await db.from('finance_bank_notes').update(row).eq('account_id',value.account_id).eq('transaction_id',value.transaction_id).eq('revision',value.revision).select(columns).maybeSingle():await db.from('finance_bank_notes').insert(row).select(columns).single();
      if(saved.error?.code==='23505'||!saved.error&&!saved.data)return json(409,{error:'REVISION_CONFLICT'});
      if(saved.error)fail('DATA_UNAVAILABLE');
      return json(200,{ok:true,record:saved.data});
    }

    if (path === '/accounting-stock' && req.method === 'GET') {
      if(!ctx.canImport&&!ctx.companies?.some((company:string)=>['LIVION','*'].includes(company)))fail('FORBIDDEN');
      const result=await db.rpc('finance_inventory_accounting');
      if(result.error||!result.data||!Array.isArray(result.data.rows))fail('DATA_UNAVAILABLE');
      if(new TextEncoder().encode(JSON.stringify(result.data)).length>MAX_BYTES)fail('LIMIT_REACHED');
      return json(200,result.data);
    }
    if (path === '/transceivers' && req.method === 'GET') {
      const [catalog,operations]=await Promise.all([
        transceiverRows('finance_transceiver_catalog','product_code,fields,revision,updated_at','product_code',2000),
        transceiverRows('finance_transceiver_operations','*','id',10000)
      ]);
      return json(200,{catalog,operations,canEdit:ctx.canImport});
    }
    if (['/transceivers/catalog','/transceivers/operations'].includes(path) && req.method === 'POST') {
      if(!ctx.canImport)fail('FORBIDDEN');
      if(!(req.headers.get('content-type')||'').startsWith('application/json'))fail('INVALID_TRANSCEIVER');
      const bytes=await boundedBody(req,12000);
      let input;try{input=JSON.parse(new TextDecoder().decode(bytes));}catch{fail('INVALID_TRANSCEIVER');}
      if(path.endsWith('/catalog')){
        const value=validateCatalog(input),previous=await db.from('finance_transceiver_catalog').select('*').eq('product_code',value.product_code).maybeSingle();
        if(previous.error)fail('DATA_UNAVAILABLE');
        if((previous.data?.revision??0)!==value.revision)return json(409,{error:'REVISION_CONFLICT'});
        const now=new Date().toISOString(),old=previous.data;
        const row={product_code:value.product_code,fields:value.fields,revision:value.revision+1,updated_at:now,updated_by:ctx.user.email,
          history:old?[...old.history,{revision:old.revision,fields:old.fields,updated_at:old.updated_at,updated_by:old.updated_by}]:[]};
        const saved=old?await db.from('finance_transceiver_catalog').update(row).eq('product_code',value.product_code).eq('revision',value.revision).select('product_code,fields,revision,updated_at').maybeSingle():await db.from('finance_transceiver_catalog').insert(row).select('product_code,fields,revision,updated_at').single();
        if(saved.error?.code==='23505'||!saved.error&&!saved.data)return json(409,{error:'REVISION_CONFLICT'});
        if(saved.error)fail('DATA_UNAVAILABLE');return json(200,{ok:true,record:saved.data});
      }
      const value=validateOperation(input);
      const known=await db.from('finance_transceiver_references').select('source_key').eq('source_key',value.source_key).maybeSingle();
      if(known.error)fail('DATA_UNAVAILABLE');if(known.data)return json(409,{error:'ALREADY_IN_ERP'});
      const saved=await db.from('finance_transceiver_operations').insert({...value,id:crypto.randomUUID(),created_by:ctx.user.email}).select('*').single();
      if(saved.error?.code==='23505')return json(409,{error:'DUPLICATE_OPERATION'});
      if(saved.error)fail('DATA_UNAVAILABLE');return json(201,{ok:true,record:saved.data});
    }
    if (path === '/access' && req.method === 'GET') return json(200, { authorized: true, canImport: ctx.canImport });
    if (path === '/snapshot' && req.method === 'GET') {
      const row = await latest(true);
      if (!row) return json(404, { error: 'NO_SNAPSHOT' });
      return new Response(row.html, { headers: { ...headers(), 'Content-Type': 'text/plain; charset=utf-8',
        'X-Snapshot-Sha256': row.sha256, 'X-Snapshot-Date': row.snapshot_date } });
    }
    if (path === '/snapshots' && req.method === 'POST') {
      if (!ctx.canImport) fail('FORBIDDEN');
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
      code === 'TOO_LARGE' ? 413 : ['INVALID_BANK_NOTE','INVALID_TRANSCEIVER','INVALID_SNAPSHOT','INVALID_DATE','INVALID_HASH','HASH_MISMATCH'].includes(code) ? 400 : 503;
    return json(status, { error: status === 503 ? 'SERVICE_UNAVAILABLE' : code });
  }
});

