const {test}=require('node:test');const a=require('node:assert/strict');const b=require('./card-billing.js');
test('before, on and after closing with due day 28',()=>{a.equal(b.firstDue('2026-09-14',20,28),'2026-09-28');a.equal(b.firstDue('2026-09-20',20,28),'2026-10-28');a.equal(b.firstDue('2026-09-21',20,28),'2026-10-28')});
test('unknown closing never invents dates',()=>{a.equal(b.firstDue('2026-09-14',null,28),null);a.equal(b.split(100,2,null)[0].due,null)});
test('payment in following month and year',()=>{a.equal(b.firstDue('2026-12-14',20,5),'2027-01-05')});
test('month end clamps without skipping February',()=>{a.deepEqual(b.split(10,3,'2028-01-31').map(p=>p.due),['2028-01-31','2028-02-29','2028-03-31'])});
test('cent conservation and two installments',()=>{a.deepEqual(b.split(100.01,2,'2026-09-28').map(p=>[p.amount,p.due]),[[50.01,'2026-09-28'],[50,'2026-10-28']])});
test('invalid dates and installment counts',()=>{a.equal(b.firstDue('2026-02-30',20,28),null);a.deepEqual(b.split(10,2.5,null),[]);a.equal(b.validDay(32),false)});
