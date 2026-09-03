create table if not exists public.inventory_documents(
  document_id uuid primary key default gen_random_uuid(),
  movement_id text references public.inventory_movements(movement_id),
  invoice_id uuid references public.inventory_invoices(invoice_id),
  document_type text not null check(document_type in ('NFE_XML','DANFE','OTHER')),
  bucket text not null default 'inventory-nfe',
  object_path text not null unique,
  original_name text,
  mime_type text not null,
  byte_size bigint not null check(byte_size>0 and byte_size<=10485760),
  created_by text not null,
  created_at timestamptz not null default now(),
  check(movement_id is not null or invoice_id is not null)
);
alter table public.inventory_documents enable row level security;
create index if not exists inventory_documents_movement_idx on public.inventory_documents(movement_id);
