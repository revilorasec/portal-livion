update public.portal_apps
set title = 'Hora Extra',
    href = 'https://portal.livionsolutions.com.br/horas-producao.html?v=4',
    updated_at = now()
where key = 'horas-producao';
