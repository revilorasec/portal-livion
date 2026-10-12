# OLV Fiscal web — homologação v0.1.0

## Escopo

Módulo independente aberto no iframe do Portal Livion. Esta etapa permite criar rascunhos de venda e devolução, editar dados e itens, duplicar, revisar, arquivar, administrar cadastros de testes por empresa e consultar/exportar o histórico.

Não há emissão, assinatura XML, autorização SEFAZ, geração de DANFE fiscal, cancelamento/CC-e ou migração. As rotas correspondentes retornam 423 no servidor. Rascunhos não recebem número fiscal nem protocolo. A instalação Windows e os bancos Access atuais não são usados nem alterados.

## Armazenamento oficial desta versão

`C:\OneDrive - Livion Solutions\00-PORTAL LIVION\OLV FISCAL\Homologacao`

```text
Homologacao/
  Dados/LIVION.json
  Dados/RHCS.json
  Backups/
  Arquivos/LIVION/
  Arquivos/RHCS/
  Exportacoes/
```

Os dois arquivos JSON são a única base operacional deste módulo. Supabase hospeda somente a API de integração; não há tabela fiscal paralela. O catálogo/permissões do Portal continuam no núcleo já existente. Os arquivos são lidos/gravados diretamente por Microsoft Graph no drive corporativo fixo, independentemente da sincronização de um computador.

## Acesso

- `olv-fiscal` no catálogo do Portal, público interno.
- Permissões: `visualizar`, `editar_rascunhos`, `revisar`, `cadastros`, `exportar` com prefixo `olv-fiscal.`; empresas LIVION/RHCS.
- O administrador segue a regra administrativa já existente; usuários não administradores precisam de liberação explícita no Portal. Esta implantação não altera usuários ou concede permissões a sócios automaticamente.
- O usuário também precisa ter acesso à nova pasta no OneDrive. Compartilhamento não é criado automaticamente.
- A API valida a identidade e as permissões atuais por `portal-api/context` em toda chamada. Não confia no contexto enviado pelo frontend.
- O broker do Portal obtém token delegado `User.Read` + `Files.ReadWrite.All`, igual à integração Graph existente da Transportadora. O token fica em memória; não vai para URL, armazenamento persistente ou logs.

## Integridade

- Schema, ambiente e empresa são verificados ao carregar a base.
- Alterações exigem revisão e eTag correspondentes; a escrita utiliza `If-Match`.
- Uma cópia anterior é preservada em Backups antes da escrita. Falha de backup bloqueia a alteração.
- O estado é relido após salvar para confirmar a operação pelo seu identificador.
- Identificadores de operação e fingerprint permitem repetir uma chamada após perda de conexão sem duplicar rascunhos.
- Arquivamento preserva dados e histórico; não há exclusão definitiva nesta etapa.
- Quantidades e preços têm até quatro casas decimais, cálculo por inteiros e totais em centavos. Os valores não representam cálculo tributário homologado.
- Alterações concorrentes reais via Graph precisam ser verificadas na homologação autenticada, além dos testes isolados.

## Continuidade e novos recursos

- `olv-fiscal/domain.mjs`: schema, validação e regras de rascunho, sem dependência de navegador/Windows.
- `olv-fiscal/graph-repository.mjs`: contrato de armazenamento isolado no OneDrive.
- `olv-fiscal/handler.mjs`: autorização, operações e bloqueio fiscal.
- `supabase/functions/olv-fiscal-hml-api/index.ts`: entrada Deno.
- `olv-fiscal/app.mjs`, `index.html`, `app.css`: interface incorporada ao Portal, com marca original aprovada do OLV.
- `supabase/olv-fiscal-hml-catalog.sql`: inclusão somente do novo app no catálogo.

O motor fiscal deve ser implementado como adaptador separado, validado em homologação SEFAZ antes de qualquer liberação. Uma futura migração deve produzir cópia, relatório de contagem/valores, comparação com Access e validação humana antes de substituir a fonte oficial. Não basta mudar uma flag da tela para habilitar emissão ou apontar para produção.

## Validação

`node --test tests/olv-fiscal-hml.test.mjs`

Teste local de navegador: `http://127.0.0.1:8768/olv-fiscal/index.html?demo=1`. A demonstração é permitida apenas em localhost/127.0.0.1, usa dados fictícios em memória e não acessa OneDrive/SEFAZ. Não comprova autenticação ou persistência real.

## Roteiro de homologação pelo Portal

1. Abrir o OLV Fiscal · Testes no Portal como administrador.
2. Conectar OneDrive e confirmar as duas empresas vazias, sem dados migrados.
3. Criar cliente e rascunho de venda fictícios, salvar, recarregar e conferir o arquivo no OneDrive.
4. Preparar devolução com chave fictícia de 44 dígitos; revisar e arquivar.
5. Confirmar que outra pessoa autorizada vê o mesmo rascunho após recarregar.
6. Abrir duas sessões; salvar em uma e confirmar conflito ao salvar a versão antiga na outra.
7. Verificar usuário sem app, sem empresa, sem ação e sem acesso à pasta.
8. Conferir que emissão e migração permanecem bloqueadas e que o OLV Windows continua funcionando.

Não iniciar esta versão com cadastros ou documentos reais durante os testes iniciais.

## Evidência de implantação e testes — 12/10/2026

- Publicado no domínio oficial e incluído no catálogo como OLV Fiscal · Testes.
- API independente `olv-fiscal-hml-api`, autenticada pelo núcleo do Portal. Health público confirma emissão/migração bloqueadas; chamada anônima à base retorna 401.
- 24 testes locais cobrem autorização, empresas, valores, estados, chave referenciada, bloqueio fiscal, revisão, repetição de gravação, backup e tratamento de falhas.
- Navegador autenticado como administrador: abertura no iframe do Portal, conexão ao OneDrive, venda fictícia de R$ 17,25 e devolução fictícia de R$ 24,60, revisão, cadastro e arquivamento confirmados.
- Duas sessões do mesmo usuário carregaram o mesmo rascunho. A segunda atualizou; a primeira recebeu 409, manteve o formulário e não sobrescreveu a versão nova. Leitura independente do arquivo no OneDrive confirmou a versão preservada.
- Dois rascunhos fictícios foram arquivados, um por empresa; existe um cliente fictício de testes na RHCS. Os exemplos não têm autorização, número fiscal ou validade fiscal.
- Hashes SHA-256 de app.py, static/index.html e dos três bancos MDB atuais permaneceram iguais antes/depois. Os dez cadastros de aplicativos anteriores também mantiveram o mesmo hash.
- Nenhum usuário não administrador foi alterado. Testes reais em Mac, outro usuário e perfis de permissão continuam no roteiro de homologação do usuário.
- Emissão SEFAZ, cálculo tributário, XML/DANFE fiscal e migração continuam fora desta etapa.
