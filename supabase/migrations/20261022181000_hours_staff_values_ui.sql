update public.portal_apps
set href = 'https://portal.livionsolutions.com.br/horas-producao.html?v=5',
    updated_at = now()
where key = 'horas-producao'
  and href = 'https://portal.livionsolutions.com.br/horas-producao.html?v=4';
