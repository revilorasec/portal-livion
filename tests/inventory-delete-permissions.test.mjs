import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';

const source=readFileSync(new URL('../supabase/functions/inventory-api/index.ts',import.meta.url),'utf8');
const compiled=stripTypeScriptTypes(source.replace(/^import .*;\r?\n/,''));
const actor=(profile='OPERACIONAL',actions=[])=>({u:{profile},email:'pessoa@example.com',admin:profile==='ADMINISTRADOR',actions});
const delegate=()=>actor('OPERACIONAL',['estoque.excluir_produto']);
function service(){
  const tables={portal_users:[],inventory_products:[{product_id:'P1',pn:'PN1',description:'Item',unit:'UN',status:'ATIVO',version:1}],inventory_stock_current:[{product_id:'P1',pn:'PN1',description:'Item',status:'ATIVO',balance:7,unit:'UN'}],inventory_product_delete_requests:[],access_audit:[]};
  let conflict=false;
  const db={from(table){let operation='select',payload,filters=[],one=false;const query={
    select(){return query},order(){return query},limit(){return query},eq(key,value){filters.push(row=>row[key]===value);return query},is(key,value){filters.push(row=>(row[key]??null)===value);return query},
    maybeSingle(){one=true;return query},single(){one=true;return query},insert(value){operation='insert';payload=value;return query},update(value){operation='update';payload=value;return query},upsert(value){operation='upsert';payload=value;return query},
    then(resolve,reject){try{let rows=tables[table]||[];let selected=rows.filter(row=>filters.every(filter=>filter(row)));
      if(operation==='insert'){const row={request_id:'R'+(rows.length+1),...payload};rows.push(row);selected=[row]}
      if(operation==='update'){if(conflict&&table==='portal_users')selected=[];else selected.forEach(row=>Object.assign(row,payload))}
      if(operation==='upsert'){selected=[payload];rows.push(payload)}
      return Promise.resolve({data:structuredClone(one?selected[0]||null:selected),error:null}).then(resolve,reject);
    }catch(error){return Promise.reject(error).then(resolve,reject)}}};return query}};
  const context=vm.createContext({createClient:()=>db,Deno:{env:{get:()=>''},serve(){}},console,crypto});
  vm.runInContext(compiled,context);
  return {tables,conflict(){conflict=true},call:(name,...args)=>{context.args=args;return vm.runInContext(`${name}(...args)`,context)}};
}

test('permissão delegada permite revisar sem tornar o usuário administrador',()=>{
  const s=service();assert.equal(s.call('canDeleteProduct',delegate()),true);assert.equal(s.call('canDeleteProduct',actor()),false);
  assert.equal(s.call('canDeleteProduct',actor('VISUALIZADOR',['estoque.excluir_produto'])),false);
  assert.equal(s.call('canDeleteProduct',actor('ADMINISTRADOR')),true);
});
test('fila mostra todos os pedidos ao responsável e apenas os próprios ao solicitante',async()=>{
  const s=service();s.tables.inventory_product_delete_requests.push({request_id:'R1',requested_by:'outra@example.com'},{request_id:'R2',requested_by:'pessoa@example.com'});
  assert.equal((await s.call('productDeleteRequests',actor())).requests.length,1);
  assert.equal((await s.call('productDeleteRequests',delegate())).requests.length,2);
});
test('solicitar mantém item e saldo; responsável delegado pode recusar',async()=>{
  const s=service();const created=await s.call('productDeleteRequest',actor(),{product_id:'P1',reason:'Duplicado'});
  assert.equal(s.tables.inventory_products[0].status,'ATIVO');assert.equal(s.tables.inventory_stock_current[0].balance,7);
  await s.call('productDeleteRequest',delegate(),{action:'REJECT',request_id:created.request.request_id,decision_notes:'Cadastro correto'});
  assert.equal(s.tables.inventory_product_delete_requests[0].status,'RECUSADO');assert.equal(s.tables.inventory_products[0].status,'ATIVO');
  assert.equal(s.tables.access_audit.at(-1).action,'INVENTORY_PRODUCT_DELETE_REJECT');
});
test('aprovação delegada inativa o item, registra decisão e preserva saldo',async()=>{
  const s=service();const created=await s.call('productDeleteRequest',actor(),{product_id:'P1',reason:'Cadastro duplicado'});
  await s.call('productDeleteRequest',delegate(),{action:'INACTIVATE',request_id:created.request.request_id,decision_notes:'Aprovado após análise'});
  assert.equal(s.tables.inventory_products[0].status,'INATIVO');assert.equal(s.tables.inventory_products.length,1);
  assert.equal(s.tables.inventory_stock_current[0].balance,7);assert.equal(s.tables.inventory_product_delete_requests[0].status,'INATIVADO');
  assert.equal(s.tables.inventory_product_delete_requests[0].reviewed_by,'pessoa@example.com');
  assert.equal(s.tables.access_audit.at(-1).action,'INVENTORY_PRODUCT_INACTIVATE');
});
test('usuário sem permissão não pode decidir nem excluir diretamente',async()=>{
  const s=service();for(const action of ['REJECT','INACTIVATE','MERGED'])await assert.rejects(s.call('productDeleteRequest',actor(),{action,product_id:'P1'}),/FORBIDDEN/);
  assert.equal(s.tables.inventory_products[0].status,'ATIVO');assert.equal(s.tables.access_audit.length,0);
});
test('somente administrador pode conceder e revogar exclusão, preservando outras ações',async()=>{
  const s=service();s.tables.portal_users.push({id:'U1',email:'marcelo@example.com',name:'Marcelo',profile:'OPERACIONAL',active:true,apps:['estoque'],actions:['estoque.editar_produto'],updated_at:null});
  await assert.rejects(s.call('productDeletePermissions',delegate()),/FORBIDDEN/);
  await assert.rejects(s.call('productDeletePermissions',delegate(),{user_id:'U1',allowed:true}),/FORBIDDEN/);
  await s.call('productDeletePermissions',actor('ADMINISTRADOR'),{user_id:'U1',allowed:true});
  assert.deepEqual(s.tables.portal_users[0].actions,['estoque.editar_produto','estoque.excluir_produto']);
  assert.equal((await s.call('productDeletePermissions',actor('ADMINISTRADOR'))).users[0].allowed,true);
  await s.call('productDeletePermissions',actor('ADMINISTRADOR'),{user_id:'U1',allowed:false});
  assert.deepEqual(s.tables.portal_users[0].actions,['estoque.editar_produto']);
  assert.equal(s.tables.access_audit.length,2);
});
test('concessão rejeita visualizadores, usuários sem acesso e alteração concorrente',async()=>{
  const s=service();const user={id:'U1',profile:'VISUALIZADOR',active:true,apps:['estoque'],actions:[]};s.tables.portal_users.push(user);
  await assert.rejects(s.call('productDeletePermissions',actor('ADMINISTRADOR'),{user_id:'U1',allowed:true}),/INVALID_DELETE_PERMISSION_USER/);
  user.profile='OPERACIONAL';user.apps=[];
  await assert.rejects(s.call('productDeletePermissions',actor('ADMINISTRADOR'),{user_id:'U1',allowed:true}),/INVALID_DELETE_PERMISSION_USER/);
  user.apps=['estoque'];s.conflict();
  await assert.rejects(s.call('productDeletePermissions',actor('ADMINISTRADOR'),{user_id:'U1',allowed:true}),/CONFLICT_REFRESH/);
  assert.deepEqual(user.actions,[]);
});
test('editar produto não permite contornar a permissão mudando o status para INATIVO',async()=>{
  const s=service();await assert.rejects(s.call('product',actor('OPERACIONAL',['estoque.editar_produto']),{product_id:'P1',pn:'PN1',description:'Item',item_type:'Componente',status:'INATIVO'}),/FORBIDDEN/);
  assert.equal(s.tables.inventory_products[0].status,'ATIVO');
});
test('qualquer item, inclusive inativo, aceita solicitação para análise',async()=>{
  const s=service();s.tables.inventory_stock_current[0].status='INATIVO';
  const result=await s.call('productDeleteRequest',actor(),{product_id:'P1',reason:'Excluir cadastro inativo'});
  assert.equal(result.ok,true);assert.equal(s.tables.inventory_product_delete_requests.length,1);
  assert.equal(s.tables.inventory_product_delete_requests[0].status,'PENDENTE');
});
