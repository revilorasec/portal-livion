-- Applied to portal-livion using the Supabase migration bonus_monthly_statements.
create table if not exists public.desempenho_bonus_statements (
 month text not null check (month ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' and month >= '2026-10'),
 technician text not null,
 client text not null check (client in ('','Claro','Nokia')),
 statement jsonb not null check (jsonb_typeof(statement) = 'object'),
 created_at timestamptz not null default now(),
 created_by text not null,
 primary key(month,technician,client)
);
alter table public.desempenho_bonus_statements enable row level security;
revoke all on public.desempenho_bonus_statements from public,anon,authenticated,service_role;
grant select,insert on public.desempenho_bonus_statements to service_role;
comment on table public.desempenho_bonus_statements is 'Immutable first-issued statements for closed months; October 2026 baseline. Private to authenticated portal backend.';
