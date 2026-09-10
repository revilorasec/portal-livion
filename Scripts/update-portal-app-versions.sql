-- Atualiza somente os endereços versionados usados pelo catálogo do Portal.
-- É idempotente e não altera permissões, usuários ou dados operacionais.
update public.portal_apps
set href = case key
  when 'rh' then 'https://revilorasec.github.io/rh-livion/?v=1.8.4'
  when 'fretes' then 'https://revilorasec.github.io/fretes-livion/?v=1.3.6'
  when 'reparos-claro' then './cliente-claro.html?v=7'
  when 'estoque' then 'https://portal.livionsolutions.com.br/estoque.html?v=4'
  when 'despesas-reembolsos' then 'https://portal.livionsolutions.com.br/despesas-reembolsos-v2.html?v=20'
  else href
end,
updated_at = now()
where key in ('rh', 'fretes', 'reparos-claro', 'estoque', 'despesas-reembolsos');
