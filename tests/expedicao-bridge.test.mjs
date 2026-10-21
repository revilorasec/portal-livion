import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { createHmac } from 'node:crypto';
import { source,groupFor,draftFor } from './expedicao-fixtures.mjs';
import { boxUpdates } from '../supabase/functions/expedicao-api/domain.mjs';
const code=await fs.readFile(new URL('../integracao/expedicao/Bridge.gs',import.meta.url),'utf8');
function setup(client,writeEnabled='true'){
 const s=source(client),width=client==='nokia'?25:38,headers=Array(width).fill(''),expected=client==='nokia'?{0:'ID',2:'Onde Está',6:'Nº Doc Envio',9:'Código de Barras',10:'Nº Série',11:'Part Number',18:'Nº Doc Liberação',20:'Data da Expedição',21:'Caixa',24:'Status do Atendimento'}:{0:'ID',3:'Onde está',7:'Nota Fiscal Claro',9:'CNPJ',10:'Centro',16:'Part. Number',17:'Nº de Série',20:'CÓD. SAP',31:'Status',36:'Caixa',37:'Nota fiscal retorno'};
 Object.entries(expected).forEach(([i,v])=>headers[Number(i)]=v);const col=i=>{let out='';do{out=String.fromCharCode(65+i%26)+out;i=Math.floor(i/26)-1;}while(i>=0);return out;};
 const data=[headers,...s.rows.map(r=>Array.from({length:width},(_,i)=>r[col(i)]||''))],cache=new Map();let writes=0;
 const context={JSON,Date,Math,Number,String,Array,Object,Error,PropertiesService:{getScriptProperties:()=>({getProperty:k=>({EXPEDICAO_CLIENT:client,EXPEDICAO_SPREADSHEET_ID:'isolated-test',EXPEDICAO_SECRET:'test-secret-not-real',EXPEDICAO_WRITE_ENABLED:writeEnabled})[k]})},Utilities:{formatDate:()=>'-0300',computeHmacSha256Signature:(value,key)=>[...createHmac('sha256',key).update(value).digest()].map(n=>n>127?n-256:n)},LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},CacheService:{getScriptCache:()=>({get:k=>cache.get(k),put:(k,v)=>cache.set(k,v)})},console:{log:()=>{}},SpreadsheetApp:{openById:()=>{throw Error('Broader scope forbidden');}},Sheets:{Spreadsheets:{get:()=>({properties:{timeZone:'America/Sao_Paulo'}}),Values:{get:(_,range,options)=>{assert.equal(options.valueRenderOption,'FORMATTED_VALUE');if(range.startsWith("'CD_Regional'"))return{values:[['CNPJ','Centro','','','CD'],['123','001','','','Cidade']]};return{values:structuredClone(data)};},batchUpdate:({data:updates})=>{writes++;for(const u of updates){const [,letters,row]=u.range.match(/!([A-Z]+)(\d+)/);let c=0;for(const l of letters)c=c*26+l.charCodeAt(0)-64;data[Number(row)-1][c-1]=String(u.values[0][0]);}},batchGet:(_,options)=>({valueRanges:options.ranges.map(range=>{const [,letters,row]=range.match(/!([A-Z]+)(\d+)/);let c=0;for(const l of letters)c=c*26+l.charCodeAt(0)-64;return{values:[[data[Number(row)-1][c-1]]]};})})}}},ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({setMimeType:()=>text})}};
 vm.createContext(context);vm.runInContext(code,context);
 const envelope=payload=>{const data=JSON.stringify(payload),timestamp=Date.now(),nonce=crypto.randomUUID(),signature=createHmac('sha256','test-secret-not-real').update(timestamp+'\n'+nonce+'\n'+data).digest('hex');return{timestamp,nonce,data,signature};};
 return{source:s,data,context,envelope,writes:()=>writes,call:(payload,mutate)=>{const e=envelope(payload);if(mutate)mutate(e);return JSON.parse(context.doPost({postData:{contents:JSON.stringify(e)}}));}};
}
test('signed bridges only write Nokia U/V or Claro AK; original statuses and all other cells preserved',async()=>{
 for(const client of ['nokia','claro']){const h=setup(client),group=await groupFor(client),draft=draftFor(group),updates=boxUpdates(group,draft),before=structuredClone(h.data);const r=h.call({action:'boxes',operationId:crypto.randomUUID(),actor:'operador@example.test',group,updates});assert.equal(r.ok,true,JSON.stringify(r));assert.equal(h.writes(),1);for(let row=1;row<h.data.length;row++)for(let c=0;c<h.data[row].length;c++)if(!(client==='nokia'?[20,21]:[36]).includes(c))assert.equal(h.data[row][c],before[row][c]);assert.equal(h.data[1][client==='nokia'?21:36],'1');}
});
test('invalid HMAC and changed member set/status are rejected before writes',async()=>{
 let h=setup('nokia'),group=await groupFor(),updates=boxUpdates(group,draftFor(group)),p={action:'boxes',operationId:crypto.randomUUID(),actor:'operador@example.test',group,updates};assert.equal(h.call(p,e=>e.signature='bad').ok,false);assert.equal(h.writes(),0);
 h.data[1][24]='STATUS ALTERADO';assert.equal(h.call(p).ok,false);assert.equal(h.writes(),0);
 h=setup('nokia');h.data.push([...h.data[1]]);h.data.at(-1)[0]='N_NEW';assert.equal(h.call(p).ok,false);assert.equal(h.writes(),0);

});

test('read-only scope uses Advanced Sheets without SpreadsheetApp or any writes',()=>{
 for(const client of ['nokia','claro']){
  const h=setup(client,'false');h.context.autorizarLeitura();const result=h.call({action:'read'});
  assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.rows.length,h.source.rows.length);
  assert.equal(h.call({action:'boxes'}).error,'WRITE_DISABLED');assert.equal(h.writes(),0);
 }
});


test('signed bridges accept any combination of unchanged statuses in the same box',async()=>{
 for(const client of ['nokia','claro']){
  const h=setup(client),group=await groupFor(client),draft=draftFor(group);draft.assignments[group.items[1].id]='1';
  const before=structuredClone(h.data),updates=boxUpdates(group,draft),result=h.call({action:'boxes',operationId:crypto.randomUUID(),actor:'operador@example.test',group,updates});
  assert.equal(result.ok,true,JSON.stringify(result));assert.equal(h.writes(),1);
  assert.equal(h.data[1][client==='nokia'?21:36],'1');assert.equal(h.data[2][client==='nokia'?21:36],'1');
  for(let row=1;row<h.data.length;row++)for(let col=0;col<h.data[row].length;col++)if(!(client==='nokia'?[20,21]:[36]).includes(col))assert.equal(h.data[row][col],before[row][col]);
 }
});
