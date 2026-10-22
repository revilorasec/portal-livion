-- Aditiva: mantém os valores oficiais anteriores e todos os registros existentes.
alter table public.hours_overtime
  add column if not exists mon_sat_cents integer check (mon_sat_cents between 0 and 1000000000),
  add column if not exists mon_fri_cents integer check (mon_fri_cents between 0 and 1000000000),
  add column if not exists saturday_cents integer check (saturday_cents between 0 and 1000000000),
  add column if not exists active_option text check (active_option in ('mon_sat','mon_fri','saturday'));

create table public.hours_record_history (
  id bigint generated always as identity primary key,
  table_name text not null,
  operation text not null,
  old_row jsonb,
  new_row jsonb,
  changed_at timestamptz not null default now()
);
alter table public.hours_record_history enable row level security;
revoke all on public.hours_record_history from public, anon, authenticated;
grant select, insert on public.hours_record_history to service_role;
grant usage, select on sequence public.hours_record_history_id_seq to service_role;

create function public.hours_preserve_record() returns trigger
language plpgsql security invoker set search_path = pg_catalog, public as $$
begin
  insert into public.hours_record_history(table_name, operation, old_row, new_row)
  values (TG_TABLE_NAME, TG_OP,
    case when TG_OP in ('UPDATE','DELETE') then to_jsonb(OLD) end,
    case when TG_OP in ('INSERT','UPDATE') then to_jsonb(NEW) end);
  if TG_OP = 'DELETE' then return OLD; end if;
  return NEW;
end;
$$;
revoke all on function public.hours_preserve_record() from public, anon, authenticated;
grant execute on function public.hours_preserve_record() to service_role;

do $$
declare source_table text;
begin
  foreach source_table in array array['hours_employees','hours_months','hours_plans','hours_entries','hours_overtime'] loop
    execute format('insert into public.hours_record_history(table_name,operation,new_row) select %L,%L,to_jsonb(r) from public.%I r', source_table, 'BASELINE', source_table);
    execute format('create trigger hours_preserve_changes after insert or update or delete on public.%I for each row execute function public.hours_preserve_record()', source_table);
  end loop;
end;
$$;
