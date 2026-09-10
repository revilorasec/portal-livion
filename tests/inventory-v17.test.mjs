import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../estoque.html', import.meta.url), 'utf8');
const portal = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const frontend = readFileSync(new URL('../estoque-assets-v17.js', import.meta.url), 'utf8');
const serviceWorker = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const api = readFileSync(new URL('../supabase/functions/inventory-api/index.ts', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/20260909130000_add_inventory_locations_and_parts.sql', import.meta.url), 'utf8');
const versionCatalogSql = readFileSync(new URL('../Scripts/update-portal-app-versions.sql', import.meta.url), 'utf8');

test('carrega os recursos v17 depois do painel v16', () => {
  assert.ok(html.indexOf('estoque-dashboard-v16.js') < html.indexOf('estoque-assets-v17.js'));
  assert.match(html, /estoque-assets-v17\.css/);
  assert.match(serviceWorker, /portal-livion-v11/);
  assert.match(html, /estoque-assets-v17\.js\?v=18/);
  assert.match(serviceWorker, /estoque-assets-v17\.js\?v=18/);
});

test('portal e aplicativo exibem versões identificáveis', () => {
  assert.match(portal, /PORTAL_VERSION='2026\.09\.10\.1'/);
  assert.match(portal, /id="portalVersion"/);
  assert.match(portal, /id="workspaceVersion"/);
  assert.match(portal, /class="app-card-version"/);
  assert.match(portal, /function stampFrameVersion/);
  assert.match(html, /data-app-version="4"/);
  assert.match(html, /class="app-release">v4/);
  assert.match(versionCatalogSql, /estoque\.html\?v=4/);
  assert.match(versionCatalogSql, /where key in/);
});

test('estoque pesquisa e filtra fornecedores', () => {
  assert.match(frontend, /id = 'stockSupplier'/);
  assert.match(frontend, /product\.supplier_names/);
  assert.match(frontend, /product\.supplier_ids/);
  assert.match(frontend, /fornecedor/iu);
});

test('produto usa localização pesquisável e aceita várias peças compatíveis', () => {
  assert.match(frontend, /catalogValues\('LOCATION'/);
  assert.match(frontend, /makeSearchableDropdown\('pLoc'/);
  assert.match(frontend, /_selectedPartIds/);
  assert.match(frontend, /part-picker-backdrop/);
  assert.match(frontend, /Somente selecionadas/);
  assert.match(frontend, /Aplicar seleção/);
  assert.match(frontend, /parts\.slice\(0, 4\)/);
  assert.doesNotMatch(frontend, /id="productPartSearch"/);
  assert.match(api, /INVENTORY_PRODUCT_PARTS_SET/);
});

test('peça possui os campos solicitados e duas fotos', () => {
  for (const id of ['partPN', 'partDescription', 'partManufacturer', 'partClient', 'partNotes']) assert.match(frontend, new RegExp(id));
  assert.match(frontend, /photoFields\('partPhoto', 2\)/);
  assert.match(frontend, /uploadPhotos\('PART', result\.part_id, 'partPhoto', 2\)/);
  assert.match(api, /pos>2/);
});

test('migração protege tabelas novas com RLS e preserva relações históricas', () => {
  assert.match(migration, /inventory_parts enable row level security/);
  assert.match(migration, /inventory_product_parts enable row level security/);
  assert.match(migration, /revoke all on table public\.inventory_parts from public, anon, authenticated/);
  assert.match(migration, /from public\.inventory_movements m/);
  assert.match(migration, /on conflict \(product_id, supplier_id\) do update/);
});

test('API v17 expõe peças no bootstrap e mantém fotos privadas assinadas', () => {
  assert.match(api, /version:17/);
  assert.match(api, /data\.parts=parts/);
  assert.match(api, /mediaMap\('PART'/);
  assert.match(api, /createSignedUrl/);
});
