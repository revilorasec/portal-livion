# Manual técnico — Recursos Humanos

Atualizado em: 07/09/2026

## Identificação

- Repositório: `revilorasec/rh-livion`.
- Branch: `main`.
- Último commit observado: `1dc9671a1e0c0baa95694d7c3d1e9958526d4c6b`.
- URL cadastrada no Portal: `https://revilorasec.github.io/rh-livion/`.

## Finalidade

Cadastro e consulta de funcionários, dados pessoais e profissionais, cargos, salários, clientes, projetos, documentos, fotos e currículos.

## Banco e armazenamento

### Uso normal dentro do Portal

- Dados estruturados: Supabase, projeto `kvfjjtkwxxbvzlicwnrz`.
- API: `https://kvfjjtkwxxbvzlicwnrz.supabase.co/functions/v1/rh-api`.
- Fotos e documentos: OneDrive via Microsoft Graph.

### Modo legado fora do Portal

- Pasta base: `00-PORTAL LIVION/RECURSOS HUMANOS`.
- Banco padronizado: `Dados/dados.json`.
- Banco antigo compatível: `dados.json` na raiz.
- Backups novos: `Backups/dados_AAAA-MM-DD.json`.
- Ao encontrar somente o arquivo antigo, o app cria `Dados/dados.json` sem apagar o original.

## Estrutura de arquivos

```text
RECURSOS HUMANOS
├── MANUAL.md
├── Dados
│   └── dados.json
├── Backups
└── Funcionarios
    └── [pasta do funcionário]
        ├── Fotos
        ├── Documentos
        └── Curriculo
```

## Autenticação e permissões

- Login Microsoft integrado ao Portal.
- Escopos legados: `User.Read` e `Files.ReadWrite.All`.
- Usuários externos não devem acessar arquivos sensíveis do RH.
- A edição completa exige permissões de edição, salário, banco, dados sensíveis e documentos.

## Estado conhecido

- Dentro do Portal, a base estruturada é carregada e salva pela `rh-api`.
- O OneDrive permanece responsável por arquivos de funcionários.
- O `dados.json` do OneDrive é compatibilidade/legado, não deve concorrer com a base Supabase durante o uso normal pelo Portal.

## Cuidados para continuidade

- Dados salariais, bancários e documentos são sensíveis.
- Validar perfis antes e depois de qualquer alteração.
- Não apagar pastas dos funcionários ao excluir um cadastro sem autorização expressa.
- Conferir se a Edge Function `rh-api` está versionada e documentada antes de migrations.
- Testar leitura e gravação tanto no Portal quanto no modo legado, quando ele for mantido.

