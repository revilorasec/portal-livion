-- Installation candidate for the new module. Execute only after isolated homologation.
-- Does not touch Nokia/Claro operational rows, users, existing apps or original models.
begin;
create table if not exists public.expedicao_models (
  id text primary key, client text not null check(client in ('nokia','claro')),
  metadata jsonb not null, storage_path text not null unique, sha256 text not null check(length(sha256)=64), active boolean not null default true,
  content_base64 text
);
create table if not exists public.expedicao_drafts (
  client text not null, group_key text not null, fingerprint text not null, revision integer not null default 1,
  payload jsonb not null, updated_at timestamptz not null default now(), updated_by text not null,
  primary key(client,group_key)
);
create table if not exists public.expedicao_events (
  id bigint generated always as identity primary key, client text not null, group_key text not null,
  action text not null, actor_email text not null, created_at timestamptz not null default now(), detail jsonb not null default '{}'
);
create table if not exists public.expedicao_operations (
  id uuid primary key, client text not null, group_key text not null, fingerprint text not null, payload_hash text not null,
  updates jsonb not null, actor_email text not null, state text not null check(state in ('PREPARED','DISPATCHED','PENDING','CONFIRMED')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), result jsonb not null default '{}'
);
create unique index if not exists expedicao_one_pending_per_group on public.expedicao_operations(client,group_key) where state in ('PREPARED','DISPATCHED','PENDING');
create table if not exists public.expedicao_exports (
  id uuid primary key default gen_random_uuid(), client text not null, group_key text not null, fingerprint text not null, dispatch_fingerprint text not null,
  actor_email text not null, created_at timestamptz not null default now(), model_id text not null, model_hash text not null,
  file_hash text not null, output jsonb not null, ids jsonb not null, draft jsonb not null, saved_at timestamptz, saved_path text
);
create table if not exists public.expedicao_dispatches (
  client text not null, group_key text not null, fingerprint text not null, export_id uuid not null references public.expedicao_exports(id),
  dispatched_at timestamptz not null default now(), dispatched_by text not null,
  primary key(client,group_key)
);
alter table public.expedicao_models enable row level security;
alter table public.expedicao_drafts enable row level security;
alter table public.expedicao_events enable row level security;
alter table public.expedicao_operations enable row level security;
alter table public.expedicao_exports enable row level security;
alter table public.expedicao_dispatches enable row level security;
revoke all on public.expedicao_models,public.expedicao_drafts,public.expedicao_events,public.expedicao_operations,public.expedicao_exports,public.expedicao_dispatches from public,anon,authenticated;
grant select,insert,update on public.expedicao_models,public.expedicao_drafts,public.expedicao_operations,public.expedicao_exports,public.expedicao_dispatches to service_role;
grant select,insert on public.expedicao_events to service_role;
revoke delete,truncate on public.expedicao_models,public.expedicao_drafts,public.expedicao_operations,public.expedicao_exports,public.expedicao_dispatches from service_role;
revoke update,delete,truncate on public.expedicao_events from service_role;
grant usage,select on sequence public.expedicao_events_id_seq to service_role;

create or replace function public.expedicao_save_draft(p jsonb) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare current_row public.expedicao_drafts; saved public.expedicao_drafts;
begin
 perform pg_advisory_xact_lock(hashtextextended('expedicao:'||(p->>'client')||':'||(p->>'groupKey'),0));
 select * into current_row from public.expedicao_drafts where client=p->>'client' and group_key=p->>'groupKey' for update;
 if coalesce(current_row.revision,0) <> coalesce((p->>'revision')::integer,-1) then raise exception 'CONFLICT'; end if;
 insert into public.expedicao_drafts(client,group_key,fingerprint,revision,payload,updated_by)
 values(p->>'client',p->>'groupKey',p->>'fingerprint',coalesce(current_row.revision,0)+1,p->'draft',p->>'actor')
 on conflict(client,group_key) do update set fingerprint=excluded.fingerprint,revision=excluded.revision,payload=excluded.payload,updated_by=excluded.updated_by,updated_at=now() returning * into saved;
 insert into public.expedicao_events(client,group_key,action,actor_email,detail) values(saved.client,saved.group_key,'DRAFT_SAVED',saved.updated_by,jsonb_build_object('revision',saved.revision,'before',current_row.payload,'after',saved.payload));
 return to_jsonb(saved);
end $$;
create or replace function public.expedicao_begin_operation(p jsonb) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare op public.expedicao_operations;
begin
 perform pg_advisory_xact_lock(hashtextextended('expedicao:'||(p->>'client')||':'||(p->>'groupKey'),0));
 select * into op from public.expedicao_operations where id=(p->>'id')::uuid;
 if found then
   if op.payload_hash is distinct from p->>'payloadHash' or op.actor_email is distinct from p->>'actor' or op.client is distinct from p->>'client' or op.group_key is distinct from p->>'groupKey' then raise exception 'CONFLICT'; end if;
   return to_jsonb(op);
 end if;
 if exists(select 1 from public.expedicao_operations where client=p->>'client' and group_key=p->>'groupKey' and state in ('PREPARED','DISPATCHED','PENDING')) then raise exception 'PENDING'; end if;
 insert into public.expedicao_operations(id,client,group_key,fingerprint,payload_hash,updates,actor_email,state) values((p->>'id')::uuid,p->>'client',p->>'groupKey',p->>'fingerprint',p->>'payloadHash',p->'updates',p->>'actor','PREPARED') returning * into op;
 insert into public.expedicao_events(client,group_key,action,actor_email,detail) values(op.client,op.group_key,'BOXES_PREPARED',op.actor_email,jsonb_build_object('operationId',op.id,'updates',op.updates));
 return to_jsonb(op);
end $$;
create or replace function public.expedicao_claim_operation(p_id uuid) returns boolean
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare op public.expedicao_operations;
begin
 update public.expedicao_operations set state='DISPATCHED',updated_at=now() where id=p_id and state='PREPARED' returning * into op;
 if not found then return false; end if;
 insert into public.expedicao_events(client,group_key,action,actor_email,detail) values(op.client,op.group_key,'BOXES_DISPATCHED',op.actor_email,jsonb_build_object('operationId',op.id));
 return true;
end $$;
create or replace function public.expedicao_finish_operation(p_id uuid,p_state text,p_result jsonb,p_actor text) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare op public.expedicao_operations;
begin
 if p_state not in ('CONFIRMED','PENDING') then raise exception 'INVALID'; end if;
 select * into strict op from public.expedicao_operations where id=p_id for update;
 if op.state='CONFIRMED' then return to_jsonb(op); end if;
 if op.state not in ('DISPATCHED','PENDING') then raise exception 'INVALID'; end if;
 update public.expedicao_operations set state=p_state,result=p_result,updated_at=now() where id=p_id returning * into op;
 insert into public.expedicao_events(client,group_key,action,actor_email,detail) values(op.client,op.group_key,'BOXES_'||p_state,p_actor,jsonb_build_object('operationId',op.id,'result',p_result));
 return to_jsonb(op);
end $$;
create or replace function public.expedicao_record_export(p jsonb) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare exp public.expedicao_exports;
begin
 insert into public.expedicao_exports(client,group_key,fingerprint,dispatch_fingerprint,actor_email,model_id,model_hash,file_hash,output,ids,draft)
 values(p->>'client',p->>'groupKey',p->>'fingerprint',p->>'dispatchFingerprint',p->>'actor',p->>'modelId',p->>'modelHash',p->>'fileHash',p->'output',p->'ids',p->'draft') returning * into exp;
 insert into public.expedicao_events(client,group_key,action,actor_email,detail) values(exp.client,exp.group_key,'EXCEL_GENERATED',exp.actor_email,jsonb_build_object('exportId',exp.id,'sha256',exp.file_hash,'model',exp.model_id));
 return to_jsonb(exp);
end $$;
create or replace function public.expedicao_complete_dispatch(p jsonb) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare exp public.expedicao_exports; result public.expedicao_dispatches; already_dispatched boolean;
begin
 perform pg_advisory_xact_lock(hashtextextended('expedicao:'||(p->>'client')||':'||(p->>'groupKey'),0));
 select * into strict exp from public.expedicao_exports where id=(p->>'exportId')::uuid for update;
 if exp.client is distinct from p->>'client' or exp.group_key is distinct from p->>'groupKey' or exp.actor_email is distinct from p->>'actor' or exp.file_hash is distinct from p->>'fileHash' or exp.dispatch_fingerprint is distinct from p->>'fingerprint' then raise exception 'CONFLICT'; end if;
 if exists(select 1 from public.expedicao_operations where client=exp.client and group_key=exp.group_key and state in ('PREPARED','DISPATCHED','PENDING')) then raise exception 'PENDING'; end if;
 if exp.saved_at is null then
   select exists(select 1 from public.expedicao_dispatches where client=exp.client and group_key=exp.group_key and fingerprint=exp.dispatch_fingerprint) into already_dispatched;
   update public.expedicao_exports set saved_at=now(),saved_path=p->>'savedPath' where id=exp.id;
   insert into public.expedicao_dispatches(client,group_key,fingerprint,export_id,dispatched_by) values(exp.client,exp.group_key,exp.dispatch_fingerprint,exp.id,exp.actor_email)
   on conflict(client,group_key) do update set fingerprint=excluded.fingerprint,export_id=excluded.export_id,dispatched_by=excluded.dispatched_by,dispatched_at=now() where expedicao_dispatches.fingerprint is distinct from excluded.fingerprint;
   insert into public.expedicao_events(client,group_key,action,actor_email,detail) values(exp.client,exp.group_key,case when already_dispatched then 'EXCEL_COPY_SAVED' else 'DISPATCH_COMPLETED' end,exp.actor_email,jsonb_build_object('exportId',exp.id,'sha256',exp.file_hash,'savedPath',p->>'savedPath'));
 end if;
 select * into result from public.expedicao_dispatches where client=exp.client and group_key=exp.group_key;
 return to_jsonb(result);
end $$;
revoke all on function public.expedicao_save_draft(jsonb),public.expedicao_begin_operation(jsonb),public.expedicao_claim_operation(uuid),public.expedicao_finish_operation(uuid,text,jsonb,text),public.expedicao_record_export(jsonb),public.expedicao_complete_dispatch(jsonb) from public,anon,authenticated;
grant execute on function public.expedicao_save_draft(jsonb),public.expedicao_begin_operation(jsonb),public.expedicao_claim_operation(uuid),public.expedicao_finish_operation(uuid,text,jsonb,text),public.expedicao_record_export(jsonb),public.expedicao_complete_dispatch(jsonb) to service_role;
-- Private model bucket: no public download policy and no client write policy.
insert into storage.buckets(id,name,public) values('expedicao-modelos','expedicao-modelos',false) on conflict(id) do nothing;
commit;
