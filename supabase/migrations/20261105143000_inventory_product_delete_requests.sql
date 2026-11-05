create table if not exists public.inventory_product_delete_requests (
  request_id uuid primary key default gen_random_uuid(),
  product_id text not null references public.inventory_products(product_id) on delete restrict,
  product_pn text not null,
  product_name text not null,
  product_unit text,
  balance_at_request numeric,
  reason text not null check (char_length(trim(reason)) between 3 and 1000),
  status text not null default 'PENDENTE' check (status in ('PENDENTE','RECUSADO','INATIVADO','MESCLADO')),
  requested_by text not null,
  requested_at timestamptz not null default now(),
  reviewed_by text,
  reviewed_at timestamptz,
  decision_notes text,
  merged_into_product_id text references public.inventory_products(product_id) on delete restrict
);

create unique index if not exists inventory_product_delete_requests_one_pending_idx
  on public.inventory_product_delete_requests(product_id)
  where status='PENDENTE';

create index if not exists inventory_product_delete_requests_status_idx
  on public.inventory_product_delete_requests(status,requested_at desc);

alter table public.inventory_product_delete_requests enable row level security;
revoke all on public.inventory_product_delete_requests from anon,authenticated;
grant select,insert,update on public.inventory_product_delete_requests to service_role;
