# Manual técnico — Portal Livion

Atualizado em: 07/09/2026

## Identificação

- Nome: Portal Livion.
- Produção: `https://portal.livionsolutions.com.br`.
- Repositório: `revilorasec/portal-livion`.
- Branch de produção: `main`.
- Último commit observado durante esta atualização: `d08c1be1a6682d6c033380230650e3d8ead19765`.

## Finalidade

Camada central de autenticação, autorização e navegação dos aplicativos corporativos da Livion Solutions. O Portal não deve absorver regras de negócio específicas dos módulos.

## Arquitetura confirmada

- Frontend versionado no GitHub e publicado para o domínio do Portal.
- Login corporativo pelo Microsoft Entra ID/MSAL.
- Tenant configurado: `911e1aee-070e-421b-ae71-439f01c2263e`.
- Client ID configurado: `88cf5cba-9f67-467d-8a51-9638200bed52`.
- API de acesso: `https://kvfjjtkwxxbvzlicwnrz.supabase.co/functions/v1/portal-api`.
- Projeto Supabase: `kvfjjtkwxxbvzlicwnrz`.
- Catálogo de apps, usuários, empresas, ações permitidas e auditoria são tratados pelo núcleo do Portal.
- Existe código alternativo para Cloudflare D1 em `lib/db.ts`; o frontend estático observado utiliza a API do Supabase. Confirmar o ambiente ativo antes de substituir qualquer backend.

## Aplicativos conhecidos

- Recursos Humanos.
- Transportadora.
- Status Reparos Claro.
- Controle de Estoque.
- Despesas e Reembolsos.

## PWA

- Manifesto principal: `manifest.webmanifest`.
- Service worker: `sw.js`.
- Há manifestos específicos para aplicativos.
- Deve permanecer instalável em Android, iPhone/iPad e computador.
- Não criar service workers concorrentes sem revisar o escopo e o cache.

## Segurança

- Usuários não liberados devem ser bloqueados.
- Permissões são por aplicativo, empresa e ação.
- Segredos e `service_role` nunca devem aparecer no frontend ou no repositório.
- Mudanças no catálogo não substituem validação de autorização na API.

## Arquivos principais

- `index.html`: Portal estático e integração dos módulos.
- `app/portal-client.tsx`: versão/estrutura Next.js do cliente do Portal.
- `lib/portal-registry.mjs`: catálogo e permissões versionados.
- `portal-admin-v3.js`: administração.
- `manifest.webmanifest` e `sw.js`: PWA.
- `supabase/functions/portal-api`: fonte versionada da API central disponível no repositório.

## Continuidade

Antes de publicar, validar login, usuário sem permissão, administrador, abertura de cada app, navegação incorporada, instalação PWA, cache, celular e desktop. Atualizar este manual sempre que aplicativo, URL, permissão, domínio, backend ou fluxo de login mudar.

