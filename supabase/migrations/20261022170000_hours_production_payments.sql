create table if not exists public.hours_employees (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  archived_at timestamptz,
  revision integer not null default 1 check (revision >= 1),
  created_at timestamptz not null default now(),
  created_by text not null,
  updated_at timestamptz not null default now(),
  updated_by text not null
);
create unique index if not exists hours_employees_active_name
  on public.hours_employees (lower(trim(name))) where archived_at is null;

create table if not exists public.hours_months (
  month date primary key check (extract(day from month) = 1),
  bonus_cents integer not null default 0 check (bonus_cents between 0 and 1000000000),
  piece_cents integer not null default 0 check (piece_cents between 0 and 100000000),
  weekday_hours numeric(5,2) not null default 0 check (weekday_hours between 0 and 24),
  saturday_hours numeric(5,2) not null default 0 check (saturday_hours between 0 and 24),
  revision integer not null default 1 check (revision >= 1),
  updated_at timestamptz not null default now(),
  updated_by text not null
);

create table if not exists public.hours_plans (
  month date not null check (extract(day from month) = 1),
  day date not null,
  planned_hours numeric(5,2) not null check (planned_hours between 0 and 24),
  revision integer not null default 1 check (revision >= 1),
  updated_at timestamptz not null default now(),
  updated_by text not null,
  primary key (month, day),
  check (day >= month and day < month + interval '1 month'),
  check (extract(dow from day) <> 0)
);

create table if not exists public.hours_entries (
  employee_id uuid not null references public.hours_employees(id) on delete restrict,
  month date not null check (extract(day from month) = 1),
  day date not null,
  actual_hours numeric(5,2) not null default 0 check (actual_hours between 0 and 24),
  pieces integer not null default 0 check (pieces between 0 and 100000),
  note text not null default '' check (length(note) <= 500),
  revision integer not null default 1 check (revision >= 1),
  updated_at timestamptz not null default now(),
  updated_by text not null,
  primary key (employee_id, day),
  check (day >= month and day < month + interval '1 month'),
  check (extract(dow from day) <> 0)
);
create index if not exists hours_entries_month_day on public.hours_entries(month, day);

create table if not exists public.hours_overtime (
  employee_id uuid not null references public.hours_employees(id) on delete restrict,
  month date not null check (extract(day from month) = 1),
  amount_cents integer check (amount_cents between 0 and 1000000000),
  note text not null default '' check (length(note) <= 500),
  revision integer not null default 1 check (revision >= 1),
  updated_at timestamptz not null default now(),
  updated_by text not null,
  primary key (employee_id, month)
);

alter table public.hours_employees enable row level security;
alter table public.hours_months enable row level security;
alter table public.hours_plans enable row level security;
alter table public.hours_entries enable row level security;
alter table public.hours_overtime enable row level security;

revoke all on public.hours_employees, public.hours_months, public.hours_plans,
  public.hours_entries, public.hours_overtime from anon, authenticated;
grant select, insert, update, delete on public.hours_employees, public.hours_months,
  public.hours_plans, public.hours_entries, public.hours_overtime to service_role;

comment on table public.hours_employees is
  'Funcionários cadastrados manualmente no aplicativo Horas, Produção e Pagamentos. Exclusão é arquivamento.';
comment on table public.hours_months is
  'Valores e programação gerais, isolados por mês; pagamentos não são executados por este aplicativo.';
comment on table public.hours_overtime is
  'Valor mensal oficial informado pelo contador: NULL significa pendente; zero significa conferido.';

insert into public.portal_apps
  (key,title,description,icon,eyebrow,href,active,audience,audience_types,
   companies,actions,sort_order,updated_at)
values
  ('horas-producao','Horas, Produção e Pagamentos',
   'Controle mensal de horas, peças reparadas e valores calculados por funcionário.',
   '◷','Pessoas & Gestão',
   'https://portal.livionsolutions.com.br/horas-producao.html?v=1',
   true,'INTERNO','["INTERNO"]'::jsonb,'["LIVION"]'::jsonb,
   '[{"key":"horas-producao.visualizar","label":"Visualizar horas, produção e valores"},{"key":"horas-producao.editar","label":"Cadastrar e editar lançamentos e configurações"},{"key":"horas-producao.excluir","label":"Arquivar funcionários preservando histórico"}]'::jsonb,
   74,now())
on conflict (key) do update set
  title = excluded.title,
  description = excluded.description,
  icon = excluded.icon,
  eyebrow = excluded.eyebrow,
  href = excluded.href,
  active = true,
  audience = excluded.audience,
  audience_types = excluded.audience_types,
  companies = excluded.companies,
  actions = excluded.actions,
  sort_order = excluded.sort_order,
  updated_at = now();
