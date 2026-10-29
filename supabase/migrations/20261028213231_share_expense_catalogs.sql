begin;

alter table public.expense_cost_centers
  alter column company_key drop not null;

alter table public.expense_projects
  alter column company_key drop not null;

update public.expense_cost_centers
set company_key = null,
    updated_at = now()
where active = true
  and company_key is not null;

update public.expense_projects
set company_key = null,
    updated_at = now()
where active = true
  and company_key is not null;

create unique index if not exists expense_cost_centers_global_active_name_uq
  on public.expense_cost_centers (lower(trim(name)))
  where company_key is null and active = true;

create unique index if not exists expense_projects_global_active_name_uq
  on public.expense_projects (lower(trim(name)))
  where company_key is null and active = true;

comment on column public.expense_cost_centers.company_key is
  'Null for the shared Livion/RHCS catalog. Legacy inactive rows may retain their original company.';

comment on column public.expense_projects.company_key is
  'Null for the shared Livion/RHCS catalog. Legacy inactive rows may retain their original company.';

commit;
