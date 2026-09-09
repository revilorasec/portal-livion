-- Controle de Estoque: duas datas por movimentação, histórico fiscal legado e origem da nota.

alter table public.inventory_invoices
  alter column access_key drop not null,
  add column if not exists supplier_name text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists source text not null default 'XML_NFE';

alter table public.inventory_invoices drop constraint if exists inventory_invoices_source_check;
alter table public.inventory_invoices add constraint inventory_invoices_source_check
  check (source in ('XML_NFE','LEGACY_IMPORT'));

update public.inventory_invoices
set supplier_name=coalesce(
      nullif(trim(supplier_name),''),
      nullif(trim(raw_data->>'supplier_name'),''),
      (select s.name from public.inventory_suppliers s where s.supplier_id=inventory_invoices.supplier_id)
    ),
    source=coalesce(nullif(source,''),'XML_NFE');

create index if not exists inventory_invoices_source_idx
  on public.inventory_invoices(source,issued_at desc);

create unique index if not exists inventory_invoices_legacy_identity_uq
  on public.inventory_invoices(supplier_id,(coalesce(nullif(ltrim(invoice_number,'0'),''),'0')))
  where source='LEGACY_IMPORT' and supplier_id is not null and invoice_number is not null;

-- Somente valores numéricos do campo legado são números de NF. Identificadores internos
-- como RHCS001/LIVION001 permanecem apenas na auditoria da migração e não viram notas.
with legacy_groups as (
  select m.supplier_id,
         coalesce(nullif(ltrim(trim(m.document_number),'0'),''),'0') invoice_number,
         min(m.occurred_at) issued_at,
         nullif(sum(coalesce(m.total_value,0)),0) total_value,
         array_agg(distinct trim(m.document_number) order by trim(m.document_number)) source_values,
         count(*) movement_count
  from public.inventory_movements m
  where m.source='APPSHEET'
    and m.movement_type='ENTRADA'
    and m.supplier_id is not null
    and trim(coalesce(m.document_number,'')) ~ '^[0-9]+$'
  group by m.supplier_id,coalesce(nullif(ltrim(trim(m.document_number),'0'),''),'0')
)
insert into public.inventory_invoices(
  access_key,supplier_id,supplier_document,supplier_name,invoice_number,issued_at,
  total_value,status,bucket,object_path,imported_by,confirmed_at,raw_data,metadata,source
)
select null,g.supplier_id,s.document,s.name,g.invoice_number,g.issued_at,g.total_value,
       'CONFIRMED','inventory-nfe',null,'MIGRACAO_ESTOQUE_BD',g.issued_at,
       jsonb_build_object(
         'legacy_source','Estoque BD (1).xlsx',
         'legacy_document_values',to_jsonb(g.source_values),
         'legacy_movement_count',g.movement_count,
         'data_quality_note','Nota reconstruída exclusivamente com os dados disponíveis na planilha original.'
       ),
       jsonb_build_object('legacy_import',true),
       'LEGACY_IMPORT'
from legacy_groups g
join public.inventory_suppliers s on s.supplier_id=g.supplier_id
where not exists (
  select 1 from public.inventory_invoices i
  where i.source='LEGACY_IMPORT'
    and i.supplier_id=g.supplier_id
    and coalesce(nullif(ltrim(i.invoice_number,'0'),''),'0')=g.invoice_number
);

with legacy_movements as (
  select m.*,
         coalesce(nullif(ltrim(trim(m.document_number),'0'),''),'0') invoice_number
  from public.inventory_movements m
  where m.source='APPSHEET'
    and m.movement_type='ENTRADA'
    and m.supplier_id is not null
    and trim(coalesce(m.document_number,'')) ~ '^[0-9]+$'
), numbered as (
  select i.invoice_id,m.movement_id,m.product_id,m.quantity,m.unit_value,m.total_value,
         p.description,p.unit,
         row_number() over(partition by i.invoice_id order by m.occurred_at,m.movement_id) line_number
  from legacy_movements m
  join public.inventory_invoices i
    on i.source='LEGACY_IMPORT'
   and i.supplier_id=m.supplier_id
   and coalesce(nullif(ltrim(i.invoice_number,'0'),''),'0')=m.invoice_number
  join public.inventory_products p on p.product_id=m.product_id
)
insert into public.inventory_invoice_items(
  invoice_id,line_number,description,quantity,unit,unit_price,total_value,
  product_id,match_method,movement_id,raw_data
)
select n.invoice_id,n.line_number,n.description,n.quantity,n.unit,n.unit_value,n.total_value,
       n.product_id,'LEGACY_MOVEMENT',n.movement_id,
       jsonb_build_object('legacy_source','Estoque BD (1).xlsx')
from numbered n
where not exists (
  select 1 from public.inventory_invoice_items ii where ii.movement_id=n.movement_id
);

drop function if exists public.inventory_register_movement(
  text,text,numeric,text,uuid,numeric,numeric,text,text,text,text,text,text,text,text,text,text,text
);

create function public.inventory_register_movement(
  p_movement_type text,p_product_id text,p_quantity numeric,p_actor_email text,p_idempotency_key uuid,
  p_total_value numeric default null,p_unit_value numeric default null,p_requester_id text default null,
  p_supplier_id text default null,p_document_number text default null,p_notes text default null,
  p_from_location text default null,p_to_location text default null,p_purpose text default null,
  p_source text default 'PORTAL',p_reversal_of text default null,p_reference_type text default null,
  p_reference_id text default null,p_occurred_at timestamptz default null
) returns public.inventory_movements language plpgsql security definer set search_path=public as $$
declare
  v_balance numeric;v_row public.inventory_movements;v_original public.inventory_movements;
  v_needed numeric;v_take numeric;v_lot record;v_occurred_at timestamptz:=coalesce(p_occurred_at,now());
begin
  if p_quantity is null or p_quantity<=0 then raise exception 'INVALID_QUANTITY';end if;
  if p_movement_type not in('ENTRADA','SAIDA','AJUSTE_POSITIVO','AJUSTE_NEGATIVO','TRANSFERENCIA') then raise exception 'INVALID_MOVEMENT_TYPE';end if;
  if v_occurred_at>now()+interval '5 minutes' then raise exception 'INVALID_OCCURRED_AT';end if;
  perform pg_advisory_xact_lock(hashtextextended(p_product_id,0));
  if not exists(select 1 from public.inventory_products where product_id=p_product_id) then raise exception 'PRODUCT_NOT_FOUND';end if;
  if p_idempotency_key is not null then select * into v_row from public.inventory_movements where idempotency_key=p_idempotency_key;if found then return v_row;end if;end if;
  if p_reversal_of is not null then select * into v_original from public.inventory_movements where movement_id=p_reversal_of;if not found then raise exception 'MOVEMENT_NOT_FOUND';end if;if exists(select 1 from public.inventory_movements where reversal_of=p_reversal_of)then raise exception 'MOVEMENT_ALREADY_REVERSED';end if;end if;
  select coalesce(sum(case when movement_type in('ENTRADA','AJUSTE_POSITIVO')then quantity when movement_type in('SAIDA','AJUSTE_NEGATIVO')then -quantity else 0 end),0)
    into v_balance from public.inventory_movements where product_id=p_product_id;
  if p_movement_type in('SAIDA','AJUSTE_NEGATIVO')and v_balance<p_quantity then raise exception 'INSUFFICIENT_STOCK';end if;
  insert into public.inventory_movements(
    movement_id,occurred_at,movement_type,product_id,quantity,total_value,unit_value,
    requester_id,supplier_id,document_number,notes,user_email,source,from_location,to_location,
    purpose,idempotency_key,reversal_of,reference_type,reference_id,recorded_at
  ) values(
    gen_random_uuid(),v_occurred_at,p_movement_type,p_product_id,p_quantity,p_total_value,p_unit_value,
    p_requester_id,p_supplier_id,p_document_number,p_notes,p_actor_email,p_source,p_from_location,p_to_location,
    p_purpose,p_idempotency_key,p_reversal_of,p_reference_type,p_reference_id,now()
  ) returning * into v_row;
  if p_movement_type='ENTRADA' then
    insert into public.inventory_lots(product_id,source_movement_id,received_at,quantity_received,quantity_remaining,unit_cost,source)
    values(p_product_id,v_row.movement_id,v_row.occurred_at,p_quantity,p_quantity,
      coalesce(p_unit_value,case when p_total_value is not null then p_total_value/p_quantity end),'ENTRY');
  elsif p_movement_type in('SAIDA','AJUSTE_NEGATIVO') then
    v_needed:=p_quantity;
    for v_lot in select lot_id,quantity_remaining from public.inventory_lots
      where product_id=p_product_id and quantity_remaining>0
      order by received_at,created_at,lot_id for update loop
      exit when v_needed<=0;v_take:=least(v_needed,v_lot.quantity_remaining);
      update public.inventory_lots set quantity_remaining=quantity_remaining-v_take where lot_id=v_lot.lot_id;
      insert into public.inventory_lot_allocations(exit_movement_id,lot_id,quantity)
      values(v_row.movement_id,v_lot.lot_id,v_take);
      v_needed:=v_needed-v_take;
    end loop;
    if v_needed>0 then raise exception 'FIFO_BALANCE_INCONSISTENT';end if;
  end if;
  return v_row;
end $$;

revoke all on function public.inventory_register_movement(
  text,text,numeric,text,uuid,numeric,numeric,text,text,text,text,text,text,text,text,text,text,text,timestamptz
) from public,anon,authenticated;
grant execute on function public.inventory_register_movement(
  text,text,numeric,text,uuid,numeric,numeric,text,text,text,text,text,text,text,text,text,text,text,timestamptz
) to service_role;

create or replace function public.inventory_confirm_invoice(
  p_invoice_id uuid,p_actor_email text,p_items jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_invoice public.inventory_invoices;v_item public.inventory_invoice_items;v_link record;
  v_movement public.inventory_movements;v_count integer:=0;
begin
  select * into v_invoice from public.inventory_invoices where invoice_id=p_invoice_id for update;
  if not found then raise exception 'INVOICE_NOT_FOUND';end if;
  if v_invoice.status='CONFIRMED' then raise exception 'INVOICE_ALREADY_CONFIRMED';end if;
  if v_invoice.status<>'PREVIEW' then raise exception 'INVOICE_NOT_CONFIRMABLE';end if;
  for v_link in select * from jsonb_to_recordset(coalesce(p_items,'[]'::jsonb)) as x(item_id uuid,product_id text) loop
    update public.inventory_invoice_items set product_id=v_link.product_id,match_method='USER_CONFIRMED'
      where item_id=v_link.item_id and invoice_id=p_invoice_id;
  end loop;
  if exists(select 1 from public.inventory_invoice_items where invoice_id=p_invoice_id and product_id is null)
    then raise exception 'INVOICE_HAS_UNMATCHED_ITEMS';end if;
  for v_item in select * from public.inventory_invoice_items where invoice_id=p_invoice_id order by line_number loop
    select * into v_movement from public.inventory_register_movement(
      p_movement_type=>'ENTRADA',p_product_id=>v_item.product_id,p_quantity=>v_item.quantity,
      p_actor_email=>p_actor_email,p_idempotency_key=>gen_random_uuid(),p_total_value=>v_item.total_value,
      p_unit_value=>v_item.unit_price,p_supplier_id=>v_invoice.supplier_id,
      p_document_number=>v_invoice.invoice_number,p_notes=>'Entrada automática por NF-e',
      p_source=>'NFE_XML',p_reference_type=>'NFE',p_reference_id=>p_invoice_id::text,
      p_occurred_at=>coalesce(v_invoice.issued_at,now())
    );
    update public.inventory_invoice_items set movement_id=v_movement.movement_id where item_id=v_item.item_id;
    if v_item.unit_price is not null then
      insert into public.inventory_supplier_price_history(product_id,supplier_id,invoice_access_key,unit_price,quantity,purchased_at)
      values(v_item.product_id,v_invoice.supplier_id,v_invoice.access_key,v_item.unit_price,v_item.quantity,coalesce(v_invoice.issued_at,now()));
    end if;
    if v_invoice.supplier_id is not null and nullif(v_item.supplier_sku,'') is not null then
      insert into public.inventory_product_suppliers(product_id,supplier_id,supplier_sku,supplier_description,last_unit_price,last_purchase_at)
      values(v_item.product_id,v_invoice.supplier_id,v_item.supplier_sku,v_item.description,v_item.unit_price,coalesce(v_invoice.issued_at,now()))
      on conflict(product_id,supplier_id) do update set supplier_sku=excluded.supplier_sku,
        supplier_description=excluded.supplier_description,last_unit_price=excluded.last_unit_price,
        last_purchase_at=excluded.last_purchase_at,active=true,updated_at=now();
    end if;
    v_count:=v_count+1;
  end loop;
  update public.inventory_invoices set status='CONFIRMED',confirmed_at=now() where invoice_id=p_invoice_id;
  return jsonb_build_object('ok',true,'invoice_id',p_invoice_id,'movements_created',v_count);
end $$;

revoke all on function public.inventory_confirm_invoice(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.inventory_confirm_invoice(uuid,text,jsonb) to service_role;
