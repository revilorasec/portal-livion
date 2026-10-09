
CREATE OR REPLACE FUNCTION public.inventory_register_movement(
  p_movement_type text,
  p_product_id text,
  p_quantity numeric,
  p_actor_email text,
  p_idempotency_key uuid,
  p_total_value numeric DEFAULT NULL::numeric,
  p_unit_value numeric DEFAULT NULL::numeric,
  p_requester_id text DEFAULT NULL::text,
  p_supplier_id text DEFAULT NULL::text,
  p_document_number text DEFAULT NULL::text,
  p_notes text DEFAULT NULL::text,
  p_from_location text DEFAULT NULL::text,
  p_to_location text DEFAULT NULL::text,
  p_purpose text DEFAULT NULL::text,
  p_source text DEFAULT 'PORTAL'::text,
  p_reversal_of text DEFAULT NULL::text,
  p_reference_type text DEFAULT NULL::text,
  p_reference_id text DEFAULT NULL::text,
  p_occurred_at timestamp with time zone DEFAULT NULL::timestamp with time zone
)
RETURNS public.inventory_movements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  if p_movement_type in('ENTRADA','AJUSTE_POSITIVO') then
    insert into public.inventory_lots(product_id,source_movement_id,received_at,quantity_received,quantity_remaining,unit_cost,source)
    values(p_product_id,v_row.movement_id,v_row.occurred_at,p_quantity,p_quantity,
      coalesce(p_unit_value,case when p_total_value is not null then p_total_value/p_quantity end),
      case when p_movement_type='ENTRADA' then 'ENTRY' else 'POSITIVE_ADJUSTMENT' end);
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
end
$function$;

CREATE TEMPORARY TABLE inventory_fifo_reconciliation_snapshot ON COMMIT DROP AS
WITH movement_balances AS (
  SELECT p.product_id,
    COALESCE(SUM(CASE
      WHEN m.movement_type IN ('ENTRADA','AJUSTE_POSITIVO') THEN m.quantity
      WHEN m.movement_type IN ('SAIDA','AJUSTE_NEGATIVO') THEN -m.quantity
      ELSE 0 END),0)::numeric AS movement_balance
  FROM public.inventory_products p
  LEFT JOIN public.inventory_movements m ON m.product_id=p.product_id
  GROUP BY p.product_id
),
lot_balances AS (
  SELECT p.product_id,COALESCE(SUM(l.quantity_remaining),0)::numeric AS fifo_balance
  FROM public.inventory_products p
  LEFT JOIN public.inventory_lots l ON l.product_id=p.product_id
  GROUP BY p.product_id
)
SELECT m.product_id,m.movement_balance,l.fifo_balance,
       (m.movement_balance-l.fifo_balance)::numeric AS delta
FROM movement_balances m
JOIN lot_balances l USING(product_id)
WHERE m.movement_balance<>l.fifo_balance;

INSERT INTO public.inventory_lots(
  product_id,source_movement_id,invoice_item_id,received_at,
  quantity_received,quantity_remaining,unit_cost,source
)
SELECT product_id,NULL,NULL,now(),delta,delta,NULL,'BALANCE_RECONCILIATION_2026_10_09'
FROM inventory_fifo_reconciliation_snapshot
WHERE delta>0;

DO $reconcile$
DECLARE
  r record;
  l record;
  v_needed numeric;
  v_take numeric;
BEGIN
  FOR r IN
    SELECT product_id,-delta AS excess
    FROM inventory_fifo_reconciliation_snapshot
    WHERE delta<0
  LOOP
    v_needed:=r.excess;
    FOR l IN
      SELECT lot_id,quantity_remaining
      FROM public.inventory_lots
      WHERE product_id=r.product_id AND quantity_remaining>0
      ORDER BY received_at DESC,created_at DESC,lot_id DESC
      FOR UPDATE
    LOOP
      EXIT WHEN v_needed<=0;
      v_take:=least(v_needed,l.quantity_remaining);
      UPDATE public.inventory_lots
      SET quantity_remaining=quantity_remaining-v_take
      WHERE lot_id=l.lot_id;
      v_needed:=v_needed-v_take;
    END LOOP;
    IF v_needed>0 THEN
      RAISE EXCEPTION 'FIFO_RECONCILIATION_EXCESS_FAILED:%',r.product_id;
    END IF;
  END LOOP;
END
$reconcile$;

INSERT INTO public.access_audit(actor_email,action,target,detail)
SELECT
  'sistema@livionsolutions.com.br',
  'INVENTORY_FIFO_RECONCILIATION',
  product_id,
  jsonb_build_object(
    'movement_balance',movement_balance,
    'fifo_balance_before',fifo_balance,
    'adjustment',delta,
    'reason','Reconciliacao da fila FIFO com o saldo contabil das movimentacoes',
    'performed_at','2026-10-09'
  )
FROM inventory_fifo_reconciliation_snapshot;

DO $validate$
BEGIN
  IF EXISTS(
    WITH movement_balances AS (
      SELECT p.product_id,
        COALESCE(SUM(CASE
          WHEN m.movement_type IN ('ENTRADA','AJUSTE_POSITIVO') THEN m.quantity
          WHEN m.movement_type IN ('SAIDA','AJUSTE_NEGATIVO') THEN -m.quantity
          ELSE 0 END),0)::numeric AS balance
      FROM public.inventory_products p
      LEFT JOIN public.inventory_movements m ON m.product_id=p.product_id
      GROUP BY p.product_id
    ),
    lot_balances AS (
      SELECT p.product_id,COALESCE(SUM(l.quantity_remaining),0)::numeric AS balance
      FROM public.inventory_products p
      LEFT JOIN public.inventory_lots l ON l.product_id=p.product_id
      GROUP BY p.product_id
    )
    SELECT 1
    FROM movement_balances m
    JOIN lot_balances l USING(product_id)
    WHERE m.balance<>l.balance
  ) THEN
    RAISE EXCEPTION 'FIFO_RECONCILIATION_VALIDATION_FAILED';
  END IF;
END
$validate$;
