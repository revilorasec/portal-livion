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
const supplierDocuments=readFileSync(new URL('../supabase/migrations/20261106145607_procurement_supplier_documents.sql',import.meta.url),'utf8');
const quoteTitles=readFileSync(new URL('../supabase/migrations/20261106170000_procurement_quote_number_date_title.sql',import.meta.url),'utf8');
const internalQuotes=readFileSync(new URL('../supabase/migrations/20261106182834_procurement_internal_quote_mode.sql',import.meta.url),'utf8');
const inventory=readFileSync(new URL('../estoque.html',import.meta.url),'utf8');
const inventoryQuotes=readFileSync(new URL('../estoque-quotes-v19.js',import.meta.url),'utf8');
const portal=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const installer=readFileSync(new URL('../app-installers.js',import.meta.url),'utf8');
const manifest=readFileSync(new URL('../manifest-compras-cotacoes.webmanifest',import.meta.url),'utf8');

test('historico inicia paginado e permite carregar mais solicitacoes',()=>{
  assert.match(js,/requestLimit=60/);
  assert.match(js,/rows\.slice\(0,requestLimit\)/);
  assert.match(js,/Mostrar mais/);
  assert.match(html,/compras-cotacoes\.js\?v=15/);
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
  assert.match(inventory,/estoque-quotes-v19\.js\?v=15/);
  assert.match(inventoryQuotes,/quoteProductBtn/);
  assert.match(inventoryQuotes,/product_id/);
  assert.match(js,/startupProductId/);
});

test('v9 gera uma planilha por fornecedor e importa somente apos revisao',()=>{
  assert.match(js,/LIVION_QUOTE_V2/);
  assert.match(html,/exceljs@4\.4\.0/);
  assert.match(js,/quoteWorkbook/);
  assert.match(js,/openResponseReview/);
  assert.match(js,/quote-response-document/);
  assert.match(api,/path==='bulk-offers'/);
  assert.match(quotes,/procurement_request_suppliers/);
});

test('nova cotacao usa titulo automatico produto exato e unidades do cadastro',()=>{
  assert.match(js,/Nova cotação · COT-/);
  assert.match(api,/nextRequestNumber/);
  assert.match(js,/autoRequestTitle/);
  assert.match(js,/Título automático/);
  assert.match(js,/Pesquise e escolha exatamente um item do estoque/);
  assert.match(api,/SELECT_EXACT_PRODUCTS/);
  assert.match(api,/inventory_catalog_options/);
  assert.match(js,/unitOptions/);
});

test('seletor de fornecedores e compacto pesquisavel',()=>{
  assert.match(js,/supplier-select-button/);
  assert.match(js,/supplier-dropdown/);
  assert.match(js,/selectedSupplierChips/);
  assert.match(js,/Pesquisar fornecedor/);
});

test('cotacoes iniciam recolhidas e usam cores por status',()=>{
  assert.match(js,/expandedRequests=new Set/);
  assert.match(js,/data-toggle-request/);
  assert.match(js,/aria-expanded/);
  assert.match(js,/requestStatusTone/);
  assert.match(js,/request-status-badge/);
});

test('pedidos ficam agrupados e recolhidos por numero da cotacao',()=>{
  assert.match(js,/expandedOrderGroups=new Set/);
  assert.match(js,/data-toggle-order-group/);
  assert.match(js,/order-group-details/);
  assert.match(js,/quote-order-link/);
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

test('pedido pode ser enviado por email ao fornecedor com apenas os itens vencedores',()=>{
  assert.match(js,/Enviar pedidos aos fornecedores/);
  assert.match(js,/Enviar pedido por e-mail/);
  assert.match(js,/PEDIDO DE COMPRA CONFIRMADO/);
  assert.match(js,/Pedido de compra Livion/);
  assert.match(js,/function orderRequest/);
  assert.match(js,/quote-order-link/);
  assert.match(js,/\$\{doc\.quoteNumber\} \/ \$\{doc\.number\}/);
  assert.match(js,/LIVION_PURCHASE_ORDER_V1/);
  assert.match(js,/message\/rfc822/);
  assert.match(inventoryQuotes,/searchParams\.set\('v','15'\)/);
  assert.match(inventory,/estoque-quotes-v19\.js\?v=15/);
  assert.match(js,/order-dispatch-card/);
  assert.match(js,/Contato de compras não cadastrado/);
});

test('fornecedor aceita varios contatos de cotacao com nome email e telefone',()=>{
  assert.match(js,/newSupplierContacts/);
  assert.match(inventoryQuotes,/supplierQuoteContacts/);
  assert.match(api,/inventory_supplier_quote_contacts/);
  assert.doesNotMatch(html,/Fornecedores e contatos/);
  assert.doesNotMatch(html,/suppliersView/);
});

test('fornecedor aceita logo privada usada na planilha de cotacao',()=>{
  assert.match(js,/Logo do fornecedor/);
  assert.match(js,/supplier-logo/);
  assert.match(js,/workbookImage\(supplier\.photo_url\)/);
  assert.match(api,/inventory_media/);
  assert.match(api,/createSignedUrl\(logo\.object_path,3600\)/);
  assert.match(api,/SUPPLIER_LOGO_UPDATED/);
});

test('Outlook classico recebe rascunho EML nominal com Excel anexado',()=>{
  assert.match(js,/X-Unsent: 1/);
  assert.match(js,/message\/rfc822/);
  assert.match(js,/Preparar no Outlook clássico/);
  assert.match(js,/Olá, \$\{esc\(contactName\)\}/);
  assert.match(js,/Content-Disposition: attachment/);
});

test('titulo oficial usa numero COT e data de criacao',()=>{
  assert.match(js,/COT-\$\{String\(number\)\.padStart\(6,'0'\)\} -/);
  assert.match(api,/officialTitle/);
  assert.match(quoteTitles,/America\/Sao_Paulo/);
  assert.match(quoteTitles,/DD\/MM\/YYYY/);
});

test('planilha destaca em amarelo os campos do fornecedor',()=>{
  assert.match(js,/preencha todas as células amarelas/);
  assert.match(js,/FFFFF2CC/);
  assert.match(js,/FFFFD966/);
});

test('planilha solicita valor total e orienta prazo e pagamento',()=>{
  assert.match(js,/LIVION_QUOTE_V3/);
  assert.match(js,/Valor total/);
  assert.match(js,/Como preencher/);
  assert.match(js,/total\/quantity/);
  assert.match(js,/condição de pagamento inválida/);
  assert.match(js,/prazo de entrega inválido/);
  assert.match(js,/30\/60\/90/);
  assert.match(js,/incluindo moeda, <b>valor total da quantidade solicitada<\/b>/);
});

test('cotacao interna usa os mesmos fornecedores em uma unica planilha reimportavel',()=>{
  assert.match(internalQuotes,/quote_mode text not null default 'SUPPLIER'/);
  assert.match(internalQuotes,/INTERNAL/);
  assert.match(api,/quote_mode:quoteMode/);
  assert.match(js,/Fazer pesquisa internamente/);
  assert.match(js,/um único Excel/);
  assert.match(js,/LIVION_INTERNAL_QUOTE_V1/);
  assert.match(js,/Baixar planilha interna única/);
  assert.match(js,/Importar pesquisa interna/);
  assert.match(js,/Pesquisa interna registrada/);
  assert.match(js,/for\(const \[supplierId,group\] of groups\)await api\('\/bulk-offers'/);
});

test('respostas multiplas mostram conversao em real pelo dolar atual',()=>{
  assert.match(js,/Valor em real/);
  assert.match(js,/USD ×/);
  assert.match(js,/Cada planilha importada aparece separadamente/);
  assert.match(api,/response_source:'XLSX_IMPORT'/);
});

test('ordem oficial do fornecedor fica anexada separada da nota fiscal',()=>{
  assert.match(supplierDocuments,/SUPPLIER_PURCHASE_ORDER/);
  assert.match(supplierDocuments,/procurement_response_documents/);
  assert.match(js,/Ordem de compra oficial do fornecedor/);
  assert.match(api,/QUOTE_RESPONSE_DOCUMENT_ADDED/);
  assert.match(api,/getOrderDocument/);
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
  assert.match(js,/Produto não localizado no estoque/);
});

test('sugestão de vínculo permanece local e exige alta confiança',()=>{
  assert.match(api,/LOCAL_DETERMINISTIC/);
  assert.match(api,/confidence<0\.86/);
  assert.doesNotMatch(api,/typesafe\.ai|TYPESAFE_API_KEY/);
});
