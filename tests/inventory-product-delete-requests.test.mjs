import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const api=readFileSync(new URL('../supabase/functions/inventory-api/index.ts',import.meta.url),'utf8');
const ui=readFileSync(new URL('../estoque-product-delete-requests.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../estoque.html',import.meta.url),'utf8');
const migration=readFileSync(new URL('../supabase/migrations/20261105143000_inventory_product_delete_requests.sql',import.meta.url),'utf8');

test('usuário do estoque pode solicitar exclusão e responsáveis autorizados decidem',()=>{
  assert.match(api,/action==='CREATE'/);
  assert.match(api,/requested_by:a\.email/);
  assert.match(api,/if\(!canDeleteProduct\(a\)\)throw Error\('FORBIDDEN'\)/);
  assert.match(ui,/Solicitar exclusão/);
  assert.match(ui,/D\?\.permissions\?\.productDelete/);
  assert.match(ui,/Solicitações de exclusão/);
});

test('exclusão administrativa inativa e preserva histórico com auditoria',()=>{
  assert.match(api,/update\(\{status:'INATIVO'/);
  assert.match(api,/INVENTORY_PRODUCT_INACTIVATE/);
  assert.match(ui,/Movimentações, notas, arquivos, saldo e auditoria serão preservados/);
  assert.match(migration,/on delete restrict/);
});

test('administrador pode mesclar ou recusar e a fila acompanha a decisão',()=>{
  assert.match(ui,/Mesclar item marcado/);
  assert.match(ui,/action:'REJECT'/);
  assert.match(ui,/apply:false/);
  assert.match(ui,/apply:true/);
  assert.match(api,/status:'MESCLADO'/);
  assert.match(api,/merged_into_product_id:targetId/);
});

test('solicitações são privadas e a V19 carrega o fluxo',()=>{
  assert.match(migration,/enable row level security/);
  assert.match(migration,/revoke all .* from anon,authenticated/);
  assert.match(migration,/grant select,insert,update .* to service_role/);
  assert.match(html,/data-app-version="19"/);
  assert.match(html,/estoque-product-delete-requests\.js\?v=3/);
});
