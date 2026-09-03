alter table public.inventory_invoices
  add column if not exists series text,
  add column if not exists operation_nature text,
  add column if not exists recipient_name text,
  add column if not exists recipient_document text,
  add column if not exists raw_data jsonb not null default '{}'::jsonb;

alter table public.inventory_invoice_items
  add column if not exists ncm text,
  add column if not exists cfop text,
  add column if not exists barcode text,
  add column if not exists raw_data jsonb not null default '{}'::jsonb;

create index if not exists inventory_invoices_issued_at_idx on public.inventory_invoices(issued_at desc);
create index if not exists inventory_invoice_items_product_idx on public.inventory_invoice_items(product_id);
