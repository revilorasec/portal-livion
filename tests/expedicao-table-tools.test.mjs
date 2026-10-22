import test from 'node:test';
import assert from 'node:assert/strict';
import {matchesQuery,compareValues} from '../expedicao/table-tools.mjs';

test('piece search ignores accents and case and matches combined fields, including assigned box and original item',()=>{
 const values=['007','2','02310FFA','SERIAL-123','20679','02-IRREPARÁVEL','EXPEDIÇÃO'];
 for(const query of ['irreparavel','SERIAL-123','007','2 20679','expedicao irreparavel','   '])assert.equal(matchesQuery(values,query),true,query);
 assert.equal(matchesQuery(values,'SERIAL-999'),false);assert.equal(matchesQuery(values,'2 reparado'),false);
});

test('numeric text sorts naturally without converting large serials to imprecise numbers',()=>{
 const rows=['10','2','1','9028911109379484','9028911109379483'];
 assert.deepEqual([...rows].sort(compareValues),['1','2','10','9028911109379483','9028911109379484']);
 assert.equal(compareValues('123456789012345678902','123456789012345678901')>0,true);
 assert.equal(compareValues('NF 10','NF 2','descending')<0,true);assert.equal(compareValues('Água','Brasília')<0,true);
});

test('empty cells remain last in either direction and localized weights sort by actual value',()=>{
 for(const direction of ['ascending','descending'])assert.equal(compareValues('','2',direction),1);
 const values=['21,400','3,500','1.200,500','10,200'];
 assert.deepEqual([...values].sort((a,b)=>compareValues(a,b,'ascending','decimal')),['3,500','10,200','21,400','1.200,500']);
 assert.deepEqual(values,['21,400','3,500','1.200,500','10,200']);
});
