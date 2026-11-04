import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import {validateCatalog,validateOperation,operationKey} from '../supabase/functions/finance-api/transceivers.mjs';
import {attachTransceiversBridge} from '../painel-financeiro/transceivers-bridge.mjs';
const source=readFileSync(new URL('../supabase/functions/finance-api/index.ts',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'');
function harness(admin=true){
 let handler;const tables={finance_transceiver_catalog:[],finance_transceiver_operations:[],finance_transceiver_references:[]};
 class Query{
  constructor(table){this.table=table;this.filters=[];}
  select(){return this;}order(){return this;}limit(){return this;}range(from,to){this.page=[from,to];return this;}eq(k,v){this.filters.push([k,v]);return this;}insert(v){this.value=v;this.action='insert';return this;}update(v){this.value=v;this.action='update';return this;}
  async result(single=false){let rows=tables[this.table].filter(r=>this.filters.every(([k,v])=>r[k]===v));if(this.action==='insert'){
   if(tables[this.table].some(r=>this.table.endsWith('catalog')?r.product_code===this.value.product_code:r.source_key===this.value.source_key))return {error:{code:'23505'}};
   tables[this.table].push(this.value);rows=[this.value];
  }else if(this.action==='update')rows.forEach(r=>Object.assign(r,this.value));if(this.page)rows=rows.slice(this.page[0],this.page[1]+1);return {data:single?rows[0]??null:rows};}
  maybeSingle(){return this.result(true);}single(){return this.result(true);}then(cb){return this.result().then(cb);}
 }
 vm.runInContext(stripTypeScriptTypes(source),vm.createContext({validateCatalog,validateOperation,createClient:()=>({from:t=>new Query(t)}),Deno:{env:{get:()=> 'https://example.test'},serve:cb=>handler=cb},fetch:async()=>new Response(JSON.stringify({authenticated:true,administrator:admin,profile:admin?'ADMINISTRADOR':'SOCIO',userType:'INTERNO',apps:['painel-financeiro'],companies:['LIVION'],actions:['painel-financeiro.visualizar'],user:{email:'synthetic@example.test'}})),Error,Response,Request,URL,AbortSignal,Uint8Array,TextDecoder,TextEncoder,crypto,console}));
 return {tables,call:(path,body,headers={})=>handler(new Request('https://example.test/functions/v1/finance-api'+path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+'x'.repeat(30),'content-type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{})}))};
}
test('catalog updates keep history, reject stale revisions and share read-only access',async()=>{
 const h=harness(),payload={product_code:'P1',revision:0,fields:{modelo:'SFP 1G',fabricante:'Known'}};
 assert.equal((await h.call('/transceivers/catalog',payload)).status,200);
 assert.equal((await h.call('/transceivers/catalog',payload)).status,409);
 assert.equal((await h.call('/transceivers/catalog',{...payload,revision:1,fields:{...payload.fields,distancia:'10km'}})).status,200);
 const row=h.tables.finance_transceiver_catalog[0];assert.equal(row.revision,2);assert.equal(row.history.length,1);assert.equal(row.history[0].fields.fabricante,'Known');
 const read=await (await h.call('/transceivers')).json();assert.equal(read.catalog.length,1);
 const denied=harness(false);assert.equal((await denied.call('/transceivers/catalog',payload)).status,403);assert.equal((await denied.call('/transceivers')).status,200);assert.equal(denied.tables.finance_transceiver_catalog.length,0);
});
test('complete private history crosses API page boundaries without truncation',async()=>{
 const h=harness();h.tables.finance_transceiver_operations.push(...Array.from({length:1201},(_,i)=>({id:String(i),quantity:1})));
 assert.equal((await (await h.call('/transceivers')).json()).operations.length,1201);
});
test('operations block ERP and manual duplicates, enforce cost coverage and bounded input',async()=>{
 const h=harness(),sale={kind:'sale',product_code:'P1',document:'NF 10',counterparty:'Client',date:'2026-01-01',quantity:2,unit_price:50};
 h.tables.finance_transceiver_references.push({source_key:operationKey(sale)});
 assert.equal((await h.call('/transceivers/operations',sale)).status,409);
 assert.equal((await h.call('/transceivers/operations',{...sale,document:'11'})).status,201);
 assert.equal(h.tables.finance_transceiver_operations[0].unit_cost,null);
 assert.equal((await h.call('/transceivers/operations',{...sale,document:'11'})).status,409);
 assert.equal((await h.call('/transceivers/operations',{...sale,kind:'purchase'})).status,400);
 assert.equal((await h.call('/transceivers/catalog',{product_code:'P1',fields:{observacoes:'x'.repeat(13000)}})).status,413);
 assert.equal((await harness(false).call('/transceivers/operations',sale)).status,403);
});
test('opaque bridge accepts only its active frame and drops responses from old sessions',async()=>{
 let listener,active=true,version=1,resolveCall;const calls=[],replies=[],frame={contentWindow:{postMessage:r=>replies.push(r)}};
 const previous=globalThis.addEventListener;globalThis.addEventListener=(_,cb)=>listener=cb;
 try{attachTransceiversBridge({frame,isActive:()=>active,version:()=>version,call:async(...args)=>{calls.push(args);return new Promise(r=>resolveCall=r);}});}finally{globalThis.addEventListener=previous;}
 const data={type:'LIVION_TRANSCEIVERS_REQUEST',requestId:'12345678-1234-1234-1234-123456789abc',action:'load'};
 await listener({data,source:{},origin:'null'});await listener({data,source:frame.contentWindow,origin:'https://attacker.test'});assert.equal(calls.length,0);
 const pending=listener({data,source:frame.contentWindow,origin:'null'});assert.equal(calls[0][0],'/transceivers');version++;resolveCall(new Response('{}'));await pending;assert.equal(replies.length,0);
 active=false;await listener({data,source:frame.contentWindow,origin:'null'});assert.equal(calls.length,1);
});
