import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {sortValue,compare}=require('../desempenho-funcionarios/table-sort.js');

test('ordena valores brasileiros numericamente e mantém ausências no final nos dois sentidos',()=>{
  const values=['R$ 1.245,00','R$ 90,00','R$ 0,00','—'];
  const sort=direction=>[...values].sort((a,b)=>compare(sortValue(a,'Valor recebido'),sortValue(b,'Valor recebido'),direction));
  assert.deepEqual(sort('ascending'),['R$ 0,00','R$ 90,00','R$ 1.245,00','—']);
  assert.deepEqual(sort('descending'),['R$ 1.245,00','R$ 90,00','R$ 0,00','—']);
  assert.equal(sortValue('89,13%','Reparabilidade'),89.13);
  assert.equal(sortValue('1.234','Reparadas'),1234);
  assert.equal(sortValue('12,5 dias','Tempo médio'),12.5);
});

test('ordena meses e datas por calendário, inclusive ao mudar o ano',()=>{
  const values=['outubro de 2026','fevereiro de 2027','janeiro de 2026','dezembro de 2026'];
  assert.deepEqual(values.sort((a,b)=>compare(sortValue(a,'Mês'),sortValue(b,'Mês'))),
    ['janeiro de 2026','outubro de 2026','dezembro de 2026','fevereiro de 2027']);
  assert.ok(compare(sortValue('30/10/2026','Devolução'),sortValue('02/11/2026','Devolução'))<0);
  assert.equal(sortValue('outubro, 2026','Medição de origem'),sortValue('2026-10','Medição de origem'));
});

test('nomes respeitam o alfabeto português e identificadores conservam precisão',()=>{
  const names=['ZÉ','BRUNO','ÁLVARO','ARGEU CÉSAR'];
  assert.deepEqual(names.sort((a,b)=>compare(sortValue(a,'Técnico'),sortValue(b,'Técnico'))),
    ['ÁLVARO','ARGEU CÉSAR','BRUNO','ZÉ']);
  assert.equal(sortValue('000012345678901234567890','Part Number'),'000012345678901234567890');
  assert.ok(compare(sortValue('PN2','Part Number'),sortValue('PN10','Part Number'))<0);
});
