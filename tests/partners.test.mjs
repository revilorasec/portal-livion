import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
const source=readFileSync(new URL('../supabase/functions/portal-api/index.ts',import.meta.url),'utf8');
const constants=source.slice(source.indexOf('const PROFILE_REGISTRY='),source.indexOf('const db='));
const functions=source.slice(source.indexOf('function audiences('),source.indexOf('async function findUserByIdentity('));
const methods=vm.runInNewContext(stripTypeScriptTypes(constants+functions+'\n({entityUserType,contextFromRow,appAllowedForType})'));
const apps=[{key:'painel-financeiro',audience_types:['INTERNO','PARCEIRO']},{key:'estoque',audience_types:['INTERNO']},{key:'rh',audience_types:['INTERNO']}];
const partner={active:true,profile:'VISUALIZADOR',user_type:'PARCEIRO',entity_key:'PARCEIROS',email:'external@example.test',apps:['painel-financeiro','estoque','rh'],actions:['painel-financeiro.visualizar','painel-financeiro.importar'],companies:['LIVION']};
test('partner entity remains external and separate from clients and internal companies',()=>{
 assert.equal(methods.entityUserType('PARCEIRO'),'PARCEIRO');assert.equal(methods.entityUserType('CLIENTE'),'CLIENTE');assert.equal(methods.entityUserType('EMPRESA'),'INTERNO');
});
test('partners receive only individually assigned apps also explicitly enabled for their audience',()=>{
 const c=methods.contextFromRow(partner,apps);assert.deepEqual(Array.from(c.apps),['painel-financeiro']);assert.deepEqual(Array.from(c.actions),['painel-financeiro.visualizar']);assert.equal(c.administrator,false);
 assert.deepEqual(Array.from(methods.contextFromRow({...partner,apps:[]},apps).apps),[]);
 assert.equal(methods.contextFromRow({...partner,active:false},apps),null);
});
test('partner classification never inherits administrator access',()=>{assert.equal(methods.contextFromRow({...partner,profile:'ADMINISTRADOR'},apps),null)});
test('guest object ID resolves the registered person even when Entra supplies an EXT username',async()=>{
 const row={id:1,email:'external@example.test',microsoft_id:null,entra_guest_id:'guest-object-1'};
 const db={from:()=>({select:()=>({eq:(key,value)=>({maybeSingle:async()=>({data:row[key]===value?row:null})})})})};
 const find=vm.runInNewContext(stripTypeScriptTypes(source.slice(source.indexOf('async function findUserByIdentity('),source.indexOf('async function access('))+'\nfindUserByIdentity'),{db});
 assert.equal((await find({id:'guest-object-1',email:'external_example.test#EXT#@tenant.example'})).id,1);
 assert.equal(await find({id:'different-guest',email:'other@example.test'}),null);
});
