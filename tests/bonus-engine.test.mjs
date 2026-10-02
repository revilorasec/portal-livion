import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const Engine=require('../desempenho-funcionarios/bonus-engine.js');
const month=value=>String(value).slice(0,7);
const row=(tech,status,pn,client='Claro',date='2026-05-10')=>({tecnico:tech,status,partNumber:pn,cliente:client,dataDevolucao:date,devolvido:true,dataFormula:false});
const config=()=>Engine.migrateConfig({
  mediumPct:50,highComplexityPct:100,highRepairabilityPct:25,
  bands:[{min:0,max:0,baseLow:0},{min:1,max:4,baseLow:2},{min:5,max:null,baseLow:4}],
  pnLevels:{'Claro|LOW':0,'Claro|MED':1,'Claro|HIGH':2},technicians:{}
});

test('migra multiplicadores e classificações existentes sem perder os PNs',()=>{
  const migrated=Engine.migrateConfig({startPct:70,highPct:80,multipliers:[1,1.25,1.5],bands:[{min:0,max:60,standard:0,high:0},{min:61,max:null,standard:2.5,high:3}],pnLevels:{'Claro|ABC':2}});
  assert.equal(migrated.mediumPct,25);assert.equal(migrated.highComplexityPct,50);assert.equal(migrated.highRepairabilityPct,0);
  assert.deepEqual(migrated.pnLevels,{ABC:2});assert.equal(migrated.bands[1].baseLow,2.5);assert.equal(migrated.version,6);
});

test('normaliza o PN e usa uma classificação única para Claro e Nokia',()=>{
  assert.equal(Engine.canonicalPn('241.119.105'),'241119105');
  assert.equal(Engine.canonicalPn('241119.105'),'241119105');
  const c=config();c.pnLevels['241119105']=2;
  const rows=[row('ANA','REPARADO','241.119.105','Claro'),row('ANA','REPARADO','241119105','Nokia')];
  const [result]=Engine.calculateMonth(rows,'2026-05',c,{returnMonth:month});
  assert.deepEqual(result.levels,[0,0,2]);assert.equal(result.partNumbers.length,1);assert.deepEqual(result.partNumbers[0].clientes.sort(),['Claro','Nokia']);assert.equal(result.bonus,10);
});

test('conflito antigo entre clientes volta para não classificado',()=>{
  const migrated=Engine.migrateConfig({pnLevels:{'Claro|241.119.105':0,'Nokia|241119105':2}});
  assert.equal(migrated.pnLevels['241119105'],undefined);
});

test('calcula Baixa Média e Alta a partir de uma única base por faixa',()=>{
  const rows=[row('ANA','REPARADO','LOW'),row('ANA','REPARADO','LOW'),row('ANA','REPARADO','MED'),row('ANA','REPARADO','HIGH')];
  const [result]=Engine.calculateMonth(rows,'2026-05',config(),{returnMonth:month,selectedTechs:['ANA']});
  assert.deepEqual(result.levels,[2,1,1]);
  assert.deepEqual(result.complexity.map(item=>item.unitRate),[2.5,3.75,5]);
  assert.equal(result.bonus,13.75);assert.equal(result.partNumbers.reduce((sum,item)=>sum+item.subtotal,0),result.bonus);
});

test('a quantidade reparada define a faixa e o acréscimo começa exatamente em 80%',()=>{
  const rows=[row('ANA','REPARADO','LOW'),row('ANA','REPARADO','LOW'),row('ANA','REPARADO','MED'),row('ANA','IRREPARÁVEL','X')];
  const [result]=Engine.calculateMonth(rows,'2026-05',config(),{returnMonth:month});
  assert.equal(result.repairability,75);assert.equal(result.bandIndex,1);assert.equal(result.bonus,7);
  const lowRepair=[row('BIA','REPARADO','LOW'),...Array.from({length:9},()=>row('BIA','IRREPARÁVEL','X'))];
  const [stillPaid]=Engine.calculateMonth(lowRepair,'2026-05',config(),{returnMonth:month});assert.equal(stillPaid.repairability,10);assert.equal(stillPaid.bonus,2);
  const exactly80=[row('CARLA','REPARADO','LOW'),row('CARLA','REPARADO','LOW'),row('CARLA','REPARADO','LOW'),row('CARLA','REPARADO','LOW'),row('CARLA','IRREPARÁVEL','X')];
  const [uplifted]=Engine.calculateMonth(exactly80,'2026-05',config(),{returnMonth:month});assert.equal(uplifted.repairability,80);assert.equal(uplifted.highRepairabilityApplied,true);assert.equal(uplifted.bonus,10);
  const five=[...rows.slice(0,3),row('ANA','REPARADO','LOW'),row('ANA','REPARADO','LOW')];
  const [next]=Engine.calculateMonth(five,'2026-05',config(),{returnMonth:month});assert.equal(next.repaired,5);assert.equal(next.bandIndex,2);
});

test('Faixa 0 explica bônus zero e PN não classificado usa o valor da Baixa',()=>{
  const zero=Engine.calculateMonth([row('ANA','IRREPARÁVEL','X')],'2026-05',config(),{returnMonth:month})[0];
  assert.equal(zero.bonus,0);assert.match(zero.reasons.join(' '),/Faixa 0/);
  const missing=Engine.calculateMonth([row('ANA','REPARADO','SEM-CADASTRO')],'2026-05',config(),{returnMonth:month})[0];
  assert.equal(missing.bonus,2.5);assert.equal(missing.unclassified,1);assert.equal(missing.complexity[0].quantity,1);assert.match(missing.reasons.join(' '),/valor da Baixa/);
});

test('percentuais de complexidade zerados preservam o valor-base da faixa',()=>{
  const c=config();c.mediumPct=0;c.highComplexityPct=0;c.highRepairabilityPct=0;
  const rows=[row('ANA','REPARADO','LOW'),row('ANA','REPARADO','MED'),row('ANA','REPARADO','HIGH'),row('ANA','REPARADO','SEM-CADASTRO')];
  const [result]=Engine.calculateMonth(rows,'2026-05',c,{returnMonth:month});
  assert.equal(result.bonus,8);assert.deepEqual(result.complexity.map(item=>item.unitRate),[2,2,2]);
});

test('seleção e status do técnico são aplicados na fonte do cálculo sem apagar histórico',()=>{
  const c=config();c.technicians.BRUNO='inactive';const rows=[row('ANA','REPARADO','LOW'),row('BRUNO','REPARADO','LOW')];
  assert.deepEqual(Engine.calculateMonth(rows,'2026-05',c,{returnMonth:month,selectedTechs:['ANA']}).map(x=>x.name),['ANA']);
  assert.equal(Engine.calculateMonth(rows,'2026-05',c,{returnMonth:month,selectedTechs:['BRUNO']}).length,0);
  const historical=Engine.calculateMonth(rows,'2026-05',c,{returnMonth:month,selectedTechs:['BRUNO'],includeInactive:true})[0];
  assert.equal(historical.name,'BRUNO');assert.equal(historical.bonus,0);assert.match(historical.reasons.join(' '),/inativo/);
});

test('valida lacunas, sobreposições e arredondamento monetário',()=>{
  const gap=config();gap.bands=[{min:0,max:5,baseLow:0},{min:7,max:null,baseLow:1}];assert.match(Engine.validateConfig(gap).warnings.join(' '),/lacuna/);
  const overlap=config();overlap.bands=[{min:0,max:5,baseLow:0},{min:5,max:null,baseLow:1}];assert.match(Engine.validateConfig(overlap).warnings.join(' '),/sobrepõem/);
  const rounded=config();rounded.mediumPct=33;rounded.highRepairabilityPct=0;rounded.bands[1].baseLow=1.01;
  const result=Engine.calculateMonth([row('ANA','REPARADO','MED')],'2026-05',rounded,{returnMonth:month})[0];assert.equal(result.complexity[1].unitRate,1.34);assert.equal(result.bonus,1.34);
});
