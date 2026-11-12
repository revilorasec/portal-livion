import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {validPin,derivePin,equalDigest,randomHex,hashSession,loginWithPin,resolvePinSession} from '../supabase/functions/portal-api/pin-auth.mjs';

function fakeDb(){
 const state={users:[{id:7,email:'guest@example.test',active:true,user_type:'CLIENTE',profile:'VISUALIZADOR',apps:['reparos-claro']}],credentials:[],sessions:[],attempts:0};
 const tableRows=name=>name==='portal_users'?state.users:name==='portal_pin_credentials'?state.credentials:state.sessions;
 const db={rpc:async()=>({data:++state.attempts<=5}),from:name=>{
  const filters=[];return {select(){return this},eq(key,value){filters.push([key,value]);return this},async maybeSingle(){return {data:tableRows(name).find(r=>filters.every(([k,v])=>r[k]===v))||null}},async insert(row){tableRows(name).push(row);return {error:null}}};
 }};
 return {db,state};
}
async function fixture(){const f=fakeDb();f.state.credentials.push({user_id:7,salt:randomHex(16),version:'credential-v1'});const c=f.state.credentials[0];c.digest=await derivePin('005982',c.salt);return f}
const request=new Request('https://example.test/pin/login',{headers:{'x-forwarded-for':'192.0.2.9'}});

test('PIN preserves leading zeros, requires 6–12 digits, and hashes with independent salts',async()=>{
 for(const p of ['005982','123456789012'])assert.equal(validPin(p),true);
 for(const p of ['12345','1234567890123','12a456',' 005982',5982,null])assert.equal(validPin(p),false);
 const a=await derivePin('005982',randomHex(16)),b=await derivePin('005982',randomHex(16));
 assert.notEqual(a,b);assert.equal(equalDigest(a,a),true);assert.equal(equalDigest(a,b),false);assert.equal(equalDigest(a,''),false);
});
test('login creates only a hashed opaque session and resolves the active external user',async()=>{
 const {db,state}=await fixture();const login=await loginWithPin(db,request,{email:' GUEST@EXAMPLE.TEST ',pin:'005982'});
 assert.match(login.token,/^lvpin_[0-9a-f]{64}$/);assert.equal(login.user.email,'guest@example.test');
 assert.equal(state.sessions[0].token_hash,await hashSession(login.token));assert.equal(JSON.stringify(state.sessions).includes(login.token),false);
 assert.equal((await resolvePinSession(db,login.token)).id,7);
 assert.ok(Date.parse(login.expiresAt)>Date.now()+7*3600000);
});
test('wrong PIN, user without PIN and unknown email have the same generic failure',async()=>{
 const {db,state}=await fixture();
 await assert.rejects(loginWithPin(db,request,{email:'guest@example.test',pin:'005983'}),/INVALID_PIN_LOGIN/);
 await assert.rejects(loginWithPin(db,request,{email:'missing@example.test',pin:'005982'}),/INVALID_PIN_LOGIN/);
 state.credentials=[];
 await assert.rejects(loginWithPin(db,request,{email:'guest@example.test',pin:'005982'}),/INVALID_PIN_LOGIN/);
 assert.equal(state.sessions.length,0);
});
test('disabled, internal, administrator and freight accounts cannot authenticate with PIN',async()=>{
 const {db,state}=await fixture(),user=state.users[0];
 for(const patch of [{active:false},{user_type:'INTERNO'},{profile:'ADMINISTRADOR'},{apps:['fretes']}]){
  const before={...user};Object.assign(user,patch);
  await assert.rejects(loginWithPin(db,request,{email:user.email,pin:'005982'}),/INVALID_PIN_LOGIN/);Object.assign(user,before);
 }
 assert.equal(state.sessions.length,0);
});
test('sixth attempt is rejected before a session is created',async()=>{
 const {db,state}=await fixture();state.attempts=5;
 await assert.rejects(loginWithPin(db,request,{email:'guest@example.test',pin:'005982'}),/PIN_RATE_LIMITED/);
 assert.equal(state.sessions.length,0);
});
test('expired, removed, rotated credentials and deactivation revoke access',async()=>{
 const {db,state}=await fixture(),login=await loginWithPin(db,request,{email:'guest@example.test',pin:'005982'});
 state.sessions[0].expires_at=new Date(0).toISOString();await assert.rejects(resolvePinSession(db,login.token),/UNAUTHENTICATED/);
 state.sessions[0].expires_at=login.expiresAt;state.credentials[0].version='rotated';await assert.rejects(resolvePinSession(db,login.token),/UNAUTHENTICATED/);
 state.credentials[0].version='credential-v1';state.users[0].active=false;await assert.rejects(resolvePinSession(db,login.token),/FORBIDDEN/);
 state.users[0].active=true;state.credentials=[];await assert.rejects(resolvePinSession(db,login.token),/UNAUTHENTICATED/);
 await assert.rejects(resolvePinSession(db,'lvpin_fake'),/UNAUTHENTICATED/);
});
test('Microsoft access is rejected when the registered user has a PIN',async()=>{
 const source=fs.readFileSync(new URL('../supabase/functions/portal-api/index.ts',import.meta.url),'utf8');
 const fn=source.slice(source.indexOf('async function access('),source.indexOf('async function admin('));
 let credential={user_id:7};const user={id:7,active:true,microsoft_id:'ms-1',entra_guest_id:'ms-1'};
 const access=vm.runInNewContext(stripTypeScriptTypes(fn+'\naccess'),{PIN_SESSION_PREFIX:'lvpin_',bearer:()=> 'microsoft-token',identity:async()=>({id:'ms-1'}),findUserByIdentity:async()=>user,pinCredential:async()=>credential,db:{},contextFromRow:()=>({authenticated:true}),appsRegistry:async()=>[]});
 await assert.rejects(access({}),/PIN_REQUIRED/);credential=null;assert.equal((await access({})).authenticated,true);
});
test('all changed browser and Edge Function scripts parse',()=>{
 const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
 for(const [,js] of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(js);
 for(const name of ['portal-api','rh-api','claro-data','client-repairs-api']){
  const source=fs.readFileSync(new URL(`../supabase/functions/${name}/index.ts`,import.meta.url),'utf8');
  new vm.Script(stripTypeScriptTypes(source).replace(/^import .*?;\s*$/gm,''));
 }
});

test('login setup executes before asynchronous Microsoft initialization',()=>{
 const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const setup=html.slice(html.indexOf('const API='),html.indexOf('const isStandalone='));
 const elements=new Map();const document={getElementById(id){if(!elements.has(id))elements.set(id,{});return elements.get(id)}};
 const runtime={window:{location:{href:'https://portal.example/'}},document,URL};
 vm.runInNewContext(setup,runtime);
 assert.equal(typeof elements.get('pinLoginForm').onsubmit,'function');
 assert.equal(typeof runtime.window.__PORTAL_GET_TOKEN__,'function');
});
