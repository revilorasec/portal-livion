-- Importador idempotente para o histórico da planilha anterior.
create or replace function public.procurement_import_legacy(p_rows jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare r jsonb; rq uuid; it uuid; ofr uuid; ord uuid; rec uuid; sup text; prod text; imported integer:=0;
begin
  if jsonb_typeof(p_rows)<>'array' then raise exception 'INVALID_LEGACY_ROWS'; end if;
  for r in select value from jsonb_array_elements(p_rows) loop
    if exists(select 1 from public.procurement_legacy_rows where legacy_id=r->>'legacy_id') then continue; end if;
    sup:=null;prod:=null;ofr:=null;ord:=null;rec:=null;
    if nullif(trim(r->>'supplier'),'') is not null then select supplier_id into sup from public.inventory_suppliers where lower(trim(name))=lower(trim(r->>'supplier')) order by created_at limit 1; end if;
    select product_id into prod from public.inventory_products where status<>'INATIVO' and (lower(trim(pn))=lower(trim(r->>'description')) or lower(trim(description))=lower(trim(r->>'description'))) order by case when lower(trim(pn))=lower(trim(r->>'description')) then 0 else 1 end limit 1;
    insert into public.procurement_requests(title,requester_email,urgency,status,notes,source,legacy_id,created_by,created_at,updated_at)
    values(r->>'title','migracao-cotacoes@livionsolutions.com.br',r->>'urgency',r->>'status',nullif(r->>'notes',''),'GOOGLE_SHEETS_LEGACY',r->>'legacy_id','migracao@livionsolutions.com.br',coalesce((r->>'request_date')::timestamptz,now()),now()) returning request_id into rq;
    insert into public.procurement_request_items(request_id,line_number,inventory_product_id,description,manufacturer,category,quantity,unit,status)
    values(rq,1,prod,r->>'description',nullif(r->>'manufacturer',''),nullif(r->>'category',''),(r->>'quantity')::numeric,'UNIDADE',case when r->>'status'='RECEBIDO' then 'RECEBIDO' when r->>'status'='PEDIDO_EMITIDO' then 'PEDIDO' when r->>'status'='APROVADA' then 'SELECIONADO' when r->>'status'='COTANDO' then 'COTANDO' else 'CANCELADO' end) returning item_id into it;
    if sup is not null or r->>'unit_price' is not null or r->>'supplier_requested' is not null then
      insert into public.procurement_offers(item_id,supplier_id,supplier_name_snapshot,requested_at,responded_at,currency,exchange_rate,unit_price,total_price,payment_terms,delivery_days,delivery_method,purchase_url,supplier_reference,notes,selected,created_by,created_at,updated_at)
      values(it,sup,nullif(r->>'supplier',''),(r->>'supplier_requested')::timestamptz,(r->>'supplier_responded')::timestamptz,coalesce(nullif(r->>'currency',''),'BRL'),(r->>'exchange_rate')::numeric,(r->>'unit_price')::numeric,(r->>'total_price')::numeric,nullif(r->>'payment_terms',''),(r->>'delivery_days')::integer,nullif(r->>'delivery_terms',''),nullif(r->>'purchase_url',''),nullif(r->>'supplier_reference',''),nullif(r->>'notes',''),r->>'purchase_date' is not null,'migracao@livionsolutions.com.br',coalesce((r->>'supplier_requested')::timestamptz,now()),now()) returning offer_id into ofr;
    end if;
    if r->>'purchase_date' is not null then
      insert into public.procurement_orders(supplier_id,supplier_name_snapshot,status,ordered_at,expected_at,currency,total_value,payment_terms,delivery_method,invoice_number,notes,created_by,created_at,updated_at)
      values(sup,nullif(r->>'supplier',''),case when (r->>'delivered')::boolean then 'RECEBIDO' else 'EMITIDO' end,(r->>'purchase_date')::timestamptz,case when r->>'delivery_days' is not null then ((r->>'purchase_date')::timestamptz+make_interval(days=>(r->>'delivery_days')::integer))::date else null end,coalesce(nullif(r->>'currency',''),'BRL'),(r->>'total_price')::numeric,nullif(r->>'payment_terms',''),nullif(r->>'delivery_terms',''),nullif(r->>'invoice',''),nullif(r->>'notes',''),'migracao@livionsolutions.com.br',(r->>'purchase_date')::timestamptz,now()) returning order_id into ord;
      insert into public.procurement_order_items(order_id,request_item_id,offer_id,inventory_product_id,description,quantity,unit,unit_price,total_price,received_quantity)
      values(ord,it,ofr,prod,r->>'description',(r->>'quantity')::numeric,'UNIDADE',(r->>'unit_price')::numeric,(r->>'total_price')::numeric,case when (r->>'delivered')::boolean then (r->>'quantity')::numeric else 0 end);
      if r->>'delivery_date' is not null then
        insert into public.procurement_receipts(order_id,received_at,invoice_number,notes,received_by,created_at) values(ord,(r->>'delivery_date')::timestamptz,nullif(r->>'invoice',''),'Histórico importado; não gerou movimentação de estoque.','migracao@livionsolutions.com.br',(r->>'delivery_date')::timestamptz) returning receipt_id into rec;
        insert into public.procurement_receipt_items(receipt_id,order_item_id,quantity,inventory_movement_id,idempotency_key) select rec,order_item_id,(r->>'quantity')::numeric,null,gen_random_uuid() from public.procurement_order_items where order_id=ord;
      end if;
    end if;
    insert into public.procurement_legacy_rows(legacy_id,source_row,request_id,item_id,offer_id,order_id,raw_data) values(r->>'legacy_id',(r->>'source_row')::integer,rq,it,ofr,ord,r->'raw');
    imported:=imported+1;
  end loop;
  return imported;
end $$;
revoke all on function public.procurement_import_legacy(jsonb) from public,anon,authenticated;
grant execute on function public.procurement_import_legacy(jsonb) to service_role;
