-- Extend the existing entity classification. Existing rows, RLS and grants remain intact.
alter table public.portal_entities drop constraint portal_entities_entity_type_check;
alter table public.portal_entities add constraint portal_entities_entity_type_check
  check (entity_type in ('EMPRESA','CLIENTE','PARCEIRO'));

insert into public.portal_entities(key,entity_type,name,notes,active)
values('PARCEIROS','PARCEIRO','Parceiros','Contadores, prestadores e parceiros externos. Apps e empresas autorizados individualmente.',true)
on conflict(key) do nothing;

-- One statement gives exports a consistent position, without pagination loss.
-- Reuse the inventory app's existing cost criterion; do not invent missing costs.
create or replace function public.finance_inventory_accounting()
returns jsonb language sql stable security invoker
set search_path = public, pg_temp
as $function$
 select jsonb_build_object(
   'collected_at',statement_timestamp(),
   'source','Controle de Estoque do Portal Livion',
   'company','LIVION',
   'method','Posição existente do Controle de Estoque: saldo × custo médio das entradas de compra precificadas. Valor estimado; custos ausentes permanecem nulos.',
   'rows',coalesce(jsonb_agg(jsonb_build_object(
     'product_id',p.product_id,'pn',p.pn,'description',p.description,'category',p.category,
     'unit',p.unit,'balance',p.balance,'stock_status',p.stock_status,'default_location',p.default_location,
     'avg_purchase_cost',p.avg_purchase_cost,'estimated_stock_value',p.estimated_stock_value,
     'last_movement_at',p.last_movement_at
   ) order by p.description,p.product_id),'[]'::jsonb))
 from public.inventory_accounting_position p;
$function$;
revoke all on function public.finance_inventory_accounting() from public,anon,authenticated;
grant execute on function public.finance_inventory_accounting() to service_role;
comment on function public.finance_inventory_accounting() is
 'Private read-only accounting export. finance-api validates Portal app/action and LIVION company scope before invoking. No inventory writes.';
