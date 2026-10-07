const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');

const source=fs.readFileSync(__dirname+'/despesas-reembolsos-v2.js','utf8');
const backend=fs.readFileSync(__dirname+'/supabase/functions/expenses-api/index.ts','utf8');
const constant=source.match(/const ALL_PAYERS_EMAIL='[^']+';/)[0];
const start=source.indexOf('function canSelectAnyPayer()');
const end=source.indexOf('function refreshSelects()',start);
const helpers=source.slice(start,end);

function run(user,users){
  const context=vm.createContext({B:{user,users}});
  vm.runInContext(constant+helpers,context);
  return {
    canAll:vm.runInContext('canSelectAnyPayer()',context),
    payers:vm.runInContext('payerUsers()',context)
  };
}

test('ordinary logged user sees only their own name as payer',()=>{
  const current={id:22,email:'socio@livionsolutions.com.br',name:'Sócio Teste'};
  const result=run(current,[current,{id:1,email:'cesar.oliver@livionsolutions.com.br',name:'Cesar Oliver'}]);
  assert.equal(result.canAll,false);
  assert.deepEqual(Array.from(result.payers,x=>x.email),['socio@livionsolutions.com.br']);
});

test('Cesar Oliver sees every eligible payer',()=>{
  const cesar={id:1,email:'CESAR.OLIVER@livionsolutions.com.br',name:'Cesar Oliver'};
  const users=[cesar,{id:22,email:'socio@livionsolutions.com.br',name:'Sócio Teste'}];
  const result=run(cesar,users);
  assert.equal(result.canAll,true);
  assert.deepEqual(Array.from(result.payers,x=>x.email),users.map(x=>x.email));
});

test('frontend and backend both enforce the Cesar-only exception',()=>{
  assert.match(source,/paid_by_user_id:canSelectAnyPayer\(\)\?\$\('ePaidBy'\)\.value:B\.user\.id/);
  assert.match(backend,/canAssignPayer=String\(a\.email\|\|''\)\.trim\(\)\.toLowerCase\(\)===ALL_PAYERS_EMAIL/);
  assert.match(backend,/const paidBy=canAssignPayer&&b\.paid_by_user_id\?Number\(b\.paid_by_user_id\):a\.u\.id/);
});
