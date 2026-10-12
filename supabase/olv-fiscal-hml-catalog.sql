-- Add only the new module. No changes to existing apps, users, fiscal records or Access.
insert into public.portal_apps
  (key,title,description,icon,eyebrow,href,active,audience,audience_types,companies,actions,sort_order)
values
  ('olv-fiscal','OLV Fiscal · Testes',
   'Rascunhos de venda e devolução, cadastros e revisão em ambiente isolado.',
   '▤','Fiscal · Homologação','./olv-fiscal/index.html?v=0.1.0-hml',true,'INTERNO','["INTERNO"]'::jsonb,
   '["LIVION","RHCS"]'::jsonb,
   '[{"key":"olv-fiscal.visualizar","label":"Consultar rascunhos e histórico de testes"},
     {"key":"olv-fiscal.editar_rascunhos","label":"Criar e editar rascunhos de testes"},
     {"key":"olv-fiscal.revisar","label":"Revisar e arquivar rascunhos de testes"},
     {"key":"olv-fiscal.cadastros","label":"Administrar cadastros de testes"},
     {"key":"olv-fiscal.exportar","label":"Exportar a base de testes"}]'::jsonb,70)
on conflict (key) do nothing;
