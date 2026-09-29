alter table public.inventory_invoices
  add column if not exists receipt_status text not null default 'PENDING',
  add column if not exists complements_invoice_id uuid references public.inventory_invoices(invoice_id) on delete set null;

alter table public.inventory_invoices drop constraint if exists inventory_invoices_receipt_status_check;
alter table public.inventory_invoices add constraint inventory_invoices_receipt_status_check
  check (receipt_status in ('PENDING','COMPLETE','PARTIAL'));
alter table public.inventory_invoices drop constraint if exists inventory_invoices_not_self_complement_check;
alter table public.inventory_invoices add constraint inventory_invoices_not_self_complement_check
  check (complements_invoice_id is null or complements_invoice_id <> invoice_id);

alter table public.inventory_invoice_items
  add column if not exists received_quantity numeric,
  add column if not exists receipt_note text,
  add column if not exists delivery_status text not null default 'RECEIVED';

update public.inventory_invoice_items
set received_quantity = quantity
where received_quantity is null;

update public.inventory_invoices
set receipt_status = case when status = 'CONFIRMED' then 'COMPLETE' else 'PENDING' end
where receipt_status is null or receipt_status = 'PENDING';

alter table public.inventory_invoice_items alter column received_quantity set default 0;
alter table public.inventory_invoice_items alter column received_quantity set not null;
alter table public.inventory_invoice_items drop constraint if exists inventory_invoice_items_received_quantity_check;
alter table public.inventory_invoice_items add constraint inventory_invoice_items_received_quantity_check
  check (received_quantity >= 0 and received_quantity <= quantity);
alter table public.inventory_invoice_items drop constraint if exists inventory_invoice_items_delivery_status_check;
alter table public.inventory_invoice_items add constraint inventory_invoice_items_delivery_status_check
  check (delivery_status in ('RECEIVED','PARTIAL','MISSING'));

create index if not exists inventory_invoices_complements_idx
  on public.inventory_invoices(complements_invoice_id) where complements_invoice_id is not null;
create index if not exists inventory_invoices_receipt_status_idx
  on public.inventory_invoices(receipt_status, issued_at desc);

create or replace function public.inventory_confirm_invoice(
  p_invoice_id uuid,p_actor_email text,p_items jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_invoice public.inventory_invoices;v_item public.inventory_invoice_items;v_link record;
  v_movement public.inventory_movements;v_count integer:=0;v_pending integer:=0;
begin
  select * into v_invoice from public.inventory_invoices where invoice_id=p_invoice_id for update;
  if not found then raise exception 'INVOICE_NOT_FOUND';end if;
  if v_invoice.status='CONFIRMED' then raise exception 'INVOICE_ALREADY_CONFIRMED';end if;
  if v_invoice.status<>'PREVIEW' then raise exception 'INVOICE_NOT_CONFIRMABLE';end if;

  for v_link in
    select * from jsonb_to_recordset(coalesce(p_items,'[]'::jsonb))
      as x(item_id uuid,product_id text,received_quantity numeric,receipt_note text)
  loop
    update public.inventory_invoice_items
    set product_id=nullif(v_link.product_id,''),
        received_quantity=coalesce(v_link.received_quantity,quantity),
        receipt_note=nullif(trim(v_link.receipt_note),''),
        delivery_status=case
          when coalesce(v_link.received_quantity,quantity)=0 then 'MISSING'
          when coalesce(v_link.received_quantity,quantity)<quantity then 'PARTIAL'
          else 'RECEIVED' end,
        match_method=case when nullif(v_link.product_id,'') is null then match_method else 'USER_CONFIRMED' end
    where item_id=v_link.item_id and invoice_id=p_invoice_id;
  end loop;

  if exists(
    select 1 from public.inventory_invoice_items
    where invoice_id=p_invoice_id and (received_quantity<0 or received_quantity>quantity)
  ) then raise exception 'INVALID_RECEIVED_QUANTITY';end if;
  if exists(
    select 1 from public.inventory_invoice_items
    where invoice_id=p_invoice_id and received_quantity>0 and product_id is null
  ) then raise exception 'INVOICE_HAS_UNMATCHED_RECEIVED_ITEMS';end if;

  for v_item in
    select * from public.inventory_invoice_items
    where invoice_id=p_invoice_id and received_quantity>0
    order by line_number
  loop
    select * into v_movement from public.inventory_register_movement(
      p_movement_type=>'ENTRADA',p_product_id=>v_item.product_id,p_quantity=>v_item.received_quantity,
      p_actor_email=>p_actor_email,p_idempotency_key=>gen_random_uuid(),
      p_total_value=>case when v_item.unit_price is not null then v_item.unit_price*v_item.received_quantity else null end,
      p_unit_value=>v_item.unit_price,p_supplier_id=>v_invoice.supplier_id,
      p_document_number=>v_invoice.invoice_number,
      p_notes=>'Entrada por NF-e'||case when v_item.receipt_note is not null then ' — '||v_item.receipt_note else '' end,
      p_source=>'NFE_XML',p_reference_type=>'NFE',p_reference_id=>p_invoice_id::text,
      p_occurred_at=>coalesce(v_invoice.issued_at,now())
    );
    update public.inventory_invoice_items set movement_id=v_movement.movement_id where item_id=v_item.item_id;
    if v_item.unit_price is not null then
      insert into public.inventory_supplier_price_history(product_id,supplier_id,invoice_access_key,unit_price,quantity,purchased_at)
      values(v_item.product_id,v_invoice.supplier_id,v_invoice.access_key,v_item.unit_price,v_item.received_quantity,coalesce(v_invoice.issued_at,now()));
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

  select count(*) into v_pending from public.inventory_invoice_items
  where invoice_id=p_invoice_id and received_quantity<quantity;
  update public.inventory_invoices
  set status='CONFIRMED',confirmed_at=now(),receipt_status=case when v_pending>0 then 'PARTIAL' else 'COMPLETE' end
  where invoice_id=p_invoice_id;
  return jsonb_build_object('ok',true,'invoice_id',p_invoice_id,'movements_created',v_count,'pending_items',v_pending);
end $$;

revoke all on function public.inventory_confirm_invoice(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.inventory_confirm_invoice(uuid,text,jsonb) to service_role;
