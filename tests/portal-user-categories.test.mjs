import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {pinCredential,externalPinUser,validPin,randomHex,derivePin} from '../supabase/functions/portal-api/pin-auth.mjs';

const frontend=fs.readFileSync(new URL('../portal-admin-v3.js',import.meta.url),'utf8');
const backend=fs.readFileSync(new URL('../supabase/functions/portal-api/index.ts',import.meta.url),'utf8');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
function handler(start,end){
 const section=backend.slice(backend.indexOf(start),backend.indexOf(end));
 assert.ok(section.startsWith(start));
 const body=section.replace(/:\s*(?:any|string)(?=[),;=])/g,'');
 return new AsyncFunction('path','req','origin','admin','db','reply','audit','keyify','ENTITY_TYPES','PROFILES','entityUserType','guardLastAdmin','appsRegistry','appAllowedForType','viewOnlyAction','entities','externalUserType','pinCredential','externalPinUser','validPin','randomHex','derivePin',body);
}
const reply=(_origin,status,body)=>({status,body});
const keyify=v=>String(v||'').trim().toUpperCase().replace(/[^A-Z0-9_-]+/g,'_').replace(/^_+|_+$/g,'');
const entityHandler=handler("if(path==='/entities'&&req.method==='POST')", "if(path==='/entities'&&req.method==='DELETE')");
const userHandler=handler("if(path==='/users'&&req.method==='POST')", "if(path==='/users/entra-status'&&req.method==='POST')");
const categoryHandler=handler("if(path==='/users/category'&&req.method==='POST')", "if(path==='/users'&&req.method==='GET')");
const fakeReq=body=>({method:'POST',json:async()=>body});
const admin=async()=>({user:{email:'admin@example.test'}});

function entityDb(seed){
 const rows=new Map(seed.map(r=>[r.key,{...r}]));
 return {rows,from(table){assert.equal(table,'portal_entities');return {
  async insert(row){if(rows.has(row.key))return {error:{code:'23505'}};rows.set(row.key,{...row});return {error:null}},
  update(row){let key,stamp;return {eq(field,val){if(field==='key')key=val;else stamp=val;return this},select(){return this},async maybeSingle(){const before=rows.get(key);if(!before||before.updated_at!==stamp)return {data:null,error:null};rows.set(key,{...before,...row});return {data:{key},error:null}}}}
 }}};
}
async function runEntity(db,body,audits){return entityHandler('/entities',fakeReq(body),'',admin,db,reply,async(...a)=>audits.push(a),keyify,['EMPRESA','CLIENTE','PARCEIRO']);}

test('cadastro com código existente não modifica a empresa e pedido antigo é bloqueado',async()=>{
 const db=entityDb([{key:'LIVION',name:'Livion Solutions',updated_at:'old'}]),audits=[];
 const duplicate=await runEntity(db,{operation:'create',key:'LIVION',name:'Funcionários',entity_type:'EMPRESA'},audits);
 assert.equal(duplicate.status,409);assert.equal(db.rows.get('LIVION').name,'Livion Solutions');
 assert.equal((await runEntity(db,{key:'LIVION',name:'Funcionários',entity_type:'EMPRESA'},audits)).status,409);
 assert.equal(db.rows.get('LIVION').name,'Livion Solutions');assert.equal(audits.length,0);
});
test('nova empresa tem código próprio e edição antiga não sobrescreve mudança recente',async()=>{
 const db=entityDb([{key:'LIVION',name:'Livion Solutions',updated_at:'new'}]),audits=[];
 assert.equal((await runEntity(db,{operation:'create',key:'NOVA',name:'Empresa Nova',entity_type:'EMPRESA'},audits)).status,200);
 assert.equal((await runEntity(db,{operation:'update',expected_updated_at:'old',key:'LIVION',name:'Alteração',entity_type:'EMPRESA'},audits)).status,409);
 assert.equal(db.rows.get('LIVION').name,'Livion Solutions');
 assert.equal((await runEntity(db,{operation:'update',expected_updated_at:'new',key:'LIVION',name:'Livion Atual',entity_type:'EMPRESA'},audits)).status,200);
 assert.equal(db.rows.get('LIVION').name,'Livion Atual');assert.equal(audits.length,2);
});

function userDb(existing){
 const state={existing:{...existing},written:null};
 return {state,async rpc(name,args){assert.equal(name,'portal_save_user_with_pin');state.written=args.p_payload;return {error:null}},from(table){if(table==='portal_pin_credentials')return {select(){return this},eq(){return this},async maybeSingle(){return {data:null,error:null}}};if(table==='portal_entities')return {select(){return this},eq(){return this},async maybeSingle(){return {data:{entity_type:'EMPRESA'},error:null}}};
  assert.equal(table,'portal_users');return {select(){return this},eq(){return this},async maybeSingle(){return {data:state.existing,error:null}},async upsert(row){state.written=row;return {error:null}}};
 }};
}
async function runUser(db,body){return userHandler('/users',fakeReq(body),'',admin,db,reply,async()=>{},keyify,[],['SOCIO','ADMINISTRADOR','OPERACIONAL'],()=> 'INTERNO',async()=>{},async()=>[{key:'app',active:true,actions:[{key:'app.ver'}]}],()=>true,()=>true,async()=>[{key:'LIVION',entity_type:'EMPRESA'}],()=>false,pinCredential,externalPinUser,validPin,randomHex,derivePin);}
test('categoria é independente das permissões e sobrevive a uma gravação antiga',async()=>{
 const db=userDb({email:'x@example.test',person_category:'SOCIO',companies:['LIVION']});
 const input={email:'x@example.test',name:'Teste',profile:'SOCIO',entity_key:'LIVION',active:true,apps:['app'],actions:['app.ver']};
 let result=await runUser(db,{...input,person_category:'FUNCIONARIO'});
 assert.equal(result.status,200);assert.equal(db.state.written.person_category,'FUNCIONARIO');assert.equal(db.state.written.profile,'SOCIO');assert.deepEqual(db.state.written.actions,['app.ver']);
 result=await runUser(db,input);assert.equal(result.status,200);assert.equal(db.state.written.person_category,'SOCIO');
 db.state.written=null;result=await runUser(db,{...input,person_category:'INVALIDA'});assert.equal(result.status,400);assert.equal(db.state.written,null);
});

test('salvar administrador normaliza acesso completo mesmo com aplicativos vazios ou curinga',async()=>{
 const db=userDb({email:'marcelo@example.test',profile:'ADMINISTRADOR',companies:['LIVION']});
 for(const apps of [['*'],[],['app']]){
  const result=await runUser(db,{email:'marcelo@example.test',name:'Marcelo',profile:'ADMINISTRADOR',entity_key:'LIVION',active:true,apps,actions:['app.ver']});
  assert.equal(result.status,200);assert.deepEqual(db.state.written.apps,['app']);assert.deepEqual(db.state.written.actions,['*']);
 }
});

test('tela do administrador mostra todos os aplicativos e ações marcados e bloqueados',()=>{
 const snippet=frontend.slice(frontend.indexOf('function userAppHtml('),frontend.indexOf('function wireUserForm('));
 const context=vm.createContext({esc:String,isViewAction:()=>true});vm.runInContext(snippet,context);
 context.app={key:'estoque',title:'Estoque',actions:[{key:'estoque.excluir_produto',label:'Excluir'}]};
 context.form={profile:'ADMINISTRADOR',apps:['*'],actions:[]};
 const html=vm.runInContext('userAppHtml(app,form)',context);
 assert.equal((html.match(/checked disabled/g)||[]).length,2);
 context.form={profile:'OPERACIONAL',apps:['estoque'],actions:[]};
 const operational=vm.runInContext('userAppHtml(app,form)',context);
 assert.doesNotMatch(operational,/disabled/);assert.equal((operational.match(/checked/g)||[]).length,1);
});

test('catálogo do Portal mantém a permissão de exclusão do estoque sem duplicá-la',async()=>{
 const snippet=backend.slice(backend.indexOf('async function appsRegistry('),backend.indexOf('async function profilesRegistry(')).replaceAll(':any','');
 const rows=[{key:'estoque',actions:[{key:'estoque.editar_produto'},{key:'estoque.excluir_produto'}]},{key:'outro',actions:[]}];
 const db={from(){return {select(){return this},order(){return this},eq(){return this},then(resolve){return Promise.resolve({data:rows,error:null}).then(resolve)}}}};
 const context=vm.createContext({db});vm.runInContext(snippet,context);const result=await vm.runInContext('appsRegistry()',context);
 assert.equal(result[0].actions.filter(action=>action.key==='estoque.excluir_produto').length,1);
 assert.ok(result[0].actions.some(action=>action.key==='estoque.editar_produto'));assert.equal(result[1],rows[1]);
 rows[0].actions=[];const missing=await vm.runInContext('appsRegistry()',context);assert.equal(missing[0].actions[0].key,'estoque.excluir_produto');
});

test('alteração rápida de categoria grava somente categoria e data',async()=>{
 const record={id:7,user_type:'INTERNO',person_category:null,profile:'SOCIO',apps:['app'],actions:['app.ver']};let updatePayload;
 const db={from(table){assert.equal(table,'portal_users');return {select(){return this},eq(){return this},async maybeSingle(){return {data:record,error:null}},update(payload){updatePayload=payload;return this}}}};
 const result=await categoryHandler('/users/category',fakeReq({email:'x@example.test',person_category:'FUNCIONARIO'}),'',admin,db,reply,async()=>{});
 assert.equal(result.status,200);assert.equal(updatePayload.person_category,'FUNCIONARIO');
 assert.deepEqual(Object.keys(updatePayload).sort(),['person_category','updated_at']);
 assert.equal(record.profile,'SOCIO');assert.deepEqual(record.actions,['app.ver']);
});

test('lista agrupa categorias confirmadas e identifica perfis pendentes sem inventar vínculo',()=>{
 const snippet=frontend.slice(frontend.indexOf('function renderMembersByCategory('),frontend.indexOf('function groupHtml('));
 const ctx={esc:String};vm.createContext(ctx);vm.runInContext(snippet+'\nthis.render=renderMembersByCategory',ctx);
 const rows=[{name:'Ana',person_category:'SOCIO_ADMINISTRADOR',profile:'ADMINISTRADOR'},{name:'Bia',person_category:'SOCIO',profile:'SOCIO'},{name:'Caio',person_category:'FUNCIONARIO',profile:'OPERACIONAL'},{name:'Dani',person_category:null,profile:'ADMINISTRADOR'}];
 const html=ctx.render({entity_type:'EMPRESA'},rows,u=>`<p>${u.name}</p>`);
 for(const name of rows.map(x=>x.name))assert.equal((html.match(new RegExp(`<p>${name}</p>`,'g'))||[]).length,1);
 for(const title of ['Sócios administradores','Sócios','Funcionários','Perfil Administrador · categoria não informada'])assert.ok(html.includes(title));
 assert.ok(frontend.includes('não altera as permissões'));assert.ok(frontend.includes("operation:e.key?'update':'create'"));
});
