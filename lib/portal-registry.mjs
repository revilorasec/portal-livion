export const APP_REGISTRY = [
  {
    key: 'rh',
    icon: '👥',
    eyebrow: 'Pessoas & Cultura',
    title: 'Recursos Humanos',
    description: 'Colaboradores, documentos, projetos e informações da equipe.',
    href: 'https://revilorasec.github.io/rh-livion/?v=1.8.2',
    companies: ['LIVION', 'RHCS'],
    actions: [
      { key: 'rh.visualizar_dados_basicos', label: 'Visualizar dados básicos' },
      { key: 'rh.visualizar_salarios', label: 'Visualizar salários' },
      { key: 'rh.visualizar_dados_bancarios', label: 'Visualizar dados bancários' },
      { key: 'rh.editar_funcionarios', label: 'Editar funcionários' },
    ],
  },
  {
    key: 'fretes',
    icon: '🚚',
    eyebrow: 'Operações & Logística',
    title: 'Transportadora',
    description: 'Cotações, propostas, coletas, entregas e acompanhamento operacional.',
    href: 'https://revilorasec.github.io/fretes-livion/?v=1.3.5',
    companies: ['LIVION'],
    actions: [
      { key: 'fretes.visualizar_valores', label: 'Visualizar valores de frete' },
      { key: 'fretes.criar_cotacao', label: 'Criar cotação' },
      { key: 'fretes.editar_cotacao', label: 'Editar cotação' },
      { key: 'fretes.aprovar_cotacao', label: 'Aprovar cotação' },
      { key: 'fretes.excluir_registro', label: 'Excluir registros' },
    ],
  },
  {
    key: 'despesas-reembolsos',
    icon: '💳',
    eyebrow: 'Financeiro & Gestão',
    title: 'Despesas e Reembolsos',
    description: 'Despesas empresariais pagas com recursos pessoais, aprovações e reembolsos.',
    href: 'https://portal.livionsolutions.com.br/despesas-reembolsos.html?v=1',
    companies: ['LIVION', 'RHCS'],
    actions: [
      { key: 'despesas.visualizar', label: 'Visualizar despesas e reembolsos' },
      { key: 'despesas.criar', label: 'Criar despesas' },
      { key: 'despesas.aprovar', label: 'Aprovar, recusar e solicitar ajustes' },
      { key: 'despesas.reembolsar', label: 'Registrar reembolsos' },
      { key: 'despesas.exportar', label: 'Exportar relatórios' },
      { key: 'despesas.gerenciar_eventos', label: 'Gerenciar eventos' },
      { key: 'despesas.administrar', label: 'Administrar cadastros e permissões' },
    ],
  },
];

export const COMPANY_REGISTRY = Array.from(new Set(APP_REGISTRY.flatMap((app) => app.companies)))
  .map((key) => ({ key, label: key }));

export const PROFILE_REGISTRY = [
  {
    key: 'ADMINISTRADOR',
    label: 'Administrador',
    description: 'Acesso total ao Portal, aplicativos, empresas e ações.',
    defaultApps: APP_REGISTRY.map((app) => app.key),
    defaultCompanies: COMPANY_REGISTRY.map((company) => company.key),
    defaultActions: ['*'],
  },
  {
    key: 'SOCIO',
    label: 'Sócio',
    description: 'Acesso gerencial aos aplicativos liberados, com permissões ajustáveis por usuário.',
    defaultApps: ['fretes'],
    defaultCompanies: ['LIVION'],
    defaultActions: ['fretes.visualizar_valores', 'fretes.editar_cotacao', 'fretes.aprovar_cotacao'],
  },
  {
    key: 'OPERACIONAL',
    label: 'Operacional',
    description: 'Acesso às rotinas operacionais, sem administração e sem dados sensíveis por padrão.',
    defaultApps: ['fretes'],
    defaultCompanies: ['LIVION'],
    defaultActions: ['fretes.visualizar_valores', 'fretes.criar_cotacao', 'fretes.editar_cotacao'],
  },
];

export const APP_KEYS = APP_REGISTRY.map((app) => app.key);
export const COMPANY_KEYS = COMPANY_REGISTRY.map((company) => company.key);
export const ACTION_KEYS = APP_REGISTRY.flatMap((app) => app.actions.map((action) => action.key));
export const PROFILES = PROFILE_REGISTRY.map((profile) => profile.key);
