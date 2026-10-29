-- Isolated private snapshot store. No user, ERP, payroll or payment record is modified.
create table public.finance_snapshots (
  sha256 text primary key check (sha256 ~ '^[a-f0-9]{64}$'),
  snapshot_date date not null,
  byte_length integer not null check (byte_length > 0 and byte_length <= 12582912),
  html text not null,
  imported_by text not null,
  imported_at timestamptz not null default now()
);
create index finance_snapshots_latest on public.finance_snapshots (snapshot_date desc, imported_at desc);
alter table public.finance_snapshots enable row level security;
revoke all on public.finance_snapshots from public, anon, authenticated;
grant select, insert on public.finance_snapshots to service_role;
-- No browser RLS policy: Microsoft sessions are validated by finance-api against portal-api.
insert into public.portal_apps (key,title,description,icon,eyebrow,href,active,audience,audience_types,companies,actions,sort_order)
values ('painel-financeiro','Painel Financeiro Livion','Resultados por projeto, recebíveis, custos provisórios e pendências de fechamento.',
  '▤','Financeiro & Gestão','./painel-financeiro/index.html?v=1',false,'INTERNO','["INTERNO"]','["LIVION","RHCS"]',
  '[{"key":"painel-financeiro.visualizar","label":"Consultar painel financeiro privado"},{"key":"painel-financeiro.importar","label":"Importar versão validada (administrador)"}]',110);
-- Administrators already have global app access. No portal_users row or grant is changed.
