# Manual técnico — Despesas e Reembolsos

Atualizado em: 07/09/2026

## Identificação

- Módulo atual: `despesas-reembolsos-v2.html` e `despesas-reembolsos-v2.js`.
- Repositório: `revilorasec/portal-livion`.
- Branch: `main`.
- Produção: `https://portal.livionsolutions.com.br/despesas-reembolsos-v2.html`.
- Projeto Supabase: `kvfjjtkwxxbvzlicwnrz`.

## Finalidade

Registrar despesas empresariais pagas por sócios ou colaboradores, controlar aprovação e reembolso e separar gastos cotidianos de gastos vinculados a eventos.

## Empresas iniciais

- Livion Solutions.
- RH Comércio e Serviços.

## APIs confirmadas

- `expenses-api`;
- `expenses-schedule-api`;
- `expense-cards-api`;
- `expense-catalog-api`;
- `expense-finalize-api`;
- `expense-change-api`;
- `fiscal-smart-api`.

As funções estão implantadas no projeto Supabase, mas nem todas as fontes aparecem versionadas na pasta `supabase/functions` do repositório. Essa lacuna deve ser corrigida antes de mudanças estruturais importantes.

## Banco e arquivos

- Banco operacional: Supabase.
- Rascunho temporário: `localStorage` do navegador; não é a fonte oficial.
- Fotos, notas e comprovantes são enviados pela API de anexos do aplicativo.
- Esta pasta do OneDrive é documental e de intercâmbio, não um segundo banco.

```text
DESPESAS E REEMBOLSOS
├── MANUAL.md
├── Importacoes
├── Exportacoes
└── Documentos
```

## Recursos observados

- despesas por empresa;
- dia a dia ou vinculadas a evento;
- pessoa que pagou;
- fornecedor, CNPJ/CPF, endereço e localização;
- categorias, centro de custo e projeto;
- cartões pessoais e corporativos;
- despesa reembolsável ou não reembolsável;
- parcelamento e agenda;
- fotos e nota/comprovante;
- dados fiscais e itens identificados;
- aprovação, ajustes, finalização e reembolso;
- filtros, ordenação e exportação;
- edição e solicitação de exclusão controladas.

## Regras essenciais

- A empresa é a devedora; não existe rateio de dívida entre sócios.
- Preservar valor solicitado, aprovado, reembolsado e saldo pendente separadamente.
- Cartão corporativo não deve gerar reembolso pessoal.
- Evento é obrigatório quando o tipo for `EVENTO`.
- Usar idempotência nas operações financeiras.
- Não apagar definitivamente despesas aprovadas ou pagas sem política e auditoria.

## Continuidade

- Versionar todas as Edge Functions e migrations.
- Testar multiempresa e isolamento de permissões.
- Testar rascunho, envio, ajuste, aprovação, recusa, pagamento parcial e total.
- Validar anexos grandes e retomada após falha.
- Validar leitura de QR/OCR apenas nos cenários realmente suportados.
- Atualizar este manual após cada mudança de regra financeira.

