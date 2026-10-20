# Expedição e Romaneios — Nokia e Claro

Versão de liberação: aplicativo v2, Portal 2026.10.20.1. Backend, integrações Google e modelos privados instalados em 20/10/2026; publicação e validação autenticada final do frontend em andamento. Nenhum plano pago, compra ou serviço de IA foi contratado.

## Operação

Abra pelo Portal Livion. As abas Nokia e Claro têm leituras e regras independentes. A tela lista notas, todas as peças, caixa por peça, pesagem, dimensões, observações, notas de origem e histórico. Rascunho, gravação de caixas e geração do Excel são ações separadas.

Cada caixa contém um único status, validado no navegador, na API e no script da origem. O status é preenchido imediatamente à direita de STATUS em 03 Etiquetas. Qualquer status não vazio é aceito. Séries e códigos de barras repetidos são mantidos; a identidade da peça é o ID do BD.

Após salvar o XLSX e reler seus bytes, a API confere a geração e as caixas atuais do BD e registra Expedido. A nota sai de Em expedição e permanece no histórico. Cancelar o salvamento ou falhar a conferência mantém a expedição aberta. O status de reparo e a localização no BD não são alterados por essa conclusão.

Cidade, UF e endereço de destino, endereço de emissão, responsável, observações e pesagem podem ser corrigidos no rascunho do romaneio. CNPJ, peças, status e caixas continuam vinculados à origem. No histórico, as caixas ficam bloqueadas; uma nova cópia pode corrigir os dados do documento, preservando a data e o comprovante originais da expedição. Alterar a composição real/status/caixas sinaliza uma nova conferência.

O usuário escolhe a pasta local: @EXPEDIÇÃO RHCS ou @EXPEDIÇÃO LIVION. Cada cópia recebe um sufixo exclusivo e não sobrescreve arquivos existentes. A conferência local não comprova o término da sincronização OneDrive. O arquivo operacional é apenas XLSX, sem JSON ao lado.

## Catálogo de modelos

Modelos é uma área exclusiva de administradores internos. Permite listar ativos/inativos, baixar, enviar XLSX de até 2 MB, editar CNPJ/cidade/UF/endereço/endereço de emissão/observação padrão e ativar uma nova versão. Para outras alterações, baixe, edite no Excel e envie a versão nova.

O arquivo é validado antes da persistência: limites ZIP, ausência de macros/objetos incorporados/vínculos externos, quatro abas, cabeçalhos, áreas de peças, fórmulas e campos de etiquetas. Fórmulas, estilos, imagens e demais partes do ZIP permanecem preservados nas cópias. As fórmulas são recalculadas ao abrir no Excel; erros em cache herdados dos modelos não são apresentados como erros novos.

O vínculo usa empresa, CNPJ completo e Centro/CD, nunca apenas o sufixo do CNPJ. Endereço, CEP e cidade são comparados ao cadastro. Uma divergência só pode ser aceita expressamente pelo administrador, mantendo os dados atuais do BD e usando os dados do modelo nos novos documentos. O aplicativo mostra os dois endereços na conferência. CNPJ sem destino válido/único bloqueia a ativação.

Excluir retira o modelo de uso e da lista principal. Mostrar excluídos permite baixar ou recuperar a cópia como inativa; a reativação exige nova conferência. As versões anteriores, os arquivos originais e a auditoria são preservados. Toda alteração usa revisão comparada e usuário/horário do servidor. Substituir um modelo vinculado a vários Centros preserva os outros vínculos.

As cópias privadas foram instaladas em expedicao_models.content_base64, com RLS e sem acesso direto por anon/authenticated; os arquivos não foram publicados no GitHub. O bucket expedicao-modelos também permanece privado e é uma alternativa suportada pelo leitor. A consulta do catálogo não transporta os bytes dos modelos; o download exige autorização administrativa.

Foram instaladas 25 cópias, com 22 modelos ativos. Três anteriores ficaram inativos por divergências no cadastro: Imperatriz, São José do Rio Preto e São José dos Campos. Eles podem ser corrigidos pelo catálogo. O modelo cujo nome dizia São Paulo (0029-48), mas tinha CNPJ interno diferente, foi recusado. As 20 notas da Claro atualmente em expedição tinham modelo conferido na leitura de implantação, incluindo PR e a cópia GO atualizada para o Centro 62EA. Os originais dessas localidades foram preservados.

## Integrações e limites de escrita

| Empresa | Origem | Nota de retorno | Localização | Escrita operacional |
|---|---|---|---|---|
| Nokia | BD_Nokia | S | C contém EXPEDIÇÃO | V quando vazia e U somente quando vazia |
| Claro | CLARO_BD e CD_Regional | AL | D = EXPEDIÇÃO | Somente AK, comparando a caixa anterior |

Dois projetos Apps Script novos foram publicados separadamente; os endpoints dos HTMLs anteriores continuam preservados. O Google exige seu escopo padrão de planilhas para a fase operacional, concedido expressamente pelo usuário. O código não contém operação para criar ou excluir planilhas e limita as escritas operacionais às colunas acima. A publicação Qualquer pessoa apenas permite a chamada HTTP; GET e pedidos POST sem assinatura HMAC válida são recusados.

Chaves separadas por empresa ficam nas propriedades dos scripts e nos segredos do backend. O frontend não recebe essas chaves nem a chave service_role. Os dois lados têm travas de habilitação de escrita, ativadas após a autorização operacional. Não houve teste de escrita nem conclusão fictícia em registros reais.

Cada operação de caixas é persistida e reivindicada antes do envio externo. Timeout gera pendência, sem repetição automática do POST. Conferir gravação só relê. A API e o script verificam cabeçalhos, IDs, composição da nota, campos de referência, status e caixas anteriores. LockService coordena o novo projeto, não edições manuais ou os scripts antigos; evite dois sistemas operando na mesma nota durante a transição.

## Segurança e instalação

O módulo usa a sessão Microsoft do Portal, valida o token completo pelo Graph e confere usuário ativo/interno, vínculo Microsoft, aplicativo, cliente e ação. VISUALIZADOR não pode alterar dados. A administração de modelos exige ADMINISTRADOR no servidor, mesmo se uma chamada for feita fora da interface.

As tabelas têm RLS e os RPCs usam SECURITY INVOKER, EXECUTE exclusivo de service_role e travas/revisões. A role do backend não pode excluir fisicamente os modelos nem atualizar/excluir a auditoria. Não foram concedidas permissões a outros usuários. Administradores seguem a autorização global já existente do Portal.

Para uma instalação nova, aplicar expedicao-schema.sql e expedicao-model-management.sql, configurar os dois bridges com Bridge.gs e o manifesto operacional, segredos e travas inicialmente false; conferir origens/modelos antes de ativar. Implantar expedicao-api com verify_jwt=false porque o handler valida o token Microsoft e suas permissões. JSZip está fixado em 3.10.1. Publicar somente a pasta do repositório canônico, nunca as cópias privadas/OneDrive nem a variante antiga Codigo-Fonte. Registrar o catálogo com expedicao-catalog.sql ao final.

## Evidências

A regressão final passou com 166 testes, zero falhas e zero ignorados. Há testes de regras, autorização, leitura sem permissão ampla na fase inicial, escrita limitada de caixas, concorrência e pendências, PostgreSQL real isolado, exclusão recuperável de modelos, ZIP, edição de cópias e preservação da data de expedição. Cópias Excel foram geradas/reabertas para os modelos estruturalmente válidos; os dois modelos anteriores com UF SPI são bloqueados até correção.

Leituras assinadas reais confirmaram 7.697 registros Nokia, 4.928 Claro e 43 destinos CD_Regional. As saídas fictícias, relatórios de leitura real, screenshots e comprovantes ficam fora do repositório publicável, em EXPEDIÇÃO E ROMANEIOS/Validacao. Autenticação no frontend publicado, a primeira expedição operacional real e a sincronização final OneDrive são verificações distintas.
