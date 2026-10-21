import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {describeBoxStatus,boxStatusKey} from '../expedicao/box-status.mjs';
import {prepareExport,boxUpdates} from '../supabase/functions/expedicao-api/domain.mjs';
import {sha256} from '../supabase/functions/expedicao-api/common.mjs';
import {source,groupFor,draftFor,harness} from './expedicao-fixtures.mjs';

test('frontend and service use the same status compatibility policy',()=>{
 assert.equal(readFileSync(new URL('../expedicao/box-status.mjs',import.meta.url),'utf8'),readFileSync(new URL('../supabase/functions/expedicao-api/box-status.mjs',import.meta.url),'utf8'));
 assert.notEqual(boxStatusKey('claro','02-IRREPARÁVEL'),boxStatusKey('claro','SEM REPARO'));
 assert.notEqual(boxStatusKey('claro','03-REPARADO'),boxStatusKey('claro','SEM REPARO'));
});

test('any status combination is accepted for either client and all original labels are shown',()=>{
 assert.deepEqual(describeBoxStatus('claro',['SEM REPARO','02-IRREPARÁVEL','02-IRREPARÁVEL']),{valid:true,combined:true,missing:false,label:'02-IRREPARÁVEL / SEM REPARO'});
 assert.equal(describeBoxStatus('claro',['03-REPARADO','SEM REPARO']).valid,true);
 assert.equal(describeBoxStatus('claro',['STATUS NOVO','SEM REPARO']).valid,true);
 assert.equal(describeBoxStatus('claro',['02-IRREPARÁVEL','']).valid,false);
 assert.equal(describeBoxStatus('nokia',['02-IRREPARÁVEL','SEM REPARO']).valid,true);
});

function sixteenPieces(){
 const s=source('claro'),base=s.rows[0];
 s.rows=Array.from({length:16},(_,k)=>({...base,A:'C_SCRAP_TEST_'+k,AF:k<11?'03-REPARADO':k<15?'02-IRREPARÁVEL':'SEM REPARO',AK:k<11?'1':'2'}));
 return s;
}
function packedDraft(g){
 const draft=draftFor(g);draft.assignments=Object.fromEntries(g.items.map(i=>[i.id,i.box]));
 draft.boxes={1:{weight:'21,400',dimension:'P - 35X35X24',observation:''},2:{weight:'10,200',dimension:'P - 35X35X24',observation:''}};
 return draft;
}

test('16 pieces form two boxes, retain each item status, and generate/complete through the service',async()=>{
 const s=sixteenPieces(),g=await groupFor('claro',s),draft=packedDraft(g),plan=prepareExport(g,draft);
 assert.deepEqual(plan.boxes.map(b=>({count:b.ids.length,status:b.status,weight:b.weight})),[{count:11,status:'03-REPARADO',weight:21.4},{count:5,status:'02-IRREPARÁVEL / SEM REPARO',weight:10.2}]);
 assert.equal(plan.cells['02 Romaneio v2'].I30.value,'SEM REPARO');
 const unboxed=structuredClone(g);unboxed.items.forEach(i=>i.box='');assert.equal(boxUpdates(unboxed,draft).length,16);
 const h=harness();h.sources.claro=s;h.models.claro[0].sha256=await sha256(new Uint8Array([1]));
 const loaded=(await h.call('load',null,'claro')).body.groups[0],base={client:'claro',groupKey:loaded.key,fingerprint:loaded.fingerprint};
 const generated=await h.call('generate',{...base,draft});assert.equal(generated.status,200,JSON.stringify(generated.body));
 assert.equal(h.dispatches.length,0);
 const saved=await h.call('saved',{...base,exportId:generated.body.exportId,sha256:generated.body.sha256,savedPath:'test-only.xlsx'});
 assert.equal(saved.status,200);assert.equal(h.writes,0);
 assert.equal((await h.call('load',null,'claro')).body.groups[0].dispatchState,'EXPEDIDO');
});

test('action failures are shown beside the generation button and scrolled into view',async()=>{
 const js=readFileSync(new URL('../expedicao/app.mjs',import.meta.url),'utf8');
 const notice=js.slice(js.indexOf('function notice('),js.indexOf('async function token('));
 const action=js.match(/async function action\(fn\)\{[^\n]+\}/)[0];
 const elements={notice:{},actionNotice:{hidden:true}},scrolled=[];
 for(const [id,e] of Object.entries(elements))e.scrollIntoView=()=>scrolled.push(id);
 const runtime={$:id=>elements[id],selected:{key:'test'},busy:false,syncControls(){}};
 const api=runInNewContext(notice+'\n'+action+'\n({notice,action})',runtime);
 await api.action(async()=>{throw Error('Caixa 2: erro de conferência');});
 assert.equal(elements.actionNotice.hidden,false);assert.equal(elements.actionNotice.textContent,'Caixa 2: erro de conferência');
 assert.deepEqual(scrolled,['actionNotice']);assert.equal(runtime.busy,false);
});
