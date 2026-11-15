import test from 'node:test';
import assert from 'node:assert/strict';
import {bonusStatements,statementFilter} from '../supabase/functions/desempenho-api/bonus-statements.mjs';
const out=(status,body)=>({status,body}),user={active:true,user_type:'INTERNO',profile:'ADMINISTRADOR',email:'test@example.test'};
const sample={countingRule:'nokia-u-v1',name:'TESTE',client:'',month:'2026-10',config:{bands:[]},result:{name:'TESTE',repaired:1,irreparable:0,bonus:2},equipment:[{id:'TESTE'}]};
const request=(body,name='TESTE',client='')=>new Request('https://test/bonus-statements?technician='+encodeURIComponent(name)+'&client='+encodeURIComponent(client),body?{method:'PUT',body:JSON.stringify(body)}:{});
test('somente administradores do app ativo registram; mês atual e cliente divergente rejeitados',async()=>{
 const db={app:async()=>({active:true}),insertBonusStatement:()=>{throw Error('não deveria gravar')}};
 assert.equal((await bonusStatements(request(sample),{...user,active:false},db,out)).status,403);
 assert.equal((await bonusStatements(request(sample),{...user,profile:'SOCIO',apps:['desempenho-funcionarios']},db,out)).status,403);
 assert.equal((await bonusStatements(request({...sample,month:'2099-01'}),user,db,out)).status,400);
 assert.equal((await bonusStatements(request({...sample,client:'Nokia'}),user,db,out)).status,400);
});
test('correção U acrescenta versão, preserva original e rejeita mudança de tarifa',async()=>{
 const old={month:'2026-10',created_at:'2026-11-01',statement:{...sample,countingRule:undefined,result:{...sample.result,nokia:1},equipment:[{client:'Nokia',id:'TESTE'}]}},original=JSON.stringify(old),corrections=[];
 const db={app:async()=>({active:true}),bonusStatements:async()=>[old],bonusStatementCorrections:async()=>corrections,insertBonusStatementCorrection:async r=>{if(!corrections.length)corrections.push(r)},insertBonusStatement:()=>{throw Error('Não substituir original')}};
 const before=await bonusStatements(request(),user,db,out);assert.equal(before.body.statements[0].needsShipmentCorrection,true);
 assert.equal((await bonusStatements(request({...sample,config:{bands:[{baseLow:99}]}}),user,db,out)).status,409);
 assert.equal((await bonusStatements(request({...sample,result:{...sample.result,repaired:59}}),user,db,out)).status,200);assert.equal(JSON.stringify(old),original);assert.equal(corrections.length,1);assert.equal(corrections[0].statement.correctsCreatedAt,'2026-11-01');
 const after=await bonusStatements(request(),user,db,out);assert.equal(after.body.statements[0].statement.result.repaired,59);assert.equal(after.body.statements[0].needsShipmentCorrection,false);
});
test('primeira emissão preservada, GET e filtro com caracteres especiais',async()=>{
 const records=new Map(),db={app:async()=>({active:true}),insertBonusStatement:async r=>{if(!records.has(r.month))records.set(r.month,r)},bonusStatements:async()=>[...records.values()]};
 assert.equal((await bonusStatements(request(sample),user,db,out)).status,200);
 await bonusStatements(request({...sample,result:{...sample.result,bonus:999}}),user,db,out);
 const response=await bonusStatements(request(),user,db,out);assert.equal(response.body.statements[0].statement.result.bonus,2);
 assert.equal(decodeURIComponent(statementFilter('A"B,C')),'"A\\"B,C"');
});
