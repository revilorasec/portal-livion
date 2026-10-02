import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const api=readFileSync(new URL('../supabase/functions/inventory-api/index.ts',import.meta.url),'utf8');
const ui=readFileSync(new URL('../estoque-registry-merge.js',import.meta.url),'utf8');
const migration=readFileSync(new URL('../supabase/migrations/20261002170000_inventory_registry_merges.sql',import.meta.url),'utf8');

test('merge is previewed before it is applied',()=>{
  assert.match(ui,/apply:false/);
  assert.match(ui,/Confira antes de concluir/);
  assert.match(ui,/apply:true/);
  assert.match(api,/p_apply:apply/);
});

test('historical movements stay immutable and are resolved through aliases',()=>{
  assert.doesNotMatch(migration,/update\s+public\.inventory_movements/i);
  assert.match(migration,/inventory_registry_merges/);
  assert.match(api,/supplierAliases\.get\(m\.supplier_id\)/);
  assert.match(api,/productAliases\.get\(m\.product_id\)/);
});

test('product merge transfers the live balance with auditable adjustments',()=>{
  assert.match(migration,/CADASTRO_MESCLAGEM/);
  assert.match(migration,/AJUSTE_NEGATIVO/);
  assert.match(migration,/AJUSTE_POSITIVO/);
  assert.match(migration,/update public\.inventory_lots set product_id=p_target_id/);
});

test('supplier merge relinks invoices, products and procurement records',()=>{
  assert.match(migration,/update public\.inventory_invoices set supplier_id=p_target_id/);
  assert.match(migration,/inventory_product_suppliers/);
  assert.match(migration,/update public\.procurement_orders set supplier_id=p_target_id/);
  assert.match(migration,/update public\.procurement_offers set supplier_id=p_target_id/);
});

