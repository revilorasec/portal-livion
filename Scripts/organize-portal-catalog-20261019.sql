-- Navegação por função, com a identidade do cliente separada do nome do app.
-- Mantém chaves, permissões, usuários e dados operacionais intactos.
begin;

update public.portal_apps
set title='Status de Reparos',
    description='Acompanhamento em tempo real de etapas, prazos e devoluções.',
    eyebrow='Clientes · Claro',
    href='./cliente-claro.html?v=8',
    updated_at=now()
where key='reparos-claro';

update public.portal_apps
set title='Desempenho Técnico',
    description='Indicadores de produção, reparabilidade e bônus com filtros por cliente.',
    eyebrow='Pessoas & Gestão',
    href='./desempenho-funcionarios/index.html?v=12',
    updated_at=now()
where key='desempenho-funcionarios';

update public.portal_apps
set title='Checklist de Requisitos',
    description='Requisitos, responsáveis e classificação de atendimento em propostas.',
    eyebrow='Clientes · V.Tal',
    href='https://portal.livionsolutions.com.br/vtal.html?v=2',
    updated_at=now()
where key='vtal';

update public.portal_apps
set active=false,updated_at=now()
where key='painel-executivo-nokia';

commit;
