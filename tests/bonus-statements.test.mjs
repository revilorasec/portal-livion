import test from 'node:test';
import assert from 'node:assert/strict';
import {bonusStatements,statementFilter} from '../supabase/functions/desempenho-api/bonus-statements.mjs';
const out=(status,body)=>({status,body}),user={active:true,user_type:'INTERNO',profile:'ADMINISTRADOR',email:'test@example.test'};
const sample={name:'TESTE',client:'',month:'2026-10',config:{bands:[]},result:{name:'TESTE',repaired:1,irreparable:0,bonus:2},equipment:[{id:'TESTE'}]};
const request=(body,name='TESTE',client='')=>new Request('https://test/bonus-statements?technician='+encodeURIComponent(name)+'&client='+encodeURIComponent(client),body?{method:'PUT',body:JSON.stringify(body)}:{});
test('somente administradores do app ativo registram; mês atual e cliente divergente rejeitados',async()=>{
 const db={app:async()=>({active:true}),insertBonusStatement:()=>{throw Error('não deveria gravar')}};
 assert.equal((await bonusStatements(request(sample),{...user,active:false},db,out)).status,403);
 assert.equal((await bonusStatements(request(sample),{...user,profile:'SOCIO',apps:['desempenho-funcionarios']},db,out)).status,403);
 assert.equal((await bonusStatements(request({...sample,month:'2099-01'}),user,db,out)).status,400);
 assert.equal((await bonusStatements(request({...sample,client:'Nokia'}),user,db,out)).status,400);
});
test('primeira emissão preservada, GET e filtro com caracteres especiais',async()=>{
 const records=new Map(),db={app:async()=>({active:true}),insertBonusStatement:async r=>{if(!records.has(r.month))records.set(r.month,r)},bonusStatements:async()=>[...records.values()]};
 assert.equal((await bonusStatements(request(sample),user,db,out)).status,200);
 await bonusStatements(request({...sample,result:{...sample.result,bonus:999}}),user,db,out);
 const response=await bonusStatements(request(),user,db,out);assert.equal(response.body.statements[0].statement.result.bonus,2);
 assert.equal(decodeURIComponent(statementFilter('A"B,C')),'"A\\"B,C"');
});
