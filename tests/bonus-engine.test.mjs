import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const Engine=require('../desempenho-funcionarios/bonus-engine.js');
const month=value=>String(value).slice(0,7);
const row=(tech,status,pn,client='Claro',date='2026-05-10')=>({tecnico:tech,status,partNumber:pn,cliente:client,dataDevolucao:date,devolvido:true,dataFormula:false});
const config=()=>Engine.migrateConfig({
  startPct:70,highPct:80,mediumPct:50,highComplexityPct:100,
  bands:[{min:0,max:0,baseStandard:0,baseHigh:0},{min:1,max:4,baseStandard:2,baseHigh:3},{min:5,max:null,baseStandard:4,baseHigh:5}],
  pnLevels:{'Claro|LOW':0,'Claro|MED':1,'Claro|HIGH':2},technicians:{}
});

test('migra multiplicadores e classificações existentes sem perder os PNs',()=>{
  const migrated=Engine.migrateConfig({startPct:70,highPct:80,multipliers:[1,1.25,1.5],bands:[{min:0,max:60,standard:0,high:0},{min:61,max:null,standard:2.5,high:3}],pnLevels:{'Claro|ABC':2}});
  assert.equal(migrated.mediumPct,25);assert.equal(migrated.highComplexityPct,50);
  assert.deepEqual(migrated.pnLevels,{'Claro|ABC':2});assert.equal(migrated.bands[1].baseStandard,2.5);assert.equal(migrated.bands[1].baseHigh,3);
});

test('preserva as duas bases de reparabilidade e calcula Baixa Média e Alta',()=>{
  const rows=[row('ANA','REPARADO','LOW'),row('ANA','REPARADO','LOW'),row('ANA','REPARADO','MED'),row('ANA','REPARADO','HIGH')];
  const [result]=Engine.calculateMonth(rows,'2026-05',config(),{returnMonth:month,selectedTechs:['ANA']});
  assert.equal(result.tier,'high');assert.deepEqual(result.levels,[2,1,1]);
  assert.deepEqual(result.complexity.map(item=>item.unitRate),[3,4.5,6]);
  assert.equal(result.bonus,16.5);assert.equal(result.partNumbers.reduce((sum,item)=>sum+item.subtotal,0),result.bonus);
});

test('usa a base padrão abaixo da faixa alta e respeita limites exatos',()=>{
  const rows=[row('ANA','REPARADO','LOW'),row('ANA','REPARADO','LOW'),row('ANA','REPARADO','MED'),row('ANA','IRREPARÁVEL','X')];
  const [result]=Engine.calculateMonth(rows,'2026-05',config(),{returnMonth:month});
  assert.equal(result.repairability,75);assert.equal(result.tier,'standard');assert.equal(result.bandIndex,1);assert.equal(result.bonus,7);
  const five=[...rows.slice(0,3),row('ANA','REPARADO','LOW'),row('ANA','REPARADO','LOW')];
  const [next]=Engine.calculateMonth(five,'2026-05',config(),{returnMonth:month});assert.equal(next.repaired,5);assert.equal(next.bandIndex,2);
});

test('Faixa 0, reparabilidade insuficiente e PN não classificado explicam bônus zero',()=>{
  const zero=Engine.calculateMonth([row('ANA','IRREPARÁVEL','X')],'2026-05',config(),{returnMonth:month})[0];
  assert.equal(zero.bonus,0);assert.match(zero.reasons.join(' '),/Faixa 0/);
  const lowRepair=Engine.calculateMonth([row('ANA','REPARADO','LOW'),row('ANA','IRREPARÁVEL','X')],'2026-05',config(),{returnMonth:month})[0];
  assert.equal(lowRepair.bonus,0);assert.match(lowRepair.reasons.join(' '),/abaixo do mínimo/);
  const missing=Engine.calculateMonth([row('ANA','REPARADO','SEM-CADASTRO')],'2026-05',config(),{returnMonth:month})[0];
  assert.equal(missing.bonus,0);assert.equal(missing.unclassified,1);assert.match(missing.reasons.join(' '),/sem classificação/);
});

test('seleção e status do técnico são aplicados na fonte do cálculo sem apagar histórico',()=>{
  const c=config();c.technicians.BRUNO='inactive';const rows=[row('ANA','REPARADO','LOW'),row('BRUNO','REPARADO','LOW')];
  assert.deepEqual(Engine.calculateMonth(rows,'2026-05',c,{returnMonth:month,selectedTechs:['ANA']}).map(x=>x.name),['ANA']);
  assert.equal(Engine.calculateMonth(rows,'2026-05',c,{returnMonth:month,selectedTechs:['BRUNO']}).length,0);
  const historical=Engine.calculateMonth(rows,'2026-05',c,{returnMonth:month,selectedTechs:['BRUNO'],includeInactive:true})[0];
  assert.equal(historical.name,'BRUNO');assert.equal(historical.bonus,0);assert.match(historical.reasons.join(' '),/inativo/);
});

test('valida lacunas, sobreposições e arredondamento monetário',()=>{
  const gap=config();gap.bands=[{min:0,max:5,baseStandard:0,baseHigh:0},{min:7,max:null,baseStandard:1,baseHigh:1}];assert.match(Engine.validateConfig(gap).warnings.join(' '),/lacuna/);
  const overlap=config();overlap.bands=[{min:0,max:5,baseStandard:0,baseHigh:0},{min:5,max:null,baseStandard:1,baseHigh:1}];assert.match(Engine.validateConfig(overlap).warnings.join(' '),/sobrepõem/);
  const rounded=config();rounded.mediumPct=33;rounded.bands[1].baseHigh=1.01;
  const result=Engine.calculateMonth([row('ANA','REPARADO','MED')],'2026-05',rounded,{returnMonth:month})[0];assert.equal(result.complexity[1].unitRate,1.34);assert.equal(result.bonus,1.34);
});
