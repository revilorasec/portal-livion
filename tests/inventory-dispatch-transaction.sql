-- Verify against the real schema using only temporary, rolled-back inventory.
begin;
set local role service_role;
do $$
declare
  v_product text := 'TEST-DISPATCH-' || gen_random_uuid()::text;
  v_key uuid := gen_random_uuid();
  v_second_key uuid := gen_random_uuid();
  v_first public.inventory_movements;
  v_replay public.inventory_movements;
  v_second public.inventory_movements;
  v_count bigint;
begin
  insert into public.inventory_products(product_id,pn,description,unit,dispatch_unit,base_quantity_per_dispatch_unit)
    values(v_product,v_product,'Rolled-back dispatch regression test','QUILOGRAMA','ROLINHO',0.5);
  perform public.inventory_register_movement('ENTRADA',v_product,1,'dispatch-test@example.invalid',gen_random_uuid());
  v_first := public.inventory_register_dispatch_exit(v_product,1,'dispatch-test@example.invalid',v_key);
  if v_first.quantity <> 0.5 or v_first.dispatch_quantity <> 1 or v_first.dispatch_unit <> 'ROLINHO'
     or v_first.base_quantity_per_dispatch_unit <> 0.5 then raise exception 'TEST_METADATA_FAILED'; end if;
  v_replay := public.inventory_register_dispatch_exit(v_product,1,'dispatch-test@example.invalid',v_key);
  if v_replay.movement_id <> v_first.movement_id then raise exception 'TEST_REPLAY_FAILED'; end if;
  v_second := public.inventory_register_dispatch_exit(v_product,1,'dispatch-test@example.invalid',v_second_key);
  -- Retrying the last roll must succeed with a zero balance and no new movement.
  v_replay := public.inventory_register_dispatch_exit(v_product,1,'dispatch-test@example.invalid',v_second_key);
  if v_replay.movement_id <> v_second.movement_id then raise exception 'TEST_ZERO_BALANCE_REPLAY_FAILED'; end if;
  if (select count(*) from public.inventory_movements where product_id=v_product) <> 3
     or (select sum(quantity_remaining) from public.inventory_lots where product_id=v_product) <> 0
     or (select sum(quantity) from public.inventory_lot_allocations where exit_movement_id in (v_first.movement_id,v_second.movement_id)) <> 1
     then raise exception 'TEST_STOCK_OR_FIFO_FAILED'; end if;
  begin
    perform public.inventory_register_dispatch_exit(v_product,1,'dispatch-test@example.invalid',gen_random_uuid());
    raise exception 'TEST_EXPECTED_INSUFFICIENT_STOCK';
  exception when others then if sqlerrm <> 'INSUFFICIENT_STOCK' then raise; end if; end;
  begin
    perform public.inventory_register_dispatch_exit(v_product,0.5,'dispatch-test@example.invalid',gen_random_uuid());
    raise exception 'TEST_EXPECTED_INVALID_QUANTITY';
  exception when others then if sqlerrm <> 'INVALID_DISPATCH_QUANTITY' then raise; end if; end;
  begin
    perform public.inventory_register_dispatch_exit(v_product,2,'dispatch-test@example.invalid',v_key);
    raise exception 'TEST_EXPECTED_IDEMPOTENCY_CONFLICT';
  exception when others then if sqlerrm <> 'IDEMPOTENCY_CONFLICT' then raise; end if; end;
  begin
    update public.inventory_movements set notes='must remain immutable' where movement_id=v_first.movement_id;
    raise exception 'TEST_EXPECTED_IMMUTABILITY';
  exception when sqlstate '55000' then null; end;

  -- Deliberately incomplete FIFO only in this rolled-back fixture.
  insert into public.inventory_movements(movement_id,product_id,movement_type,quantity,user_email,source)
    values(gen_random_uuid(),v_product,'ENTRADA',0.5,'dispatch-test@example.invalid','PORTAL');
  select count(*) into v_count from public.inventory_movements where product_id=v_product;
  begin
    perform public.inventory_register_dispatch_exit(v_product,1,'dispatch-test@example.invalid',gen_random_uuid());
    raise exception 'TEST_EXPECTED_FIFO_FAILURE';
  exception when others then if sqlerrm <> 'FIFO_BALANCE_INCONSISTENT' then raise; end if; end;
  if (select count(*) from public.inventory_movements where product_id=v_product) <> v_count then
    raise exception 'TEST_PARTIAL_MOVEMENT_COMMITTED';
  end if;
end;
$$;
rollback;
select 'PASS: metadata, FIFO, retries at zero stock, validation, immutability and rollback' as verification;
