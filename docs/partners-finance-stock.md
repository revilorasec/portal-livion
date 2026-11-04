# Parceiros e estoque contábil no Painel Financeiro

Parceiros são uma entidade externa separada de empresas internas e clientes. A classificação não concede aplicativos ou empresas automaticamente. Cada pessoa recebe apps, ações e escopo de empresas explícitos. Parceiros não recebem perfil de administrador do Portal.

O cadastro mostra **Cadastrar e convidar** para novos externos e **Salvar e enviar convite** quando uma identidade externa ainda precisa de convite. O status aparece junto ao usuário. Clientes e parceiros usam o fluxo Microsoft Entra B2B existente. E-mails externos podem usar [código temporário por e-mail](https://learn.microsoft.com/entra/external-id/one-time-passcode), conforme a configuração do tenant; o Portal não cria PIN fixo nem guarda códigos. Aceitar o convite/primeiro login depende do convidado.

O usuário convidado é vinculado pelo object ID do Entra, inclusive quando o identificador de login contém `#EXT#`. A validação de assinatura, tenant, emissor e aplicativo foi preservada.

O Painel Financeiro aceita parceiros com liberação explícita do app, ação `painel-financeiro.visualizar` e empresa autorizada. Importação de snapshots e edição de transceivers continuam exclusivas de administradores. O acesso financeiro não concede o app operacional Estoque.

`GET /accounting-stock` consulta a posição existente `inventory_accounting_position` por uma função SQL privada e somente leitura. A função gera uma posição consistente em uma única consulta, sem perda de linhas por paginação. Execução é revogada de `PUBLIC`, `anon` e `authenticated`; somente `service_role` pode chamá-la, após a validação de acesso e escopo Livion feita pela API. O iframe continua opaco e recebe dados pelo canal já existente, sem token.

A aba Estoque para contabilidade oferece filtros, saldos por unidade, CSV geral/filtrado e relatório. Reutiliza o custo médio das entradas precificadas adotado no app de estoque. Quantidades de unidades diferentes não são somadas. Custos ausentes permanecem nulos e o valor disponível é identificado como subtotal estimado, sem afirmar avaliação completa. A localização é a padrão do cadastro; o saldo é consolidado por produto. A fonte é distinta do estoque ERP de transceivers, sem soma automática entre bases.

Os dados e snapshots ficam no armazenamento privado existente. Este repositório contém somente código, testes sintéticos e migração. A posição salva serve a cópias portáteis; o Portal pode consultar a posição atual pela API.
