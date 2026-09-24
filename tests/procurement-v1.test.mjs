import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html=readFileSync(new URL('../compras-cotacoes.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../compras-cotacoes.js',import.meta.url),'utf8');
const api=readFileSync(new URL('../supabase/functions/procurement-api/index.ts',import.meta.url),'utf8');
const schema=readFileSync(new URL('../supabase/migrations/20260923120000_procurement_v1.sql',import.meta.url),'utf8');
const legacy=readFileSync(new URL('../supabase/migrations/20260923123000_procurement_legacy_import.sql',import.meta.url),'utf8');
const installer=readFileSync(new URL('../install-app.html',import.meta.url),'utf8');
const manifest=readFileSync(new URL('../manifest-compras-cotacoes.webmanifest',import.meta.url),'utf8');

test('historico inicia paginado e permite carregar mais solicitacoes',()=>{
  assert.match(js,/requestLimit=60/);
  assert.match(js,/rows\.slice\(0,requestLimit\)/);
  assert.match(js,/Mostrar mais/);
  assert.match(html,/compras-cotacoes\.js\?v=3/);
});

test('app possui entrada e instalacao independentes no Portal Livion',()=>{
  assert.match(js,/openThroughPortal/);
  assert.match(js,/searchParams\.set\('app','compras-cotacoes'\)/);
  assert.match(installer,/'compras-cotacoes':\{name:'Compras e Cotações'/);
  assert.equal(JSON.parse(manifest).start_url,'./?app=compras-cotacoes');
});

test('app usa marca Livion e expõe o fluxo completo',()=>{
  assert.match(html,/Compras e Cotações/);
  assert.match(html,/Pedidos e recebimentos/);
  assert.doesNotMatch(html,/RHTE|RH TELECOM/i);
  for(const endpoint of ['request','offer','select-offer','issue-orders','receive'])assert.match(api,new RegExp(`path==='${endpoint}'`));
});

test('recebimento é transacional, idempotente e integra com estoque',()=>{
  assert.match(schema,/procurement_receive_order/);
  assert.match(schema,/inventory_register_movement/);
  assert.match(schema,/idempotency_key uuid not null unique/);
  assert.match(schema,/COMPRAS_COTACOES/);
  assert.doesNotMatch(api,/from\('inventory_movements'\)\.insert/);
});

test('migração histórica não cria movimentações de estoque',()=>{
  assert.match(schema,/procurement_legacy_rows/);
  assert.match(legacy,/Histórico importado; não gerou movimentação de estoque/);
  assert.match(js,/Vincular ao estoque/);
});

test('sugestão de vínculo permanece local e exige alta confiança',()=>{
  assert.match(api,/LOCAL_DETERMINISTIC/);
  assert.match(api,/confidence<0\.86/);
  assert.doesNotMatch(api,/typesafe\.ai|TYPESAFE_API_KEY/);
});
