-- Controle de Estoque Livion: segurança transacional, mídia, NF-e e integrações.
create extension if not exists pg_trgm with schema extensions;

create table if not exists public.inventory_deployment_snapshots (
  id bigint generated always as identity primary key,
  label text not null unique,
  products integer not null,
  movements integer not null,
  balance numeric not null,
  negative_products integer not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.inventory_deployment_snapshots enable row level security;

insert into public.inventory_deployment_snapshots(label,products,movements,balance,negative_products,detail)
select 'before_inventory_v2_20260903', count(*),
       (select count(*) from public.inventory_movements),
       coalesce(sum(balance),0), count(*) filter (where balance < 0),
       jsonb_build_object('legacy_rows',(select count(*) from public.inventory_legacy_snapshot),
                          'legacy_balance',(select coalesce(sum(balance),0) from public.inventory_legacy_snapshot))
from public.inventory_stock_current
on conflict (label) do nothing;

alter table public.inventory_products
  add column if not exists internal_code text,
  add column if not exists barcode text,
  add column if not exists evidence_required boolean not null default false,
  add column if not exists version integer not null default 1;
alter table public.inventory_requesters add column if not exists portal_user_id bigint references public.portal_users(id) on delete set null;
alter table public.inventory_movements
  add column if not exists idempotency_key uuid,
  add column if not exists reversal_of text references public.inventory_movements(movement_id),
  add column if not exists reference_type text,
  add column if not exists reference_id text,
  add column if not exists recorded_at timestamptz not null default now();

create unique index if not exists inventory_products_internal_code_uq on public.inventory_products(lower(internal_code)) where internal_code is not null;
create unique index if not exists inventory_products_barcode_uq on public.inventory_products(barcode) where barcode is not null;
create unique index if not exists inventory_movements_idempotency_uq on public.inventory_movements(idempotency_key) where idempotency_key is not null;
create unique index if not exists inventory_movements_reversal_uq on public.inventory_movements(reversal_of) where reversal_of is not null;
create index if not exists inventory_products_search_trgm on public.inventory_products using gin ((coalesce(pn,'')||' '||coalesce(description,'')||' '||coalesce(internal_code,'')) extensions.gin_trgm_ops);

create table if not exists public.inventory_media (
  media_id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('PRODUCT','REQUESTER','MOVEMENT')),
  entity_id text not null,
  position smallint not null check (position between 1 and 4),
  bucket text not null default 'inventory-media',
  object_path text not null unique,
  mime_type text not null,
  byte_size bigint not null check (byte_size > 0 and byte_size <= 10485760),
  created_by text not null,
  created_at timestamptz not null default now(),
  unique(entity_type,entity_id,position)
);
alter table public.inventory_media enable row level security;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('inventory-media','inventory-media',false,10485760,array['image/jpeg','image/png','image/webp']),
       ('inventory-nfe','inventory-nfe',false,10485760,array['application/xml','text/xml','application/pdf'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create table if not exists public.inventory_product_suppliers (
  product_id text not null references public.inventory_products(product_id) on delete cascade,
  supplier_id text not null references public.inventory_suppliers(supplier_id) on delete cascade,
  supplier_sku text,
  supplier_description text,
  last_unit_price numeric,
  last_purchase_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(product_id,supplier_id),
  unique(supplier_id,supplier_sku)
);
alter table public.inventory_product_suppliers enable row level security;

create table if not exists public.inventory_supplier_price_history (
  id bigint generated always as identity primary key,
  product_id text not null references public.inventory_products(product_id),
  supplier_id text references public.inventory_suppliers(supplier_id),
  invoice_access_key text,
  unit_price numeric not null check(unit_price >= 0),
  quantity numeric not null check(quantity > 0),
  purchased_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.inventory_supplier_price_history enable row level security;

create table if not exists public.inventory_invoices (
  invoice_id uuid primary key default gen_random_uuid(),
  access_key text not null unique check(length(access_key)=44),
  supplier_id text references public.inventory_suppliers(supplier_id),
  supplier_document text,
  invoice_number text,
  issued_at timestamptz,
  total_value numeric,
  status text not null default 'PREVIEW' check(status in ('PREVIEW','CONFIRMED','CANCELLED','ERROR')),
  bucket text not null default 'inventory-nfe',
  object_path text,
  imported_by text not null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.inventory_invoices enable row level security;

create table if not exists public.inventory_invoice_items (
  item_id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.inventory_invoices(invoice_id) on delete cascade,
  line_number integer not null,
  supplier_sku text,
  description text not null,
  quantity numeric not null check(quantity > 0),
  unit text,
  unit_price numeric,
  total_value numeric,
  product_id text references public.inventory_products(product_id),
  match_method text,
  movement_id text references public.inventory_movements(movement_id),
  unique(invoice_id,line_number)
);
alter table public.inventory_invoice_items enable row level security;

create or replace function public.inventory_prevent_movement_mutation() returns trigger language plpgsql as $$
begin raise exception 'MOVEMENTS_ARE_IMMUTABLE' using errcode='55000'; end $$;
drop trigger if exists inventory_movements_immutable on public.inventory_movements;
create trigger inventory_movements_immutable before update or delete on public.inventory_movements
for each row execute function public.inventory_prevent_movement_mutation();

create or replace function public.inventory_register_movement(
  p_movement_type text, p_product_id text, p_quantity numeric, p_actor_email text,
  p_idempotency_key uuid, p_total_value numeric default null, p_unit_value numeric default null,
  p_requester_id text default null, p_supplier_id text default null, p_document_number text default null,
  p_notes text default null, p_from_location text default null, p_to_location text default null,
  p_purpose text default null, p_source text default 'PORTAL', p_reversal_of text default null,
  p_reference_type text default null, p_reference_id text default null
) returns public.inventory_movements language plpgsql security definer set search_path=public as $$
declare v_balance numeric; v_row public.inventory_movements; v_original public.inventory_movements;
begin
  if p_quantity is null or p_quantity <= 0 then raise exception 'INVALID_QUANTITY'; end if;
  if p_movement_type not in ('ENTRADA','SAIDA','AJUSTE_POSITIVO','AJUSTE_NEGATIVO','TRANSFERENCIA') then raise exception 'INVALID_MOVEMENT_TYPE'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_product_id,0));
  if not exists(select 1 from public.inventory_products where product_id=p_product_id) then raise exception 'PRODUCT_NOT_FOUND'; end if;
  if p_idempotency_key is not null then select * into v_row from public.inventory_movements where idempotency_key=p_idempotency_key; if found then return v_row; end if; end if;
  if p_reversal_of is not null then
    select * into v_original from public.inventory_movements where movement_id=p_reversal_of;
    if not found then raise exception 'MOVEMENT_NOT_FOUND'; end if;
    if exists(select 1 from public.inventory_movements where reversal_of=p_reversal_of) then raise exception 'MOVEMENT_ALREADY_REVERSED'; end if;
  end if;
  select coalesce(sum(case when movement_type in ('ENTRADA','AJUSTE_POSITIVO') then quantity when movement_type in ('SAIDA','AJUSTE_NEGATIVO') then -quantity else 0 end),0)
    into v_balance from public.inventory_movements where product_id=p_product_id;
  if p_movement_type in ('SAIDA','AJUSTE_NEGATIVO') and v_balance < p_quantity then raise exception 'INSUFFICIENT_STOCK'; end if;
  insert into public.inventory_movements(movement_id,occurred_at,movement_type,product_id,quantity,total_value,unit_value,requester_id,supplier_id,document_number,notes,user_email,source,from_location,to_location,purpose,idempotency_key,reversal_of,reference_type,reference_id,recorded_at)
  values(gen_random_uuid(),now(),p_movement_type,p_product_id,p_quantity,p_total_value,p_unit_value,p_requester_id,p_supplier_id,p_document_number,p_notes,p_actor_email,p_source,p_from_location,p_to_location,p_purpose,p_idempotency_key,p_reversal_of,p_reference_type,p_reference_id,now()) returning * into v_row;
  return v_row;
end $$;
revoke all on function public.inventory_register_movement(text,text,numeric,text,uuid,numeric,numeric,text,text,text,text,text,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.inventory_register_movement(text,text,numeric,text,uuid,numeric,numeric,text,text,text,text,text,text,text,text,text,text,text) to service_role;

create or replace view public.inventory_product_costs with (security_invoker=true) as
select p.product_id,
 coalesce(sum(m.total_value) filter(where m.movement_type='ENTRADA' and m.total_value>0),0) purchase_value_total,
 coalesce(sum(m.quantity) filter(where m.movement_type='ENTRADA' and m.total_value>0),0) purchase_qty_priced,
 case when coalesce(sum(m.quantity) filter(where m.movement_type='ENTRADA' and m.total_value>0),0)>0
      then sum(m.total_value) filter(where m.movement_type='ENTRADA' and m.total_value>0)/sum(m.quantity) filter(where m.movement_type='ENTRADA' and m.total_value>0)
      else null end avg_purchase_cost
from public.inventory_products p left join public.inventory_movements m on m.product_id=p.product_id group by p.product_id;

create index if not exists inventory_invoice_items_product_idx on public.inventory_invoice_items(product_id);
create index if not exists inventory_price_history_product_date_idx on public.inventory_supplier_price_history(product_id,purchased_at desc);
create index if not exists inventory_media_entity_idx on public.inventory_media(entity_type,entity_id,position);
