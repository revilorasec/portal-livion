import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';

const source=readFileSync(new URL('../supabase/functions/inventory-packaging-api/index.ts',import.meta.url),'utf8');
const compiled=stripTypeScriptTypes(source.replace(/^import .*;\r?\n/,''));
function service({balance=0.5,rpcError=null}={}){
  const calls=[],audits=[];
  const row={movement_id:'M1',quantity:0.5,dispatch_quantity:1,dispatch_unit:'ROLINHO',base_quantity_per_dispatch_unit:0.5,occurred_at:'2026-11-18T17:00:00Z',recorded_at:'2026-11-18T17:00:01Z'};
  const db={from(table){
    if(table==='access_audit')return {insert(value){audits.push(value);return Promise.resolve({error:null})}};
    assert.notEqual(table,'inventory_movements','API must not mutate an already committed movement');
    assert.ok(['inventory_products','inventory_stock_current'].includes(table));
    const data=table==='inventory_products'?{product_id:'P1',dispatch_unit:'ROLINHO',base_quantity_per_dispatch_unit:0.5}:{balance,unit:'QUILOGRAMA'};
    return {select(){return this},eq(){return this},maybeSingle(){return Promise.resolve({data,error:null})}};
  },async rpc(name,params){calls.push({name,params});return {data:rpcError?null:row,error:rpcError?new Error(rpcError):null}}};
  const context=vm.createContext({createClient:()=>db,Deno:{env:{get:()=>''},serve(){}},crypto,console});
  vm.runInContext(compiled,context);
  return {calls,audits,row,async exit(body={},actions=['estoque.movimentar_saida']){context.args=[{admin:false,email:'actor@example.invalid',actions},{product_id:'P1',dispatch_quantity:1,idempotency_key:'00000000-0000-4000-8000-000000000001',...body}];return vm.runInContext('exitByDispatchUnit(...args)',context)}};
}

test('saída usa uma única RPC atômica e retorna as medidas gravadas',async()=>{
  const s=service(),result=await s.exit({requester_id:'R1',notes:'Retirada'});
  assert.equal(s.calls.length,1);assert.equal(s.calls[0].name,'inventory_register_dispatch_exit');
  assert.equal(s.calls[0].params.p_dispatch_quantity,1);assert.equal(s.calls[0].params.p_requester_id,'R1');
  assert.equal(result.quantity,0.5);assert.equal(result.dispatch_quantity,1);assert.equal(result.dispatch_unit,'ROLINHO');
  assert.equal(result.id,'M1');assert.equal(s.audits[0].detail.quantity,0.5);
});
test('repetir a mesma tentativa ainda consulta a idempotência com estoque atual zerado',async()=>{
  const s=service({balance:0});const first=await s.exit(),retry=await s.exit();
  assert.equal(first.id,retry.id);assert.equal(s.calls.length,2);
  assert.equal(s.calls[0].params.p_idempotency_key,s.calls[1].params.p_idempotency_key);
});
test('retorno respeita a conversão efetivamente gravada no banco',async()=>{
  const s=service();Object.assign(s.row,{quantity:0.25,dispatch_unit:'ROLO',base_quantity_per_dispatch_unit:0.25});
  const result=await s.exit();assert.equal(result.quantity,0.25);assert.equal(result.dispatch_unit,'ROLO');
  assert.equal(s.audits[0].detail.base_quantity_per_dispatch_unit,0.25);
});
test('falha transacional não executa atualização posterior nem informa sucesso',async()=>{
  const s=service({rpcError:'FIFO_BALANCE_INCONSISTENT'});
  await assert.rejects(s.exit(),/FIFO_BALANCE_INCONSISTENT/);assert.equal(s.calls.length,1);assert.equal(s.audits.length,0);
});
test('permissão e quantidade inteira são validadas antes da RPC',async()=>{
  const s=service();await assert.rejects(s.exit({},[]),/FORBIDDEN/);
  for(const dispatch_quantity of [0,-1,1.5,'NaN'])await assert.rejects(s.exit({dispatch_quantity}),/INVALID_DISPATCH_QUANTITY/);
  assert.equal(s.calls.length,0);
});
