# Sugestão de categoria com TypeSafe

No formulário de despesas, **Sugerir categoria** envia somente o motivo digitado ao serviço TypeSafe. As opções vêm do cadastro autorizado retornado pelo bootstrap do servidor. Não são enviados anexos, valores, CPF/CNPJ, contas, cartões ou histórico de despesas como campos separados. O texto livre do motivo é enviado como digitado; evite colocar dados pessoais desnecessários nele.

A resposta aparece para revisão. **Usar sugestão** altera apenas o campo de categoria do formulário. O usuário salva a despesa pelo fluxo existente. Alterações no formulário invalidam sugestões pendentes. Não há classificação em lote nem alteração de registros existentes pela função.

## Ativação

1. Criar uma conta TypeSafe e obter uma chave de API; conferir condições e custos do serviço.
2. No projeto Supabase `kvfjjtkwxxbvzlicwnrz`, cadastrar `TYPESAFE_API_KEY` em Edge Functions > Secrets. Nunca colocar a chave no HTML, JavaScript público, Git ou mensagens.
3. Publicar `expense-category-ai` com `index.ts` e `handler.mjs`. A verificação JWT do gateway fica desativada porque a função autentica o bearer Microsoft Entra pelo `expenses-api/bootstrap`; exige permissão de criação e empresa autorizada antes de acessar TypeSafe.
4. Testar com uma sessão autorizada e descrições fictícias, conferindo categorias sugeridas e corrigindo manualmente quando necessário. Nenhum limiar de confiança foi calibrado; toda sugestão exige aceitação humana.

Sem chave, a função retorna `TYPESAFE_NOT_CONFIGURED` e o formulário mantém a seleção manual. Timeout, categoria desconhecida e falhas do serviço não alteram o campo. Não há repetição automática de chamadas ao provedor após falhas.

## Validação

`node --test tests/expense-category-ai.test.mjs`

Os testes usam respostas simuladas e dados fictícios. Não comprovam a qualidade do modelo, cobrança, autenticação real Microsoft ou uma chamada TypeSafe real. A avaliação real depende da chave e de uma sessão autorizada.

Referência: https://docs.typesafe.ai/api e https://docs.typesafe.ai/primitives/choice
