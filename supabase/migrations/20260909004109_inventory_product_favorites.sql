alter table public.inventory_products
  add column if not exists is_favorite boolean not null default false;

create index if not exists inventory_products_favorite_idx
  on public.inventory_products (updated_at desc)
  where is_favorite;

comment on column public.inventory_products.is_favorite is
  'Produto destacado pelo usuário para acompanhamento rápido no painel inicial.';
