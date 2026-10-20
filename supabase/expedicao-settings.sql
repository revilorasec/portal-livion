-- Folder preferences follow the authenticated Portal user across devices. No tokens are stored.
create table if not exists public.expedicao_settings (
 owner_email text not null, client text not null check(client in ('nokia','claro')),
 folder jsonb not null, revision integer not null default 1,
 updated_at timestamptz not null default now(), primary key(owner_email,client)
);
alter table public.expedicao_settings enable row level security;
revoke all on public.expedicao_settings from public,anon,authenticated,service_role;
grant select,insert,update on public.expedicao_settings to service_role;
create or replace function public.expedicao_save_settings(p jsonb) returns jsonb language plpgsql security invoker set search_path=public as $$
declare current_row public.expedicao_settings; saved public.expedicao_settings;
begin
 perform pg_advisory_xact_lock(hashtextextended('expedicao-settings:'||(p->>'actor')||':'||(p->>'client'),0));
 select * into current_row from public.expedicao_settings where owner_email=p->>'actor' and client=p->>'client' for update;
 if coalesce(current_row.revision,0) is distinct from (p->>'revision')::integer then raise exception 'CONFLICT'; end if;
 insert into public.expedicao_settings(owner_email,client,folder,revision) values(p->>'actor',p->>'client',p->'folder',1)
 on conflict(owner_email,client) do update set folder=excluded.folder,revision=expedicao_settings.revision+1,updated_at=now() returning * into saved;
 insert into public.expedicao_events(client,group_key,action,actor_email,detail) values(saved.client,'SETTINGS','OUTPUT_FOLDER_SAVED',saved.owner_email,jsonb_build_object('revision',saved.revision,'folder',saved.folder));
 return to_jsonb(saved);
end $$;
revoke all on function public.expedicao_save_settings(jsonb) from public,anon,authenticated;
grant execute on function public.expedicao_save_settings(jsonb) to service_role;
