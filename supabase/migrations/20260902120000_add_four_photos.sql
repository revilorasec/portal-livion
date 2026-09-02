alter table public.inventory_products add column if not exists photo_url_2 text, add column if not exists photo_url_3 text, add column if not exists photo_url_4 text;
alter table public.inventory_requesters add column if not exists photo_url_2 text, add column if not exists photo_url_3 text, add column if not exists photo_url_4 text;
alter table public.inventory_suppliers add column if not exists photo_url text, add column if not exists photo_url_2 text, add column if not exists photo_url_3 text, add column if not exists photo_url_4 text;
alter table public.portal_users add column if not exists photo_url_2 text, add column if not exists photo_url_3 text, add column if not exists photo_url_4 text;
create or replace view public.inventory_stock_current with (security_invoker = true) as
select p.product_id,p.pn,p.description,p.category,p.item_type,p.unit,p.min_stock,p.ideal_stock,p.default_location,p.photo_url,p.status,p.notes,
coalesce(sum(case when m.movement_type in ('ENTRADA','AJUSTE_POSITIVO') then m.quantity when m.movement_type in ('SAIDA','AJUSTE_NEGATIVO') then -m.quantity else 0 end),0) balance,
coalesce(sum(case when m.movement_type='ENTRADA' then m.quantity else 0 end),0) total_in,
coalesce(sum(case when m.movement_type='SAIDA' then m.quantity else 0 end),0) total_out,max(m.occurred_at) last_movement_at,
case when coalesce(sum(case when m.movement_type in ('ENTRADA','AJUSTE_POSITIVO') then m.quantity when m.movement_type in ('SAIDA','AJUSTE_NEGATIVO') then -m.quantity else 0 end),0)<0 then 'NEGATIVO'
when coalesce(sum(case when m.movement_type in ('ENTRADA','AJUSTE_POSITIVO') then m.quantity when m.movement_type in ('SAIDA','AJUSTE_NEGATIVO') then -m.quantity else 0 end),0)=0 then 'ZERADO'
when p.min_stock is not null and p.min_stock>0 and coalesce(sum(case when m.movement_type in ('ENTRADA','AJUSTE_POSITIVO') then m.quantity when m.movement_type in ('SAIDA','AJUSTE_NEGATIVO') then -m.quantity else 0 end),0)<=p.min_stock then 'BAIXO' else 'OK' end stock_status,
p.photo_url_2,p.photo_url_3,p.photo_url_4
from public.inventory_products p left join public.inventory_movements m on m.product_id=p.product_id group by p.product_id;
