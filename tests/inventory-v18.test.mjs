import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html = readFileSync(new URL('../estoque.html', import.meta.url), 'utf8');
const frontend = readFileSync(new URL('../estoque-assets-v18.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../estoque-assets-v18.css', import.meta.url), 'utf8');
const serviceWorker = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const versions = readFileSync(new URL('../Scripts/update-portal-app-versions.sql', import.meta.url), 'utf8');
const api = readFileSync(new URL('../supabase/functions/inventory-api/index.ts', import.meta.url), 'utf8');
const qrSourceMigration = readFileSync(new URL('../supabase/migrations/20260910170000_inventory_qr_invoice_source.sql', import.meta.url), 'utf8');

test('publica a versão 5 do estoque com recursos v18 atualizados', () => {
  assert.match(html, /data-app-version="5"/);
  assert.match(html, /class="app-release">v5/);
  assert.match(html, /estoque-assets-v18\.css\?v=2/);
  assert.match(html, /estoque-assets-v18\.js\?v=2/);
  assert.match(serviceWorker, /portal-livion-v12/);
  assert.match(serviceWorker, /estoque-assets-v18\.js\?v=2/);
  assert.match(versions, /estoque\.html\?v=5/);
});

test('entrada oferece QR com câmera, foto, chave e validação do XML', () => {
  assert.match(frontend, /Escanear QR da nota/);
  assert.match(frontend, /BarcodeDetector/);
  assert.match(frontend, /getUserMedia/);
  assert.match(frontend, /Ler foto do QR/);
  assert.match(frontend, /\\d\{44\}/);
  assert.match(frontend, /O XML selecionado pertence a outra nota fiscal/);
  assert.match(frontend, /invoiceCache\.some/);
  assert.match(frontend, /showInvoiceReview\(await api\('\/invoice-import'/);
  assert.match(frontend, /fiscal-smart-api/);
  assert.match(frontend, /fiscalMetadata/);
  assert.match(frontend, /invoice-import-qr/);
  assert.match(frontend, /XML da mesma nota \(alternativa\)/);
  assert.match(api, /async function invoiceImportQr/);
  assert.match(api, /source:'QR_NFE'/);
  assert.match(api, /version:18/);
  assert.match(qrSourceMigration, /'XML_NFE','QR_NFE','LEGACY_IMPORT'/);
  assert.match(css, /qr-camera-box/);
});

test('associação exige escolha antes de renomear item ou fornecedor', () => {
  assert.match(frontend, /Manter o nome atual/);
  assert.match(frontend, /Trocar para o nome da nota/);
  assert.match(frontend, /Associar e escolher nome/);
  assert.match(frontend, /name_choice_product_id/);
  assert.match(frontend, /name_choice_supplier_id/);
  assert.match(frontend, /updateApprovedNames/);
  assert.match(frontend, /D\.permissions\.product/);
  assert.match(frontend, /D\.permissions\.supplier/);
});
