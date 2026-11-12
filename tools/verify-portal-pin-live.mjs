// Creates no account: the caller provisions a temporary, app-less test account separately.
// Reads its credentials only from a local, untracked file; prints no PIN or token.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const file=process.argv[2],phase=process.argv[3]||'login';
const test=JSON.parse(fs.readFileSync(file,'utf8'));
if(!test.email.endsWith('@example.invalid'))throw Error('Only reserved test accounts are permitted');
const base='https://kvfjjtkwxxbvzlicwnrz.supabase.co/functions/v1';
async function call(path,body,token){const response=await fetch(base+path,{method:body?'POST':'GET',headers:{Origin:'https://portal.livionsolutions.com.br',...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(25000)});return {status:response.status,body:await response.json()};}
if(phase==='login'){
 const health=await call('/portal-api/health');assert.equal(health.body.externalPin,true);
 const wrong=await call('/portal-api/pin/login',{email:test.email,pin:test.pin==='000000'?'000001':'000000'});assert.equal(wrong.status,401);
 const login=await call('/portal-api/pin/login',{email:test.email,pin:test.pin});assert.equal(login.status,200,JSON.stringify({status:login.status,error:login.body.error}));
 assert.match(login.body.token,/^lvpin_[0-9a-f]{64}$/);assert.equal(login.body.context.administrator,false);assert.deepEqual(login.body.context.apps,[]);
 const ctx=await call('/portal-api/context',null,login.body.token);assert.equal(ctx.status,200);assert.equal(ctx.body.authMethod,'PIN');
 // A valid PIN session with no app grants must not access these apps.
 for(const app of ['claro-data','client-repairs-api','finance-api','rh-api']){const denied=await call('/'+app,null,login.body.token);assert.equal(denied.status,403,app+' access was not denied');}
 test.token=login.body.token;fs.writeFileSync(file,JSON.stringify(test));
 console.log('PASS: live PIN login, generic rejection, Portal context, and access denied to all four APIs without grants.');
}else if(phase==='revoked'){
 const revoked=await call('/portal-api/context',null,test.token);assert.equal(revoked.status,401);
 const denied=await call('/portal-api/pin/login',{email:test.email,pin:test.pin});assert.equal(denied.status,401);
 console.log('PASS: credential removal invalidates the existing session and rejects the old PIN.');
}else throw Error('Unknown test phase');
