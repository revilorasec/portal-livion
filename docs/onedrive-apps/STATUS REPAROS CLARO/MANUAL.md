# Manual técnico — Status Reparos Claro

Atualizado em: 07/09/2026

## Identificação

- Módulo visual: `cliente-claro.html` no repositório `revilorasec/portal-livion`.
- Branch: `main`.
- Produção: aberto dentro do Portal Livion conforme permissão do cliente.

## Finalidade

Apresentar ao cliente Claro a situação dos equipamentos, etapas do fluxo, SLA, tempo na Livion, famílias, quantidades, indicadores e exportação da base filtrada.

## Fonte de dados confirmada

- Endpoint: `https://kvfjjtkwxxbvzlicwnrz.supabase.co/functions/v1/claro-data`.
- O frontend exige token do Portal e consulta o endpoint com o parâmetro `cliente=claro`.
- O navegador mantém os dados atuais se uma atualização falhar.

## O que ainda precisa ser documentado

O código-fonte da função implantada `claro-data` não está presente no repositório analisado. Por isso, não está confirmado se a fonte final é tabela Supabase, OneDrive, Google Drive ou outro serviço.

Até essa origem ser comprovada:

- não tratar nenhum arquivo desta pasta como banco oficial;
- não criar uma segunda base paralela;
- usar `Dados` apenas para importações ou snapshots identificados;
- versionar a Edge Function assim que sua fonte for localizada.

## Recursos observados

- filtros e indicadores operacionais;
- análise de SLA e envelhecimento;
- gráficos;
- exportação Excel/CSV da base filtrada;
- acesso controlado pelo Portal;
- endpoint configurável localmente apenas como suporte técnico.

## Continuidade

Antes de alterar, identificar e versionar a `claro-data`, confirmar a fonte oficial, validar quais campos podem ser exibidos ao cliente, testar usuário de cliente e administrador e conferir que nenhum valor interno indevido aparece na exportação.

