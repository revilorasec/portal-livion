-- Applied as bonus_nokia_u_corrections. Originals are retained without updates.
create table if not exists public.desempenho_bonus_statement_corrections (
 month text not null check (month ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' and month >= '2026-10'),
 technician text not null, client text not null check(client in ('','Claro','Nokia')),
 statement jsonb not null check(jsonb_typeof(statement)='object'),
 created_at timestamptz not null default now(), created_by text not null,
 primary key(month,technician,client)
);
alter table public.desempenho_bonus_statement_corrections enable row level security;
revoke all on public.desempenho_bonus_statement_corrections from public,anon,authenticated,service_role;
grant select,insert on public.desempenho_bonus_statement_corrections to service_role;
comment on table public.desempenho_bonus_statement_corrections is 'Append-only corrections for Nokia column U. Original statements and original tariff configuration are preserved.';
