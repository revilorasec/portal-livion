-- Catálogos de localização e peças compatíveis com produtos do estoque.

alter table public.inventory_catalog_options
  drop constraint if exists inventory_catalog_options_option_type_check;

alter table public.inventory_catalog_options
  add constraint inventory_catalog_options_option_type_check
  check (option_type in ('TYPE', 'CATEGORY', 'UNIT', 'LOCATION'));

insert into public.inventory_catalog_options(option_type, value, active, sort_order, created_by)
select 'LOCATION', location_name, true, 100, 'migration@portal-livion'
from (
  select distinct btrim(default_location) as location_name
  from public.inventory_products
  where nullif(btrim(default_location), '') is not null
) locations
on conflict (option_type, value) do update
set active = true, updated_at = now();

create table if not exists public.inventory_parts (
  part_id uuid primary key default gen_random_uuid(),
  pn text not null,
  description text not null,
  manufacturer text,
  client_name text,
  status text not null default 'ATIVO'
    check (status in ('ATIVO', 'INATIVO')),
  notes text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists inventory_parts_pn_unique
  on public.inventory_parts (lower(btrim(pn)));
create index if not exists inventory_parts_description_idx
  on public.inventory_parts (lower(description));
create index if not exists inventory_parts_client_idx
  on public.inventory_parts (lower(client_name));

create table if not exists public.inventory_product_parts (
  product_id text not null references public.inventory_products(product_id) on delete cascade,
  part_id uuid not null references public.inventory_parts(part_id) on delete cascade,
  created_by text,
  created_at timestamptz not null default now(),
  primary key (product_id, part_id)
);

create index if not exists inventory_product_parts_part_idx
  on public.inventory_product_parts(part_id, product_id);

alter table public.inventory_parts enable row level security;
alter table public.inventory_product_parts enable row level security;
revoke all on table public.inventory_parts from public, anon, authenticated;
revoke all on table public.inventory_product_parts from public, anon, authenticated;
grant all on table public.inventory_parts to service_role;
grant all on table public.inventory_product_parts to service_role;

alter table public.inventory_media
  drop constraint if exists inventory_media_entity_type_check;

alter table public.inventory_media
  add constraint inventory_media_entity_type_check
  check (entity_type in ('PRODUCT', 'REQUESTER', 'SUPPLIER', 'MOVEMENT', 'PART'));

-- Preserva a relação histórica produto-fornecedor encontrada nas entradas antigas.
insert into public.inventory_product_suppliers(
  product_id, supplier_id, last_unit_price, last_purchase_at, active
)
select distinct on (m.product_id, m.supplier_id)
  m.product_id,
  m.supplier_id,
  m.unit_value,
  m.occurred_at,
  true
from public.inventory_movements m
where m.movement_type = 'ENTRADA'
  and m.supplier_id is not null
order by m.product_id, m.supplier_id, m.occurred_at desc
on conflict (product_id, supplier_id) do update
set last_unit_price = coalesce(excluded.last_unit_price, inventory_product_suppliers.last_unit_price),
    last_purchase_at = greatest(excluded.last_purchase_at, inventory_product_suppliers.last_purchase_at),
    active = true,
    updated_at = now();
