-- Padroniza as unidades do cadastro sem alterar quantidades ou o histórico fiscal.
update public.inventory_products
set unit = case upper(btrim(unit))
  when 'UN' then 'UNIDADE'
  when 'PC' then 'PEÇA'
  when 'KG' then 'QUILOGRAMA'
  when 'LT' then 'LITRO'
  else upper(btrim(unit))
end
where nullif(btrim(unit), '') is not null;

insert into public.inventory_catalog_options(option_type, value, sort_order, active)
values
  ('UNIT', 'UNIDADE', 10, true),
  ('UNIT', 'PEÇA', 20, true),
  ('UNIT', 'QUILOGRAMA', 40, true),
  ('UNIT', 'LITRO', 50, true)
on conflict(option_type, value) do update set active = true;

update public.inventory_catalog_options
set active = false
where option_type = 'UNIT'
  and upper(btrim(value)) in ('UN', 'PC', 'KG', 'LT');
