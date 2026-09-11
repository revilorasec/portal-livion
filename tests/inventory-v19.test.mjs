import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const frontend = readFileSync(new URL('../estoque-assets-v18.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../estoque-assets-v18.css', import.meta.url), 'utf8');
const api = readFileSync(new URL('../supabase/functions/inventory-api/index.ts', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/20260911180000_inventory_manual_invoices.sql', import.meta.url), 'utf8');

test('entrada manual cria vínculo com a lista de notas sem repetir o saldo', () => {
  assert.match(api, /inventory_register_manual_invoice_entry/);
  assert.match(api, /t==='ENTRADA'&&documentNumber/);
  assert.match(frontend, /Quando informado, o registro aparecerá em Notas Fiscais/);
  assert.match(frontend, /result\.invoice_id/);
  assert.match(frontend, /idempotencyKey/);
  assert.match(migration, /source in \('XML_NFE','QR_NFE','LEGACY_IMPORT','MANUAL_ENTRY'\)/);
  assert.match(migration, /not exists\(select 1 from public\.inventory_invoice_items ii where ii\.movement_id=m\.movement_id\)/);
  assert.match(migration, /inventory_invoice_items_movement_uq/);
  assert.doesNotMatch(migration, /update public\.inventory_movements/);
});

test('nota aberta mostra anexos privados e permite adicionar foto ou PDF', () => {
  assert.match(frontend, /Foto ou PDF da nota/);
  assert.match(frontend, /Anexar à nota/);
  assert.match(frontend, /invoiceDocumentUpload/);
  assert.match(frontend, /D\.permissions\.entry/);
  assert.match(api, /db\.from\('inventory_documents'\)\.select\('\*'\)\.eq\('invoice_id',id\)/);
  assert.match(api, /createSignedUrl\(document\.object_path,3600\)/);
  assert.match(api, /requestedInvoiceId/);
  assert.match(api, /file\.size>10485760/);
  assert.match(css, /invoice-document-panel/);
});
