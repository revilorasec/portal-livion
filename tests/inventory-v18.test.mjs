import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html = readFileSync(new URL('../estoque.html', import.meta.url), 'utf8');
const frontend = readFileSync(new URL('../estoque-assets-v18.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../estoque-assets-v18.css', import.meta.url), 'utf8');
const serviceWorker = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const versions = readFileSync(new URL('../Scripts/update-portal-app-versions.sql', import.meta.url), 'utf8');

test('publica a versão 4 do estoque com recursos v18', () => {
  assert.match(html, /data-app-version="4"/);
  assert.match(html, /class="app-release">v4/);
  assert.match(html, /estoque-assets-v18\.css\?v=1/);
  assert.match(html, /estoque-assets-v18\.js\?v=1/);
  assert.match(serviceWorker, /portal-livion-v11/);
  assert.match(serviceWorker, /estoque-assets-v18\.js\?v=1/);
  assert.match(versions, /estoque\.html\?v=4/);
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
