# Expedição e Romaneios — Nokia e Claro

Versão de liberação: aplicativo v5, Portal 2026.10.20.3. O fluxo central é administrado pela empresa; operadores não conectam OneDrive. A ativação Microsoft e a validação operacional devem ser registradas separadamente dos testes locais. Nenhum serviço pago foi contratado.

## Operação

Abra pelo Portal Livion. As abas Nokia e Claro têm leituras e regras independentes. A tela lista notas, todas as peças, caixa por peça, pesagem, dimensões, observações, notas de origem e histórico. Rascunho, gravação de caixas e geração do Excel são ações separadas.

Cada caixa pode conter qualquer combinação de status, na Claro e na Nokia. Todos os status distintos da caixa são preenchidos imediatamente à direita de STATUS em 03 Etiquetas, separados por /, preservando o status individual de cada peça. Qualquer status não vazio é aceito. A regra deve ser a mesma no navegador, na API e nos dois serviços Google. Séries e códigos de barras repetidos são mantidos; a identidade da peça é o ID do BD.

Após enviar o XLSX ao OneDrive e baixar seus bytes para conferência, a API confere a geração e as caixas atuais do BD e registra Expedido. A nota sai de Em expedição e permanece no histórico. Cancelar o salvamento ou falhar a conferência mantém a expedição aberta. O status de reparo e a localização no BD não são alterados por essa conclusão.

Cidade, UF e endereço de destino, endereço de emissão, responsável, observações e pesagem podem ser corrigidos no rascunho do romaneio. CNPJ, peças, status e caixas continuam vinculados à origem. No histórico, as caixas ficam bloqueadas; uma nova cópia pode corrigir os dados do documento, preservando a data e o comprovante originais da expedição. Alterar a composição real/status/caixas sinaliza uma nova conferência.

Somente ADMINISTRADOR define os destinos centrais Nokia e Claro. A conta central cesar.oliver@livionsolutions.com.br autoriza uma integração Microsoft dedicada, sem consentimento geral da organização. O servidor conserva a credencial de renovação com AES-GCM e HKDF com separação de contexto; nunca a envia ao navegador. O segredo de proteção é EXPEDICAO_CLOUD_KEY, quando configurado, ou uma derivação isolada do segredo de integração existente. Rotacionar esse segredo exige reconectar a conta central. Não há senha Microsoft armazenada. A equipe usa apenas o login e as permissões do Portal: não recebe credenciais, links de navegação ou acesso às pastas do OneDrive. As preferências individuais anteriores foram preservadas e não são mais utilizadas para salvar.

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

A regressão final passou com 172 testes, zero falhas e zero ignorados. Há testes de regras, autorização, leitura sem permissão ampla na fase inicial, escrita limitada de caixas, concorrência e pendências, PostgreSQL real isolado, exclusão recuperável de modelos, ZIP, edição de cópias e preservação da data de expedição. Cópias Excel foram geradas/reabertas para os modelos estruturalmente válidos; os dois modelos anteriores com UF SPI são bloqueados até correção.

Leituras assinadas reais confirmaram 7.697 registros Nokia, 4.928 Claro e 43 destinos CD_Regional. As saídas fictícias, relatórios de leitura real, screenshots e comprovantes ficam fora do repositório publicável, em EXPEDIÇÃO E ROMANEIOS/Validacao. Autenticação no frontend publicado, a primeira expedição operacional real e a sincronização final OneDrive são verificações distintas.

## Interface v3 e dimensões

A nota mostra a logo do cliente e a bandeira/nome da UF do rascunho. As 27 bandeiras são cópias estáticas de domínio público identificadas na galeria Wikimedia Commons; as páginas de origem e os créditos estão em assets/state-flags/sources.json. UF vazia ou desconhecida não mostra bandeira substituta. A área Rascunhos reúne os salvos do cliente selecionado, inclusive notas expedidas; rascunhos cuja nota saiu do BD continuam listados sem permitir uma operação desatualizada. Salvar uma nota nova sem editar campos também cria o rascunho.

Dimensões são selecionadas em dropdown a partir da lista Dimensões padrão da aba 04 Configurações do modelo. A importação e a edição de modelos extraem novamente essa lista. As 25 cópias instaladas usam P - 35X35X24, M - 47X38X24, G - 60X40X40 e OUTRA. Valores anteriores divergentes são preservados no rascunho, mas precisam de escolha válida antes da geração.

O layout adapta navegação, listas e formulários para celular/tablet, com campos de toque, navegação Notas/Rascunhos, rolagem das tabelas dentro do painel e foco automático na nota selecionada em telas pequenas. O salvamento central depende de internet e da conexão da conta central; a equipe não precisa conectar OneDrive.

Instalação central: aplicar supabase/expedicao-cloud.sql (migração expedicao_central_output). Registrar uma aplicação Microsoft dedicada, de locatário único, com fluxo por código e permissões delegadas User.Read, Files.ReadWrite e offline_access apenas para a conta central. Registrar seu client_id não secreto na linha central de expedicao_cloud_connection em estado RECONNECT, sem credencial. O administrador conclui a conexão e confere os dois destinos na interface. As quatro tabelas têm RLS, sem SELECT ou RPC para anon/authenticated. Apenas o servidor pode gerar, salvar, baixar os bytes para conferir o SHA-256 e registrar Expedido.


Instalação individual: o cartão Expedição e Romaneios e a barra do aplicativo têm o botão Instalar, inclusive no celular. A página install-app.html?app=expedicao usa o manifesto manifest-expedicao.webmanifest, com identidade própria ./pwa/expedicao e abertura em ./?app=expedicao pelo Portal autenticado. A instalação não concede novas permissões. A pasta de saída continua vinculada à conta no servidor.


Atualização de 21/10/2026: a geração mostra andamento e mensagens de erro junto aos botões, com rolagem até a mensagem. O teste da nota 394 usa o rascunho revisão 3: caixa 1 com 11 peças 03-REPARADO e 21,4 kg; caixa 2 com 4 peças 02-IRREPARÁVEL e 1 SEM REPARO, 10,2 kg. Ambas usam P - 35X35X24. A cópia de conferência e os dados reais ficam fora do repositório público.

O salvamento central reserva uma operação única por nota antes do envio. Um timeout nunca repete POST/PUT. Em caso indeterminado, Conferir salvamento procura a cópia de UUID exato e confere os bytes antes da conclusão. A antiga rota saved não aceita comprovação fornecida pelo navegador no modo central. Destinos só podem ser alterados por administrador, inclusive em chamadas diretas à API. A resposta do Google é seguida apenas até o host oficial de entrega; uma URL de resposta expirada permite no máximo uma leitura nova, nunca uma repetição de gravação.

A interface limita o tempo de espera de cada chamada, incluindo a autenticação e o corpo da resposta, sem repetir gravações. A confirmação de um Excel salvo aparece antes da atualização da lista: se essa consulta ao Google falhar, o sucesso permanece visível e a tela orienta usar Atualizar BD. Cada chamada assinada ao Google usa um identificador próprio também na URL e solicita resposta sem cache, preservando a assinatura no corpo e as regras de redirecionamento.

A busca acima de Todas as peças filtra os campos visíveis da nota selecionada, incluindo item e caixa atribuída, sem diferenciar maiúsculas ou acentos. O contador informa quantas peças estão sendo exibidas. Os cabeçalhos das tabelas de peças, caixas e notas de origem alternam ordenação crescente/decrescente; números e identificadores usam ordem natural e pesos usam valor decimal. Essas ferramentas alteram somente a visualização: não renumeram itens nem excluem peças do rascunho ou do Excel.
