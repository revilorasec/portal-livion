create table if not exists public.inventory_lots(
  lot_id uuid primary key default gen_random_uuid(),
  product_id text not null references public.inventory_products(product_id),
  source_movement_id text unique references public.inventory_movements(movement_id),
  invoice_item_id uuid references public.inventory_invoice_items(item_id),
  received_at timestamptz not null,
  quantity_received numeric not null check(quantity_received>0),
  quantity_remaining numeric not null check(quantity_remaining>=0 and quantity_remaining<=quantity_received),
  unit_cost numeric,
  source text not null default 'ENTRY',
  created_at timestamptz not null default now()
);
alter table public.inventory_lots enable row level security;
create index if not exists inventory_lots_fifo_idx on public.inventory_lots(product_id,received_at,created_at) where quantity_remaining>0;

create table if not exists public.inventory_lot_allocations(
  allocation_id uuid primary key default gen_random_uuid(),
  exit_movement_id text not null references public.inventory_movements(movement_id),
  lot_id uuid not null references public.inventory_lots(lot_id),
  quantity numeric not null check(quantity>0),
  created_at timestamptz not null default now(),
  unique(exit_movement_id,lot_id)
);
alter table public.inventory_lot_allocations enable row level security;
create index if not exists inventory_lot_allocations_lot_idx on public.inventory_lot_allocations(lot_id);

-- O histórico importado não contém lotes individuais. Cria um lote inicial conciliado,
-- preservando integralmente o saldo atual e permitindo FIFO daqui em diante.
insert into public.inventory_lots(product_id,received_at,quantity_received,quantity_remaining,unit_cost,source)
select s.product_id,coalesce(s.last_movement_at,'2000-01-01'::timestamptz),s.balance,s.balance,c.avg_purchase_cost,'LEGACY_OPENING_BALANCE'
from public.inventory_stock_current s left join public.inventory_product_costs c using(product_id)
where s.balance>0 and not exists(select 1 from public.inventory_lots l where l.product_id=s.product_id)
on conflict do nothing;

create or replace function public.inventory_register_movement(
  p_movement_type text,p_product_id text,p_quantity numeric,p_actor_email text,p_idempotency_key uuid,
  p_total_value numeric default null,p_unit_value numeric default null,p_requester_id text default null,
  p_supplier_id text default null,p_document_number text default null,p_notes text default null,
  p_from_location text default null,p_to_location text default null,p_purpose text default null,
  p_source text default 'PORTAL',p_reversal_of text default null,p_reference_type text default null,
  p_reference_id text default null
) returns public.inventory_movements language plpgsql security definer set search_path=public as $$
declare v_balance numeric;v_row public.inventory_movements;v_original public.inventory_movements;v_needed numeric;v_take numeric;v_lot record;
begin
 if p_quantity is null or p_quantity<=0 then raise exception 'INVALID_QUANTITY';end if;
 if p_movement_type not in('ENTRADA','SAIDA','AJUSTE_POSITIVO','AJUSTE_NEGATIVO','TRANSFERENCIA') then raise exception 'INVALID_MOVEMENT_TYPE';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_product_id,0));
 if not exists(select 1 from public.inventory_products where product_id=p_product_id) then raise exception 'PRODUCT_NOT_FOUND';end if;
 if p_idempotency_key is not null then select * into v_row from public.inventory_movements where idempotency_key=p_idempotency_key;if found then return v_row;end if;end if;
 if p_reversal_of is not null then select * into v_original from public.inventory_movements where movement_id=p_reversal_of;if not found then raise exception 'MOVEMENT_NOT_FOUND';end if;if exists(select 1 from public.inventory_movements where reversal_of=p_reversal_of)then raise exception 'MOVEMENT_ALREADY_REVERSED';end if;end if;
 select coalesce(sum(case when movement_type in('ENTRADA','AJUSTE_POSITIVO')then quantity when movement_type in('SAIDA','AJUSTE_NEGATIVO')then -quantity else 0 end),0) into v_balance from public.inventory_movements where product_id=p_product_id;
 if p_movement_type in('SAIDA','AJUSTE_NEGATIVO')and v_balance<p_quantity then raise exception 'INSUFFICIENT_STOCK';end if;
 insert into public.inventory_movements(movement_id,occurred_at,movement_type,product_id,quantity,total_value,unit_value,requester_id,supplier_id,document_number,notes,user_email,source,from_location,to_location,purpose,idempotency_key,reversal_of,reference_type,reference_id,recorded_at)
 values(gen_random_uuid(),now(),p_movement_type,p_product_id,p_quantity,p_total_value,p_unit_value,p_requester_id,p_supplier_id,p_document_number,p_notes,p_actor_email,p_source,p_from_location,p_to_location,p_purpose,p_idempotency_key,p_reversal_of,p_reference_type,p_reference_id,now())returning * into v_row;
 if p_movement_type='ENTRADA' then
  insert into public.inventory_lots(product_id,source_movement_id,received_at,quantity_received,quantity_remaining,unit_cost,source)
  values(p_product_id,v_row.movement_id,v_row.occurred_at,p_quantity,p_quantity,coalesce(p_unit_value,case when p_total_value is not null then p_total_value/p_quantity end),'ENTRY');
 elsif p_movement_type in('SAIDA','AJUSTE_NEGATIVO') then
  v_needed:=p_quantity;
  for v_lot in select lot_id,quantity_remaining from public.inventory_lots where product_id=p_product_id and quantity_remaining>0 order by received_at,created_at,lot_id for update loop
   exit when v_needed<=0;v_take:=least(v_needed,v_lot.quantity_remaining);
   update public.inventory_lots set quantity_remaining=quantity_remaining-v_take where lot_id=v_lot.lot_id;
   insert into public.inventory_lot_allocations(exit_movement_id,lot_id,quantity)values(v_row.movement_id,v_lot.lot_id,v_take);
   v_needed:=v_needed-v_take;
  end loop;
  if v_needed>0 then raise exception 'FIFO_BALANCE_INCONSISTENT';end if;
 end if;
 return v_row;
end $$;
revoke all on function public.inventory_register_movement(text,text,numeric,text,uuid,numeric,numeric,text,text,text,text,text,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.inventory_register_movement(text,text,numeric,text,uuid,numeric,numeric,text,text,text,text,text,text,text,text,text,text,text) to service_role;

create or replace view public.inventory_invoice_details with(security_invoker=true)as
select i.invoice_id,i.access_key,i.invoice_number,i.issued_at,i.total_value,i.status,i.supplier_id,
       s.name supplier_name,s.document supplier_document,i.object_path,i.imported_by,i.confirmed_at,i.created_at,
       coalesce(jsonb_agg(jsonb_build_object('item_id',ii.item_id,'line_number',ii.line_number,'supplier_sku',ii.supplier_sku,
       'description',ii.description,'quantity',ii.quantity,'unit',ii.unit,'unit_price',ii.unit_price,'total_value',ii.total_value,
       'product_id',ii.product_id,'movement_id',ii.movement_id,'remaining',l.quantity_remaining))filter(where ii.item_id is not null),'[]'::jsonb) items
from public.inventory_invoices i left join public.inventory_suppliers s on s.supplier_id=i.supplier_id
left join public.inventory_invoice_items ii on ii.invoice_id=i.invoice_id
left join public.inventory_lots l on l.invoice_item_id=ii.item_id
group by i.invoice_id,s.name,s.document;
