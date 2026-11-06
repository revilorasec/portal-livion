-- Exclusão administrativa preserva auditoria, pedidos e recebimentos já realizados.
alter table public.procurement_requests
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by text,
  add column if not exists deletion_reason text;

create index if not exists procurement_requests_active_created_idx
  on public.procurement_requests(created_at desc) where deleted_at is null;

alter table public.procurement_orders
  add column if not exists tracking_status text not null default 'AGUARDANDO_ENVIO'
    check (tracking_status in ('AGUARDANDO_ENVIO','EM_TRANSPORTE','ENTREGUE')),
  add column if not exists tracking_code text,
  add column if not exists tracking_url text,
  add column if not exists shipped_at timestamptz,
  add column if not exists tracking_updated_at timestamptz,
  add column if not exists tracking_updated_by text;

create table if not exists public.procurement_order_documents (
  document_id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.procurement_orders(order_id) on delete cascade,
  kind text not null check (kind in ('NFE_XML','DANFE_PDF')),
  bucket text not null,
  object_path text not null,
  file_name text not null,
  mime_type text,
  file_size bigint not null check (file_size > 0 and file_size <= 10485760),
  created_by text not null,
  created_at timestamptz not null default now()
);
create index if not exists procurement_order_documents_order_idx
  on public.procurement_order_documents(order_id,created_at desc);
alter table public.procurement_order_documents enable row level security;
revoke all on public.procurement_order_documents from public,anon,authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('procurement-documents','procurement-documents',false,10485760,array['application/xml','text/xml','application/pdf'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create or replace view public.procurement_dashboard as
select
  count(*) filter(where status not in('ENCERRADO','CANCELADO','RECEBIDO')) as open_requests,
  count(*) filter(where status in('COTANDO','EM_APROVACAO')) as quoting_requests,
  count(*) filter(where urgency in('ALTA','CRITICA') and status not in('ENCERRADO','CANCELADO','RECEBIDO')) as urgent_requests,
  (select count(*) from public.procurement_orders where status in('EMITIDO','PARCIALMENTE_RECEBIDO')) as open_orders,
  (select coalesce(sum(total_value),0) from public.procurement_orders where status in('EMITIDO','PARCIALMENTE_RECEBIDO','RECEBIDO') and ordered_at >= date_trunc('month',now())) as ordered_month_value
from public.procurement_requests
where deleted_at is null;

revoke all on public.procurement_dashboard from public,anon,authenticated;
grant select on public.procurement_dashboard to service_role;
