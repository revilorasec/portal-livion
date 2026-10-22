begin;
alter table public.expedicao_drafts add column if not exists archived_at timestamptz;
alter table public.expedicao_drafts add column if not exists archived_by text;
create or replace function public.expedicao_save_draft(p jsonb) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare current_row public.expedicao_drafts; saved public.expedicao_drafts;
begin
 perform pg_advisory_xact_lock(hashtextextended('expedicao:'||(p->>'client')||':'||(p->>'groupKey'),0));
 select * into current_row from public.expedicao_drafts where client=p->>'client' and group_key=p->>'groupKey' for update;
 if coalesce(current_row.revision,0) <> coalesce((p->>'revision')::integer,-1) then raise exception 'CONFLICT'; end if;
 insert into public.expedicao_drafts(client,group_key,fingerprint,revision,payload,updated_by)
 values(p->>'client',p->>'groupKey',p->>'fingerprint',coalesce(current_row.revision,0)+1,p->'draft',p->>'actor')
 on conflict(client,group_key) do update set fingerprint=excluded.fingerprint,revision=excluded.revision,payload=excluded.payload,updated_by=excluded.updated_by,updated_at=now(),archived_at=null,archived_by=null returning * into saved;
 insert into public.expedicao_events(client,group_key,action,actor_email,detail) values(saved.client,saved.group_key,'DRAFT_SAVED',saved.updated_by,jsonb_build_object('revision',saved.revision,'before',current_row.payload,'after',saved.payload));
 return to_jsonb(saved);
end $$;
create or replace function public.expedicao_archive_draft(p jsonb) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare saved public.expedicao_drafts;
begin
 perform pg_advisory_xact_lock(hashtextextended('expedicao:'||(p->>'client')||':'||(p->>'groupKey'),0));
 select * into saved from public.expedicao_drafts where client=p->>'client' and group_key=p->>'groupKey' for update;
 if not found or saved.revision is distinct from (p->>'revision')::integer then raise exception 'CONFLICT'; end if;
 if saved.archived_at is not null then return to_jsonb(saved); end if;
 update public.expedicao_drafts set archived_at=now(),archived_by=p->>'actor',revision=revision+1,updated_at=now(),updated_by=p->>'actor'
 where client=saved.client and group_key=saved.group_key returning * into saved;
 insert into public.expedicao_events(client,group_key,action,actor_email,detail)
 values(saved.client,saved.group_key,'DRAFT_ARCHIVED',p->>'actor',jsonb_build_object('revision',saved.revision));
 return to_jsonb(saved);
end $$;
create or replace function public.expedicao_cloud_release_missing_job(p jsonb) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare job public.expedicao_cloud_jobs;
begin
 select * into strict job from public.expedicao_cloud_jobs where id=(p->>'id')::uuid for update;
 if job.state in ('COMPLETED','FAILED') then return to_jsonb(job); end if;
 if job.state not in ('PREPARED','UPLOADING','PENDING') or job.receipt is not null
 or job.updated_at > now()-interval '10 minutes'
 or job.updated_at is distinct from (p->>'updatedAt')::timestamptz
 or job.export_id is distinct from (p->>'exportId')::uuid
 or not exists(select 1 from public.expedicao_exports where id=job.export_id and saved_at is null)
 then raise exception 'CONFLICT'; end if;
 update public.expedicao_cloud_jobs set state='FAILED',updated_at=now() where id=job.id returning * into job;
 insert into public.expedicao_events(client,group_key,action,actor_email,detail)
 values(job.client,job.group_key,'CENTRAL_SAVE_NOT_FOUND',p->>'actor',jsonb_build_object('jobId',job.id,'exportId',job.export_id,'readOnlyCheck',true));
 return to_jsonb(job);
end $$;
revoke all on function public.expedicao_archive_draft(jsonb),public.expedicao_cloud_release_missing_job(jsonb),public.expedicao_save_draft(jsonb) from public,anon,authenticated;
grant execute on function public.expedicao_archive_draft(jsonb),public.expedicao_cloud_release_missing_job(jsonb),public.expedicao_save_draft(jsonb) to service_role;
commit;