alter table public.hours_entries
  drop constraint hours_entries_employee_id_fkey,
  add constraint hours_entries_employee_id_fkey
    foreign key (employee_id) references public.hours_employees(id) on delete cascade;

alter table public.hours_overtime
  drop constraint hours_overtime_employee_id_fkey,
  add constraint hours_overtime_employee_id_fkey
    foreign key (employee_id) references public.hours_employees(id) on delete cascade;

comment on table public.hours_employees is
  'Funcionários cadastrados manualmente no Hora Extra. A exclusão remove o funcionário, lançamentos diários e horas extras oficiais.';

update public.portal_apps
set actions = jsonb_set(actions, '{2,label}', to_jsonb('Excluir funcionários e seus lançamentos'::text)),
    updated_at = now()
where key = 'horas-producao'
  and actions->2->>'key' = 'horas-producao.excluir';
