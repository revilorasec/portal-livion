const test=require('node:test');
const assert=require('node:assert/strict');
const InputFormat=require('./expense-input-format.js');

test('formats Brazilian money while digits are typed',()=>{
  assert.equal(InputFormat.formatMoneyInput('1'),'0,01');
  assert.equal(InputFormat.formatMoneyInput('12'),'0,12');
  assert.equal(InputFormat.formatMoneyInput('38532'),'385,32');
  assert.equal(InputFormat.formatMoneyInput('123456'),'1.234,56');
  assert.equal(InputFormat.formatMoneyInput('385,32'),'385,32');
});

test('converts formatted money to the numeric value sent to the API',()=>{
  assert.equal(InputFormat.parseMoneyInput('385,32'),385.32);
  assert.equal(InputFormat.parseMoneyInput('1.234,56'),1234.56);
  assert.equal(InputFormat.formatMoneyValue(385.32),'385,32');
});

test('formats CPF and CNPJ with the standard punctuation',()=>{
  assert.equal(InputFormat.formatDocument('12345678901'),'123.456.789-01');
  assert.equal(InputFormat.formatDocument('12345678000199'),'12.345.678/0001-99');
});
