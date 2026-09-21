import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHandler } from '../supabase/functions/expense-category-ai/handler.mjs';

const boot = { permissions: { create: true }, companies: [{ key: 'A' }], categories: [{ category_id: 'parking', name: 'Estacionamento', active: true, company_key: null }, { category_id: 'other-company', name: 'Privada', company_key: 'B' }] };
const input = { company_key: 'A', description: 'Estacionamento durante visita ao cliente' };
function setup({ authStatus = 200, bootstrap = boot, key = 'synthetic-key', providerStatus = 200, choice = 'category_0', confidence = 0.9, throws = false } = {}) {
  const calls = [];
  const handler = createHandler({ env: n => n === 'SUPABASE_URL' ? 'https://example.supabase.co' : key, fetcher: async (url, options) => {
    calls.push({ url, options });
    if (url.includes('/bootstrap')) return Response.json(bootstrap, { status: authStatus });
    if (throws) throw new DOMException('timeout', 'TimeoutError');
    return Response.json({ answers: { category: { type: 'choice', choice, confidence } } }, { status: providerStatus });
  } });
  const request = (body = input, auth = 'Bearer synthetic-user-token') => handler(new Request('https://example.test', { method: 'POST', headers: { authorization: auth }, body: JSON.stringify(body) }));
  return { calls, request, handler };
}
test('authorized suggestion only sends description and server-owned categories', async () => {
  const { request, calls } = setup();
  const response = await request({ ...input, amount: 100, cpf: 'private', categories: [{ name: 'Injected' }] });
  assert.deepEqual(await response.json(), { suggestion: { category_id: 'parking', name: 'Estacionamento' } });
  const payload = JSON.parse(calls[1].options.body);
  assert.deepEqual(payload.state, { description: input.description });
  assert.deepEqual(Object.keys(payload.questions.category.criteria), ['category_0', 'none']);
  assert.equal(calls[0].options.headers.authorization, 'Bearer synthetic-user-token');
  assert.equal(calls[1].options.headers.authorization, 'Bearer synthetic-key');
});
for (const authStatus of [401, 403, 500]) test('auth failure prevents provider call: ' + authStatus, async () => {
  const { request, calls } = setup({ authStatus });
  assert.equal((await request()).status, authStatus === 500 ? 503 : authStatus);
  assert.equal(calls.length, 1);
});
for (const bootstrap of [{ ...boot, permissions: { create: false } }, { ...boot, companies: [{ key: 'B' }] }]) test('permission/company denied before provider', async () => {
  const { request, calls } = setup({ bootstrap });
  assert.equal((await request()).status, 403); assert.equal(calls.length, 1);
});
test('missing key gives actionable response without calling provider', async () => {
  const { request, calls } = setup({ key: '' });
  assert.deepEqual(await (await request()).json(), { error: 'TYPESAFE_NOT_CONFIGURED' }); assert.equal(calls.length, 1);
});
test('missing bearer and invalid input never reach provider', async () => {
  const { request, calls } = setup();
  assert.equal((await request(input, '')).status, 401);
  for (const body of [null, {}, { ...input, description: 'x' }, { ...input, description: 'x'.repeat(2001) }]) assert.equal((await request(body)).status, 400);
  assert.equal(calls.length, 0);
});
test('none stays unclassified; unknown choices and invalid confidence fail closed', async () => {
  assert.deepEqual(await (await setup({ choice: 'none' }).request()).json(), { suggestion: null });
  assert.equal((await setup({ choice: 'invented' }).request()).status, 502);
  assert.equal((await setup({ confidence: 4 }).request()).status, 502);
});
test('provider rate limit and timeout handled without retry or leaking details', async () => {
  assert.equal((await setup({ providerStatus: 429 }).request()).status, 429);
  assert.deepEqual(await (await setup({ throws: true }).request()).json(), { error: 'AI_TIMEOUT' });
});

function ui() {
  const elements = {};
  const form = { listeners: {}, addEventListener(t, cb) { this.listeners[t] = cb; } };
  for (const id of ['suggestCategory', 'applyCategorySuggestion', 'categorySuggestionStatus', 'eCompany', 'eDesc', 'eCategory']) elements[id] = { value: '', textContent: '', hidden: true, options: [{ value: 'parking' }, { value: 'manual' }], listeners: {}, addEventListener(t, cb) { this.listeners[t] = cb; }, dispatchEvent() { form.listeners.change(); } };
  elements.expenseForm = form; elements.eCompany.value = 'A'; elements.eDesc.value = input.description; elements.eCategory.value = 'manual';
  let resolve, reject; const promise = new Promise((a,b) => { resolve = a; reject = b; });
  const context = { document: { getElementById: id => elements[id] }, $: id => elements[id], B: boot, editingExpenseId: null, manualTouched: new Set(), EXP_API: 'https://example.test/expenses-api', call: () => promise, setTimeout, clearTimeout, AbortController, Event };
  vm.runInNewContext(fs.readFileSync(new URL('../expense-category-ai.js', import.meta.url), 'utf8'), context);
  return { elements, resolve, reject, context, click: () => elements.suggestCategory.listeners.click() };
}
test('UI preserves category until explicit acceptance', async () => {
  const u = ui(), work = u.click();
  u.resolve({ suggestion: { category_id: 'parking', name: 'Estacionamento' } }); await work;
  assert.equal(u.elements.eCategory.value, 'manual'); assert.equal(u.elements.applyCategorySuggestion.hidden, false);
  u.elements.applyCategorySuggestion.listeners.click();
  assert.equal(u.elements.eCategory.value, 'parking'); assert.ok(u.context.manualTouched.has('eCategory'));
});
test('UI drops in-flight results after input edits and resets', async () => {
  for (const event of ['input', 'reset']) {
    const u = ui(), work = u.click(); u.elements.expenseForm.listeners[event]();
    u.resolve({ suggestion: { category_id: 'parking', name: 'Estacionamento' } }); await work;
    assert.equal(u.elements.applyCategorySuggestion.hidden, true); assert.equal(u.elements.eCategory.value, 'manual');
  }
});
test('UI rejects stale suggestion if form changes programmatically', async () => {
  const u = ui(), work = u.click(); u.resolve({ suggestion: { category_id: 'parking', name: 'Estacionamento' } }); await work;
  u.elements.eCompany.value = 'B'; u.elements.applyCategorySuggestion.listeners.click(); assert.equal(u.elements.eCategory.value, 'manual');
});
test('UI reports unconfigured service and re-enables button', async () => {
  const u = ui(), work = u.click(); u.reject(Error('TYPESAFE_NOT_CONFIGURED')); await work;
  assert.match(u.elements.categorySuggestionStatus.textContent, /ainda não foi ativada/);
  assert.equal(u.elements.suggestCategory.disabled, false); assert.equal(u.elements.eCategory.value, 'manual');
});
