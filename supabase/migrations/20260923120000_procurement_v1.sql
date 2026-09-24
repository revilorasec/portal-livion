-- Compras e Cotações Livion: solicitações, ofertas, pedidos e recebimentos integrados ao estoque.
create table if not exists public.procurement_requests (
  request_id uuid primary key default gen_random_uuid(),
  request_number bigint generated always as identity unique,
  title text not null,
  requester_email text not null,
  department text,
  urgency text not null default 'MEDIA' check (urgency in ('BAIXA','MEDIA','ALTA','CRITICA')),
  status text not null default 'RASCUNHO' check (status in ('RASCUNHO','SOLICITADA','COTANDO','EM_APROVACAO','APROVADA','PEDIDO_EMITIDO','PARCIALMENTE_RECEBIDO','RECEBIDO','ENCERRADO','CANCELADO')),
  needed_at date,
  notes text,
  source text not null default 'PORTAL',
  legacy_id text unique,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.procurement_request_items (
  item_id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.procurement_requests(request_id) on delete cascade,
  line_number integer not null,
  inventory_product_id text references public.inventory_products(product_id),
  description text not null,
  manufacturer text,
  category text,
  quantity numeric not null check (quantity > 0),
  unit text not null default 'UNIDADE',
  quantity_notes text,
  status text not null default 'PENDENTE' check (status in ('PENDENTE','COTANDO','SELECIONADO','PEDIDO','PARCIAL','RECEBIDO','CANCELADO')),
  created_at timestamptz not null default now(),
  unique(request_id,line_number)
);

create table if not exists public.procurement_offers (
  offer_id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.procurement_request_items(item_id) on delete cascade,
  supplier_id text references public.inventory_suppliers(supplier_id),
  supplier_name_snapshot text,
  requested_at timestamptz,
  responded_at timestamptz,
  currency text not null default 'BRL',
  exchange_rate numeric check (exchange_rate is null or exchange_rate > 0),
  unit_price numeric check (unit_price is null or unit_price >= 0),
  total_price numeric check (total_price is null or total_price >= 0),
  payment_terms text,
  delivery_days integer check (delivery_days is null or delivery_days >= 0),
  delivery_method text,
  purchase_url text,
  supplier_reference text,
  notes text,
  selected boolean not null default false,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists procurement_one_selected_offer_per_item
  on public.procurement_offers(item_id) where selected;

create table if not exists public.procurement_orders (
  order_id uuid primary key default gen_random_uuid(),
  order_number bigint generated always as identity unique,
  supplier_id text references public.inventory_suppliers(supplier_id),
  supplier_name_snapshot text,
  status text not null default 'RASCUNHO' check (status in ('RASCUNHO','EMITIDO','PARCIALMENTE_RECEBIDO','RECEBIDO','CANCELADO')),
  ordered_at timestamptz,
  expected_at date,
  currency text not null default 'BRL',
  total_value numeric check (total_value is null or total_value >= 0),
  payment_terms text,
  delivery_method text,
  invoice_number text,
  notes text,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.procurement_order_items (
  order_item_id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.procurement_orders(order_id) on delete cascade,
  request_item_id uuid references public.procurement_request_items(item_id),
  offer_id uuid references public.procurement_offers(offer_id),
  inventory_product_id text references public.inventory_products(product_id),
  description text not null,
  quantity numeric not null check (quantity > 0),
  unit text not null default 'UNIDADE',
  unit_price numeric check (unit_price is null or unit_price >= 0),
  total_price numeric check (total_price is null or total_price >= 0),
  received_quantity numeric not null default 0 check (received_quantity >= 0 and received_quantity <= quantity),
  unique(order_id,request_item_id)
);

create table if not exists public.procurement_receipts (
  receipt_id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.procurement_orders(order_id),
  received_at timestamptz not null default now(),
  invoice_number text,
  notes text,
  received_by text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.procurement_receipt_items (
  receipt_item_id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.procurement_receipts(receipt_id) on delete cascade,
  order_item_id uuid not null references public.procurement_order_items(order_item_id),
  quantity numeric not null check (quantity > 0),
  inventory_movement_id text unique references public.inventory_movements(movement_id),
  idempotency_key uuid not null unique,
  unique(receipt_id,order_item_id)
);

create table if not exists public.procurement_legacy_rows (
  legacy_id text primary key,
  source_sheet text not null default 'Cotações',
  source_row integer not null,
  request_id uuid references public.procurement_requests(request_id),
  item_id uuid references public.procurement_request_items(item_id),
  offer_id uuid references public.procurement_offers(offer_id),
  order_id uuid references public.procurement_orders(order_id),
  raw_data jsonb not null,
  imported_at timestamptz not null default now(),
  unique(source_sheet,source_row)
);

create table if not exists public.procurement_events (
  event_id bigint generated always as identity primary key,
  entity_type text not null,
  entity_id uuid not null,
  event_type text not null,
  actor_email text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

do $$ declare t text; begin
  foreach t in array array['procurement_requests','procurement_request_items','procurement_offers','procurement_orders','procurement_order_items','procurement_receipts','procurement_receipt_items','procurement_legacy_rows','procurement_events'] loop
    execute format('alter table public.%I enable row level security',t);
  end loop;
end $$;

create index if not exists procurement_requests_status_idx on public.procurement_requests(status,created_at desc);
create index if not exists procurement_items_product_idx on public.procurement_request_items(inventory_product_id);
create index if not exists procurement_offers_item_idx on public.procurement_offers(item_id,responded_at desc);
create index if not exists procurement_orders_status_idx on public.procurement_orders(status,ordered_at desc);
create index if not exists procurement_order_items_product_idx on public.procurement_order_items(inventory_product_id);
create index if not exists procurement_receipts_order_idx on public.procurement_receipts(order_id,received_at desc);

create or replace view public.procurement_dashboard with (security_invoker=true) as
select
  count(*) filter(where status not in ('ENCERRADO','CANCELADO','RECEBIDO')) as open_requests,
  count(*) filter(where status in ('COTANDO','EM_APROVACAO')) as quoting_requests,
  count(*) filter(where urgency in ('ALTA','CRITICA') and status not in ('ENCERRADO','CANCELADO','RECEBIDO')) as urgent_requests,
  (select count(*) from public.procurement_orders where status in ('EMITIDO','PARCIALMENTE_RECEBIDO')) as open_orders,
  (select coalesce(sum(total_value),0) from public.procurement_orders where status in ('EMITIDO','PARCIALMENTE_RECEBIDO','RECEBIDO') and ordered_at >= date_trunc('month',now())) as ordered_month_value
from public.procurement_requests;

create or replace view public.procurement_lead_time_stats with (security_invoker=true) as
select oi.inventory_product_id,
       count(*) filter(where o.ordered_at is not null and r.received_at is not null) sample_count,
       percentile_cont(0.5) within group(order by extract(epoch from (r.received_at-o.ordered_at))/86400) filter(where o.ordered_at is not null and r.received_at is not null) median_days,
       percentile_cont(0.75) within group(order by extract(epoch from (r.received_at-o.ordered_at))/86400) filter(where o.ordered_at is not null and r.received_at is not null) p75_days,
       percentile_cont(0.9) within group(order by extract(epoch from (r.received_at-o.ordered_at))/86400) filter(where o.ordered_at is not null and r.received_at is not null) p90_days
from public.procurement_order_items oi
join public.procurement_orders o on o.order_id=oi.order_id
left join public.procurement_receipt_items ri on ri.order_item_id=oi.order_item_id
left join public.procurement_receipts r on r.receipt_id=ri.receipt_id
where oi.inventory_product_id is not null
group by oi.inventory_product_id;

create or replace function public.procurement_receive_order(
  p_order_id uuid,
  p_items jsonb,
  p_actor_email text,
  p_invoice_number text default null,
  p_notes text default null,
  p_received_at timestamptz default now()
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_order public.procurement_orders;
  v_receipt_id uuid;
  v_input jsonb;
  v_item public.procurement_order_items;
  v_quantity numeric;
  v_remaining numeric;
  v_key uuid;
  v_movement public.inventory_movements;
  v_count integer := 0;
begin
  select * into v_order from public.procurement_orders where order_id=p_order_id for update;
  if not found or v_order.status not in ('EMITIDO','PARCIALMENTE_RECEBIDO') then raise exception 'INVALID_ORDER'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'INVALID_RECEIPT_ITEMS'; end if;
  insert into public.procurement_receipts(order_id,received_at,invoice_number,notes,received_by)
  values(p_order_id,coalesce(p_received_at,now()),nullif(trim(p_invoice_number),''),nullif(trim(p_notes),''),p_actor_email)
  returning receipt_id into v_receipt_id;
  for v_input in select value from jsonb_array_elements(p_items) loop
    select * into v_item from public.procurement_order_items
      where order_item_id=(v_input->>'order_item_id')::uuid and order_id=p_order_id for update;
    if not found or v_item.inventory_product_id is null then raise exception 'INVALID_ORDER_ITEM'; end if;
    v_quantity := (v_input->>'quantity')::numeric;
    v_remaining := v_item.quantity-v_item.received_quantity;
    if v_quantity is null or v_quantity<=0 or v_quantity>v_remaining then raise exception 'INVALID_RECEIPT_QUANTITY'; end if;
    v_key := coalesce(nullif(v_input->>'idempotency_key','')::uuid,gen_random_uuid());
    select * into v_movement from public.inventory_register_movement(
      'ENTRADA',v_item.inventory_product_id,v_quantity,p_actor_email,v_key,
      case when v_item.unit_price is null then null else v_item.unit_price*v_quantity end,
      v_item.unit_price,null,v_order.supplier_id,nullif(trim(p_invoice_number),''),
      concat('Recebimento do pedido LIV-',lpad(v_order.order_number::text,6,'0')),
      null,null,null,'COMPRAS_COTACOES',null,'PROCUREMENT_ORDER',p_order_id::text,coalesce(p_received_at,now())
    );
    insert into public.procurement_receipt_items(receipt_id,order_item_id,quantity,inventory_movement_id,idempotency_key)
    values(v_receipt_id,v_item.order_item_id,v_quantity,v_movement.movement_id,v_key);
    update public.procurement_order_items set received_quantity=received_quantity+v_quantity where order_item_id=v_item.order_item_id;
    v_count:=v_count+1;
  end loop;
  if exists(select 1 from public.procurement_order_items where order_id=p_order_id and received_quantity<quantity) then
    update public.procurement_orders set status='PARCIALMENTE_RECEBIDO',updated_at=now(),invoice_number=coalesce(nullif(trim(p_invoice_number),''),invoice_number) where order_id=p_order_id;
  else
    update public.procurement_orders set status='RECEBIDO',updated_at=now(),invoice_number=coalesce(nullif(trim(p_invoice_number),''),invoice_number) where order_id=p_order_id;
    update public.procurement_requests r set status='RECEBIDO',updated_at=now()
      where exists(select 1 from public.procurement_request_items ri join public.procurement_order_items oi on oi.request_item_id=ri.item_id where ri.request_id=r.request_id and oi.order_id=p_order_id)
      and not exists(select 1 from public.procurement_request_items ri left join public.procurement_order_items oi on oi.request_item_id=ri.item_id left join public.procurement_orders po on po.order_id=oi.order_id where ri.request_id=r.request_id and coalesce(po.status,'')<>'RECEBIDO');
  end if;
  insert into public.procurement_events(entity_type,entity_id,event_type,actor_email,detail)
  values('ORDER',p_order_id,'RECEIPT_CREATED',p_actor_email,jsonb_build_object('receipt_id',v_receipt_id,'items',v_count));
  return jsonb_build_object('ok',true,'receipt_id',v_receipt_id,'items',v_count);
end $$;
revoke all on function public.procurement_receive_order(uuid,jsonb,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.procurement_receive_order(uuid,jsonb,text,text,text,timestamptz) to service_role;

insert into public.portal_apps(key,title,description,icon,eyebrow,href,active,audience,audience_types,companies,actions,sort_order,updated_at)
values('compras-cotacoes','Compras e Cotações','Solicitações, comparação de fornecedores, pedidos e recebimentos integrados ao estoque.','🛒','Suprimentos & Operações','https://portal.livionsolutions.com.br/compras-cotacoes.html?v=3',true,'INTERNO','["INTERNO"]'::jsonb,'["LIVION"]'::jsonb,
 '[{"key":"compras.visualizar","label":"Visualizar compras e cotações"},{"key":"compras.criar_solicitacao","label":"Criar solicitações"},{"key":"compras.cotar","label":"Registrar cotações"},{"key":"compras.aprovar","label":"Aprovar compras"},{"key":"compras.emitir_pedido","label":"Emitir pedidos"},{"key":"compras.receber","label":"Receber e dar entrada no estoque"},{"key":"compras.visualizar_valores","label":"Visualizar valores"},{"key":"compras.gerenciar_fornecedores","label":"Gerenciar fornecedores"},{"key":"compras.exportar","label":"Exportar dados"}]'::jsonb,45,now())
on conflict(key) do update set title=excluded.title,description=excluded.description,icon=excluded.icon,eyebrow=excluded.eyebrow,href=excluded.href,active=true,audience_types=excluded.audience_types,companies=excluded.companies,actions=excluded.actions,sort_order=excluded.sort_order,updated_at=now();

-- Administradores já recebem todos os aplicativos e ações por regra do Portal.
revoke all on public.procurement_requests, public.procurement_request_items, public.procurement_offers,
  public.procurement_orders, public.procurement_order_items, public.procurement_receipts,
  public.procurement_receipt_items, public.procurement_legacy_rows, public.procurement_events
from anon, authenticated;
