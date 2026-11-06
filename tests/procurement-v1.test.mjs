import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html=readFileSync(new URL('../compras-cotacoes.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../compras-cotacoes.js',import.meta.url),'utf8');
const api=readFileSync(new URL('../supabase/functions/procurement-api/index.ts',import.meta.url),'utf8');
const schema=readFileSync(new URL('../supabase/migrations/20260923120000_procurement_v1.sql',import.meta.url),'utf8');
const legacy=readFileSync(new URL('../supabase/migrations/20260923123000_procurement_legacy_import.sql',import.meta.url),'utf8');
const quotes=readFileSync(new URL('../supabase/migrations/20261106133000_procurement_quotes_v1.sql',import.meta.url),'utf8');
const workflow=readFileSync(new URL('../supabase/migrations/20261106135258_procurement_request_soft_delete.sql',import.meta.url),'utf8');
const inventory=readFileSync(new URL('../estoque.html',import.meta.url),'utf8');
const inventoryQuotes=readFileSync(new URL('../estoque-quotes-v19.js',import.meta.url),'utf8');
const portal=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const installer=readFileSync(new URL('../app-installers.js',import.meta.url),'utf8');
const manifest=readFileSync(new URL('../manifest-compras-cotacoes.webmanifest',import.meta.url),'utf8');

test('historico inicia paginado e permite carregar mais solicitacoes',()=>{
  assert.match(js,/requestLimit=60/);
  assert.match(js,/rows\.slice\(0,requestLimit\)/);
  assert.match(js,/Mostrar mais/);
  assert.match(html,/compras-cotacoes\.js\?v=5/);
});

test('app possui entrada e instalacao independentes no Portal Livion',()=>{
  assert.match(js,/openThroughPortal/);
  assert.match(js,/searchParams\.set\('app','estoque'\)/);
  assert.match(installer,/'compras-cotacoes':\{name:'Compras e Cotações'/);
  assert.equal(JSON.parse(manifest).start_url,'./?app=compras-cotacoes');
});

test('cotacoes ficam dentro do estoque e podem nascer de um produto aberto',()=>{
  assert.match(inventory,/data-app-version="19"/);
  assert.match(inventory,/data-v="quotes"/);
  assert.match(inventory,/estoque-quotes-v19\.js/);
  assert.match(inventoryQuotes,/quoteProductBtn/);
  assert.match(inventoryQuotes,/product_id/);
  assert.match(js,/startupProductId/);
});

test('v5 gera uma planilha por fornecedor e importa somente apos revisao',()=>{
  assert.match(js,/LIVION_QUOTE_V1/);
  assert.match(js,/quoteWorkbook/);
  assert.match(js,/openResponseReview/);
  assert.match(api,/path==='bulk-offers'/);
  assert.match(quotes,/procurement_request_suppliers/);
});

test('dolar preserva a taxa original e atualiza apenas a referencia atual',()=>{
  assert.match(quotes,/exchange_rate_original/);
  assert.match(quotes,/exchange_rate_current/);
  assert.match(api,/BCB_PTAX/);
  assert.match(api,/indicadorCambio/);
  assert.match(js,/Dólar BC venda/);
  assert.match(api,/CotacaoDolarDia/);
  assert.match(js,/PTAX atualizada sem alterar o valor original/);
});

test('administrador exclui cotacao da lista sem destruir auditoria e pedidos',()=>{
  assert.match(workflow,/deleted_at timestamptz/);
  assert.match(workflow,/where deleted_at is null/);
  assert.match(api,/REQUEST_DELETED/);
  assert.match(api,/if\(!a\.admin\)throw Error\('FORBIDDEN'\)/);
  assert.match(js,/data-delete-request/);
});

test('comparativo destaca menor valor e registra vencedor escolhido',()=>{
  assert.match(js,/best-price-label/);
  assert.match(js,/Menor valor/);
  assert.match(js,/Escolher vencedor/);
  assert.match(api,/OFFER_SELECTED/);
});

test('pedido tem acompanhamento e recebe XML ou PDF antes da entrada',()=>{
  assert.match(workflow,/tracking_status/);
  assert.match(workflow,/procurement_order_documents/);
  assert.match(api,/path==='order-tracking'/);
  assert.match(api,/path==='order-document'/);
  assert.match(js,/Dar entrada \/ NF/);
  assert.match(js,/XML autorizado da NF-e/);
  assert.match(js,/PDF da nota \/ DANFE/);
});

test('fornecedor aceita varios contatos de cotacao com nome email e telefone',()=>{
  assert.match(js,/newSupplierContacts/);
  assert.match(inventoryQuotes,/supplierQuoteContacts/);
  assert.match(api,/inventory_supplier_quote_contacts/);
});

test('Outlook recebe escopo sob demanda e cria rascunho com anexo',()=>{
  assert.match(portal,/__PORTAL_GET_OUTLOOK_TOKEN__/);
  assert.match(portal,/Mail\.ReadWrite/);
  assert.match(js,/graph\.microsoft\.com\/v1\.0\/me\/messages/);
  assert.match(js,/fileAttachment/);
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
