create or replace view public.inventory_stock_current with (security_invoker=true) as
select p.product_id,p.pn,p.description,p.category,p.item_type,p.unit,p.min_stock,p.ideal_stock,p.default_location,
       p.photo_url,p.status,p.notes,
       coalesce(sum(case when m.movement_type in ('ENTRADA','AJUSTE_POSITIVO') then m.quantity
                         when m.movement_type in ('SAIDA','AJUSTE_NEGATIVO') then -m.quantity else 0 end),0) balance,
       coalesce(sum(case when m.movement_type='ENTRADA' then m.quantity else 0 end),0) total_in,
       coalesce(sum(case when m.movement_type='SAIDA' then m.quantity else 0 end),0) total_out,
       max(m.occurred_at) last_movement_at,
       case when coalesce(sum(case when m.movement_type in ('ENTRADA','AJUSTE_POSITIVO') then m.quantity when m.movement_type in ('SAIDA','AJUSTE_NEGATIVO') then -m.quantity else 0 end),0)<0 then 'NEGATIVO'
            when coalesce(sum(case when m.movement_type in ('ENTRADA','AJUSTE_POSITIVO') then m.quantity when m.movement_type in ('SAIDA','AJUSTE_NEGATIVO') then -m.quantity else 0 end),0)=0 then 'ZERADO'
            when p.min_stock is not null and p.min_stock>0 and coalesce(sum(case when m.movement_type in ('ENTRADA','AJUSTE_POSITIVO') then m.quantity when m.movement_type in ('SAIDA','AJUSTE_NEGATIVO') then -m.quantity else 0 end),0)<=p.min_stock then 'BAIXO'
            else 'OK' end stock_status,
       p.photo_url_2,p.photo_url_3,p.photo_url_4,p.internal_code,p.barcode,p.evidence_required,p.version
from public.inventory_products p left join public.inventory_movements m on m.product_id=p.product_id
group by p.product_id;

update public.portal_apps a set actions=(
 select jsonb_agg(x order by x->>'key') from (
  select distinct on (v->>'key') v x from jsonb_array_elements(coalesce(a.actions,'[]'::jsonb) ||
   '[{"key":"estoque.importar_nfe","label":"Importar NF-e"},{"key":"estoque.estornar","label":"Estornar movimentação"},{"key":"estoque.visualizar_auditoria","label":"Visualizar auditoria"},{"key":"estoque.gerenciar_fotos","label":"Gerenciar fotos"},{"key":"estoque.analisar_consumo","label":"Analisar consumo"}]'::jsonb) v
  order by v->>'key'
 ) d
) where key='estoque';

insert into public.inventory_deployment_snapshots(label,products,movements,balance,negative_products,detail)
select 'after_inventory_v2_schema_20260903',count(*),(select count(*) from public.inventory_movements),
       coalesce(sum(balance),0),count(*) filter(where balance<0),
       jsonb_build_object('phase','schema') from public.inventory_stock_current
on conflict(label) do nothing;
