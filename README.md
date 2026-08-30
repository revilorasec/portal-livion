# Portal Livion

Portal corporativo da Livion Solutions.

## Estado da migração

Este repositório foi criado para retirar a publicação do Portal da dependência do `chatgpt.site` e passar a manter o código-fonte no GitHub.

A arquitetura atual do Portal **não é apenas estática**: o frontend usa autenticação Microsoft e chama APIs do próprio Portal; o backend usa Cloudflare Workers e banco D1 para usuários, permissões e auditoria. Por isso, publicar somente no GitHub Pages quebraria o controle administrativo.

Arquitetura alvo:

- GitHub: fonte, histórico e automação de deploy;
- Cloudflare Worker/Pages: execução do Portal e APIs;
- Cloudflare D1: usuários, permissões e auditoria;
- Microsoft Entra ID: autenticação;
- GitHub Pages dos apps existentes: `rh-livion` e `fretes-livion`.

## Segurança

Nenhuma credencial, token ou segredo deve ser commitado neste repositório. Segredos de implantação devem ficar em GitHub Actions Secrets/Cloudflare.

## Status

- Repositório criado: concluído
- Arquitetura identificada: concluído
- Origem local/OneDrive preservada: concluído
- Migração integral do código: em andamento
- Deploy independente do Codex/chatgpt.site: pendente
- Validação em produção: pendente
