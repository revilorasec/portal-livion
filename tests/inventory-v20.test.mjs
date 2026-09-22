import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const frontend = readFileSync(new URL('../estoque-assets-v18-core.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../estoque-assets-v18.css', import.meta.url), 'utf8');
const api = readFileSync(new URL('../supabase/functions/inventory-api/index.ts', import.meta.url), 'utf8');

test('cadastro sempre oferece componente e insumo', () => {
  assert.match(frontend, /\['Componente', 'Insumo', \.\.\.values\]/);
  assert.match(frontend, /type === 'TYPE'/);
});

test('ajuste de estoque reaparece com permissão, motivo e tipos positivo e negativo', () => {
  assert.match(frontend, /quickAdjust/);
  assert.match(frontend, /mAdjust/);
  assert.match(frontend, /D\.permissions\.adjust/);
  assert.match(frontend, /AJUSTE_POSITIVO/);
  assert.match(frontend, /AJUSTE_NEGATIVO/);
  assert.match(frontend, /Motivo do ajuste/);
  assert.match(frontend, /occurred_at: selectedOccurredAt\(\)/);
  assert.match(api, /AJUSTE_POSITIVO:'estoque\.ajustar'/);
  assert.match(api, /AJUSTE_NEGATIVO:'estoque\.ajustar'/);
});

test('nota pode ficar pendente sem fornecedor ou produtos vinculados', () => {
  assert.match(frontend, /Guardar nota sem lançar estoque/);
  assert.match(frontend, /Nenhum saldo foi alterado/);
  assert.match(frontend, /Fornecedor opcional/);
  assert.match(frontend, /const ready = linked === detail\.items\.length/);
  assert.doesNotMatch(frontend, /const ready = !!supplier && linked === detail\.items\.length/);
});

test('produto da nota é escolhido em janela ampla pesquisável', () => {
  assert.match(frontend, /chooseInvoiceProduct/);
  assert.match(frontend, /Pesquisar por PN, descrição, código ou localização/);
  assert.match(frontend, /Escolher produto no estoque/);
  assert.match(css, /invoice-product-picker-backdrop/);
  assert.match(css, /height:min\(760px,calc\(100vh - 36px\)\)/);
  assert.match(css, /invoice-product-results\{min-height:0;overflow:auto/);
});
