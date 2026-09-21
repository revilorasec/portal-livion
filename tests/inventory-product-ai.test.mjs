import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHandler, rankCandidates } from '../supabase/functions/inventory-product-ai/handler.mjs';

const products = [
  { product_id: 'fiber', pn: 'FO-SM-01', description: 'Cabo de fibra óptica monomodo', category: 'Cabos', item_type: 'Componente', unit: 'M', status: 'ATIVO' },
  { product_id: 'utp', pn: 'UTP-CAT6', description: 'Cabo de rede categoria 6', category: 'Cabos', item_type: 'Componente', unit: 'M', status: 'ATIVO' },
  { product_id: 'inactive', pn: 'OLD', description: 'Cabo antigo', status: 'INATIVO' }
];
const boot = { permissions: { entry: true }, stock: products };
const item = { description: 'CABO OPTICO MONOMODO', supplier_sku: 'FO-SM-01', unit: 'M' };

function setup({ authStatus = 200, bootstrap = boot, key = 'synthetic-key', providerStatus = 200, choice = 'product_0', confidence = 0.9, throws = false } = {}) {
  const calls = [];
  const handler = createHandler({ env: name => name === 'SUPABASE_URL' ? 'https://example.supabase.co' : key, fetcher: async (url, options) => {
    calls.push({ url, options });
    if (url.includes('/bootstrap')) return Response.json(bootstrap, { status: authStatus });
    if (throws) throw new DOMException('timeout', 'TimeoutError');
    return Response.json({ answers: { product: { type: 'choice', choice, confidence } } }, { status: providerStatus });
  } });
  const request = (body = { item }, authorization = 'Bearer synthetic-user-token') => handler(new Request('https://example.test', { method: 'POST', headers: { authorization }, body: JSON.stringify(body) }));
  return { calls, request };
}

test('candidate ranking prioritizes exact supplier PN and excludes inactive products', () => {
  const ranked = rankCandidates(item, products);
  assert.equal(ranked[0].product_id, 'fiber');
  assert.equal(ranked.some(product => product.product_id === 'inactive'), false);
});

test('authorized suggestion sends only fiscal matching fields and server-owned candidates', async () => {
  const { calls, request } = setup();
  const response = await request({ item: { ...item, quantity: 500, unit_price: 9.99 }, products: [{ product_id: 'injected' }] });
  assert.deepEqual(await response.json(), { suggestion: { product_id: 'fiber', pn: 'FO-SM-01', description: 'Cabo de fibra óptica monomodo' } });
  const payload = JSON.parse(calls[1].options.body);
  assert.deepEqual(payload.state.item, { description: item.description, supplier_sku: item.supplier_sku, barcode: null, ncm: null, unit: item.unit });
  assert.deepEqual(Object.keys(payload.questions.product.criteria), ['product_0', 'product_1', 'none']);
  assert.equal(JSON.stringify(payload).includes('unit_price'), false);
  assert.equal(JSON.stringify(payload).includes('quantity'), false);
  assert.equal(calls[0].options.headers.authorization, 'Bearer synthetic-user-token');
  assert.equal(calls[1].options.headers.authorization, 'Bearer synthetic-key');
});

for (const authStatus of [401, 403, 500]) test('bootstrap failure prevents TypeSafe call: ' + authStatus, async () => {
  const { request, calls } = setup({ authStatus });
  assert.equal((await request()).status, authStatus === 500 ? 503 : authStatus);
  assert.equal(calls.length, 1);
});

test('entry permission is required before TypeSafe call', async () => {
  const { request, calls } = setup({ bootstrap: { ...boot, permissions: { entry: false } } });
  assert.equal((await request()).status, 403);
  assert.equal(calls.length, 1);
});

test('missing key fails without exposing or calling the provider', async () => {
  const { request, calls } = setup({ key: '' });
  assert.deepEqual(await (await request()).json(), { error: 'TYPESAFE_NOT_CONFIGURED' });
  assert.equal(calls.length, 1);
});

test('invalid input and missing bearer are rejected before external calls', async () => {
  const { request, calls } = setup();
  assert.equal((await request({ item }, '')).status, 401);
  for (const body of [null, {}, { item: { description: '' } }, { item: { description: 'x'.repeat(1001) } }]) assert.equal((await request(body)).status, 400);
  assert.equal(calls.length, 0);
});

test('none remains unmatched and malformed TypeSafe answers fail closed', async () => {
  assert.deepEqual(await (await setup({ choice: 'none' }).request()).json(), { suggestion: null });
  assert.equal((await setup({ choice: 'invented' }).request()).status, 502);
  assert.equal((await setup({ confidence: -1 }).request()).status, 502);
});

test('provider overload and timeout are contained', async () => {
  assert.equal((await setup({ providerStatus: 529 }).request()).status, 429);
  assert.deepEqual(await (await setup({ throws: true }).request()).json(), { error: 'AI_TIMEOUT' });
});

test('frontend only applies a suggestion through the existing association confirmation', () => {
  const frontend = readFileSync(new URL('../estoque-typesafe.js', import.meta.url), 'utf8');
  assert.match(frontend, /Sugerir produto/);
  assert.match(frontend, /Usar sugestão/);
  assert.match(frontend, /data-link-invoice-item/);
  assert.match(frontend, /\.click\(\)/);
  assert.doesNotMatch(frontend, /invoice-confirm|\/movement|inventory_movements/);
});
