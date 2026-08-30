# Portal Livion

Portal corporativo da Livion Solutions.

## Arquitetura atual

O Portal foi retirado da dependência do `chatgpt.site` e passou a ter código-fonte e publicação controlados no GitHub.

Arquitetura em uso:

- **GitHub**: código-fonte, histórico e automações;
- **GitHub Pages**: frontend do Portal e dos módulos existentes;
- **Supabase (sa-east-1)**: banco central de usuários, permissões, catálogo de aplicativos e auditoria;
- **Supabase Edge Functions**: API segura do Portal;
- **Microsoft Entra ID**: autenticação corporativa;
- **Cloudflare DNS**: domínio `livionsolutions.com.br` e subdomínios, após a migração dos nameservers;
- **OneDrive / Microsoft Graph**: documentos e arquivos corporativos quando o módulo exigir;
- **Google Drive**: opção preferencial para grandes volumes de imagens operacionais quando já houver acervo ou integração existente.

## Modelo modular

O Portal é a camada principal. Os aplicativos continuam independentes tecnicamente, mas são apresentados e autorizados de forma centralizada.

Estrutura:

```text
portal.livionsolutions.com.br
├── autenticação e permissões
├── RH
├── Transportadora
└── futuros módulos
```

O catálogo de aplicativos fica no banco (`portal_apps`). Assim, futuros módulos podem ser adicionados ao Portal sem reescrever a tela inicial.

## Usuários e acesso futuro

O núcleo já diferencia três tipos de usuário:

- `INTERNO`
- `CLIENTE`
- `PARCEIRO`

Cada usuário pode ter organização, escopo de cliente, aplicativos, empresas e ações permitidas. Aplicativos podem ser classificados para público interno, cliente ou ambos.

## Armazenamento

Regra arquitetural:

- **Supabase**: dados estruturados, relacionamentos, permissões e referências de arquivos;
- **OneDrive**: documentos e arquivos corporativos;
- **Google Drive**: grandes volumes de fotos/imagens operacionais quando apropriado;
- arquivos grandes não devem ser armazenados diretamente no banco.

## Segurança

- Login pelo Microsoft Entra ID;
- usuários não cadastrados são bloqueados;
- banco com RLS habilitado e sem acesso direto por `anon`/`authenticated` às tabelas administrativas;
- API valida identidade Microsoft e autorização central;
- proteção contra remoção/desativação do último administrador ativo;
- auditoria de alterações administrativas;
- nenhum token, segredo ou chave privada deve ser commitado no repositório.

## Domínios

Atual/fallback:

`https://revilorasec.github.io/portal-livion/`

Destino oficial:

`https://portal.livionsolutions.com.br/`

O frontend usa URI de redirecionamento dinâmica, permitindo funcionar no endereço GitHub atual e no domínio oficial depois que a URI correspondente estiver cadastrada no Microsoft Entra.

## Estado

- Código-fonte no GitHub: concluído
- Frontend independente do `chatgpt.site`: concluído
- Backend Supabase: concluído
- Catálogo dinâmico de aplicativos: concluído
- Modelo INTERNO/CLIENTE/PARCEIRO: preparado
- DNS Cloudflare: aguardando propagação dos nameservers
- Domínio `portal.livionsolutions.com.br`: pendente da ativação do Cloudflare
- URI do domínio oficial no Entra: pendente após ativação do domínio
- Proteção de acesso direto nos módulos RH/Fretes: etapa posterior
