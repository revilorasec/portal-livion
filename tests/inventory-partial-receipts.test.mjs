import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const frontend = readFileSync(new URL('../estoque-invoice-receipt.js', import.meta.url), 'utf8');
const api = readFileSync(new URL('../supabase/functions/inventory-api/index.ts', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/20260929203000_inventory_partial_invoice_receipts.sql', import.meta.url), 'utf8');

test('a revisão permite quantidade recebida, item ausente e observação', () => {
  assert.match(frontend, /Quantidade recebida/);
  assert.match(frontend, /Não veio/);
  assert.match(frontend, /Observação do item/);
  assert.match(frontend, /received_quantity/);
  assert.match(frontend, /Informe uma observação/);
});

test('produto só é obrigatório quando houve recebimento', () => {
  assert.match(frontend, /received > 0 \? confirmedProductValue/);
  assert.match(migration, /received_quantity>0 and product_id is null/);
  assert.match(migration, /where invoice_id=p_invoice_id and received_quantity>0/);
});

test('movimento usa a quantidade realmente recebida e preserva a quantidade fiscal', () => {
  assert.match(migration, /p_quantity=>v_item\.received_quantity/);
  assert.match(migration, /received_quantity <= quantity/);
  assert.match(migration, /delivery_status/);
  assert.match(migration, /receipt_status/);
});

test('nota complementar é opcional, validada e auditada', () => {
  assert.match(frontend, /Esta nota complementa uma entrega anterior/);
  assert.match(frontend, /complements_invoice_id/);
  assert.match(api, /receipt_status.*PARTIAL/);
  assert.match(api, /INVALID_COMPLEMENT_SUPPLIER/);
  assert.match(api, /complements_invoice_id:complementId/);
});

test('importações XML e QR iniciam com a quantidade fiscal recebida', () => {
  assert.match(api, /received_quantity:quantity/);
  assert.match(api, /received_quantity:it\.quantity/);
});
