-- Confirma todos os itens de uma NF-e em uma única transação.
create or replace function public.inventory_confirm_invoice(
  p_invoice_id uuid,
  p_actor_email text,
  p_items jsonb
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_invoice public.inventory_invoices;
  v_item public.inventory_invoice_items;
  v_link record;
  v_movement public.inventory_movements;
  v_count integer := 0;
begin
  select * into v_invoice from public.inventory_invoices where invoice_id=p_invoice_id for update;
  if not found then raise exception 'INVOICE_NOT_FOUND'; end if;
  if v_invoice.status='CONFIRMED' then raise exception 'INVOICE_ALREADY_CONFIRMED'; end if;
  if v_invoice.status<>'PREVIEW' then raise exception 'INVOICE_NOT_CONFIRMABLE'; end if;

  for v_link in select * from jsonb_to_recordset(coalesce(p_items,'[]'::jsonb)) as x(item_id uuid,product_id text)
  loop
    update public.inventory_invoice_items set product_id=v_link.product_id,match_method='USER_CONFIRMED'
      where item_id=v_link.item_id and invoice_id=p_invoice_id;
  end loop;

  if exists(select 1 from public.inventory_invoice_items where invoice_id=p_invoice_id and product_id is null)
    then raise exception 'INVOICE_HAS_UNMATCHED_ITEMS';
  end if;

  for v_item in select * from public.inventory_invoice_items where invoice_id=p_invoice_id order by line_number
  loop
    select * into v_movement from public.inventory_register_movement(
      p_movement_type=>'ENTRADA',p_product_id=>v_item.product_id,p_quantity=>v_item.quantity,
      p_actor_email=>p_actor_email,p_idempotency_key=>gen_random_uuid(),p_total_value=>v_item.total_value,
      p_unit_value=>v_item.unit_price,p_supplier_id=>v_invoice.supplier_id,
      p_document_number=>v_invoice.invoice_number,p_notes=>'Entrada automática por NF-e',
      p_source=>'NFE_XML',p_reference_type=>'NFE',p_reference_id=>p_invoice_id::text
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
