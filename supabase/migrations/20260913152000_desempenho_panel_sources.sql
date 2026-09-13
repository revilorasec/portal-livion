create table if not exists public.desempenho_panel_sources (
  panel text primary key check (panel in ('combined','nokia')),
  url text not null,
  query_client text not null,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.desempenho_panel_sources enable row level security;
revoke all on table public.desempenho_panel_sources from public, anon, authenticated;
grant select on table public.desempenho_panel_sources to service_role;

comment on table public.desempenho_panel_sources is
  'Server-only endpoints used by the two authenticated performance panels.';
