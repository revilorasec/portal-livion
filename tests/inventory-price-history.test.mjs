import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const api=readFileSync(new URL('../supabase/functions/inventory-api/index.ts',import.meta.url),'utf8');
const frontend=readFileSync(new URL('../estoque-price-history.js',import.meta.url),'utf8');
const packaging=readFileSync(new URL('../estoque-packaging.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../estoque.html',import.meta.url),'utf8');

test('histórico de preços usa apenas entradas reais com valor e protege valores financeiros',()=>{
  assert.match(api,/async function priceHistory/);
  assert.match(api,/estoque\.visualizar_valores/);
  assert.match(api,/eq\('movement_type','ENTRADA'\)/);
  assert.match(api,/gt\('unit_value',0\)/);
  assert.match(api,/p==='price-history'/);
  assert.match(api,/version:30/);
});

test('tela compara evolução por componente e por fornecedor',()=>{
  assert.match(frontend,/Histórico de preços/);
  assert.match(frontend,/Evolução do preço unitário/);
  assert.match(frontend,/Comparação por fornecedor/);
  assert.match(frontend,/Menor preço registrado/);
  assert.match(frontend,/Variação da última compra/);
  assert.match(frontend,/priceSupplier/);
  assert.match(frontend,/const groups=new Map/);
  assert.match(frontend,/supplierGroups/);
  assert.match(frontend,/Ver histórico de preços/);
  assert.match(html,/estoque-price-history\.js\?v=1/);
});

test('entrada manual explica e cria automaticamente a nota fiscal vinculada',()=>{
  assert.match(packaging,/Número da nota fiscal \(opcional\)/);
  assert.match(packaging,/aparece automaticamente em Notas Fiscais/);
  assert.match(api,/inventory_register_manual_invoice_entry/);
  assert.match(api,/t==='ENTRADA'&&documentNumber/);
});
