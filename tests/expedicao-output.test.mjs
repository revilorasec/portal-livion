import test from 'node:test';import assert from 'node:assert/strict';
import {resolveFolder,saveCloudWorkbook} from '../expedicao/onedrive.mjs';
import {harness,groupFor,draftFor} from './expedicao-fixtures.mjs';
import {prepareExport} from '../supabase/functions/expedicao-api/domain.mjs';
import {dimensionOptions} from '../supabase/functions/expedicao-api/models.mjs';

test('dimension dropdown values follow the Excel configuration and generation rejects other values',async()=>{
 const cells={C8:{value:'Dimensões padrão'},C9:{value:'PEQUENA'},C10:{value:'OUTRA'}};
 const book={cells:{'04 Configurações':cells},value:(_s,a)=>cells[a]?.value||''};assert.deepEqual(dimensionOptions(book),['PEQUENA','OUTRA']);
 const h=harness();h.models.nokia[0].dimensionOptions=['P - 35X35X24','M - 47X38X24','OUTRA'];const g=(await h.call('load')).body.groups[0];assert.deepEqual(g.model.dimensionOptions,h.models.nokia[0].dimensionOptions);const d=draftFor(g);prepareExport(g,d);d.boxes[1].dimension='inventada';assert.throws(()=>prepareExport(g,d),/dimensão da lista/);
});
test('output folder preferences persist by authenticated user and client and reject stale updates',async()=>{
 const h=harness(),folder={driveId:'test-drive',folderId:'test-folder',path:'destino'};
 const s=await h.call('settings',{client:'nokia',revision:0,folder});assert.equal(s.status,200);assert.equal((await h.call('settings')).body.settings.folder.path,'destino');
 assert.equal((await h.call('settings',null,'claro')).body.settings,null);
 assert.equal((await h.call('settings',{client:'nokia',revision:0,folder})).status,409);
 h.user.email='outro@example.test';assert.equal((await h.call('settings')).body.settings,null);
 h.user.profile='VISUALIZADOR';assert.equal((await h.call('settings',{client:'nokia',revision:0,folder})).status,403);assert.equal(h.writes,0);
});
test('cloud save creates only the note folder and one unique Excel, then verifies actual bytes; never overwrites or retries a write',async()=>{
 const bytes=new Uint8Array([1,2,3]),sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
 const result={bytes:btoa(String.fromCharCode(...bytes)),sha256,folder:'NF 123',filename:'Romaneio.xlsx',exportId:'test-export'},target={driveId:'drive',folderId:'root',path:'Expedição'};
 for(const scenario of ['ok','existing','bad-readback','timeout']){
  let puts=0,posts=0;const calls=[];const fake=async(url,o={})=>{calls.push(url);if(url.includes('/root?'))return Response.json({id:'root',name:'Expedição',folder:{}});if(o.method==='POST'){posts++;return Response.json({id:'note-folder',folder:{}});}if(o.method==='PUT'){puts++;assert.equal(o.headers['If-None-Match'],'*');if(scenario==='timeout')throw Error('timeout');return Response.json({id:'saved'});}if(url.includes('/saved?'))return Response.json({id:'saved','@microsoft.graph.downloadUrl':'https://files.example.test/workbook'});if(url==='https://files.example.test/workbook'){assert.equal(o.headers?.Authorization,undefined);return new Response(scenario==='bad-readback'?new Uint8Array([9]):bytes);}if(url.includes('note-folder:/')&&scenario==='existing')return Response.json({id:'old'});return new Response('{}',{status:404});};
  if(scenario==='ok')assert.match(await saveCloudWorkbook('test-token',target,result,fake),/OneDrive\/Expedição\/NF 123\/Romaneio \(test-export\)\.xlsx/);else await assert.rejects(()=>saveCloudWorkbook('test-token',target,result,fake));
  assert.equal(posts,1);assert.equal(puts,scenario==='existing'?0:1);assert.ok(calls.every(u=>u.startsWith('https://graph.microsoft.com/v1.0/drives/drive/')||u==='https://files.example.test/workbook'));
 }
 let called=false;await assert.rejects(()=>resolveFolder('test','../private',async()=>{called=true;}));assert.equal(called,false);
});
