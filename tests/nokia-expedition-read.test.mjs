import test from 'node:test';
import assert from 'node:assert/strict';
import {readNokiaExpedition} from '../supabase/functions/desempenho-api/nokia-expedition.mjs';
const env=k=>({EXPEDICAO_NOKIA_URL:'https://script.google.com/macros/s/TEST/exec',EXPEDICAO_NOKIA_SECRET:'test-only'})[k];
test('ponte executa somente read assinado e segue apenas a resposta Google',async()=>{
 const calls=[];const result=await readNokiaExpedition(env,async(url,options)=>{calls.push({url:String(url),options});if(calls.length===1)return new Response(null,{status:302,headers:{location:'https://script.googleusercontent.com/macros/echo?x=1'}});return Response.json({ok:true,client:'nokia',schemaVersion:1,sheet:'BD_Nokia',rows:[{A:'ID1',U:'30/10/2026',W:'15/11/2026',Y:'REPARADO'}]});});
 const envelope=JSON.parse(calls[0].options.body);assert.deepEqual(JSON.parse(envelope.data),{action:'read'});assert.equal(envelope.signature.length,64);assert.equal(calls[1].options.method,'GET');assert.equal(result.rows[0]['Data da Expedição'],'30/10/2026');assert.equal(Object.hasOwn(result.rows[0],'Data eSmart (Devolução)'),false);
});
test('não segue redirecionamento externo nem aceita origem sem coluna U',async()=>{
 await assert.rejects(()=>readNokiaExpedition(env,async()=>new Response(null,{status:302,headers:{location:'https://example.com'}})),/Redirecionamento/);
 await assert.rejects(()=>readNokiaExpedition(env,async()=>Response.json({ok:true,client:'nokia',schemaVersion:1,sheet:'BD_Nokia',rows:[{A:'ID1',W:'15/11/2026'}]})),/coluna U/);
});
