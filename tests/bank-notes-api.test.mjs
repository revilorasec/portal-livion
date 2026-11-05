import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import {validateBankNote} from '../supabase/functions/finance-api/bank-notes.mjs';
const source=readFileSync(new URL('../supabase/functions/finance-api/index.ts',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'');
const input={account_id:'77b447d7-c379-4946-a18c-08152933f225',transaction_id:'f8f0a019-b323-40ab-b1ec-29d33d164664',note:'SYNTHETIC REVIEW ONLY',revision:0};
function harness(override={}){
 let handler;const rows=new Map(),writes=[];
 class Q{
  constructor(table){this.table=table;this.filters=[];} select(){return this;} order(){return this;} range(){this.many=true;return this;} eq(k,v){this.filters.push([k,v]);return this;} insert(v){this.value=v;this.inserted=true;return this;} update(v){this.value=v;return this;}
  result(){assert.equal(this.table,'finance_bank_notes');const existing=[...rows.values()].find(r=>this.filters.every(([k,v])=>r[k]===v));if(!this.value)return {data:this.many?[...rows.values()]:existing??null};const key=this.value.account_id+'|'+this.value.transaction_id;if(this.inserted&&rows.has(key))return {error:{code:'23505'}};if(!this.inserted&&!existing)return {data:null};rows.set(key,{...this.value});writes.push(this.value);return {data:this.value};}
  async maybeSingle(){return this.result();}async single(){return this.result();}then(resolve){return Promise.resolve(this.result()).then(resolve);}
 }
 const ctx={authenticated:true,administrator:true,profile:'ADMINISTRADOR',userType:'INTERNO',apps:['painel-financeiro'],companies:['LIVION'],actions:['painel-financeiro.visualizar'],user:{email:'synthetic@example.test'},...override};
 vm.runInNewContext(stripTypeScriptTypes(source),{Error,createClient:()=>({from:t=>new Q(t)}),validateBankNote,Deno:{env:{get:()=>''},serve:f=>handler=f},fetch:async()=>new Response(JSON.stringify(ctx)),Request,Response,URL,AbortSignal,Uint8Array,TextEncoder,TextDecoder,crypto,console});
 return {rows,writes,call:(method='GET',payload,headers={})=>handler(new Request('https://example.test/finance-api/bank-notes',{method,headers:{authorization:'Bearer '+'x'.repeat(30),'content-type':'application/json',...headers},...(payload?{body:JSON.stringify(payload)}:{})}))};
}
test('notes persist separately from snapshots, with audit history and revision conflict protection',async()=>{
 const h=harness();let response=await h.call('POST',input);assert.equal(response.status,200);let record=(await response.json()).record;assert.equal(record.revision,1);assert.equal(record.updated_by,'synthetic@example.test');
 response=await h.call('POST',{...input,note:'second',revision:1});assert.equal(response.status,200);record=(await response.json()).record;assert.equal(record.history[0].note,input.note);assert.equal(record.revision,2);
 assert.equal((await h.call('POST',{...input,note:'stale',revision:1})).status,409);assert.equal(h.writes.length,2);assert.equal((await (await h.call()).json()).notes[0].note,'second');
});
test('partner financial viewers may read but cannot create or update notes',async()=>{
 const h=harness({administrator:false,profile:'VISUALIZADOR',userType:'PARCEIRO'});assert.equal((await h.call()).status,200);assert.equal((await h.call('POST',input)).status,403);assert.equal(h.writes.length,0);
});
test('wrong audience, missing app, missing grant and missing authentication fail closed',async()=>{
 for(const context of [{userType:'CLIENTE'},{apps:[]},{authenticated:false},{administrator:false,profile:'SOCIO',actions:[]}]){const h=harness(context);assert.equal((await h.call()).status,403);assert.equal((await h.call('POST',input)).status,403);assert.equal(h.writes.length,0);}
 assert.equal((await harness().call('GET',null,{authorization:''})).status,401);
});
test('invalid payload and foreign origin never produce a note',async()=>{
 const h=harness();assert.equal((await h.call('POST',{...input,revision:-1})).status,400);assert.equal((await h.call('POST',input,{origin:'https://other.example'})).status,403);assert.equal(h.writes.length,0);
});
