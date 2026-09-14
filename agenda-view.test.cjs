const {test}=require('node:test'),assert=require('node:assert/strict'),q=require('./agenda-view.js');
const rows=[
 {index:0,purchase:'2026-09-10',due:'2026-10-28',description:'Refeição',vendor:'Café',card:'Itaú',cardId:'a',person:'Pessoa A',personId:'1',number:2,amount:100,status:'FORECAST'},
 {index:1,purchase:'2026-09-12',due:'',description:'Material',vendor:'Loja',card:'Outro',cardId:'b',person:'Pessoa B',personId:'2',number:1,amount:20,status:'UNDATED'},
 {index:2,purchase:'2026-09-10',due:'2026-09-28',description:'Refeição',vendor:'Café',card:'Itaú',cardId:'a',person:'Pessoa A',personId:'1',number:1,amount:99,status:'FORECAST'}];
test('purchase descending by default, stable installment order',()=>{assert.deepEqual(q.select(rows).map(r=>r.index),[1,2,0]);assert.deepEqual(q.select(rows,{},'purchase',1).map(r=>r.index),[2,0,1])});
test('numeric columns sort numerically both directions',()=>{assert.deepEqual(q.select(rows,{},'amount',1).map(r=>r.amount),[20,99,100]);assert.deepEqual(q.select(rows,{},'amount',-1).map(r=>r.amount),[100,99,20])});
test('unknown due dates remain last both directions',()=>{for(const dir of [1,-1])assert.equal(q.select(rows,{},'due',dir).at(-1).index,1)});
test('combined advanced filters and accent insensitive search',()=>{assert.deepEqual(q.select(rows,{search:'cafe ITAU',purchaseFrom:'2026-09-10',purchaseTo:'2026-09-10',dueFrom:'2026-10-01',dueTo:'2026-10-31',cardId:'a',personId:'1',status:'FORECAST',minimum:'100',maximum:'100'}).map(r=>r.index),[0]);assert.equal(q.select(rows,{search:'inexistente'}).length,0)});
test('undated selection and date range exclusion',()=>{assert.equal(q.select(rows,{undated:true})[0].index,1);assert.equal(q.select(rows,{undated:true,dueFrom:'2026-01-01'}).length,0)});
test('Brazil purchase date preserves local calendar',()=>{assert.equal(q.day('2026-09-11T01:00:00Z'),'2026-09-10');assert.equal(q.day(null),'')});
test('render integration includes both lists and clickable columns without network',()=>{
 const fs=require('node:fs'),vm=require('node:vm');const elements={};
 function element(id){return elements[id]={value:'',checked:false,addEventListener(){},querySelector(){return null},set innerHTML(v){this.html=v;for(const m of v.matchAll(/id="([^"]+)"/g))if(!elements[m[1]])element(m[1])},get innerHTML(){return this.html||''}}}
 element('agenda');element('globalCompany');
 const ctx=vm.createContext({Intl,Date,CardBilling:require('./card-billing.js'),document:{getElementById:id=>elements[id]||null}});
 const main=fs.readFileSync(__dirname+'/despesas-reembolsos-v2.js','utf8').split('\n').filter(l=>!l.startsWith("$('nav').onclick=")).join('\n');vm.runInContext(main,ctx);vm.runInContext(fs.readFileSync(__dirname+'/agenda-view.js','utf8'),ctx);
 vm.runInContext("B={paymentMethods:[{payment_method_id:'credit',name:'Crédito'}],users:[{id:1,name:'Pessoa fictícia'}]};cards=[{card_id:'test',nickname:'Teste',closing_day:20,due_day:28}];expenses=[{expense_id:'e',company_key:'test',status:'REGISTRADA',card_id:'test',payment_method_id:'credit',paid_by_user_id:1,incurred_at:'2026-09-14T12:00:00Z',requested_amount:100,installment_count:2,description:'Compra fictícia'}];agenda=[{expense_id:'e',company_key:'test',payee_user_id:1,due_date:'2026-09-28',installment_number:1,installment_count:2,scheduled_amount:50,reimbursed_amount:0,pending_amount:50,status:'PREVISTO'}];renderAgenda()",ctx);
 assert.match(elements.agendaCardTable.html,/14\/09\/2026/);assert.match(elements.agendaCardTable.html,/2 parcela/);assert.match(elements.agendaCardTable.html,/aria-sort="descending"/);assert.match(elements.agendaReimbursementTable.html,/1 parcela/);
 elements['af-search'].value='nada';vm.runInContext('renderAgenda()',ctx);assert.match(elements.agendaCardTable.html,/Nenhuma parcela encontrada/);
});
