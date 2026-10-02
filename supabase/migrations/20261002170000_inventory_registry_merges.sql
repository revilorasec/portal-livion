create table if not exists public.inventory_registry_merges (
  merge_id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('PRODUCT','SUPPLIER')),
  source_id text not null,
  target_id text not null,
  source_name text not null,
  target_name text not null,
  merged_by text not null,
  merged_at timestamptz not null default now(),
  detail jsonb not null default '{}'::jsonb,
  unique (entity_type, source_id),
  check (source_id <> target_id)
);

create index if not exists inventory_registry_merges_target_idx
  on public.inventory_registry_merges(entity_type, target_id);

alter table public.inventory_registry_merges enable row level security;
revoke all on public.inventory_registry_merges from anon, authenticated;
grant select, insert, update, delete on public.inventory_registry_merges to service_role;

create or replace function public.inventory_merge_registry(
  p_entity_type text,
  p_source_id text,
  p_target_id text,
  p_actor_email text,
  p_apply boolean default false
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_type text:=upper(trim(coalesce(p_entity_type,'')));
  v_source_name text;
  v_target_name text;
  v_balance numeric:=0;
  v_counts jsonb;
  v_link record;
  v_media record;
  v_detail jsonb;
begin
  if v_type not in ('PRODUCT','SUPPLIER') or nullif(trim(p_source_id),'') is null
     or nullif(trim(p_target_id),'') is null or p_source_id=p_target_id then
    raise exception 'INVALID_REGISTRY_MERGE';
  end if;

  if exists(select 1 from public.inventory_registry_merges where entity_type=v_type and source_id=p_target_id) then
    raise exception 'MERGE_TARGET_IS_ALIAS';
  end if;
  if exists(select 1 from public.inventory_registry_merges where entity_type=v_type and source_id=p_source_id) then
    raise exception 'REGISTRY_ALREADY_MERGED';
  end if;

  if v_type='PRODUCT' then
    select description into v_source_name from public.inventory_products where product_id=p_source_id for update;
    select description into v_target_name from public.inventory_products where product_id=p_target_id for update;
    if v_source_name is null or v_target_name is null then raise exception 'REGISTRY_NOT_FOUND'; end if;
    select coalesce(sum(case when movement_type in ('ENTRADA','AJUSTE_POSITIVO') then quantity
                             when movement_type in ('SAIDA','AJUSTE_NEGATIVO') then -quantity else 0 end),0)
      into v_balance from public.inventory_movements where product_id=p_source_id;
    v_counts:=jsonb_build_object(
      'movements',(select count(*) from public.inventory_movements where product_id=p_source_id),
      'balance',v_balance,
      'invoice_items',(select count(*) from public.inventory_invoice_items where product_id=p_source_id),
      'lots',(select count(*) from public.inventory_lots where product_id=p_source_id),
      'supplier_links',(select count(*) from public.inventory_product_suppliers where product_id=p_source_id),
      'price_records',(select count(*) from public.inventory_supplier_price_history where product_id=p_source_id),
      'files',(select count(*) from public.inventory_product_files where product_id=p_source_id),
      'compatible_parts',(select count(*) from public.inventory_product_parts where product_id=p_source_id),
      'purchase_links',(
        (select count(*) from public.procurement_request_items where inventory_product_id=p_source_id)+
        (select count(*) from public.procurement_order_items where inventory_product_id=p_source_id)
      )
    );
  else
    select name into v_source_name from public.inventory_suppliers where supplier_id=p_source_id for update;
    select name into v_target_name from public.inventory_suppliers where supplier_id=p_target_id for update;
    if v_source_name is null or v_target_name is null then raise exception 'REGISTRY_NOT_FOUND'; end if;
    v_counts:=jsonb_build_object(
      'movements',(select count(*) from public.inventory_movements where supplier_id=p_source_id),
      'invoices',(select count(*) from public.inventory_invoices where supplier_id=p_source_id),
      'product_links',(select count(*) from public.inventory_product_suppliers where supplier_id=p_source_id),
      'price_records',(select count(*) from public.inventory_supplier_price_history where supplier_id=p_source_id),
      'purchase_links',(
        (select count(*) from public.procurement_offers where supplier_id=p_source_id)+
        (select count(*) from public.procurement_orders where supplier_id=p_source_id)
      )
    );
  end if;

  v_detail:=jsonb_build_object('entity_type',v_type,'source_id',p_source_id,'source_name',v_source_name,
    'target_id',p_target_id,'target_name',v_target_name,'counts',v_counts,'applied',p_apply);
  if not p_apply then return v_detail; end if;

  if v_type='PRODUCT' then
    if v_balance>0 then
      insert into public.inventory_movements(movement_id,occurred_at,movement_type,product_id,quantity,notes,user_email,source,idempotency_key,recorded_at)
      values(gen_random_uuid(),now(),'AJUSTE_NEGATIVO',p_source_id,v_balance,'Saldo transferido por mesclagem de cadastro para '||v_target_name,p_actor_email,'CADASTRO_MESCLAGEM',gen_random_uuid(),now());
      insert into public.inventory_movements(movement_id,occurred_at,movement_type,product_id,quantity,notes,user_email,source,idempotency_key,recorded_at)
      values(gen_random_uuid(),now(),'AJUSTE_POSITIVO',p_target_id,v_balance,'Saldo recebido por mesclagem do cadastro '||v_source_name,p_actor_email,'CADASTRO_MESCLAGEM',gen_random_uuid(),now());
    elsif v_balance<0 then
      insert into public.inventory_movements(movement_id,occurred_at,movement_type,product_id,quantity,notes,user_email,source,idempotency_key,recorded_at)
      values(gen_random_uuid(),now(),'AJUSTE_POSITIVO',p_source_id,abs(v_balance),'Saldo zerado por mesclagem de cadastro para '||v_target_name,p_actor_email,'CADASTRO_MESCLAGEM',gen_random_uuid(),now());
      insert into public.inventory_movements(movement_id,occurred_at,movement_type,product_id,quantity,notes,user_email,source,idempotency_key,recorded_at)
      values(gen_random_uuid(),now(),'AJUSTE_NEGATIVO',p_target_id,abs(v_balance),'Saldo negativo recebido por mesclagem do cadastro '||v_source_name,p_actor_email,'CADASTRO_MESCLAGEM',gen_random_uuid(),now());
    end if;

    update public.inventory_invoice_items set product_id=p_target_id,match_method='REGISTRY_MERGE' where product_id=p_source_id;
    update public.inventory_lots set product_id=p_target_id where product_id=p_source_id;
    update public.inventory_supplier_price_history set product_id=p_target_id where product_id=p_source_id;
    update public.inventory_product_files set product_id=p_target_id where product_id=p_source_id;
    update public.procurement_request_items set inventory_product_id=p_target_id where inventory_product_id=p_source_id;
    update public.procurement_order_items set inventory_product_id=p_target_id where inventory_product_id=p_source_id;

    for v_link in select * from public.inventory_product_parts where product_id=p_source_id loop
      delete from public.inventory_product_parts where product_id=p_source_id and part_id=v_link.part_id;
      insert into public.inventory_product_parts(product_id,part_id,created_by,created_at)
      values(p_target_id,v_link.part_id,v_link.created_by,v_link.created_at) on conflict do nothing;
    end loop;

    for v_link in select * from public.inventory_product_suppliers where product_id=p_source_id loop
      delete from public.inventory_product_suppliers where product_id=p_source_id and supplier_id=v_link.supplier_id;
      insert into public.inventory_product_suppliers(product_id,supplier_id,supplier_sku,supplier_description,last_unit_price,last_purchase_at,active,created_at,updated_at)
      values(p_target_id,v_link.supplier_id,v_link.supplier_sku,v_link.supplier_description,v_link.last_unit_price,v_link.last_purchase_at,v_link.active,v_link.created_at,now())
      on conflict(product_id,supplier_id) do update set
        supplier_sku=coalesce(excluded.supplier_sku,inventory_product_suppliers.supplier_sku),
        supplier_description=coalesce(excluded.supplier_description,inventory_product_suppliers.supplier_description),
        last_unit_price=case when coalesce(excluded.last_purchase_at,'epoch')>=coalesce(inventory_product_suppliers.last_purchase_at,'epoch') then excluded.last_unit_price else inventory_product_suppliers.last_unit_price end,
        last_purchase_at=greatest(excluded.last_purchase_at,inventory_product_suppliers.last_purchase_at),active=inventory_product_suppliers.active or excluded.active,updated_at=now();
    end loop;

    for v_media in select * from public.inventory_media where entity_type='PRODUCT' and entity_id=p_source_id order by position loop
      if not exists(select 1 from public.inventory_media where entity_type='PRODUCT' and entity_id=p_target_id and position=v_media.position) then
        update public.inventory_media set entity_id=p_target_id where media_id=v_media.media_id;
      end if;
    end loop;
    update public.inventory_products set status='INATIVO',is_favorite=false,updated_at=now(),version=version+1,
      notes=concat_ws(E'\n',nullif(notes,''),'Mesclado em '||p_target_id||' ('||v_target_name||') em '||to_char(now(),'DD/MM/YYYY HH24:MI')||'.')
      where product_id=p_source_id;
  else
    update public.inventory_invoices set supplier_id=p_target_id,supplier_name=v_target_name where supplier_id=p_source_id;
    update public.inventory_supplier_price_history set supplier_id=p_target_id where supplier_id=p_source_id;
    update public.procurement_offers set supplier_id=p_target_id,supplier_name_snapshot=v_target_name,updated_at=now() where supplier_id=p_source_id;
    update public.procurement_orders set supplier_id=p_target_id,supplier_name_snapshot=v_target_name,updated_at=now() where supplier_id=p_source_id;

    for v_link in select * from public.inventory_product_suppliers where supplier_id=p_source_id loop
      delete from public.inventory_product_suppliers where product_id=v_link.product_id and supplier_id=p_source_id;
      if v_link.supplier_sku is not null and exists(select 1 from public.inventory_product_suppliers where supplier_id=p_target_id and supplier_sku=v_link.supplier_sku and product_id<>v_link.product_id) then
        v_link.supplier_sku:=null;
      end if;
      insert into public.inventory_product_suppliers(product_id,supplier_id,supplier_sku,supplier_description,last_unit_price,last_purchase_at,active,created_at,updated_at)
      values(v_link.product_id,p_target_id,v_link.supplier_sku,v_link.supplier_description,v_link.last_unit_price,v_link.last_purchase_at,v_link.active,v_link.created_at,now())
      on conflict(product_id,supplier_id) do update set
        supplier_sku=coalesce(excluded.supplier_sku,inventory_product_suppliers.supplier_sku),
        supplier_description=coalesce(excluded.supplier_description,inventory_product_suppliers.supplier_description),
        last_unit_price=case when coalesce(excluded.last_purchase_at,'epoch')>=coalesce(inventory_product_suppliers.last_purchase_at,'epoch') then excluded.last_unit_price else inventory_product_suppliers.last_unit_price end,
        last_purchase_at=greatest(excluded.last_purchase_at,inventory_product_suppliers.last_purchase_at),active=inventory_product_suppliers.active or excluded.active,updated_at=now();
    end loop;

    for v_media in select * from public.inventory_media where entity_type='SUPPLIER' and entity_id=p_source_id order by position loop
      if not exists(select 1 from public.inventory_media where entity_type='SUPPLIER' and entity_id=p_target_id and position=v_media.position) then
        update public.inventory_media set entity_id=p_target_id where media_id=v_media.media_id;
      end if;
    end loop;
    update public.inventory_suppliers set status='INATIVO',updated_at=now(),
      notes=concat_ws(E'\n',nullif(notes,''),'Mesclado em '||p_target_id||' ('||v_target_name||') em '||to_char(now(),'DD/MM/YYYY HH24:MI')||'.')
      where supplier_id=p_source_id;
  end if;

  update public.inventory_registry_merges set target_id=p_target_id,target_name=v_target_name
    where entity_type=v_type and target_id=p_source_id;
  insert into public.inventory_registry_merges(entity_type,source_id,target_id,source_name,target_name,merged_by,detail)
  values(v_type,p_source_id,p_target_id,v_source_name,v_target_name,p_actor_email,v_counts);
  return v_detail;
end;
$$;

revoke all on function public.inventory_merge_registry(text,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.inventory_merge_registry(text,text,text,text,boolean) to service_role;

create or replace view public.inventory_stock_current with (security_invoker=true) as
select p.product_id,p.pn,p.description,p.category,p.item_type,p.unit,p.min_stock,p.ideal_stock,p.default_location,p.photo_url,p.status,p.notes,
 coalesce(sum(case when m.movement_type in('ENTRADA','AJUSTE_POSITIVO') then m.quantity when m.movement_type in('SAIDA','AJUSTE_NEGATIVO') then -m.quantity else 0 end),0) balance,
 coalesce(sum(case when m.movement_type='ENTRADA' then m.quantity else 0 end),0) total_in,
 coalesce(sum(case when m.movement_type='SAIDA' then m.quantity else 0 end),0) total_out,max(m.occurred_at) last_movement_at,
 case when coalesce(sum(case when m.movement_type in('ENTRADA','AJUSTE_POSITIVO') then m.quantity when m.movement_type in('SAIDA','AJUSTE_NEGATIVO') then -m.quantity else 0 end),0)<0 then 'NEGATIVO'
      when coalesce(sum(case when m.movement_type in('ENTRADA','AJUSTE_POSITIVO') then m.quantity when m.movement_type in('SAIDA','AJUSTE_NEGATIVO') then -m.quantity else 0 end),0)=0 then 'ZERADO'
      when p.min_stock is not null and p.min_stock>0 and coalesce(sum(case when m.movement_type in('ENTRADA','AJUSTE_POSITIVO') then m.quantity when m.movement_type in('SAIDA','AJUSTE_NEGATIVO') then -m.quantity else 0 end),0)<=p.min_stock then 'BAIXO' else 'OK' end stock_status,
 p.photo_url_2,p.photo_url_3,p.photo_url_4,p.internal_code,p.barcode,p.evidence_required,p.version
from public.inventory_products p
left join (
 select coalesce(r.target_id,m.product_id) product_id,m.movement_type,m.quantity,m.occurred_at from public.inventory_movements m
 left join public.inventory_registry_merges r on r.entity_type='PRODUCT' and r.source_id=m.product_id
) m on m.product_id=p.product_id
where not exists(select 1 from public.inventory_registry_merges r where r.entity_type='PRODUCT' and r.source_id=p.product_id)
group by p.product_id;

create or replace view public.inventory_product_costs with (security_invoker=true) as
select p.product_id,
 coalesce(sum(m.total_value) filter(where m.movement_type='ENTRADA' and m.total_value>0),0) purchase_value_total,
 coalesce(sum(m.quantity) filter(where m.movement_type='ENTRADA' and m.total_value>0),0) purchase_qty_priced,
 case when coalesce(sum(m.quantity) filter(where m.movement_type='ENTRADA' and m.total_value>0),0)>0
      then sum(m.total_value) filter(where m.movement_type='ENTRADA' and m.total_value>0)/sum(m.quantity) filter(where m.movement_type='ENTRADA' and m.total_value>0) end avg_purchase_cost
from public.inventory_products p
left join (
 select coalesce(r.target_id,m.product_id) product_id,m.movement_type,m.quantity,m.total_value from public.inventory_movements m
 left join public.inventory_registry_merges r on r.entity_type='PRODUCT' and r.source_id=m.product_id
) m on m.product_id=p.product_id
where not exists(select 1 from public.inventory_registry_merges r where r.entity_type='PRODUCT' and r.source_id=p.product_id)
group by p.product_id;

create or replace view public.inventory_consumption_30d with (security_invoker=true) as
select p.product_id,p.pn,p.description,
 coalesce(sum(case when m.movement_type='SAIDA' and m.occurred_at>=now()-interval '30 days' then m.quantity else 0 end),0) out_30d,
 coalesce(sum(case when m.movement_type='SAIDA' and m.occurred_at>=now()-interval '30 days' then m.quantity else 0 end),0)/30.0 avg_daily_out,
 ceil((coalesce(sum(case when m.movement_type='SAIDA' and m.occurred_at>=now()-interval '30 days' then m.quantity else 0 end),0)/30.0)*15) suggested_min_15d
from public.inventory_products p
left join (
 select coalesce(r.target_id,m.product_id) product_id,m.movement_type,m.quantity,m.occurred_at from public.inventory_movements m
 left join public.inventory_registry_merges r on r.entity_type='PRODUCT' and r.source_id=m.product_id
) m on m.product_id=p.product_id
where not exists(select 1 from public.inventory_registry_merges r where r.entity_type='PRODUCT' and r.source_id=p.product_id)
group by p.product_id,p.pn,p.description;

