import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html = readFileSync(new URL('../estoque.html', import.meta.url), 'utf8');
const frontend = readFileSync(new URL('../estoque-product-media.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../estoque-assets-v18.css', import.meta.url), 'utf8');
const api = readFileSync(new URL('../supabase/functions/inventory-api/index.ts', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/20260930103000_inventory_product_files.sql', import.meta.url), 'utf8');

test('as quatro fotos têm finalidade identificada e oferecem câmera ou galeria', () => {
  for (const title of ['Visão geral do item', 'Identificação — PN e inscrições', 'Verso do item', 'Detalhes — conexões e acabamento']) assert.match(frontend, new RegExp(title));
  assert.match(frontend, /Tirar foto/);
  assert.match(frontend, /Escolher da galeria/);
  assert.match(frontend, /setAttribute\('capture', 'environment'\)/);
  assert.match(frontend, /removeAttribute\('capture'\)/);
  assert.match(css, /product-current-photo-grid/);
});

test('produto aceita vários documentos e permite remover cada arquivo pelo x', () => {
  assert.match(frontend, /type="file" multiple/);
  assert.match(frontend, /datasheets, manuais, certificados/);
  assert.match(frontend, /data-delete-product-file/);
  assert.match(frontend, /method: 'DELETE'/);
  assert.match(api, /PRODUCT_FILE_LIMIT/);
  assert.match(api, /count\.count\|\|0\)>=20/);
});

test('arquivos ficam em armazenamento privado com metadados e auditoria', () => {
  assert.match(migration, /inventory_product_files/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all.*public, anon, authenticated/);
  assert.match(api, /createSignedUrl/);
  assert.match(api, /INVENTORY_PRODUCT_FILE_UPLOAD/);
  assert.match(api, /INVENTORY_PRODUCT_FILE_DELETE/);
  assert.match(api, /20971520/);
});

test('a versão publicada carrega o novo recurso', () => {
  assert.match(html, /estoque-product-media\.js\?v=1/);
  assert.match(html, /data-app-version="9"/);
});
