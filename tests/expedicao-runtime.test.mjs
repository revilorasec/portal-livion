import test from 'node:test';
import assert from 'node:assert/strict';
import { runtimeDependencies } from '../supabase/functions/expedicao-api/runtime.mjs';

test('bridge failures expose only known safe diagnostics',async()=>{
 const env={EXPEDICAO_CLARO_URL:'https://script.google.com/macros/s/test-only/exec',EXPEDICAO_CLARO_SECRET:'test-only'};
 for(const [source,code] of [['AUTH','SOURCE_AUTH'],['BUSY','SOURCE_BUSY'],['private data must never escape','SOURCE_ERROR']]){
  const deps=runtimeDependencies(k=>env[k],null,async()=>Response.json({ok:false,error:source}));
  await assert.rejects(deps.readSource('claro'),e=>e.status===502&&e.code===code&&!e.message.includes('private data'));
 }
});

test('bridge follows only the Google response URL without forwarding the signed envelope or retrying POST',async()=>{
 const env={EXPEDICAO_CLARO_URL:'https://script.google.com/macros/s/test-only/exec',EXPEDICAO_CLARO_SECRET:'test-only'};
 for(const destination of ['https://script.googleusercontent.com/macros/echo?user_content_key=private-test','https://other.example/macros/echo']){
  const calls=[];const deps=runtimeDependencies(k=>env[k],null,async(url,options)=>{calls.push({url:String(url),options});if(calls.length===1)return new Response(null,{status:302,headers:{location:destination}});return Response.json({ok:true,client:'claro',schemaVersion:1,rows:[]});});
  if(destination.startsWith('https://script.googleusercontent.com/')){assert.deepEqual((await deps.readSource('claro')).rows,[]);assert.equal(calls.length,2);assert.equal(calls[1].options.method,'GET');assert.equal(calls[1].options.body,undefined);assert.equal(calls[1].options.headers,undefined);}
  else{await assert.rejects(deps.readSource('claro'),e=>e.code==='SOURCE_REDIRECT');assert.equal(calls.length,1);}
  assert.equal(calls.filter(c=>c.options.method==='POST').length,1);
 }
});

test('only an expired Google response may start one fresh read, while a write is never replayed',async()=>{
 const env={EXPEDICAO_CLARO_URL:'https://script.google.com/macros/s/test-only/exec',EXPEDICAO_CLARO_SECRET:'test-only'};
 for(const write of [false,true]){let posts=0;const deps=runtimeDependencies(k=>env[k],null,async(_url,options)=>{if(options.method==='POST')posts++;return new Response(null,{status:302,headers:{location:env.EXPEDICAO_CLARO_URL}});});
  await assert.rejects(write?deps.writeSource('claro',{}):deps.readSource('claro'),e=>e.code==='SOURCE_RESPONSE_EXPIRED');assert.equal(posts,write?1:2);
 }
});

test('private database templates stay out of catalog responses and decode unchanged on the server',async()=>{
 const bytes=new Uint8Array([0,1,127,128,255]),calls=[];
 const deps=runtimeDependencies(k=>({SUPABASE_URL:'https://isolated.test',SUPABASE_SERVICE_ROLE_KEY:'test-only'})[k],null,async(url,options)=>{
  calls.push(url);assert.equal(options.headers.apikey,'test-only');
  if(url.includes('select=content_base64'))return Response.json([{content_base64:Buffer.from(bytes).toString('base64')}]);
  assert.ok(url.includes('select=id,client,metadata,sha256,storage_path,active'));
  return Response.json([{id:'test',client:'nokia',metadata:{name:'copy'},sha256:'a'.repeat(64),storage_path:'nokia/'+'a'.repeat(64)+'.xlsx',active:true}]);
 });
 const models=await deps.db.models('nokia');assert.equal(models[0].content_base64,undefined);
 assert.deepEqual(await deps.modelBytes(models[0]),bytes);assert.equal(calls.length,2);
});
