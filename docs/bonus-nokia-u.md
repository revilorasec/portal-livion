# Competência Nokia pela coluna U

O bônus usa exclusivamente `Data da Expedição` (U), para todos os técnicos. `Data eSmart (Devolução)` não é alternativa para o bônus. A Claro mantém AJ. Os demais painéis mantêm seus critérios anteriores.

O backend lê U pelo bridge de expedição já existente, com a ação fixa `read`, HMAC e os segredos já configurados no servidor. Não há endpoint de diagnóstico, alteração da autenticação ou ação de gravação na planilha. A leitura completa é validada por ID e armazenada apenas no cache em memória. Se a origem U não estiver disponível, o backend falha explicitamente, sem trocar para W.

O frontend aplica `BonusEngine.bonusReturnRow` antes de todas as contagens do bônus: tabela mensal, meses disponíveis, auditoria, evolução, PDF e Excel. U vazia/fórmula identificada não entra na contagem. Os valores originais de RAW não são alterados.

Demonstrativos emitidos com o critério anterior continuam intactos em `desempenho_bonus_statements`. Versões corrigidas ficam em `desempenho_bonus_statement_corrections`, com vínculo temporal à emissão anterior e a mesma configuração de pagamento original. O backend apresenta a versão corrigida quando disponível e rejeita correções que tentem mudar a tarifa. Nenhuma atualização ou exclusão de originais é necessária.

Conferência com a cópia original Nokia de 15/11/2026: José Ambrósio tem 59 reparadas e 14 irreparáveis expedidas em outubro; Bruno Pivoto tem 29 e 3. No consolidado com a Claro, José tem 59/17 e Bruno 139/43. Cópia das regras e dos seis demonstrativos anteriores mantida em `.build/nokia-u-safe-fix/backup-settings-statements.json` no ambiente de trabalho, fora da publicação.
