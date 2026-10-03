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

test('falha de rede ao renovar token preserva a sessão para reconexão',async()=>{
  const source=html.match(/^const api=async\(path,opt=\{\}\)=>\{.*\};$/m)?.[0];
  let calls=0;
  const runtime={API:'https://example.test',token:'antigo',AbortSignal,interactionRequired:()=>false,
    refreshPortalToken:async()=>{throw new Error('network_error')},
    fetch:async()=>{calls++;return{status:401,ok:false,json:async()=>({error:'UNAUTHENTICATED'})}}};
  await assert.rejects(runInNewContext(`${source};api('/context')`,runtime),/SERVICE_UNAVAILABLE/);
  assert.equal(calls,1);
});

test('falha transitória na validação é repetida antes da reconexão automática',async()=>{
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
  assert.match(html,/Reconectando ao Portal/);
  assert.match(html,/Tentar agora/);
  assert.match(html,/if\(unavailable\)scheduleReconnect\(\)/);
});

test('reconexão automática preserva a sessão e agenda nova tentativa',()=>{
  const source=html.slice(html.indexOf('let reconnectTimer='),html.indexOf('function loginRequest()'));
  assert.ok(source.startsWith('let reconnectTimer='));
  const elements=new Map(),get=id=>{
    if(!elements.has(id))elements.set(id,{classList:{contains:()=>false,remove(){},toggle(){}},textContent:'',checked:false});
    return elements.get(id);
  };
  let scheduled=null;
  const runtime={msal:{InteractionRequiredAuthError:class {}},$:get,trustedDevice:()=>true,
    setTimeout:(fn,delay)=>{scheduled={fn,delay};return 1},clearTimeout:()=>{},resumeLoginAfterTrust:()=>{throw new Error('login indevido')}};
  runInNewContext(`${source};showAuthError(new Error('SERVICE_UNAVAILABLE'))`,runtime);
  assert.equal(get('authTitle').textContent,'Reconectando ao Portal...');
  assert.equal(get('loginBtn').textContent,'Tentar agora');
  assert.equal(get('trustDeviceWrap').classList.contains('hidden'),false);
  assert.equal(scheduled.delay,3000);
});

test('falha de rede do MSAL não redireciona para login e a tentativa seguinte recupera a sessão',async()=>{
  const source=html.slice(html.indexOf('let reconnectTimer='),html.indexOf('function showAuthError('));
  const account={username:'teste@livion.example'},errors=[];
  let silentCalls=0,redirects=0,shown=0;
  class FakeMsal {
    async initialize(){}
    async handleRedirectPromise(){return null}
    getActiveAccount(){return account}
    getAllAccounts(){return [account]}
    setActiveAccount(){}
    async acquireTokenSilent(){if(++silentCalls===1)throw new Error('network_error');return{accessToken:'validado'}}
    async acquireTokenRedirect(){redirects++}
  }
  const runtime={msal:{PublicClientApplication:FakeMsal,InteractionRequiredAuthError:class {}},msalApp:null,
    window:{opener:null},document:{documentElement:{}},CLIENT:'client',TENANT:'tenant',REDIRECT:'https://portal.example/',
    trustedDevice:()=>true,token:null,ctx:null,sessionStorage:{removeItem(){}},LOGIN_AFTER_TRUST_KEY:'pending',
    api:async()=>({authenticated:true}),showPortal:()=>{shown++},showAuthError:e=>errors.push(e.message),signedOut:()=>{},clearTimeout:()=>{}};
  runInNewContext(`${source};globalThis.retryPortal=init`,runtime);
  await runtime.retryPortal();
  assert.deepEqual(errors,['SERVICE_UNAVAILABLE']);
  assert.equal(redirects,0);
  await runtime.retryPortal();
  assert.equal(shown,1);
  assert.equal(runtime.window.__PORTAL_TOKEN__,'validado');
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
