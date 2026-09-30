create table if not exists public.inventory_product_files (
  file_id uuid primary key default gen_random_uuid(),
  product_id text not null references public.inventory_products(product_id) on delete cascade,
  bucket text not null default 'inventory-media',
  object_path text not null unique,
  original_name text not null,
  mime_type text,
  byte_size bigint not null check (byte_size > 0 and byte_size <= 20971520),
  created_by text not null,
  created_at timestamptz not null default now()
);

alter table public.inventory_product_files enable row level security;
revoke all on table public.inventory_product_files from public, anon, authenticated;

create index if not exists inventory_product_files_product_idx
  on public.inventory_product_files(product_id, created_at desc);
