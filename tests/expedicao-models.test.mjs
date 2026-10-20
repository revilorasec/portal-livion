import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,groupFor,draftFor} from './expedicao-fixtures.mjs';
import {prepareExport,sourceGroups} from '../supabase/functions/expedicao-api/domain.mjs';
import {guardModelZip,modelDestinations} from '../supabase/functions/expedicao-api/models.mjs';
import * as claro from '../supabase/functions/expedicao-api/adapters/claro.mjs';

test('model administration requires administrator before any file access; deletion is recoverable with revision checks',async()=>{
 const h=harness();assert.equal((await h.call('models')).body.models.length,1);
 h.user.profile='OPERACIONAL';h.user.apps=['expedicao'];h.user.actions=['expedicao.nokia.acessar','expedicao.visualizar'];
 assert.equal((await h.call('models')).status,403);assert.equal((await h.call('model-state',{client:'nokia',id:'model-nokia-test',revision:1,action:'archive'})).status,403);assert.equal(h.events.length,0);
 h.user.profile='ADMINISTRADOR';const p={client:'nokia',id:'model-nokia-test',revision:1,action:'archive'};
 assert.equal((await h.call('model-state',p)).status,200);assert.ok(h.models.nokia[0].deletedAt);assert.equal((await h.call('model-state',p)).status,409);
 assert.equal((await h.call('model-state',{...p,revision:2,action:'restore'})).status,200);assert.equal(h.models.nokia[0].deletedAt,null);assert.equal(h.models.nokia[0].active,false);assert.equal(h.writes,0);
});
test('editing a romaneio destination changes only the copied workbook and output plan',async()=>{
 for(const client of ['nokia','claro']){const group=await groupFor(client),original=structuredClone(group),draft={...draftFor(group),destinationCity:'Cidade de teste',destinationUf:'SP',destinationAddress:'Rua fictícia 123, CEP 01000-000'};const plan=prepareExport(group,draft);assert.equal(plan.cells['01 Pesagem v2'].B11.value,draft.destinationAddress);assert.equal(plan.cells['01 Pesagem v2'].D6.value,draft.destinationCity);assert.deepEqual(group,original);}
});
test('new addresses require an explicit model override and remain bound to full client, CNPJ and Centro',async()=>{
 const h=harness(),s=h.sources.claro,m={...h.models.claro[0],address:'Novo endereço',city:'Nova cidade',overrideDestination:true};
 const r=await sourceGroups('claro',s,[m]);assert.equal(r.groups[0].destination.address,'Novo endereço');assert.deepEqual(r.groups[0].errors,[]);
 assert.equal(claro.modelMatches({...m,centers:['OUTRO']},r.groups[0]),false);assert.equal(claro.modelMatches({...m,cnpj:'99999999999999'},r.groups[0]),false);
 const ds=modelDestinations('claro',m,s,h.models.claro);assert.equal(ds.length,1);assert.equal(ds[0].matches,false);
});
test('ZIP limits reject malformed, encrypted and oversized expanded workbooks before decompression',()=>{
 assert.throws(()=>guardModelZip(new Uint8Array([1])));
 const make=(size,flags=0)=>{const b=new Uint8Array(150),v=new DataView(b.buffer);v.setUint32(0,0x02014b50,true);v.setUint16(8,flags,true);v.setUint32(24,size,true);v.setUint16(28,1,true);b[46]=65;v.setUint32(128,0x06054b50,true);v.setUint16(138,1,true);v.setUint32(144,0,true);return b;};
 guardModelZip(make(10));assert.throws(()=>guardModelZip(make(50*1024*1024)));assert.throws(()=>guardModelZip(make(10,1)));
});
