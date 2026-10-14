alter table public.inventory_products
  add column if not exists dispatch_unit text,
  add column if not exists base_quantity_per_dispatch_unit numeric;
alter table public.inventory_products drop constraint if exists inventory_products_dispatch_factor_check;
alter table public.inventory_products add constraint inventory_products_dispatch_factor_check check ((dispatch_unit is null and base_quantity_per_dispatch_unit is null) or (nullif(trim(dispatch_unit),'') is not null and base_quantity_per_dispatch_unit > 0));

alter table public.inventory_movements
  add column if not exists dispatch_quantity numeric,
  add column if not exists dispatch_unit text,
  add column if not exists base_quantity_per_dispatch_unit numeric;
alter table public.inventory_movements drop constraint if exists inventory_movements_dispatch_values_check;
alter table public.inventory_movements add constraint inventory_movements_dispatch_values_check check ((dispatch_quantity is null and dispatch_unit is null and base_quantity_per_dispatch_unit is null) or (dispatch_quantity > 0 and nullif(trim(dispatch_unit),'') is not null and base_quantity_per_dispatch_unit > 0));

comment on column public.inventory_products.dispatch_unit is 'Unidade operacional de baixa, por exemplo ROLO.';
comment on column public.inventory_products.base_quantity_per_dispatch_unit is 'Quantidade da unidade base consumida por uma unidade operacional.';
comment on column public.inventory_movements.dispatch_quantity is 'Quantidade informada na unidade operacional.';
