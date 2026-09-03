create table if not exists public.inventory_catalog_options(
  option_id uuid primary key default gen_random_uuid(),
  option_type text not null check(option_type in ('TYPE','CATEGORY','UNIT')),
  value text not null,
  active boolean not null default true,
  sort_order integer not null default 100,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(option_type,value)
);
alter table public.inventory_catalog_options enable row level security;
create index if not exists inventory_catalog_options_type_active_idx on public.inventory_catalog_options(option_type,active,sort_order,value);

insert into public.inventory_catalog_options(option_type,value,sort_order)
values ('TYPE','Componente',10),('TYPE','Insumo',20),('TYPE','Legado',30),
       ('UNIT','UNIDADE',10),('UNIT','PEÇA',20),('UNIT','METRO',30),
       ('UNIT','QUILOGRAMA',40),('UNIT','LITRO',50),('UNIT','CAIXA',60),('UNIT','PACOTE',70)
on conflict(option_type,value) do nothing;

insert into public.inventory_catalog_options(option_type,value)
select 'TYPE',trim(item_type) from public.inventory_products where nullif(trim(item_type),'') is not null
on conflict(option_type,value) do nothing;
insert into public.inventory_catalog_options(option_type,value)
select 'CATEGORY',trim(category) from public.inventory_products where nullif(trim(category),'') is not null
on conflict(option_type,value) do nothing;
insert into public.inventory_catalog_options(option_type,value)
select 'UNIT',trim(unit) from public.inventory_products where nullif(trim(unit),'') is not null
on conflict(option_type,value) do nothing;
