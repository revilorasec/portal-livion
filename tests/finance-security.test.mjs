import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
const source = readFileSync(new URL('../supabase/functions/finance-api/index.ts', import.meta.url), 'utf8').replace(/^import[^\n]+\n/, '');
const html = '<!doctype html><html><body>dashboard:4d7a3151-8d62-4c70-9031-e1bc4e03c9c7 Synthetic only</body></html>';
const hash = async body => Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body))).toString('hex');
function harness(override = {}) {
  let handler, writes = [], snapshot = null, ctx = { authenticated: true, administrator: true, profile: 'ADMINISTRADOR', userType: 'INTERNO', apps: ['painel-financeiro'], user: { email: 'synthetic@example.test' }, ...override };
  class Query {
    constructor(table) { this.table = table; }
    select() { return this; } order() { return this; } limit() { return this; }
    insert(value) { this.value = value; return this; }
    async result() {
      if (!this.value) return { data: snapshot };
      writes.push({ table: this.table, value: this.value });
      if (this.table === 'finance_snapshots') {
        if (snapshot?.sha256 === this.value.sha256) return { error: { code: '23505' } };
        snapshot = this.value;
      }
      return { data: this.value };
    }
    maybeSingle() { return this.result(); } single() { return this.result(); }
    then(resolve) { return this.result().then(resolve); }
  }
  vm.runInContext(stripTypeScriptTypes(source), vm.createContext({
    createClient: () => ({ from: table => new Query(table) }),
    Deno: { env: { get: () => 'https://example.test' }, serve: cb => { handler = cb; } },
    fetch: async () => new Response(JSON.stringify(ctx)), Response, Request, URL, AbortSignal, Uint8Array, TextDecoder, TextEncoder, crypto, console
  }));
  return { writes, setSnapshot: value => { snapshot = value; }, call: (path, options = {}) => handler(new Request('https://example.test/functions/v1/finance-api' + path, { headers: { authorization: 'Bearer ' + 'x'.repeat(30) }, ...options })) };
}
test('missing token, bad origin, ordinary and external profiles cannot read or import', async () => {
  const h = harness();
  assert.equal((await h.call('/snapshot', { headers: {} })).status, 401);
  assert.equal((await h.call('/snapshot', { headers: { origin: 'https://attacker.test' } })).status, 403);
  for (const profile of ['OPERACIONAL','SOCIO','VISUALIZADOR']) {
    const denied = harness({ administrator: false, profile });
    assert.equal((await denied.call('/snapshot')).status, 403);
    assert.equal((await denied.call('/snapshots', { method: 'POST' })).status, 403);
    assert.equal(denied.writes.length, 0);
  }
  assert.equal((await harness({ userType: 'CLIENTE' }).call('/snapshot')).status, 403);
  assert.equal((await harness({ apps: [] }).call('/snapshot')).status, 403);
});
test('private content has no-store/nosniff, exact integrity, immutable duplicates and audit without content', async () => {
  const h = harness(), sha256 = await hash(html);
  const upload = () => h.call('/snapshots', { method: 'POST', headers: { authorization: 'Bearer ' + 'x'.repeat(30), 'content-type': 'text/html', 'x-snapshot-date': '2026-10-28', 'x-snapshot-sha256': sha256 }, body: html });
  assert.equal((await upload()).status, 201);
  const response = await h.call('/snapshot');
  assert.match(response.headers.get('cache-control'), /no-store/);
  assert.equal(response.headers.get('content-type'), 'text/plain; charset=utf-8');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-snapshot-sha256'), sha256);
  assert.equal(await response.text(), html);
  assert.equal((await upload()).status, 200);
  assert.equal(h.writes.find(w => w.table === 'access_audit').value.detail.html, undefined);
  assert.ok(h.writes.every(w => ['finance_snapshots','access_audit'].includes(w.table)));
});
test('integrity, dates, size and stale snapshots fail before persistence', async () => {
  const h = harness(), sha256 = await hash(html);
  const send = extra => h.call('/snapshots', { method: 'POST', headers: { authorization: 'Bearer ' + 'x'.repeat(30), 'content-type': 'text/html', 'x-snapshot-date': '2026-10-28', 'x-snapshot-sha256': sha256, ...extra }, body: html });
  assert.equal((await send({ 'x-snapshot-sha256': '0'.repeat(64) })).status, 400);
  assert.equal((await send({ 'x-snapshot-date': '2026-99-99' })).status, 400);
  assert.equal((await send({ 'content-length': '12582913' })).status, 413);
  h.setSnapshot({ snapshot_date: '2026-10-29' });
  assert.equal((await send({})).status, 409);
  assert.equal(h.writes.length, 0);
});
test('database policies grant no public read; public wrapper includes no reviewed snapshot', () => {
  const sql = readFileSync(new URL('../Scripts/finance-schema.sql', import.meta.url), 'utf8');
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all on public.finance_snapshots from public, anon, authenticated/i);
  assert.doesNotMatch(sql, /update\s+public.portal_users|create policy/i);
  const shell = readFileSync(new URL('../painel-financeiro/index.html', import.meta.url), 'utf8');
  assert.match(shell, /sandbox="allow-scripts allow-downloads allow-modals"/);
  assert.doesNotMatch(shell, /allow-same-origin|350361|Bruno Ribeiro|data-reviewed-rows/);
});
