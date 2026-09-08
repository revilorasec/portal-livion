# Manual técnico — Controle de Estoque

Atualizado em: 07/09/2026

## Identificação

- Módulo: `estoque.html`.
- Repositório: `revilorasec/portal-livion`.
- Branch: `main`.
- API: `https://kvfjjtkwxxbvzlicwnrz.supabase.co/functions/v1/inventory-api`.
- Projeto Supabase: `kvfjjtkwxxbvzlicwnrz`.

## Finalidade

Controle de componentes e insumos, entradas, saídas, saldos, fornecedores, solicitantes, notas fiscais, lotes FIFO, fotos, relatórios e auditoria operacional.

## Banco operacional

O banco oficial está no Supabase. O arquivo Excel original foi fonte de importação e não deve ser usado como banco concorrente.

Tabelas confirmadas no código e migrations:

- `inventory_products`;
- `inventory_movements`;
- `inventory_stock_current`;
- `inventory_suppliers`;
- `inventory_requesters`;
- `inventory_media`;
- `inventory_invoices`;
- `inventory_invoice_items`;
- `inventory_lots`;
- `inventory_lot_allocations`;
- `inventory_product_costs`;
- `inventory_product_suppliers`;
- `inventory_supplier_price_history`;
- `inventory_legacy_snapshot`;
- `inventory_deployment_snapshots`.

## Uso da pasta no OneDrive

Esta pasta é documental e de intercâmbio. Não contém o banco operacional.

```text
CONTROLE DE ESTOQUE
├── MANUAL.md
├── Importacoes
├── Exportacoes
└── Documentos
```

- `Importacoes`: planilhas e XMLs usados em migrações controladas.
- `Exportacoes`: relatórios gerados para arquivo corporativo.
- `Documentos`: documentação complementar, quando necessária.
- Anexos operacionais continuam no armazenamento seguro definido pelo aplicativo.

## Recursos implementados ou observados

- cadastro de produtos com tipo, categoria, unidade e fotos;
- entradas manuais e importação de XML de NF-e;
- saídas com solicitante e evidências fotográficas;
- fornecedores e solicitantes;
- notas fiscais, itens e vínculo com produtos;
- lotes e consumo FIFO;
- filtros, ordenação, exportações e relatórios;
- histórico por componente;
- permissões pelo Portal.

## Estado de dados conhecido

Foi relatada a correção da listagem para exibir 2.529 movimentações da base original. Esse número é histórico informado e deve ser reconfirmado diretamente no banco antes de nova migração ou publicação.

## Continuidade

- Reconciliar `inventory_stock_current` com a soma das movimentações.
- Não editar saldo diretamente sem trilha de auditoria.
- Testar XML com múltiplos itens, produto não vinculado, fornecedor novo/existente e confirmação da nota.
- Validar FIFO, anexos, fotos, filtros, ordenação, exportações e permissões.
- Migrations e Edge Functions devem permanecer versionadas no repositório.

