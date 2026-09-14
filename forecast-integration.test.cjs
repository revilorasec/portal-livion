const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('registered non-reimbursable purchase appears in two installments without financial writes',()=>{
 const output={innerHTML:''},context=vm.createContext({CardBilling:require('./card-billing.js'),Intl,Date,document:{getElementById:id=>id==='cardForecast'?output:{value:''}}});
 let source=fs.readFileSync(__dirname+'/despesas-reembolsos-v2.js','utf8').split('\n').filter(l=>!l.startsWith("$('nav').onclick=")).join('\n');
 vm.runInContext(source,context);
 vm.runInContext("B={paymentMethods:[{payment_method_id:'credit',name:'Cartão de crédito'}]};cards=[{card_id:'synthetic',nickname:'Cartão de teste',closing_day:20,due_day:28}];expenses=[{company_key:'fixture',status:'REGISTRADA',reimbursable:false,card_id:'synthetic',payment_method_id:'credit',requested_amount:100.01,installment_count:2,description:'Compra fictícia',incurred_at:'2026-09-14T12:00:00Z'}];renderCardForecast();",context);
 assert.match(output.innerHTML,/28\/09\/2026/);assert.match(output.innerHTML,/28\/10\/2026/);assert.match(output.innerHTML,/1\/2/);assert.match(output.innerHTML,/2\/2/);
 vm.runInContext('cards[0].closing_day=null;renderCardForecast()',context);assert.match(output.innerHTML,/Data a definir/);
 vm.runInContext("expenses[0].status='CANCELADA';renderCardForecast()",context);assert.doesNotMatch(output.innerHTML,/Compra fictícia/);
});
