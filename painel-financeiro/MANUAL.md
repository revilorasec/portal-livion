# Painel Financeiro Livion

Implantação iniciada em 28/10/2026; conferência de servidor concluída em 29/10/2026. Entrada: https://portal.livionsolutions.com.br/?app=painel-financeiro

## Arquitetura e acesso

O catálogo do Portal aponta para `painel-financeiro/index.html`. O código público não contém dados, snapshots, fontes, caches ou folhas. `finance-api` valida cada leitura/importação no `portal-api/context` ativo. Para leitura, exige usuário interno e app ativo no contexto; administradores mantêm o acesso global existente, e os demais usuários precisam da ação explícita `painel-financeiro.visualizar` e empresa LIVION/RHCS autorizada. O perfil SOCIO sozinho não libera dados. Importações continuam exclusivas de administradores internos, inclusive quando uma ação de importar foi marcada para outro perfil. Nenhum usuário ou permissão individual é alterado por essa implementação.

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

## Estado publicado e limites — 29/10/2026

- Código inicial publicado no commit `d3a4ff3`; Portal `2026.10.28.1`; função `finance-api` v1 ativa. O domínio oficial serviu index.html, app.mjs e style.css com conteúdo exatamente igual ao validado localmente.
- Importado o HTML original da coleta 28/10/2026: 6.005.739 bytes, SHA-256 `19a4cd6f0618202370fc7f7d6c28dfb6bcc6743cec11a11b79f8e4d929b7de32`. Readback pelo banco confirmou tamanho e hash completos. O cartão está ativo. Importação inicial auditada como `deployment:codex`, sem se passar por usuário real.
- O conector recusou uma requisição SQL única pelo tamanho. A migration `20261029111439_finance_private_import_stage.sql` criou staging privado para transferência retomável em 34 partes. A montagem só foi aceita com hash/tamanho exatos; depois da confirmação foram removidas exclusivamente essas 34 partes temporárias. A versão integral permanece privada. O estágio vazio continua disponível para retomadas futuras, sem grants públicos.
- Produção: GET de snapshot/access sem token -> 401; token inválido -> 401; origem indevida -> 403; REST com chave pública -> 401/permission denied. RLS ligado e SELECT/INSERT negados a anon/authenticated. Advisors do novo módulo apresentam somente INFO de RLS sem políticas, intencional para acesso exclusivo pelo servidor. Os avisos preexistentes de outros módulos não foram alterados.
- Os 12 registros de usuários foram preservados integralmente: checksum antes/depois `da3845a55bd9b1033aae423bfe6af4f1`.
- Abertura autenticada, inspeção visual final, exportação CSV e responsividade em produção **pendentes**. O Portal mostrou indisponibilidade durante a renovação de sessão. A automação do navegador encerrou o controle por não conseguir confirmar a URL de um iframe about:srcdoc isolado; nenhum contorno foi feito. A publicação e o readback de servidor não comprovam esses testes de navegador.
- A rotina diária existente permanece inalterada: coleta e HTML local, com importação privada manual após validação. Não criar rotina concorrente nem afirmar atualização automática do Portal.

## Correção de acesso por permissão explícita — 29/10/2026

A v1 exigia administrador para toda leitura, bloqueando usuários que já tinham recebido o aplicativo e a ação de visualizar pela administração do Portal. A `finance-api` v2 passa a respeitar essas autorizações existentes. `/access` informa `canImport` separadamente; a interface v2 oculta a importação de quem só pode consultar e apresenta mensagem de permissão coerente com a regra atual. O POST permanece bloqueado no servidor para não administradores.

Sete testes locais passam, incluindo sócio interno com grants explícitos lendo sem poder importar, falta de ação/app/empresa, wildcard isolado, público externo e falha no serviço de autenticação. A confirmação dos grants no banco e os testes de autorização não equivalem a login real na conta de outro usuário; a reabertura por esse usuário deve ser conferida na sessão dele.

## Detalhes por gráfico e diferença parcial — 29/10/2026

Nova revisão privada publicada, mantendo a coleta em 28/10/2026: SHA-256 `25711e02102d7308df2849d331544a54f61fc2a91d6a7953d5886fb53fe7311c`, 5.934.366 bytes. A versão anterior foi preservada. As 43 queries revisadas, dados de origem, identidade do dashboard e runtime foram mantidos; somente o conteúdo autoral e o estado de conclusão da interface mudaram. Nenhum HTML preenchido, dataset ou fonte foi colocado em Git/Pages.

- Clicar numa barra abre a ação de consultar seus registros. Nos recebíveis, **Ver títulos com datas** lista cliente, documento/parcela, projeto, emissão, vencimento, saldo, situação e atraso, respeitando todos os filtros já aplicados. Há total, busca, paginação, CSV e detalhe individual com retorno à mesma lista. A seleção por cliente também abre seus títulos.
- Os gráficos mensais abrem as notas ou títulos do mês e série selecionados. O comparativo abre notas, custos/fontes ou a memória da diferença, conforme a barra escolhida. Datas contratuais continuam distintas de baixas efetivas.
- A terceira série é **Diferença parcial = faturamento fiscal − custos identificados**. Ela não é lucro final nem dinheiro disponível. O IPI de Transceivers continua incluído no faturamento fiscal da terceira barra; tabela e memória mostram também o saldo depois de separar o IPI. Custos, encargos, créditos e apurações fiscais pendentes não foram preenchidos como zero. Lucro exato permanece não apurado.
- Foram verificados na prévia: recorte por projeto, mês, filtro FUST, limpar filtros, notas por projeto, memória do IPI, retorno da parcela à lista e CSV com escopo, totais e datas corretos. A sessão autenticada de administrador no Portal carregou a revisão publicada; a terceira série, memória da diferença e títulos de Reparos foram abertos em produção. Não houve login na conta de outro usuário.
- Readback do banco confirmou hash/tamanho completos. Endpoints de snapshot e REST público continuam recusando acesso sem sessão. Os 12 usuários e seus grants permaneceram idênticos, e a `finance-api` v2 não foi modificada. Partes temporárias de transferência foram descartadas somente após validar a revisão integral.

Manutenção do conteúdo autoral continua no projeto original privado indicado pelo handoff, em `src/content/dashboard/ProjectDashboard.jsx` e `chart-details.js`. Preservar as ações de detalhamento e as três séries ao atualizar a coleta. Não rerodar scripts antigos que reconstruam a interface a partir de backups. A rotina diária existente não foi alterada nem duplicada.

## Períodos, contas a pagar e relatórios — 30/10/2026

A revisão privada `74759c917d775d2f01b141c3a5f679c359ecb77b098c00b3dc746710c7fa14bd` foi publicada e aberta no Portal autenticado. A coleta continua em 28/10/2026, com as mesmas 43 queries e o mesmo runtime.

- O comparativo permite escolher o intervalo de apuração dentro da cobertura revisada. Faturamento usa emissão e folha usa competência mensal integral. Custos anuais sem data ficam separados no recorte personalizado, sem rateio; ausência de custo datado não vira zero. A diferença é parcial e não é lucro fechado.
- Cada barra abre os itens do projeto e categoria escolhidos. Custos detalham CMV e holerites/FGTS, mantendo os totais anuais sem abertura identificados como agregados. Notas do recorte são listadas integralmente.
- A aba Contas a pagar tem filtros de vencimento, fornecedor, projeto, categoria e situação na coleta, além de gráficos e documentos detalhados. Não efetua pagamentos ou baixas.
- As listas autorais mostram todos os itens por padrão, com rolagem, busca e ordenação; oito por página continua opcional. Busca, CSV e relatório da lista compartilham o mesmo recorte.
- Relatórios da visão, da lista e geral geram HTML independente com gráficos e tabelas completas, sem recursos remotos. Abra o arquivo e use Imprimir / salvar em PDF. O geral independe dos filtros locais; relatórios da visão/lista os respeitam. Relatórios de lista incluem a busca aplicada.

Correção de download preparada para o shell `app.mjs?v=3`: o iframe isolado envia somente o arquivo explicitamente gerado para a camada autenticada. O receptor exige o `contentWindow` atual, origem opaca, sessão ativa, MIME HTML/CSV, extensão compatível, nome seguro, identificador único e limite de tamanho. Mensagens repetidas, outros emissores, tipos executáveis e sessão encerrada são rejeitados. O sandbox permanece sem `allow-same-origin`; nenhum token é enviado ao quadro.

O artefato privado que usa a correção é `2252239e74938f3d35f019cd9877f093c8febad411a301123c852ef916ac5a06`. Oito testes de autenticação e download sintético passaram. A publicação do shell e a verificação do download autenticado dessa correção estão pendentes da autorização explícita para main, solicitada após a rejeição anterior do auto-review. Nenhum dataset ou HTML preenchido deve entrar neste repositório.
