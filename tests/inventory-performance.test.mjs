import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../estoque-performance.js',import.meta.url),'utf8');
function helpers(){
  let numberFormats=0,dateFormats=0;
  const context=vm.createContext({window:{},document:{readyState:'loading',addEventListener(){}},Intl:{NumberFormat:function(...args){numberFormats++;return new Intl.NumberFormat(...args)},DateTimeFormat:function(...args){dateFormats++;return new Intl.DateTimeFormat(...args)}}});
  vm.runInContext(source,context);
  return {api:context.window.InventoryPerformance,counts:()=>({numberFormats,dateFormats})};
}
test('reutiliza os formatadores preservando números, moeda e datas',()=>{
  const h=helpers();for(let i=0;i<5000;i++){h.api.formatNumber(i);h.api.formatMoney(i);h.api.formatDate('2026-11-18T12:00:00Z')}
  assert.deepEqual(h.counts(),{numberFormats:2,dateFormats:1});
  assert.equal(h.api.formatNumber(1234.5),'1.234,5');assert.match(h.api.formatMoney(1234.5),/1\.234,50/);
  assert.equal(h.api.formatDate(null),'—');assert.equal(h.api.formatDate('invalid'),'Invalid Date');
});
test('índices preservam nomes atualizados e são refeitos após recarregar ou adicionar itens',()=>{
  const {api}=helpers();const rows=[{id:'P1',name:'Antes'}];
  assert.equal(api.lookup(rows,'id','P1'),rows[0]);rows[0].name='Depois';assert.equal(api.lookup(rows,'id','P1').name,'Depois');
  rows.push({id:'P2',name:'Novo'});assert.equal(api.lookup(rows,'id','P2').name,'Novo');
  assert.equal(api.lookup([{id:'P1',name:'Recarregado'}],'id','P1').name,'Recarregado');
  assert.equal(api.lookup([{email:'Pessoa@Example.invalid'}],'email','pessoa@example.invalid',true).email,'Pessoa@Example.invalid');
});
test('buscas continuam encontrando textos sem acentos e com letras maiúsculas',()=>{
  const {api}=helpers();assert.equal(api.normalize('ÁLCOOL São Paulo'),'alcool sao paulo');
  assert.equal(api.normalize('ÁLCOOL São Paulo'),'alcool sao paulo');assert.equal(api.normalize(null),'');
});
