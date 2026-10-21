-- Run only when the new frontend, backend, sources and models are homologated.
-- Registering actions does not grant them to any existing user.
insert into public.portal_apps(key,title,description,icon,eyebrow,href,active,audience,audience_types,companies,actions,sort_order)
values('expedicao','Expedição e Romaneios','Notas, caixas, pesagem e romaneios Nokia e Claro.','▣','Operações & Logística','./expedicao/index.html?v=5',true,'INTERNO','["INTERNO"]','["LIVION","RHCS"]',
'[{"key":"expedicao.visualizar","label":"Consultar notas e expedições"},{"key":"expedicao.nokia.acessar","label":"Acessar expedição Nokia"},{"key":"expedicao.claro.acessar","label":"Acessar expedição Claro"},{"key":"expedicao.editar_rascunho","label":"Editar rascunhos"},{"key":"expedicao.gravar_caixas","label":"Gravar caixas no BD"},{"key":"expedicao.gerar_romaneio","label":"Gerar romaneios e concluir expedições"}]',35)
on conflict(key) do nothing;
