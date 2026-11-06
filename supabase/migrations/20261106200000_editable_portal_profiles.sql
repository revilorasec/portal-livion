begin;

create table if not exists public.portal_profiles (
  key text primary key,
  label text not null,
  description text not null,
  default_apps jsonb not null default '[]'::jsonb,
  default_companies jsonb not null default '[]'::jsonb,
  default_actions jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by text,
  constraint portal_profiles_default_apps_array check (jsonb_typeof(default_apps) = 'array'),
  constraint portal_profiles_default_companies_array check (jsonb_typeof(default_companies) = 'array'),
  constraint portal_profiles_default_actions_array check (jsonb_typeof(default_actions) = 'array')
);

alter table public.portal_profiles enable row level security;
revoke all on table public.portal_profiles from anon, authenticated;
grant select, insert, update, delete on table public.portal_profiles to service_role;

insert into public.portal_profiles
  (key, label, description, default_apps, default_companies, default_actions, active)
values
  ('ADMINISTRADOR', 'Administrador', 'Administra o Portal, usuários, entidades e permissões.', '["*"]', '["*"]', '["*"]', true),
  ('SOCIO', 'Sócio', 'Acesso gerencial aos aplicativos liberados, com permissões ajustáveis.', '["fretes"]', '["LIVION"]', '["fretes.visualizar_valores","fretes.editar_cotacao","fretes.aprovar_cotacao"]', true),
  ('OPERACIONAL', 'Operacional', 'Executa as rotinas liberadas em cada aplicativo.', '["fretes"]', '["LIVION"]', '["fretes.visualizar_valores","fretes.criar_cotacao","fretes.editar_cotacao"]', true),
  ('VISUALIZADOR', 'Visualizador', 'Somente visualização. Não edita, aprova, cria ou exclui.', '[]', '[]', '[]', true),
  ('FUNCIONARIO', 'Funcionário', 'Acesso individual ao Recursos Humanos. Vê somente os próprios dados.', '["rh"]', '["LIVION"]', '[]', true)
on conflict (key) do nothing;

alter table public.portal_users drop constraint if exists portal_users_profile_check;
alter table public.portal_users
  add constraint portal_users_profile_check
  check (profile = any (array['ADMINISTRADOR'::text, 'SOCIO'::text, 'OPERACIONAL'::text, 'VISUALIZADOR'::text, 'FUNCIONARIO'::text]));

commit;
