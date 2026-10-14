import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {availableDispatchUnits,calculateBaseQuantity,calculateDispatchFactor} from '../supabase/functions/inventory-packaging-api/logic.mjs';

test('10 kg divided into 20 rolls gives 0.5 kg per roll',()=>{
  assert.equal(calculateDispatchFactor(10,20),0.5);
  assert.equal(calculateBaseQuantity(1,0.5),0.5);
  assert.equal(availableDispatchUnits(10,0.5),20);
});

test('roll exits require whole positive quantities',()=>{
  assert.throws(()=>calculateBaseQuantity(1.5,0.5),/INVALID_DISPATCH_QUANTITY/);
  assert.throws(()=>calculateBaseQuantity(0,0.5),/INVALID_DISPATCH_QUANTITY/);
});

test('backend stores both operational and base quantities',()=>{
  const source=readFileSync(new URL('../supabase/functions/inventory-packaging-api/index.ts',import.meta.url),'utf8');
  assert.match(source,/dispatch_quantity:dispatchQuantity/);
  assert.match(source,/unit:baseUnit,dispatch_unit:dispatchUnit/);
  assert.match(source,/base_quantity_per_dispatch_unit:product\.data\.base_quantity_per_dispatch_unit/);
  assert.match(source,/p_quantity:baseQuantity/);
  assert.match(source,/INSUFFICIENT_STOCK/);
});
