import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { destinationState, states, savedDraftEntries } from '../expedicao/presentation.mjs';

test('destination flags cover all 27 UFs and never substitute an unknown state',async()=>{
 assert.equal(Object.keys(states).length,27);
 assert.deepEqual(destinationState(' go '),{uf:'GO',name:'Goiás',src:'../assets/state-flags/GO.svg'});
 for(const uf of Object.keys(states))assert.match(await fs.readFile(new URL('../assets/state-flags/'+uf+'.svg',import.meta.url),'utf8'),/<svg\b/);
 assert.equal(destinationState('SPI'),null);assert.equal(destinationState(''),null);assert.equal(destinationState('../../private'),null);
});
test('saved drafts keep distinct destinations, saved corrections and drafts absent from the current BD',()=>{
 const one={key:'["claro","394","cnpj","GO"]',note:'394',destination:{city:'Gioania',uf:'GO',center:'62EA'},dispatchState:'EM_EXPEDICAO'};
 const two={key:'["claro","394","cnpj","DF"]',note:'394',destination:{city:'Brasília',uf:'DF',center:'6192'},dispatchState:'EXPEDIDO'};
 const drafts=[{group_key:one.key,payload:{destinationCity:'Goiânia',destinationUf:'GO'},updated_at:'2026-10-20T20:00:00Z'},{group_key:two.key,payload:{},updated_at:'2026-10-20T21:00:00Z'},{group_key:'["claro","300","missing","SP"]',payload:{destinationCity:'São Paulo'},updated_at:'2026-10-19T10:00:00Z'}];
 const rows=savedDraftEntries([one,two],drafts);assert.equal(rows.length,3);assert.equal(rows[0].group.dispatchState,'EXPEDIDO');assert.equal(rows[1].city,'Goiânia');assert.equal(rows[2].note,'300');assert.equal(rows[2].group,undefined);assert.equal(rows[2].saved,drafts[2]);assert.deepEqual(savedDraftEntries(),[]);
});
