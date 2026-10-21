-- Central output: the browser never receives the company's Microsoft credential.
begin;
create table if not exists public.expedicao_cloud_connection (
 id text primary key check(id='central'), client_id uuid not null, owner_email text not null, owner_id text not null,
 credential text not null, scope text not null, state text not null check(state in ('ACTIVE','RECONNECT')),
 revision integer not null default 1, updated_at timestamptz not null default now()
);
create table if not exists public.expedicao_cloud_sessions (
 id uuid primary key, client_id uuid not null, actor_email text not null, credential text not null,
 expires_at timestamptz not null, next_poll_at timestamptz not null,
 interval_seconds integer not null check(interval_seconds>=5),
 state text not null check(state in ('OPEN','COMPLETE','EXPIRED')), created_at timestamptz not null default now()
);
create table if not exists public.expedicao_cloud_settings (
 client text primary key check(client in ('nokia','claro')), folder jsonb not null,
 revision integer not null default 1, updated_by text not null, updated_at timestamptz not null default now()
);
create table if not exists public.expedicao_cloud_jobs (
 id uuid primary key, client text not null check(client in ('nokia','claro')), group_key text not null,
 fingerprint text not null, actor_email text not null, target jsonb not null,
 state text not null check(state in ('PREPARED','UPLOADING','VERIFIED','COMPLETED','PENDING','FAILED')),
 export_id uuid references public.expedicao_exports(id), receipt jsonb,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create unique index if not exists expedicao_cloud_one_active_job on public.expedicao_cloud_jobs(client,group_key) where state in ('PREPARED','UPLOADING','VERIFIED','PENDING');
alter table public.expedicao_cloud_connection enable row level security;
alter table public.expedicao_cloud_sessions enable row level security;
alter table public.expedicao_cloud_settings enable row level security;
alter table public.expedicao_cloud_jobs enable row level security;
revoke all on public.expedicao_cloud_connection,public.expedicao_cloud_sessions,public.expedicao_cloud_settings,public.expedicao_cloud_jobs from public,anon,authenticated,service_role;
grant select,insert,update on public.expedicao_cloud_connection,public.expedicao_cloud_sessions,public.expedicao_cloud_settings,public.expedicao_cloud_jobs to service_role;

create or replace function public.expedicao_cloud_save_folder(p jsonb) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare existing public.expedicao_cloud_settings; saved public.expedicao_cloud_settings;
begin
 perform pg_advisory_xact_lock(hashtextextended('expedicao-cloud-folder:'||(p->>'client'),0));
 select * into existing from public.expedicao_cloud_settings where client=p->>'client' for update;
 if coalesce(existing.revision,0) is distinct from (p->>'revision')::integer then raise exception 'CONFLICT'; end if;
 insert into public.expedicao_cloud_settings(client,folder,updated_by) values(p->>'client',p->'folder',p->>'actor')
 on conflict(client) do update set folder=excluded.folder,updated_by=excluded.updated_by,revision=expedicao_cloud_settings.revision+1,updated_at=now() returning * into saved;
 insert into public.expedicao_events(client,group_key,action,actor_email,detail) values(saved.client,'SETTINGS','CENTRAL_FOLDER_SAVED',saved.updated_by,jsonb_build_object('revision',saved.revision,'folder',saved.folder));
 return to_jsonb(saved);
end $$;
create or replace function public.expedicao_cloud_claim_session(p jsonb) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare s public.expedicao_cloud_sessions;
begin
 select * into s from public.expedicao_cloud_sessions where id=(p->>'id')::uuid and actor_email=p->>'actor' for update;
 if not found or s.state<>'OPEN' or s.expires_at<=now() then return null; end if;
 if s.next_poll_at>now() then return jsonb_build_object('waiting',true); end if;
 update public.expedicao_cloud_sessions set next_poll_at=now()+make_interval(secs=>interval_seconds) where id=s.id;
 return to_jsonb(s);
end $$;
create or replace function public.expedicao_cloud_begin_job(p jsonb) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare j public.expedicao_cloud_jobs;
begin
 perform pg_advisory_xact_lock(hashtextextended('expedicao-cloud-job:'||(p->>'client')||':'||(p->>'groupKey'),0));
 select * into j from public.expedicao_cloud_jobs where id=(p->>'id')::uuid;
 if found then
  if j.client is distinct from p->>'client' or j.group_key is distinct from p->>'groupKey' or j.actor_email is distinct from p->>'actor' or j.fingerprint is distinct from p->>'fingerprint' then raise exception 'CONFLICT'; end if;
  return jsonb_build_object('created',false,'job',to_jsonb(j));
 end if;
 if exists(select 1 from public.expedicao_cloud_jobs where client=p->>'client' and group_key=p->>'groupKey' and state in ('PREPARED','UPLOADING','VERIFIED','PENDING')) then raise exception 'PENDING'; end if;
 insert into public.expedicao_cloud_jobs(id,client,group_key,fingerprint,actor_email,target,state) values((p->>'id')::uuid,p->>'client',p->>'groupKey',p->>'fingerprint',p->>'actor',p->'target','PREPARED') returning * into j;
 insert into public.expedicao_events(client,group_key,action,actor_email,detail) values(j.client,j.group_key,'CENTRAL_SAVE_PREPARED',j.actor_email,jsonb_build_object('jobId',j.id));
 return jsonb_build_object('created',true,'job',to_jsonb(j));
end $$;
revoke all on function public.expedicao_cloud_save_folder(jsonb),public.expedicao_cloud_claim_session(jsonb),public.expedicao_cloud_begin_job(jsonb) from public,anon,authenticated;
grant execute on function public.expedicao_cloud_save_folder(jsonb),public.expedicao_cloud_claim_session(jsonb),public.expedicao_cloud_begin_job(jsonb) to service_role;
commit;
