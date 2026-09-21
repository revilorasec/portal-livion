# Sugestão de produto no Controle de Estoque

Na revisão de uma NF-e ainda não confirmada, **Sugerir produto** compara a descrição, o código do fornecedor, o código de barras, o NCM e a unidade do item com os produtos ativos. A API TypeSafe recebe somente esses campos fiscais e os dados cadastrais necessários dos produtos candidatos; saldo, valores, quantidades, anexos e movimentações não são enviados.

A resposta não altera o estoque. **Usar sugestão** seleciona o produto e abre a confirmação de associação já existente, incluindo a decisão sobre manter ou trocar o nome. A entrada só é criada quando o usuário confirma a NF-e pelo fluxo normal. A função de IA não escreve no banco e não chama rotas de movimentação.

A função `inventory-product-ai` reutiliza o segredo `TYPESAFE_API_KEY` já configurado no Supabase. Ela valida a sessão Microsoft pelo `inventory-api/bootstrap` e exige a permissão `estoque.movimentar_entrada` antes de consultar a TypeSafe. Produtos inativos são excluídos. Quando há mais opções do que o limite de Choice, o servidor faz uma pré-seleção determinística por PN, código de barras, descrição e termos em comum.

Validação local:

`node --test tests/inventory-product-ai.test.mjs`

Os testes usam dados e respostas simuladas. A qualidade da associação precisa ser avaliada com descrições fictícias representativas e, depois, durante o uso normal com revisão humana. Nenhuma movimentação real deve ser criada apenas para testar a sugestão.
