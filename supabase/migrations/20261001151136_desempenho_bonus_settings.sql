create table if not exists public.desempenho_bonus_settings (
  id smallint primary key default 1 check (id = 1),
  config jsonb not null default '{}'::jsonb,
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now(),
  updated_by text
);

alter table public.desempenho_bonus_settings enable row level security;
revoke all on table public.desempenho_bonus_settings from anon, authenticated;

insert into public.desempenho_bonus_settings (id, config, revision)
values (1, '{}'::jsonb, 0)
on conflict (id) do nothing;

create or replace function public.desempenho_save_bonus_settings(
  p_config jsonb,
  p_revision bigint,
  p_actor text
)
returns table(config jsonb, revision bigint, updated_at timestamptz, updated_by text)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if p_revision is null or p_revision < 0 or p_config is null or jsonb_typeof(p_config) <> 'object' then
    raise exception 'invalid bonus settings';
  end if;

  return query
  update public.desempenho_bonus_settings s
     set config = p_config,
         revision = s.revision + 1,
         updated_at = now(),
         updated_by = nullif(trim(p_actor), '')
   where s.id = 1
     and s.revision = p_revision
  returning s.config, s.revision, s.updated_at, s.updated_by;

  if not found then
    raise exception 'bonus settings revision conflict' using errcode = '40001';
  end if;
end;
$$;

revoke all on function public.desempenho_save_bonus_settings(jsonb, bigint, text) from public, anon, authenticated;
grant execute on function public.desempenho_save_bonus_settings(jsonb, bigint, text) to service_role;

comment on table public.desempenho_bonus_settings is
  'Singleton configuration for return bonus bands, PN complexity and technician status.';
