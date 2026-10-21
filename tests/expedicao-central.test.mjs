import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {centralCloud} from '../supabase/functions/expedicao-api/cloud.mjs';
import {cloudGraph,verifyCentralFile} from '../supabase/functions/expedicao-api/cloud-drive.mjs';
import {sha256,ExpeditionError} from '../supabase/functions/expedicao-api/common.mjs';
import {harness,draftFor} from './expedicao-fixtures.mjs';
const OWNER='cesar.oliver@livionsolutions.com.br',APP='12345678-1234-1234-1234-123456789abc';
function cloudHarness(){
 let clock=Date.now();const tables={expedicao_cloud_connection:[{id:'central',client_id:APP,owner_email:OWNER,owner_id:'',credential:'',scope:'',state:'RECONNECT',revision:1}],expedicao_cloud_sessions:[],expedicao_cloud_settings:[],expedicao_cloud_jobs:[]};
 const h={tables,puts:0,posts:0,failUpload:false,account:OWNER,bytes:new Uint8Array([1]),calls:[]};
 const rest=async(path,o={})=>{const u=new URL('https://isolated.test/'+path),rows=tables[u.pathname.slice(1)];assert.ok(rows,path);const selected=rows.filter(row=>[...u.searchParams].every(([k,v])=>['select','order'].includes(k)||v.startsWith('eq.')&&String(row[k])===v.slice(3)||v.startsWith('in.(')&&v.slice(4,-1).split(',').includes(row[k])));
  if(o.method==='POST'){const row=JSON.parse(o.body);rows.push(row);return [structuredClone(row)];}if(o.method==='PATCH'){const patch=JSON.parse(o.body);selected.forEach(row=>Object.assign(row,patch));}return structuredClone(selected);};
 const rpc=async(name,{p})=>{if(name==='cloud_claim_session'){const s=tables.expedicao_cloud_sessions.find(s=>s.id===p.id&&s.actor_email===p.actor);if(!s||s.state!=='OPEN'||new Date(s.expires_at)<=clock)return null;if(new Date(s.next_poll_at)>clock)return {waiting:true};s.next_poll_at=new Date(clock+s.interval_seconds*1000).toISOString();return structuredClone(s);}
  if(name==='cloud_save_folder'){let s=tables.expedicao_cloud_settings.find(s=>s.client===p.client);if((s?.revision||0)!==p.revision)throw new ExpeditionError(409,'CONFLICT');if(!s){s={client:p.client,revision:0};tables.expedicao_cloud_settings.push(s);}Object.assign(s,{folder:p.folder,revision:s.revision+1,updated_by:p.actor});return structuredClone(s);}
  if(name==='cloud_begin_job'){let j=tables.expedicao_cloud_jobs.find(j=>j.id===p.id);if(j)return {created:false,job:structuredClone(j)};if(tables.expedicao_cloud_jobs.some(j=>j.group_key===p.groupKey&&['PREPARED','UPLOADING','VERIFIED','PENDING'].includes(j.state)))throw new ExpeditionError(409,'PENDING');j={id:p.id,client:p.client,group_key:p.groupKey,actor_email:p.actor,fingerprint:p.fingerprint,target:p.target,state:'PREPARED'};tables.expedicao_cloud_jobs.push(j);return {created:true,job:structuredClone(j)};}throw Error(name);};
 const fetcher=async(url,o={})=>{url=String(url);h.calls.push({url,method:o.method||'GET'});
  if(url.endsWith('/devicecode')){assert.equal(o.body.get('client_id'),APP);return Response.json({device_code:'private-device-code',user_code:'TEST-ONLY',verification_uri:'https://login.microsoft.com/device',expires_in:900,interval:5});}
  if(url.endsWith('/token')){assert.equal(o.body.get('client_id'),APP);return Response.json({access_token:'private-central-access-token',refresh_token:'private-central-refresh-token',scope:'User.Read Files.ReadWrite'});}
  if(url.includes('graph.microsoft.com'))assert.equal(o.headers.Authorization,'Bearer private-central-access-token');
  if(url.includes('/me?'))return Response.json({id:'central-owner',mail:h.account});
  if(url.includes('/root:/'))return Response.json({id:'central-root',name:'Expedição',folder:{},parentReference:{driveId:'central-drive'}});
  if(url.includes('/central-root?'))return Response.json({id:'central-root',folder:{}});
  if(o.method==='POST'){h.posts++;return Response.json({id:'note-folder',folder:{}});}
  if(o.method==='PUT'){h.puts++;if(h.failUpload)throw Error('timeout after upload');return Response.json({id:'saved-file'});}
  if(url.endsWith('/saved-file'))return Response.json({id:'saved-file',size:1,'@microsoft.graph.downloadUrl':'https://tenant.sharepoint.com/private-download'});
  if(url==='https://tenant.sharepoint.com/private-download'){assert.equal(o.headers?.Authorization,undefined);return new Response(h.bytes);}
  if(url.includes('central-root:/')&&url.includes('.xlsx'))return Response.json({id:'saved-file'});
  return new Response('{}',{status:404});
 };
 h.cloud=centralCloud({env:()=> 'isolated-test-master-secret-32-characters',rest,rpc,fetcher,now:()=>clock});
 h.connect=async()=>{const flow=await h.cloud.connect(OWNER);assert.equal(JSON.stringify(tables).includes('private-device-code'),false);clock+=6000;await h.cloud.poll(OWNER,flow.sessionId);};
 return h;
}

test('central credential is encrypted, bound to its purpose and owner, never returned to operators; only central account can connect',async()=>{
 const h=cloudHarness();await assert.rejects(h.cloud.connect('operator@example.test'),e=>e.status===403);await h.connect();
 assert.equal(JSON.stringify(h.tables).includes('private-central-refresh-token'),false);
 assert.equal(h.tables.expedicao_cloud_sessions[0].credential,'');
 await h.cloud.saveFolder('nokia','Empresa/Expedição',0,OWNER);
 assert.deepEqual(await h.cloud.status('nokia',false),{central:true,connected:true,ready:true});
 assert.equal((await h.cloud.status('nokia',true)).settings.folder.path,'Empresa/Expedição');
 h.tables.expedicao_cloud_connection[0].owner_email='different@example.test';
 await assert.rejects(h.cloud.saveFolder('nokia','Empresa/Expedição',1,OWNER),e=>e.code==='CLOUD_RECONNECT');
 const wrong=cloudHarness();wrong.account='operator@example.test';await assert.rejects(wrong.connect(),e=>e.status===403);assert.equal(wrong.tables.expedicao_cloud_connection[0].state,'RECONNECT');
});

test('operator without OneDrive scopes saves only to admin target; server verifies bytes and completes; repeated request never uploads twice',async()=>{
 const cloud=cloudHarness();await cloud.connect();await cloud.cloud.saveFolder('nokia','Empresa/Expedição',0,OWNER);
 const h=harness();h.deps.cloud=cloud.cloud;h.user.profile='OPERADOR';h.user.apps=['expedicao'];h.user.actions=['expedicao.nokia.acessar','expedicao.visualizar','expedicao.gerar_romaneio'];
 h.models.nokia[0].sha256=await sha256(new Uint8Array([1]));h.deps.generateWorkbook=async()=>({bytes:new Uint8Array([1]),sha256:await sha256(new Uint8Array([1]))});
 h.sources.nokia.rows.forEach((r,i)=>{r.V=String(i+1);r.U='21/10/2026';});
 const g=(await h.call('load')).body.groups[0],draft=draftFor(g),operationId=crypto.randomUUID(),body={client:'nokia',groupKey:g.key,fingerprint:g.fingerprint,draft,operationId};
 assert.equal((await h.call('context')).body.canManageOutput,false);
 for(const route of ['cloud-connect','cloud-poll','cloud-folder','settings'])assert.equal((await h.call(route,{client:'nokia',path:'evil',revision:0})).status,403);
 const result=await h.call('generate',body);assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.dispatchState,'EXPEDIDO');assert.equal(cloud.puts,1);assert.equal(h.dispatches.length,1);
 assert.equal(JSON.stringify(result.body).includes('token'),false);assert.equal(result.body.bytes,undefined);assert.equal(result.body.savedPath,undefined);
 assert.equal((await h.call('generate',body)).status,200);assert.equal(cloud.puts,1);
 assert.equal((await h.call('saved',{...body,exportId:h.exports[0].id,sha256:h.exports[0].file_hash,savedPath:'forged'})).status,403);
 const copy=await h.call('generate',{...body,operationId:crypto.randomUUID()});assert.equal(copy.status,200);assert.equal(copy.body.alreadyDispatched,true);assert.equal(cloud.puts,2);assert.notEqual(copy.body.exportId,result.body.exportId);
 assert.equal(cloud.tables.expedicao_cloud_jobs.every(j=>j.state==='COMPLETED'),true);
});

test('uncertain upload remains open, blocks duplicate writes and reconciles actual bytes without reuploading',async()=>{
 const cloud=cloudHarness();await cloud.connect();await cloud.cloud.saveFolder('nokia','Empresa/Expedição',0,OWNER);cloud.failUpload=true;
 const h=harness();h.deps.cloud=cloud.cloud;h.models.nokia[0].sha256=await sha256(new Uint8Array([1]));h.deps.generateWorkbook=async()=>({bytes:new Uint8Array([1]),sha256:await sha256(new Uint8Array([1]))});h.sources.nokia.rows.forEach((r,i)=>{r.V=String(i+1);r.U='21/10/2026';});
 const g=(await h.call('load')).body.groups[0],body={client:'nokia',groupKey:g.key,fingerprint:g.fingerprint,draft:draftFor(g),operationId:crypto.randomUUID()};
 assert.equal((await h.call('generate',body)).status,502);assert.equal(h.dispatches.length,0);assert.equal(cloud.puts,1);
 assert.equal((await h.call('generate',body)).status,409);assert.equal(cloud.puts,1);
 assert.equal((await h.call('load')).body.pendingCloudJobs.length,1);
 assert.equal((await h.call('cloud-reconcile',body)).status,200);assert.equal(h.dispatches.length,1);assert.equal(cloud.puts,1);
});

test('folder errors distinguish missing path from sign-in; central download cannot send credentials to arbitrary hosts',async()=>{
 await assert.rejects(cloudGraph('test','/missing',{},async()=>new Response('{}',{status:404})),e=>e.code==='CLOUD_404'&&!e.message.includes('Reconecte'));
 let calls=0;await assert.rejects(verifyCentralFile('test',{driveId:'d',itemId:'f'},'hash',async()=>{calls++;return Response.json({id:'f',size:1,'@microsoft.graph.downloadUrl':'https://other.example/private'});}));assert.equal(calls,1);
 const ui=readFileSync(new URL('../expedicao/output-settings.mjs',import.meta.url),'utf8');assert.equal(ui.includes('__PORTAL_GET_EXPEDICAO_GRAPH_TOKEN__'),false);assert.equal(ui.includes('graphToken'),false);assert.ok(ui.includes('canManage'));
});
