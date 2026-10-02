import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const root=new URL('../',import.meta.url);
const html=readFileSync(new URL('index.html',root),'utf8');

test('login oferece confiança explícita e mantém o modo compartilhado como padrão',()=>{
  assert.match(html,/id="trustDevice" type="checkbox"/);
  assert.match(html,/Confiar neste computador/);
  assert.match(html,/cacheLocation:trustedDevice\(\)\?'localStorage':'sessionStorage'/);
  assert.match(html,/localStorage\.getItem\(TRUSTED_DEVICE_KEY\)==='1'/);
});

test('login recorrente não força a escolha de conta',()=>{
  const source=html.match(/^function loginRequest\(\)\{.*\}$/m)?.[0];
  assert.ok(source);
  const ordinary=runInNewContext(`${source};loginRequest()`,{portalAuthError:''});
  assert.equal(ordinary.scopes[0],'User.Read');
  assert.equal(ordinary.prompt,undefined);
  const rejected=runInNewContext(`${source};loginRequest()`,{portalAuthError:'UNAUTHENTICATED'});
  assert.equal(rejected.prompt,'select_account');
  assert.match(html,/acquireTokenSilent\(\{scopes:\['User\.Read'\],account\}\)/);
});

test('401 na consulta renova o token e tenta novamente uma única vez',async()=>{
  const source=html.match(/^const api=async\(path,opt=\{\}\)=>\{.*\};$/m)?.[0];
  assert.ok(source);
  const headers=[];
  const runtime={API:'https://example.test',token:'antigo',AbortSignal,refreshPortalToken:async force=>{assert.equal(force,true);runtime.token='novo'},fetch:async(_url,opt)=>{headers.push(opt.headers.Authorization);return headers.length===1?{status:401,ok:false,json:async()=>({error:'UNAUTHENTICATED'})}:{status:200,ok:true,json:async()=>({ok:true})}}};
  const result=await runInNewContext(`${source};api('/context')`,runtime);
  assert.equal(result.ok,true);
  assert.deepEqual(headers,['Bearer antigo','Bearer novo']);
});

test('falha transitória na validação é repetida uma vez antes da opção de reconexão',async()=>{
  const source=html.match(/^const api=async\(path,opt=\{\}\)=>\{.*\};$/m)?.[0];
  assert.ok(source);
  let unavailableCalls=0;
  const unavailable={API:'https://example.test',token:'teste',AbortSignal,setTimeout:(fn)=>fn(),fetch:async()=>{unavailableCalls++;return{status:500,ok:false,json:async()=>({error:'PGRST003'})}}};
  await assert.rejects(runInNewContext(`${source};api('/context')`,unavailable),/SERVICE_UNAVAILABLE/);
  assert.equal(unavailableCalls,2);
  let timeoutCalls=0;
  const timeout={API:'https://example.test',token:'teste',setTimeout:(fn)=>fn(),AbortSignal:{timeout:()=>AbortSignal.timeout(5)},fetch:async(_url,opt)=>{timeoutCalls++;return new Promise((_,reject)=>opt.signal.addEventListener('abort',()=>reject(new Error('aborted'))))}};
  await assert.rejects(runInNewContext(`${source};api('/context')`,timeout),/SERVICE_UNAVAILABLE/);
  assert.equal(timeoutCalls,2);
  assert.match(html,/Portal temporariamente indisponível/);
  assert.match(html,/Tentar novamente/);
  assert.match(html,/portalAuthError==='SERVICE_UNAVAILABLE'\)\{location\.reload\(\);return\}/);
});

test('segunda tentativa recupera o portal após uma falha transitória',async()=>{
  const source=html.match(/^const api=async\(path,opt=\{\}\)=>\{.*\};$/m)?.[0];
  let calls=0;
  const runtime={API:'https://example.test',token:'teste',AbortSignal,setTimeout:(fn)=>fn(),fetch:async()=>{calls++;return calls===1?{status:503,ok:false,json:async()=>({error:'temporário'})}:{status:200,ok:true,json:async()=>({authenticated:true})}}};
  const result=await runInNewContext(`${source};api('/context')`,runtime);
  assert.equal(result.authenticated,true);
  assert.equal(calls,2);
});

test('tokens continuam sob controle do MSAL e não são gravados manualmente',()=>{
  assert.doesNotMatch(html,/localStorage\.setItem\([^\n]*(?:token|accessToken)/i);
  assert.match(html,/window\.__PORTAL_TOKEN__=token/);
});

test('todos os aplicativos instaláveis iniciam pelo Portal autenticado',()=>{
  const manifests=readdirSync(root,{withFileTypes:true})
    .filter(entry=>entry.isFile()&&/^manifest-.+\.webmanifest$/.test(entry.name));
  assert.ok(manifests.length>=7);
  for(const entry of manifests){
    const manifest=JSON.parse(readFileSync(new URL(entry.name,root),'utf8'));
    assert.match(manifest.start_url,/^\.\/\?app=[a-z0-9-]+$/i,entry.name);
  }
});
