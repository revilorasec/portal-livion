# Painel Financeiro Livion

Implantação: 28/10/2026. Entrada: https://portal.livionsolutions.com.br/?app=painel-financeiro

## Arquitetura e acesso

O catálogo do Portal aponta para `painel-financeiro/index.html`. O código público não contém dados, snapshots, fontes, caches ou folhas. `finance-api` valida cada leitura/importação no `portal-api/context` ativo e exige usuário interno, perfil ADMINISTRADOR, indicador administrativo e app ativo no contexto. Essa é a regra global já existente do Portal. Nenhum usuário ou permissão individual é alterado. Outros perfis, inclusive sócios, dependem de decisão específica futura e continuam bloqueados pelo servidor mesmo que recebam acidentalmente o app no catálogo.

O HTML validado fica exclusivamente na tabela `public.finance_snapshots`, com RLS e privilégios revogados para PUBLIC/anon/authenticated. Somente o servidor usa service_role. A API não retorna URLs públicas ou assinadas: entrega texto somente com sessão autorizada, com no-store e nosniff. O navegador verifica SHA-256 antes de renderizar e usa iframe sandbox sem allow-same-origin para separar o HTML da sessão do Portal. Dados e token não são gravados no armazenamento do navegador pelo integrador. A sessão é revalidada a cada minuto; falha limpa o conteúdo. Uma sessão já autorizada pode manter o conteúdo por até esse intervalo após revogação. Exportações feitas conscientemente pelo administrador continuam sendo arquivos privados sob sua guarda.

## Fonte e significado

Preservar o HTML portátil validado e o app original `dashboard:4d7a3151-8d62-4c70-9031-e1bc4e03c9c7`. O runtime protegido Data App não foi modificado. As sete áreas, tema claro, fontes, filtros, CSV brasileiro e pendências permanecem no artefato original. Lucro exato não fechado, custos provisórios e lacunas não viram zero. Recebimentos por baixa real não equivalem a vencimentos; valores não representam saldo bancário conciliado.

## Atualização segura

1. Executar a coleta/análise somente leitura já existente e validar dados e renderização no projeto original; nunca alterar ERP, pagamentos ou documentos fontes.
2. Exportar o HTML portátil pelo fluxo oficial, conferir o App ID e registrar seu SHA-256, data real da coleta e cobertura parcial. Preservar o original local.
3. Abrir o app no Portal como administrador interno e expandir **Importar versão validada**. Escolher a data da coleta, selecionar o arquivo e importar. A versão vai apenas para a tabela privada. Reenvio do mesmo hash é idempotente. Uma data inferior à versão publicada é recusada; versões anteriores não são sobrescritas.
4. Conferir a confirmação, reler a versão exibida, as sete áreas e as pendências. Comparar SHA-256 no readback e negar acesso direto sem sessão. Nunca subir o HTML preenchido ou data.json em Git/Pages.

A rotina existente `livion-html-financeiro-di-rio-s-17h`, às 17h de Brasília, permanece única e gera HTML local. Não foi transformada em publicação automática. Importar a nova versão exige a sessão administrativa; não cadastrar credenciais permanentes nem ampliar permissões para automatizar essa etapa. A coleta continua pela UI autenticada do ERP e pelos documentos locais; não existe integração automática direta com ERP.

## Verificação e continuidade

Testes: `node --test tests/finance-security.test.mjs`. Cobrem falta de token/origem indevida, perfis e público recusados, hash, limite de tamanho, data inválida, regressão de data, versão duplicada, auditoria sem conteúdo e isolamento da página pública. Verificar adicionalmente na produção: leitura autorizada, não autorizado, RLS, igualdade do hash, gráficos/navegação/CSV e responsividade. HTTP 200 no health não comprova login ou acesso ao painel.

Migration aplicada: `20261029023110_finance_private_snapshots.sql`. Função nova isolada `finance-api`, sem alteração do portal-api ou funções de outros apps. O cartão é criado inativo e só ativado após a página pública estar disponível. Para suspender, desativar apenas o cartão no catálogo; não apagar versões ou usuários.
