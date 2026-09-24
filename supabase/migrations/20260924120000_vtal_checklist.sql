create table if not exists public.vtal_checklists (
  id text primary key check (id = 'rfp'),
  payload jsonb not null,
  revision bigint not null default 1 check (revision >= 1),
  updated_at timestamptz not null default now(),
  updated_by text not null
);

alter table public.vtal_checklists enable row level security;
revoke all on public.vtal_checklists from anon, authenticated;

insert into public.portal_apps(key,title,description,icon,eyebrow,href,active,audience,audience_types,companies,actions,sort_order,updated_at)
values('vtal','V.Tal','Checklist da RFP com 268 requisitos, responsáveis, observações e classificação de atendimento.','✓','Propostas & Requisitos','https://portal.livionsolutions.com.br/vtal.html?v=1',true,'INTERNO','["INTERNO"]'::jsonb,'["LIVION"]'::jsonb,
 '[{"key":"vtal.visualizar","label":"Visualizar checklist V.Tal"},{"key":"vtal.editar","label":"Editar checklist V.Tal"},{"key":"vtal.exportar","label":"Exportar checklist V.Tal"}]'::jsonb,50,now())
on conflict(key) do update set title=excluded.title,description=excluded.description,icon=excluded.icon,eyebrow=excluded.eyebrow,href=excluded.href,active=true,audience=excluded.audience,audience_types=excluded.audience_types,companies=excluded.companies,actions=excluded.actions,sort_order=excluded.sort_order,updated_at=now();
