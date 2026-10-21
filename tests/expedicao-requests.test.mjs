import test from 'node:test';
import assert from 'node:assert/strict';
import {requestJson,generateAndRefresh} from '../expedicao/requests.mjs';

test('a confirmed Excel copy remains successful when the subsequent Google refresh fails',async()=>{
 const notices=[];let writes=0,reads=0;
 const result=await generateAndRefresh({key:'note394',generate:async()=>{writes++;return {central:true,alreadyDispatched:true,filename:'copy.xlsx'};},refresh:async key=>{reads++;assert.equal(key,'note394');assert.equal(notices[0][1],'success');throw Error('O Google não entregou a resposta segura.');},report:(...args)=>notices.push(args)});
 assert.equal(result.filename,'copy.xlsx');assert.equal(writes,1);assert.equal(reads,1);assert.match(notices.at(-1)[0],/Nova cópia salva e conferida.*Atualizar BD/);assert.equal(notices.at(-1)[1],'success');
});

test('failed generation reports its original error before reading pending jobs, without replay',async()=>{
 const notices=[];const failure=Error('O Google não entregou a resposta segura.');let writes=0;
 await assert.rejects(generateAndRefresh({key:'394',generate:async()=>{writes++;throw failure;},refresh:async()=>{assert.equal(notices[0][0],failure.message);throw Error('another read failed');},report:(...args)=>notices.push(args)}),error=>error===failure);
 assert.equal(writes,1);assert.equal(notices[0][1],'error');
});

test('unresponsive authentication, fetch and response bodies have bounded waits and never repeat writes',async()=>{
 for(const phase of ['auth','fetch','body']){
  let calls=0;const never=()=>new Promise(()=>{});
  await assert.rejects(requestJson({url:'https://test.invalid/generate',body:{operationId:'one'},timeoutMs:20,getToken:phase==='auth'?never:async()=> 'test',fetcher:async()=>{calls++;if(phase==='fetch')return never();return {ok:true,status:200,json:never};}}),e=>e.code==='REQUEST_TIMEOUT'&&/Nenhum envio foi repetido/.test(e.message));
  assert.equal(calls,phase==='auth'?0:1);
 }
});

test('only reads renew a rejected session; mutation authorization failure is never replayed',async()=>{
 for(const body of [undefined,{operationId:'one'}]){
  const tokens=[],calls=[];const run=()=>requestJson({url:'https://test.invalid',body,getToken:async force=>{tokens.push(force);return 'test';},fetcher:async(_url,options)=>{calls.push(options);return calls.length===1?Response.json({message:'Entre novamente.'},{status:401}):Response.json({ok:true});}});
  if(body){await assert.rejects(run(),/Entre novamente/);assert.equal(calls.length,1);}else{assert.deepEqual(await run(),{ok:true});assert.deepEqual(tokens,[false,true]);}
 }
});
