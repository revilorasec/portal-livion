import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const api=readFileSync(new URL('../supabase/functions/inventory-api/index.ts',import.meta.url),'utf8');
const frontend=readFileSync(new URL('../estoque-price-history.js',import.meta.url),'utf8');
const packaging=readFileSync(new URL('../estoque-packaging.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../estoque.html',import.meta.url),'utf8');

test('histórico de preços consulta todos os itens de uma vez, usa entradas reais e protege valores financeiros',()=>{
  assert.match(api,/async function priceHistory/);
  assert.match(api,/estoque\.visualizar_valores/);
  assert.match(api,/eq\('movement_type','ENTRADA'\)/);
  assert.match(api,/gt\('unit_value',0\)/);
  assert.match(api,/if\(id\)movementQuery=movementQuery\.in/);
  assert.match(api,/product_pn:product\.pn/);
  assert.match(api,/p==='price-history'/);
  assert.match(api,/version:32/);
});

test('tela abre todos os itens e pesquisa produto, fornecedor e datas sem dropdown',()=>{
  assert.match(frontend,/Histórico de preços/);
  assert.match(frontend,/priceProductSearch/);
  assert.match(frontend,/priceSupplierSearch/);
  assert.match(frontend,/priceCatalogBody/);
  assert.match(frontend,/data-price-product/);
  assert.doesNotMatch(frontend,/makeSearchableDropdown/);
  assert.match(frontend,/Evolução do preço unitário/);
  assert.match(frontend,/Comparação por fornecedor/);
  assert.match(frontend,/Menor preço registrado/);
  assert.match(frontend,/Variação da última compra/);
  assert.match(frontend,/priceSupplierSearch/);
  assert.match(frontend,/const groups=new Map/);
  assert.match(frontend,/supplierGroups/);
  assert.match(frontend,/Ver histórico de preços/);
  assert.match(html,/estoque-price-history\.js\?v=2/);
  assert.match(html,/data-app-version="18"/);
});

test('entrada manual explica e cria automaticamente a nota fiscal vinculada',()=>{
  assert.match(packaging,/Número da nota fiscal \(opcional\)/);
  assert.match(packaging,/aparece automaticamente em Notas Fiscais/);
  assert.match(api,/inventory_register_manual_invoice_entry/);
  assert.match(api,/t==='ENTRADA'&&documentNumber/);
});
