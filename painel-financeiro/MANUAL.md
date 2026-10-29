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
