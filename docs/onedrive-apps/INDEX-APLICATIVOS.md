# Índice técnico dos aplicativos do Portal Livion

Atualizado em: 07/09/2026

Este diretório é a referência operacional dos aplicativos do Portal Livion. Cada aplicativo possui seu próprio `MANUAL.md`. Os manuais documentam arquitetura, armazenamento, integrações, recursos, estado conhecido e procedimento seguro para continuidade.

## Regra de armazenamento

- GitHub: código-fonte, histórico e automações.
- Supabase: bancos estruturados dos módulos que usam a nuvem, APIs e Storage quando aplicável.
- OneDrive: banco e arquivos somente dos módulos que usam Microsoft Graph, além desta documentação de continuidade.
- O arquivo `MANUAL.md` no OneDrive não é banco de produção.
- Não criar cópias concorrentes de bancos do Supabase no OneDrive como se fossem a fonte oficial.

## Aplicativos

| Aplicativo | Código | Banco operacional | Pasta no OneDrive |
|---|---|---|---|
| Portal Livion | `revilorasec/portal-livion` | Supabase | `PORTAL LIVION` |
| Recursos Humanos | `revilorasec/rh-livion` | Supabase; legado no OneDrive | `RECURSOS HUMANOS` |
| Transportadora | `revilorasec/fretes-livion` | OneDrive | `COTAÇÃO DE FRETES` |
| Status Reparos Claro | módulo no `portal-livion` | API Supabase; origem final não verificada | `STATUS REPAROS CLARO` |
| Controle de Estoque | módulo no `portal-livion` | Supabase | `CONTROLE DE ESTOQUE` |
| Despesas e Reembolsos | módulo no `portal-livion` | Supabase | `DESPESAS E REEMBOLSOS` |

## Antes de alterar qualquer aplicativo

1. Ler o `MANUAL.md` do aplicativo.
2. Conferir a branch `main` e o commit mais recente.
3. Identificar qual sistema é a fonte oficial dos dados.
4. Criar backup antes de migrations ou alterações de dados.
5. Não misturar tabelas, funções e arquivos de aplicativos diferentes.
6. Testar login, permissão, gravação, leitura e responsividade.
7. Atualizar o manual após publicar a alteração.

