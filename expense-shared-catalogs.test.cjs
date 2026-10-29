const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const ui=fs.readFileSync('despesas-reembolsos-v2.js','utf8');
const api=fs.readFileSync('supabase/functions/expenses-api/index.ts','utf8');
const catalogApi=fs.readFileSync('supabase/functions/expense-catalog-api/index.ts','utf8');
const migration=fs.readFileSync('supabase/migrations/20261028213231_share_expense_catalogs.sql','utf8');

test('all classification catalogs are global in the UI',()=>{
  assert.match(ui,/type:'cost_center'.*global:true/);
  assert.match(ui,/type:'project'.*global:true/);
  assert.match(ui,/opts\(B\.costCenters\|\|\[\],'cost_center_id'/);
  assert.match(ui,/opts\(B\.projects\|\|\[\],'project_id'/);
  assert.doesNotMatch(ui,/B\.costCenters\|\|\[\]\)\.filter\(x=>x\.company_key/);
});

test('bootstrap reads the same global rows for either company',()=>{
  assert.match(api,/expense_cost_centers'\)\.select\('\*'\)\.is\('company_key',null\)/);
  assert.match(api,/expense_projects'\)\.select\('\*'\)\.is\('company_key',null\)/);
});

test('catalog API always saves one global record and rejects active duplicates',()=>{
  assert.match(catalogApi,/company_key:null/);
  assert.match(catalogApi,/\.is\('company_key',null\)\.eq\('active',true\)\.ilike\('name',row\.name\)/);
});

test('migration reuses active records and enforces unique global names',()=>{
  assert.match(migration,/update public\.expense_cost_centers[\s\S]*set company_key = null/);
  assert.match(migration,/update public\.expense_projects[\s\S]*set company_key = null/);
  assert.match(migration,/expense_cost_centers_global_active_name_uq/);
  assert.match(migration,/expense_projects_global_active_name_uq/);
});
