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

test('somente perfil administrador pode revisar mesmo que haja permissão antiga delegada',()=>{
  const s=service();assert.equal(s.call('canDeleteProduct',delegate()),false);assert.equal(s.call('canDeleteProduct',actor()),false);
  assert.equal(s.call('canDeleteProduct',actor('VISUALIZADOR',['estoque.excluir_produto'])),false);
  assert.equal(s.call('canDeleteProduct',actor('ADMINISTRADOR')),true);
});
test('fila mostra todos os pedidos ao responsável e apenas os próprios ao solicitante',async()=>{
  const s=service();s.tables.inventory_product_delete_requests.push({request_id:'R1',requested_by:'outra@example.com'},{request_id:'R2',requested_by:'pessoa@example.com'});
  assert.equal((await s.call('productDeleteRequests',actor())).requests.length,1);
  assert.equal((await s.call('productDeleteRequests',actor('ADMINISTRADOR'))).requests.length,2);
});
test('solicitar mantém item e saldo; administrador pode recusar',async()=>{
  const s=service();const created=await s.call('productDeleteRequest',actor(),{product_id:'P1',reason:'Duplicado'});
  assert.equal(s.tables.inventory_products[0].status,'ATIVO');assert.equal(s.tables.inventory_stock_current[0].balance,7);
  await s.call('productDeleteRequest',actor('ADMINISTRADOR'),{action:'REJECT',request_id:created.request.request_id,decision_notes:'Cadastro correto'});
  assert.equal(s.tables.inventory_product_delete_requests[0].status,'RECUSADO');assert.equal(s.tables.inventory_products[0].status,'ATIVO');
  assert.equal(s.tables.access_audit.at(-1).action,'INVENTORY_PRODUCT_DELETE_REJECT');
});
test('aprovação administrativa inativa o item, registra decisão e preserva saldo',async()=>{
  const s=service();const created=await s.call('productDeleteRequest',actor(),{product_id:'P1',reason:'Cadastro duplicado'});
  await s.call('productDeleteRequest',actor('ADMINISTRADOR'),{action:'INACTIVATE',request_id:created.request.request_id,decision_notes:'Aprovado após análise'});
  assert.equal(s.tables.inventory_products[0].status,'INATIVO');assert.equal(s.tables.inventory_products.length,1);
  assert.equal(s.tables.inventory_stock_current[0].balance,7);assert.equal(s.tables.inventory_product_delete_requests[0].status,'INATIVADO');
  assert.equal(s.tables.inventory_product_delete_requests[0].reviewed_by,'pessoa@example.com');
  assert.equal(s.tables.access_audit.at(-1).action,'INVENTORY_PRODUCT_INACTIVATE');
});
test('usuário sem permissão não pode decidir nem excluir diretamente',async()=>{
  const s=service();for(const action of ['REJECT','INACTIVATE','MERGED'])await assert.rejects(s.call('productDeleteRequest',actor(),{action,product_id:'P1'}),/FORBIDDEN/);
  assert.equal(s.tables.inventory_products[0].status,'ATIVO');assert.equal(s.tables.access_audit.length,0);
});
test('nenhuma permissão individual permite conceder exclusão a operacional',async()=>{
  const s=service();s.tables.portal_users.push({id:'U1',email:'operador@example.com',name:'Operador',profile:'OPERACIONAL',active:true,apps:['estoque'],actions:['estoque.excluir_produto']},{id:'A1',profile:'ADMINISTRADOR',active:true,actions:[]});
  await assert.rejects(s.call('productDeletePermissions',delegate()),/FORBIDDEN/);
  await assert.rejects(s.call('productDeletePermissions',actor('ADMINISTRADOR'),{user_id:'U1',allowed:true}),/FORBIDDEN_ADMIN_ONLY/);
  const users=(await s.call('productDeletePermissions',actor('ADMINISTRADOR'))).users;
  assert.equal(users.find(user=>user.id==='U1').allowed,false);assert.equal(users.find(user=>user.id==='A1').allowed,true);
});
test('permissão antiga de exclusão e edição não autoriza mesclar nem decidir pedidos',async()=>{
  const s=service(),operational=actor('OPERACIONAL',['estoque.editar_produto','estoque.excluir_produto','estoque.gerenciar_fornecedores']);
  for(const action of ['REJECT','INACTIVATE','MERGED'])await assert.rejects(s.call('productDeleteRequest',operational,{action,product_id:'P1'}),/FORBIDDEN/);
  for(const entity_type of ['PRODUCT','SUPPLIER'])await assert.rejects(s.call('registryMerge',operational,{entity_type,source_id:'P1',target_id:'P2',apply:true}),/FORBIDDEN/);
  await assert.rejects(s.call('registryMergeReview',operational,{merge_id:'M1'}),/FORBIDDEN/);
  assert.equal(s.tables.inventory_products[0].status,'ATIVO');assert.equal(s.tables.access_audit.length,0);
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
