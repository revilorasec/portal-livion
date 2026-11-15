import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const require=createRequire(import.meta.url),Engine=require('../desempenho-funcionarios/bonus-engine.js');
const source=readFileSync(new URL('../desempenho-funcionarios/bonus-upgrade-v1.js',import.meta.url),'utf8');
function harness({admin=true}={}){
  const saved=Engine.defaults();saved.bands[1].baseLow=1.3;saved.pnLevels.TEST=2;
  let remote=structuredClone(saved),revision=20,conflict=false;
  const requests=[],storage=new Map(),nodes=new Map();
  for(const [id,value] of [['bonusMediumPct',25],['bonusComplexHighPct',50],['bonusRates',''],['bonusSettingsStatus',''],['bonusWarning','']])nodes.set(id,{value,innerHTML:'',textContent:'',classList:{toggle(){}}});
  const scope={window:{BonusEngine:Engine},localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},
    PANEL_API:'https://example.test/panel-data',portalToken:async()=> 'test-token',location:{hostname:'example.test'},console,
    $:id=>nodes.get(id)||null,document:{querySelectorAll:()=>[]},
    setupTeam(){},setupBonus(){},renderAll(){},fetchPanelPayload(){},money(){},esc:value=>value,txt:value=>String(value??''),norm:value=>String(value??''),
    savedBonusConfig(){},saveBonusConfig(){},readBonusConfig(){},bonusConfigWarnings(){},bonusMultiplier(){},pnLevel(){},renderBonusConfig(){},showBonusWarnings(){},calculateBonusMonth(){},renderBonus(){},renderBonusPn(){},setupBonusTrendTechs(){},renderBonusTrend(){},bonusRowsForMonth(){},
    confirm:()=>true,fetch:async(url,options)=>{
      requests.push({method:options.method,body:options.body?JSON.parse(options.body):null});
      if(options.method==='PUT'&&conflict)return {status:409,ok:false,json:async()=>({message:'Conflito de revisão'})};
      if(options.method==='PUT'){remote=JSON.parse(options.body).config;revision++}
      return {status:200,ok:true,json:async()=>({config:structuredClone(remote),revision,canManage:admin,updatedAt:'2026-11-15T15:00:00Z'})};
    }};
  runInNewContext(source.slice(0,source.indexOf('\ninjectUi();'))+'\nglobalThis.SettingsTest={loadRemoteSettings,saveRemoteSettings,restoreSavedRules,getConfig:()=>savedBonusConfig(),edit:saveBonusConfig,read:readBonusConfig};})();',scope);
  return {api:scope.SettingsTest,requests,storage,nodes,setConflict:value=>conflict=value,remote:()=>remote};
}
test('edições e redesenhos não enviam PUT; só Gravar regras compartilha os valores',async()=>{
  const h=harness();await h.api.loadRemoteSettings();const config=h.api.getConfig();config.bands[1].baseLow=1.85;h.api.edit(config);h.api.read();h.api.read();
  assert.equal(h.requests.filter(r=>r.method==='PUT').length,0);assert.equal(h.remote().bands[1].baseLow,1.3);
  await h.api.saveRemoteSettings();assert.equal(h.requests.filter(r=>r.method==='PUT').length,1);assert.equal(h.remote().bands[1].baseLow,1.85);
  assert.equal(JSON.parse(h.storage.get('portalBonusSavedConfigV1')).bands[1].baseLow,1.85);
});
test('Restaurar regras recupera último valor gravado e não o padrão de fábrica',async()=>{
  const h=harness();await h.api.loadRemoteSettings();const config=h.api.getConfig();config.bands[1].baseLow=9.99;config.pnLevels.OTHER=1;h.api.edit(config);
  await h.api.restoreSavedRules();assert.equal(h.api.getConfig().bands[1].baseLow,1.3);assert.equal(h.api.getConfig().pnLevels.OTHER,1);
  assert.equal(h.requests.filter(r=>r.method==='PUT').length,0);
});
test('conflitos e faixas inválidas não substituem a configuração gravada',async()=>{
  const h=harness();await h.api.loadRemoteSettings();const config=h.api.getConfig();config.bands[1].min=10;h.api.edit(config);await h.api.saveRemoteSettings();assert.equal(h.requests.filter(r=>r.method==='PUT').length,0);
  config.bands[1].min=61;config.bands[1].baseLow=1.85;h.api.edit(config);h.setConflict(true);await h.api.saveRemoteSettings();assert.equal(h.remote().bands[1].baseLow,1.3);assert.equal(h.api.getConfig().bands[1].baseLow,1.85);
});
test('usuário sem permissão não grava ou restaura regras',async()=>{
  const h=harness({admin:false});await h.api.loadRemoteSettings();await h.api.saveRemoteSettings();await h.api.restoreSavedRules();assert.equal(h.requests.length,1);
});
