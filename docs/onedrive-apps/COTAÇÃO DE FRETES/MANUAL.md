# Manual técnico — Transportadora

Atualizado em: 07/09/2026

## Identificação

- Nome exibido: Transportadora.
- Repositório: `revilorasec/fretes-livion`.
- Branch: `main`.
- Último commit observado: `11570150f2b4f54eafc2eb90dacf43c95b481527`.
- URL: `https://revilorasec.github.io/fretes-livion/`.

## Finalidade

Controle de solicitações de cotação, propostas, escolha de transportadora, cargas, coletas, entregas, clientes, endereços, empresas, documentos e histórico operacional.

## Banco operacional

- Tecnologia: arquivo JSON no OneDrive via Microsoft Graph.
- Pasta base: `00-PORTAL LIVION/COTAÇÃO DE FRETES`.
- Banco: `Dados/dados.json`.
- Concorrência: `eTag` e `If-Match` para impedir sobrescrita silenciosa.
- Validação existente: preservação mínima dos 3.176 IDs históricos importados.

## Estrutura padronizada

```text
COTAÇÃO DE FRETES
├── MANUAL.md
├── Dados
│   └── dados.json
├── Backups
│   └── dados_AAAA-MM-DD.json
└── Anexos
    └── Fretes
        └── [ID]
            └── [etapa]
```

- Novos backups são criados em `Backups` antes da primeira gravação do dia.
- Novos anexos são gravados em `Anexos/Fretes/[ID]/[etapa]`.
- Referências antigas em outros caminhos são preservadas e continuam sendo abertas pelo caminho salvo no registro.

## Conteúdo do banco

- empresas;
- clientes;
- endereços;
- transportadoras;
- solicitações de cotação;
- opções e propostas de frete;
- cargas e volumes;
- coletas e entregas;
- anexos;
- permissões;
- histórico de alterações;
- vínculos entre empresa e cliente;
- configurações.

## Autenticação

- Login Microsoft.
- Microsoft Graph com `User.Read` e `Files.ReadWrite.All`.
- Permissão esperada no Portal: `fretes.acessar` e ações específicas.
- Drive corporativo configurado em `config.local.json`.

## Continuidade e segurança

- Nunca salvar sem o `eTag` esperado.
- Em conflito HTTP 412, recarregar antes de tentar novamente.
- Criar backup antes de migração estrutural.
- Não apagar o `dados.json` nem os 3.176 registros históricos.
- Validar novo cadastro, proposta, escolha, coleta, entrega, anexo e abertura de anexo.
- O IndexedDB é suporte local temporário e não substitui o banco compartilhado do OneDrive.

