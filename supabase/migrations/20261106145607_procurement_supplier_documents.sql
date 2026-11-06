-- A ordem de compra oficial do fornecedor fica separada dos documentos fiscais.
alter table public.procurement_order_documents
  drop constraint if exists procurement_order_documents_kind_check;

alter table public.procurement_order_documents
  add constraint procurement_order_documents_kind_check
  check (kind in ('NFE_XML','DANFE_PDF','SUPPLIER_PURCHASE_ORDER'));

alter table public.procurement_order_documents
  drop constraint if exists procurement_order_documents_file_size_check;

alter table public.procurement_order_documents
  add constraint procurement_order_documents_file_size_check
  check (file_size > 0 and file_size <= 20971520);

create table if not exists public.procurement_response_documents (
  document_id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.procurement_requests(request_id) on delete cascade,
  supplier_id text not null references public.inventory_suppliers(supplier_id),
  bucket text not null default 'procurement-documents',
  object_path text not null,
  file_name text not null,
  mime_type text,
  file_size bigint not null check (file_size > 0 and file_size <= 20971520),
  uploaded_by text not null,
  uploaded_at timestamptz not null default now()
);

create index if not exists procurement_response_documents_request_idx
  on public.procurement_response_documents(request_id,supplier_id,uploaded_at desc);

alter table public.procurement_response_documents enable row level security;
revoke all on public.procurement_response_documents from public,anon,authenticated;

update storage.buckets
set file_size_limit = 20971520,
    allowed_mime_types = array[
      'application/xml','text/xml','application/pdf',
      'image/jpeg','image/png',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]
where id = 'procurement-documents';
