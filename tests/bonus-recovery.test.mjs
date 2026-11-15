import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),Engine=require('../desempenho-funcionarios/bonus-engine.js'),Recovery=require('../desempenho-funcionarios/bonus-recovery.js');
test('busca cópias antigas sem alterar o armazenamento ou apresentar os padrões como recuperação',()=>{
  const old=Engine.defaults();old.bands[1].baseLow=1.11;old.mediumPct=15;
  const data=new Map([['portalBonusConfigV4',JSON.stringify(old)],['portalBonusConfigV3',JSON.stringify(old)],['portalBonusConfigV2',JSON.stringify(Engine.defaults())]]);
  const before=JSON.stringify([...data]);const candidates=Recovery.findCandidates({getItem:key=>data.get(key)||null},Engine,Engine.defaults());
  assert.equal(candidates.length,1);assert.equal(candidates[0].config.bands[1].baseLow,1.11);assert.equal(JSON.stringify([...data]),before);
});
test('carregar cópia recupera só as regras, mantendo os PNs e técnicos atuais',()=>{
  const current=Engine.defaults();current.pnLevels.PN=2;current.technicians.TESTE='inactive';
  const old=Engine.defaults();old.bands[1].baseLow=1.11;old.pnLevels.OUTRO=1;
  const result=Recovery.applyCandidate(current,{config:old},Engine);
  assert.equal(result.bands[1].baseLow,1.11);assert.deepEqual(result.pnLevels,{PN:2});assert.equal(result.technicians.TESTE,'inactive');assert.equal(current.bands[1].baseLow,2.5);
});
test('ausência de cópia, JSON inválido e faixas com lacunas não geram valores inventados',()=>{
  const bad=Engine.defaults();bad.bands[1].min=65;
  const data=new Map([['portalBonusConfigV4','invalido'],['portalBonusConfigV3',JSON.stringify(bad)]]);
  assert.deepEqual(Recovery.findCandidates({getItem:key=>data.get(key)||null},Engine,Engine.defaults()),[]);
});
