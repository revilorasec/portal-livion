-- Service-only RPC: register the base quantity, packaging snapshot and FIFO use
-- together. Never UPDATE an existing inventory movement.
create or replace function public.inventory_register_dispatch_exit(
  p_product_id text,
  p_dispatch_quantity numeric,
  p_actor_email text,
  p_idempotency_key uuid,
  p_requester_id text default null,
  p_document_number text default null,
  p_notes text default null,
  p_purpose text default 'CONSUMO_INTERNO',
  p_occurred_at timestamptz default null
) returns public.inventory_movements
language plpgsql security invoker
set search_path = public, pg_temp
as $$
declare
  v_product public.inventory_products;
  v_row public.inventory_movements;
  v_balance numeric;
  v_quantity numeric;
  v_needed numeric;
  v_take numeric;
  v_lot record;
  v_occurred_at timestamptz := coalesce(p_occurred_at, now());
begin
  if p_dispatch_quantity is null or p_dispatch_quantity::text in ('NaN','Infinity','-Infinity')
     or p_dispatch_quantity <= 0 or trunc(p_dispatch_quantity) <> p_dispatch_quantity then
    raise exception 'INVALID_DISPATCH_QUANTITY';
  end if;
  if p_idempotency_key is null then raise exception 'INVALID_IDEMPOTENCY_KEY'; end if;
  if nullif(trim(p_actor_email), '') is null then raise exception 'INVALID_ACTOR'; end if;
  if v_occurred_at > now() + interval '5 minutes' then raise exception 'INVALID_OCCURRED_AT'; end if;

  -- Same lock as inventory_register_movement, including ordinary exits.
  perform pg_advisory_xact_lock(hashtextextended(p_product_id, 0));
  select * into v_product from public.inventory_products where product_id = p_product_id for update;
  if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
  if nullif(trim(v_product.dispatch_unit), '') is null or v_product.base_quantity_per_dispatch_unit is null
     or v_product.base_quantity_per_dispatch_unit::text in ('NaN','Infinity','-Infinity')
     or v_product.base_quantity_per_dispatch_unit <= 0 then
    raise exception 'DISPATCH_NOT_CONFIGURED';
  end if;
  v_quantity := round(p_dispatch_quantity * v_product.base_quantity_per_dispatch_unit, 6);
  if v_quantity <= 0 then raise exception 'INVALID_DISPATCH_QUANTITY'; end if;

  -- Replay before checking current stock: the previous call may have used the last roll.
  select * into v_row from public.inventory_movements where idempotency_key = p_idempotency_key;
  if found then
    if v_row.product_id <> p_product_id or v_row.movement_type <> 'SAIDA'
       or v_row.user_email is distinct from p_actor_email
       or v_row.requester_id is distinct from p_requester_id
       or (v_row.dispatch_quantity is not null and v_row.dispatch_quantity <> p_dispatch_quantity)
       or (v_row.dispatch_quantity is null and v_row.quantity <> v_quantity) then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;
    return v_row;
  end if;

  select coalesce(sum(case when movement_type in ('ENTRADA','AJUSTE_POSITIVO') then quantity
    when movement_type in ('SAIDA','AJUSTE_NEGATIVO') then -quantity else 0 end), 0)
    into v_balance from public.inventory_movements where product_id = p_product_id;
  if v_balance < v_quantity then raise exception 'INSUFFICIENT_STOCK'; end if;

  insert into public.inventory_movements (
    movement_id, occurred_at, movement_type, product_id, quantity, requester_id,
    document_number, notes, user_email, source, purpose, idempotency_key, recorded_at,
    dispatch_quantity, dispatch_unit, base_quantity_per_dispatch_unit
  ) values (
    gen_random_uuid(), v_occurred_at, 'SAIDA', p_product_id, v_quantity, p_requester_id,
    p_document_number, p_notes, p_actor_email, 'PORTAL', p_purpose, p_idempotency_key, now(),
    p_dispatch_quantity, v_product.dispatch_unit, v_product.base_quantity_per_dispatch_unit
  ) returning * into v_row;

  v_needed := v_quantity;
  for v_lot in select lot_id, quantity_remaining from public.inventory_lots
    where product_id = p_product_id and quantity_remaining > 0
    order by received_at, created_at, lot_id for update loop
    exit when v_needed <= 0;
    v_take := least(v_needed, v_lot.quantity_remaining);
    update public.inventory_lots set quantity_remaining = quantity_remaining - v_take where lot_id = v_lot.lot_id;
    insert into public.inventory_lot_allocations(exit_movement_id, lot_id, quantity)
      values (v_row.movement_id, v_lot.lot_id, v_take);
    v_needed := v_needed - v_take;
  end loop;
  if v_needed > 0 then raise exception 'FIFO_BALANCE_INCONSISTENT'; end if;
  return v_row;
end;
$$;

revoke all on function public.inventory_register_dispatch_exit(text,numeric,text,uuid,text,text,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.inventory_register_dispatch_exit(text,numeric,text,uuid,text,text,text,text,timestamptz) to service_role;
