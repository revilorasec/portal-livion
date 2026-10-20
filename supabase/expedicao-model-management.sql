begin;
alter table public.expedicao_models add column if not exists revision integer not null default 1;
alter table public.expedicao_models add column if not exists deleted_at timestamptz;
alter table public.expedicao_models add column if not exists updated_at timestamptz not null default now();
alter table public.expedicao_models add column if not exists updated_by text;
create or replace function public.expedicao_manage_model(p jsonb) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare row_before public.expedicao_models; saved public.expedicao_models; old public.expedicao_models;
 m jsonb:=p->'model'; c text:=p->>'client'; target text:=p->>'center'; actual jsonb; remaining jsonb; merged jsonb;
begin
 if c not in ('nokia','claro') or coalesce(p->>'actor','')='' then raise exception 'INVALID';end if;
 perform pg_advisory_xact_lock(hashtextextended('expedicao-models:'||c,0));
 if p->>'action' in ('archive','restore') then
  select * into strict row_before from public.expedicao_models where id=p->>'id' and client=c for update;
  if row_before.revision is distinct from (p->>'revision')::integer then raise exception 'CONFLICT';end if;
  update public.expedicao_models set active=false,deleted_at=case when p->>'action'='archive' then now() else null end,revision=revision+1,updated_at=now(),updated_by=p->>'actor' where id=row_before.id returning * into saved;
 else
  if p->>'action'<>'save' or m->>'client' is distinct from c or length(m->>'sha256')<>64 or m->>'id' is distinct from c||'-'||left(m->>'sha256',20) then raise exception 'INVALID';end if;
  if length(p->>'contentBase64')>2800000 or encode(sha256(decode(p->>'contentBase64','base64')),'hex') is distinct from m->>'sha256' then raise exception 'INVALID';end if;
  if p->>'sourceId' is not null then
   select * into strict old from public.expedicao_models where id=p->>'sourceId' and client=c for update;
   if old.revision is distinct from (p->>'sourceRevision')::integer or old.deleted_at is not null then raise exception 'CONFLICT';end if;
  end if;
  select coalesce(jsonb_agg(id order by id),'[]'::jsonb) into actual from public.expedicao_models where client=c and active and deleted_at is null and (c='nokia' or metadata->>'cnpj'=m->>'cnpj' and metadata->'centers' ? target);
  if actual is distinct from p->'expectedActiveIds' then raise exception 'CONFLICT';end if;
  select * into row_before from public.expedicao_models where id=m->>'id' for update;
  if found and row_before.sha256 is distinct from m->>'sha256' then raise exception 'CONFLICT';end if;
  if c='claro' then
   select jsonb_agg(distinct value) into merged from jsonb_array_elements(coalesce(row_before.metadata->'centers','[]')||coalesce(m->'centers','[]'));
   m=jsonb_set(m,'{centers}',coalesce(merged,'[]'));
  end if;
  for old in select * from public.expedicao_models where client=c and active and deleted_at is null and (c='nokia' or metadata->>'cnpj'=m->>'cnpj' and metadata->'centers' ? target) for update loop
   select coalesce(jsonb_agg(value),'[]') into remaining from jsonb_array_elements(coalesce(old.metadata->'centers','[]')) where value<>to_jsonb(target);
   update public.expedicao_models set active=c='claro' and jsonb_array_length(remaining)>0,metadata=case when c='claro' then jsonb_set(metadata,'{centers}',remaining) else metadata end,revision=revision+1,updated_at=now(),updated_by=p->>'actor' where id=old.id;
  end loop;
  insert into public.expedicao_models(id,client,metadata,storage_path,sha256,active,content_base64,updated_by)
  values(m->>'id',c,m,c||'/'||(m->>'sha256')||'.xlsx',m->>'sha256',true,p->>'contentBase64',p->>'actor')
  on conflict(id) do update set metadata=excluded.metadata,active=true,deleted_at=null,content_base64=excluded.content_base64,revision=expedicao_models.revision+1,updated_at=now(),updated_by=excluded.updated_by returning * into saved;
 end if;
 insert into public.expedicao_events(client,group_key,action,actor_email,detail) values(c,'model:'||saved.id,'MODEL_'||upper(p->>'action'),p->>'actor',jsonb_build_object('id',saved.id,'revision',saved.revision,'before',row_before.metadata,'after',saved.metadata,'deleted',saved.deleted_at is not null));
 return jsonb_build_object('id',saved.id,'revision',saved.revision,'active',saved.active,'deleted_at',saved.deleted_at);
end $$;
revoke all on function public.expedicao_manage_model(jsonb) from public,anon,authenticated;
grant execute on function public.expedicao_manage_model(jsonb) to service_role;
commit;
