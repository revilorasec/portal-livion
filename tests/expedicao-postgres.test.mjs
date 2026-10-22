import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
let PGlite;try{({PGlite}=await import(pathToFileURL(path.resolve(import.meta.dirname,'../../../EXPEDIÇÃO E ROMANEIOS/Testes-Runtime/node_modules/@electric-sql/pglite/dist/index.js'))));}catch{}
test('actual PostgreSQL RPCs: atomic draft revisions, one pending operation, immutable confirmed receipt, audited Expedido; roles cannot access tables or RPCs',{skip:!PGlite},async()=>{
 const db=new PGlite();try{
 await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create schema storage;create table storage.buckets(id text primary key,name text,public boolean);");
 const schema=await fs.readFile(new URL('../supabase/expedicao-schema.sql',import.meta.url),'utf8');await db.exec(schema);
 await db.exec(await fs.readFile(new URL('../supabase/expedicao-model-management.sql',import.meta.url),'utf8'));
 await db.exec(await fs.readFile(new URL('../supabase/expedicao-settings.sql',import.meta.url),'utf8'));
 await db.exec(await fs.readFile(new URL('../supabase/expedicao-cloud.sql',import.meta.url),'utf8'));
 await db.exec(await fs.readFile(new URL('../supabase/migrations/20261022171000_expedicao_unwritten_operations.sql',import.meta.url),'utf8'));
 await db.exec(await fs.readFile(new URL('../supabase/migrations/20261022202155_expedicao_draft_archive_and_missing_save.sql',import.meta.url),'utf8'));
 const call=async(name,p)=> (await db.query('select public.'+name+'($1::jsonb) as value',[JSON.stringify(p)])).rows[0].value;
 const p={client:'nokia',groupKey:'test-note',fingerprint:'f'.repeat(64),revision:0,draft:{responsible:'Fictício'},actor:'operador@example.test'};
 const output={actor:p.actor,client:'nokia',revision:0,folder:{driveId:'test',folderId:'test-folder',path:'destino'}};
 await db.exec('set role service_role');assert.equal((await call('expedicao_save_settings',output)).revision,1);await assert.rejects(()=>call('expedicao_save_settings',output),/CONFLICT/);await assert.rejects(()=>call('expedicao_save_settings',{...output,revision:null}),/CONFLICT/);await call('expedicao_save_settings',{...output,actor:'outro@example.test'});assert.equal((await db.query('select count(*)::int n from public.expedicao_settings')).rows[0].n,2);await assert.rejects(()=>db.query('delete from public.expedicao_settings'),/permission denied/);
 await db.exec('set role service_role');const d=await call('expedicao_save_draft',p);assert.equal(d.revision,1);await assert.rejects(()=>call('expedicao_save_draft',p),/CONFLICT/);await assert.rejects(()=>call('expedicao_save_draft',{...p,revision:null}),/CONFLICT/);
 const op={...p,id:crypto.randomUUID(),payloadHash:'a'.repeat(64),updates:[{id:'N_TEST',box:'1'}]};const created=await call('expedicao_begin_operation',op);assert.equal(created.state,'PREPARED');assert.equal((await call('expedicao_begin_operation',op)).id,op.id);await assert.rejects(()=>call('expedicao_begin_operation',{...op,id:crypto.randomUUID()}),/PENDING/);
 assert.equal((await db.query('select public.expedicao_claim_operation($1::uuid) as claimed',[op.id])).rows[0].claimed,true);assert.equal((await db.query('select public.expedicao_claim_operation($1::uuid) as claimed',[op.id])).rows[0].claimed,false);
 await db.query("select public.expedicao_finish_operation($1::uuid,'CONFIRMED','{}','operador@example.test')",[op.id]);await db.query("select public.expedicao_finish_operation($1::uuid,'PENDING','{}','operador@example.test')",[op.id]);assert.equal((await db.query('select state from public.expedicao_operations where id=$1',[op.id])).rows[0].state,'CONFIRMED');
 const exp=await call('expedicao_record_export',{...p,dispatchFingerprint:p.fingerprint,modelId:'model-test',modelHash:'a'.repeat(64),fileHash:'b'.repeat(64),output:{filename:'TESTE.xlsx'},ids:['N_TEST']});
 const complete={...p,exportId:exp.id,fileHash:'b'.repeat(64),savedPath:'TESTE.xlsx'};await assert.rejects(()=>call('expedicao_complete_dispatch',{...complete,fileHash:'wrong'}),/CONFLICT/);const done=await call('expedicao_complete_dispatch',complete);assert.equal(done.export_id,exp.id);await call('expedicao_complete_dispatch',complete);assert.equal((await db.query("select count(*)::int n from public.expedicao_events where action='DISPATCH_COMPLETED'")).rows[0].n,1);
 const secondExport=await call('expedicao_record_export',{...p,dispatchFingerprint:p.fingerprint,modelId:'model-test',modelHash:'a'.repeat(64),fileHash:'c'.repeat(64),output:{filename:'CORRECAO.xlsx'},ids:['N_TEST']});
 const corrected=await call('expedicao_complete_dispatch',{...complete,exportId:secondExport.id,fileHash:'c'.repeat(64)});assert.equal(corrected.export_id,exp.id);assert.equal(corrected.dispatched_at,done.dispatched_at);assert.equal((await db.query("select count(*)::int n from public.expedicao_events where action='EXCEL_COPY_SAVED'")).rows[0].n,1);
 await assert.rejects(()=>db.query('delete from public.expedicao_events'),/permission denied/);await assert.rejects(()=>db.query("update public.expedicao_events set actor_email='outro'"),/permission denied/);
 const modelPayload=async value=>{const bytes=new Uint8Array([value]),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');return {client:'claro',action:'save',center:'TEST',actor:p.actor,contentBase64:Buffer.from(bytes).toString('base64'),expectedActiveIds:[],model:{id:'claro-'+hash.slice(0,20),client:'claro',sha256:hash,cnpj:'12345678000199',centers:['TEST','SECOND'],name:'Fictício'}};};
 const first=await modelPayload(1),m1=await call('expedicao_manage_model',first);assert.equal(m1.active,true);
 const second=await modelPayload(2);second.model.centers=['TEST'];Object.assign(second,{expectedActiveIds:[m1.id],sourceId:m1.id,sourceRevision:m1.revision});const m2=await call('expedicao_manage_model',second);
 const retained=(await db.query('select active,metadata from public.expedicao_models where id=$1',[m1.id])).rows[0];assert.equal(retained.active,true);assert.deepEqual(retained.metadata.centers,['SECOND']);
 await assert.rejects(()=>call('expedicao_manage_model',second),/CONFLICT/);
 const archived=await call('expedicao_manage_model',{client:'claro',id:m2.id,revision:m2.revision,action:'archive',actor:p.actor});assert.ok(archived.deleted_at);assert.equal(archived.active,false);
 const recovered=await call('expedicao_manage_model',{client:'claro',id:m2.id,revision:archived.revision,action:'restore',actor:p.actor});assert.equal(recovered.deleted_at,null);assert.equal(recovered.active,false);
 assert.equal((await db.query('select count(*)::int n from public.expedicao_models where content_base64 is not null')).rows[0].n,2);
 for(const role of ['anon','authenticated']){await db.exec('reset role;set role '+role);await assert.rejects(()=>db.query('select * from public.expedicao_drafts'),/permission denied/);await assert.rejects(()=>call('expedicao_save_draft',p),/permission denied/);await assert.rejects(()=>call('expedicao_manage_model',first),/permission denied/);}
 for(const role of ['anon','authenticated']){await db.exec('reset role;set role '+role);await assert.rejects(()=>db.query('select * from public.expedicao_settings'),/permission denied/);await assert.rejects(()=>call('expedicao_save_settings',output),/permission denied/);}
 await db.exec('reset role;set role service_role');
 const beforeArchive=(await db.query('select payload from public.expedicao_drafts where client=$1 and group_key=$2',[p.client,p.groupKey])).rows[0].payload;
 const archivedDraft=await call('expedicao_archive_draft',{client:p.client,groupKey:p.groupKey,revision:1,actor:p.actor});assert.ok(archivedDraft.archived_at);assert.deepEqual(archivedDraft.payload,beforeArchive);
 await assert.rejects(()=>call('expedicao_archive_draft',{client:p.client,groupKey:p.groupKey,revision:1,actor:p.actor}),/CONFLICT/);
 assert.equal((await call('expedicao_save_draft',{...p,revision:archivedDraft.revision})).archived_at,null);
 const missingExport=await call('expedicao_record_export',{...p,groupKey:'missing-file-test',dispatchFingerprint:p.fingerprint,modelId:'model-test',modelHash:'a'.repeat(64),fileHash:'b'.repeat(64),output:{filename:'MISSING.xlsx'},ids:['N_TEST']});
 const missingJobId=crypto.randomUUID();await call('expedicao_cloud_begin_job',{id:missingJobId,client:p.client,groupKey:'missing-file-test',fingerprint:p.fingerprint,actor:p.actor,target:{driveId:'test',folderId:'test'}});
 let missingJob=(await db.query("update public.expedicao_cloud_jobs set export_id=$2,state='UPLOADING' where id=$1 returning to_jsonb(expedicao_cloud_jobs) as value",[missingJobId,missingExport.id])).rows[0].value;
 const releaseMissing=()=>call('expedicao_cloud_release_missing_job',{id:missingJob.id,updatedAt:missingJob.updated_at,exportId:missingExport.id,actor:p.actor});await assert.rejects(releaseMissing,/CONFLICT/);
 missingJob=(await db.query("update public.expedicao_cloud_jobs set updated_at=now()-interval '11 minutes' where id=$1 returning to_jsonb(expedicao_cloud_jobs) as value",[missingJobId])).rows[0].value;
 assert.equal((await releaseMissing()).state,'FAILED');assert.equal((await db.query("select count(*)::int n from public.expedicao_events where action='CENTRAL_SAVE_NOT_FOUND' and detail->>'jobId'=$1",[missingJobId])).rows[0].n,1);
 const unwritten={...op,id:crypto.randomUUID(),groupKey:'unwritten-test-note'};await call('expedicao_begin_operation',unwritten);await db.query('select public.expedicao_claim_operation($1::uuid)',[unwritten.id]);
 const release=proof=>db.query("select public.expedicao_finish_operation($1::uuid,'NOT_WRITTEN',$2::jsonb,'operador@example.test') as value",[unwritten.id,JSON.stringify(proof)]);
 await assert.rejects(()=>release({readOnlyCheck:true,unchanged:1}),/CONFLICT/);
 await db.query("update public.expedicao_operations set updated_at=now()-interval '11 minutes' where id=$1",[unwritten.id]);
 await assert.rejects(()=>release({unchanged:1}),/CONFLICT/);await assert.rejects(()=>release({readOnlyCheck:true,unchanged:2}),/CONFLICT/);
 assert.equal((await release({readOnlyCheck:true,unchanged:1})).rows[0].value.state,'NOT_WRITTEN');
 assert.equal((await db.query("select public.expedicao_finish_operation($1::uuid,'CONFIRMED','{}','operador@example.test') as value",[unwritten.id])).rows[0].value.state,'NOT_WRITTEN');
 assert.equal((await db.query("select count(*)::int n from public.expedicao_events where action='BOXES_NOT_WRITTEN' and detail->>'operationId'=$1",[unwritten.id])).rows[0].n,1);
 await call('expedicao_begin_operation',{...unwritten,id:crypto.randomUUID()});
 const central={client:'nokia',actor:'admin@example.test',revision:0,folder:{driveId:'central',folderId:'only-admin-target',path:'central-output'}};
 assert.equal((await call('expedicao_cloud_save_folder',central)).revision,1);await assert.rejects(()=>call('expedicao_cloud_save_folder',{...central,actor:'another-admin@example.test'}),/CONFLICT/);
 const job={id:crypto.randomUUID(),client:'nokia',groupKey:'central-test-note',fingerprint:'snapshot',actor:'operator@example.test',target:central.folder};
 assert.equal((await call('expedicao_cloud_begin_job',job)).created,true);assert.equal((await call('expedicao_cloud_begin_job',job)).created,false);await assert.rejects(()=>call('expedicao_cloud_begin_job',{...job,id:crypto.randomUUID()}),/PENDING/);await assert.rejects(()=>call('expedicao_cloud_begin_job',{...job,actor:'other@example.test'}),/CONFLICT/);
 const session=crypto.randomUUID();await db.query("insert into public.expedicao_cloud_sessions(id,client_id,actor_email,credential,expires_at,next_poll_at,interval_seconds,state) values($1,$2,'admin@example.test','encrypted-test',now()+interval '10 minutes',now()-interval '1 second',5,'OPEN')",[session,crypto.randomUUID()]);
 assert.equal(await call('expedicao_cloud_claim_session',{id:session,actor:'other@example.test'}),null);assert.equal((await call('expedicao_cloud_claim_session',{id:session,actor:'admin@example.test'})).credential,'encrypted-test');assert.equal((await call('expedicao_cloud_claim_session',{id:session,actor:'admin@example.test'})).waiting,true);
 for(const role of ['anon','authenticated']){await db.exec('reset role;set role '+role);for(const table of ['expedicao_cloud_connection','expedicao_cloud_sessions','expedicao_cloud_settings','expedicao_cloud_jobs'])await assert.rejects(()=>db.query('select * from public.'+table),/permission denied/);await assert.rejects(()=>call('expedicao_cloud_save_folder',central),/permission denied/);await assert.rejects(()=>call('expedicao_cloud_claim_session',{id:session,actor:'admin@example.test'}),/permission denied/);await assert.rejects(()=>call('expedicao_cloud_begin_job',job),/permission denied/);}
 await db.exec('reset role');const rls=(await db.query("select count(*)::int n from pg_class where relname like 'expedicao_%' and relkind='r' and relrowsecurity")).rows[0].n;assert.equal(rls,11);
 }finally{await db.close();}
});
