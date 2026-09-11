begin;

alter table public.inventory_invoices
  drop constraint if exists inventory_invoices_source_check;

alter table public.inventory_invoices
  add constraint inventory_invoices_source_check
  check (source in ('XML_NFE','QR_NFE','LEGACY_IMPORT','MANUAL_ENTRY'));

create index if not exists inventory_invoices_manual_lookup_idx
  on public.inventory_invoices(source,supplier_id,lower(trim(invoice_number)));

create unique index if not exists inventory_invoice_items_movement_uq
  on public.inventory_invoice_items(movement_id)
  where movement_id is not null;

create or replace function public.inventory_register_manual_invoice_entry(
  p_product_id text,
  p_quantity numeric,
  p_actor_email text,
  p_idempotency_key uuid,
  p_total_value numeric default null,
  p_unit_value numeric default null,
  p_supplier_id text default null,
  p_document_number text default null,
  p_notes text default null,
  p_occurred_at timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_movement public.inventory_movements;
  v_invoice_id uuid;
  v_line_number integer;
  v_document_number text:=nullif(trim(p_document_number),'');
  v_product public.inventory_products;
  v_supplier public.inventory_suppliers;
begin
  if v_document_number is null then raise exception 'INVALID_DOCUMENT_NUMBER'; end if;

  select * into v_movement
  from public.inventory_register_movement(
    p_movement_type=>'ENTRADA',
    p_product_id=>p_product_id,
    p_quantity=>p_quantity,
    p_actor_email=>p_actor_email,
    p_idempotency_key=>p_idempotency_key,
    p_total_value=>p_total_value,
    p_unit_value=>p_unit_value,
    p_supplier_id=>p_supplier_id,
    p_document_number=>v_document_number,
    p_notes=>p_notes,
    p_source=>'PORTAL',
    p_occurred_at=>p_occurred_at
  );

  select ii.invoice_id into v_invoice_id
  from public.inventory_invoice_items ii
  where ii.movement_id=v_movement.movement_id;

  if v_invoice_id is null then
    perform pg_advisory_xact_lock(hashtextextended('manual-invoice:'||coalesce(p_supplier_id,'')||':'||lower(v_document_number),0));

    select ii.invoice_id into v_invoice_id
    from public.inventory_invoice_items ii
    where ii.movement_id=v_movement.movement_id;

    if v_invoice_id is null then
      select i.invoice_id into v_invoice_id
      from public.inventory_invoices i
      where i.source='MANUAL_ENTRY'
        and i.status='CONFIRMED'
        and i.supplier_id is not distinct from p_supplier_id
        and lower(trim(i.invoice_number))=lower(v_document_number)
      order by i.created_at desc
      limit 1
      for update;

      if v_invoice_id is null then
        if p_supplier_id is not null then
          select * into v_supplier from public.inventory_suppliers where supplier_id=p_supplier_id;
        end if;
        insert into public.inventory_invoices(
          access_key,supplier_id,supplier_document,supplier_name,invoice_number,issued_at,
          total_value,status,imported_by,confirmed_at,raw_data,source
        ) values(
          null,p_supplier_id,v_supplier.document,v_supplier.name,v_document_number,v_movement.occurred_at,
          p_total_value,'CONFIRMED',p_actor_email,now(),jsonb_build_object('manual_entry',true),'MANUAL_ENTRY'
        ) returning invoice_id into v_invoice_id;
      end if;

      select * into v_product from public.inventory_products where product_id=p_product_id;
      select coalesce(max(line_number),0)+1 into v_line_number
      from public.inventory_invoice_items where invoice_id=v_invoice_id;

      insert into public.inventory_invoice_items(
        invoice_id,line_number,description,quantity,unit,unit_price,total_value,
        product_id,match_method,movement_id,raw_data
      ) values(
        v_invoice_id,v_line_number,v_product.description,p_quantity,v_product.unit,p_unit_value,p_total_value,
        p_product_id,'MANUAL_ENTRY',v_movement.movement_id,jsonb_build_object('manual_entry',true,'notes',p_notes)
      );

      update public.inventory_documents
      set invoice_id=v_invoice_id
      where movement_id=v_movement.movement_id and invoice_id is null;

      update public.inventory_invoices i
      set total_value=(select sum(ii.total_value) from public.inventory_invoice_items ii where ii.invoice_id=i.invoice_id),
          issued_at=least(coalesce(i.issued_at,v_movement.occurred_at),v_movement.occurred_at)
      where i.invoice_id=v_invoice_id;
    end if;
  end if;

  return jsonb_build_object(
    'movement_id',v_movement.movement_id,
    'invoice_id',v_invoice_id,
    'occurred_at',v_movement.occurred_at,
    'recorded_at',v_movement.recorded_at
  );
end $$;

revoke all on function public.inventory_register_manual_invoice_entry(
  text,numeric,text,uuid,numeric,numeric,text,text,text,timestamptz
) from public,anon,authenticated;

grant execute on function public.inventory_register_manual_invoice_entry(
  text,numeric,text,uuid,numeric,numeric,text,text,text,timestamptz
) to service_role;

do $$
declare
  v_group record;
  v_movement record;
  v_invoice_id uuid;
  v_line_number integer;
  v_supplier_name text;
  v_supplier_document text;
begin
  for v_group in
    select m.supplier_id,trim(m.document_number) invoice_number,
           min(m.occurred_at) issued_at,sum(m.total_value) total_value,max(m.user_email) imported_by
    from public.inventory_movements m
    where m.movement_type='ENTRADA'
      and m.source='PORTAL'
      and nullif(trim(coalesce(m.document_number,'')),'') is not null
      and not exists(select 1 from public.inventory_invoice_items ii where ii.movement_id=m.movement_id)
    group by m.supplier_id,trim(m.document_number)
  loop
    v_supplier_name:=null;v_supplier_document:=null;
    if v_group.supplier_id is not null then
      select s.name,s.document into v_supplier_name,v_supplier_document
      from public.inventory_suppliers s where s.supplier_id=v_group.supplier_id;
    end if;

    insert into public.inventory_invoices(
      access_key,supplier_id,supplier_document,supplier_name,invoice_number,issued_at,
      total_value,status,imported_by,confirmed_at,raw_data,source
    ) values(
      null,v_group.supplier_id,v_supplier_document,v_supplier_name,v_group.invoice_number,v_group.issued_at,
      v_group.total_value,'CONFIRMED',v_group.imported_by,now(),jsonb_build_object('manual_entry',true,'backfilled',true),'MANUAL_ENTRY'
    ) returning invoice_id into v_invoice_id;

    v_line_number:=0;
    for v_movement in
      select m.*,p.description,p.unit
      from public.inventory_movements m
      join public.inventory_products p on p.product_id=m.product_id
      where m.movement_type='ENTRADA'
        and m.source='PORTAL'
        and m.supplier_id is not distinct from v_group.supplier_id
        and trim(m.document_number)=v_group.invoice_number
        and not exists(select 1 from public.inventory_invoice_items ii where ii.movement_id=m.movement_id)
      order by m.occurred_at,m.recorded_at,m.movement_id
    loop
      v_line_number:=v_line_number+1;
      insert into public.inventory_invoice_items(
        invoice_id,line_number,description,quantity,unit,unit_price,total_value,
        product_id,match_method,movement_id,raw_data
      ) values(
        v_invoice_id,v_line_number,v_movement.description,v_movement.quantity,v_movement.unit,
        v_movement.unit_value,v_movement.total_value,v_movement.product_id,'MANUAL_ENTRY',
        v_movement.movement_id,jsonb_build_object('manual_entry',true,'notes',v_movement.notes)
      );
      update public.inventory_documents set invoice_id=v_invoice_id
      where movement_id=v_movement.movement_id and invoice_id is null;
    end loop;
  end loop;
end $$;

commit;
