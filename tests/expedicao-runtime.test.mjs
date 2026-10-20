import test from 'node:test';
import assert from 'node:assert/strict';
import { runtimeDependencies } from '../supabase/functions/expedicao-api/runtime.mjs';

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
