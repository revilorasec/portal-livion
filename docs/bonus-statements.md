# Demonstrativos individuais do bônus

`bonus-print.js` baixa um PDF vetorial, com fontes incorporadas, critérios do cálculo, próxima faixa, evolução desde outubro/2026, assinatura de conferência e anexo de equipamentos. A biblioteca pdfmake 0.2.21 e suas fontes são carregadas sob demanda. Os dados não são enviados à biblioteca/CDN; o PDF é montado no navegador.

O comparativo usa as mesmas funções de elegibilidade e cálculo do bônus. Bônus calculado não significa pagamento confirmado. Meses ainda não registrados usam as regras atuais e são identificados como simulação; o mês em andamento é parcial. Outubro mantém seus números reais e funciona como referência, sem zerar a produção.

Na primeira emissão, um mês encerrado é registrado por técnico e filtro de cliente, com regras, indicadores, cálculo e equipamentos. Outubro também é registrado como referência na primeira emissão de um mês posterior. Não é possível reconstruir tarifas anteriores que nunca foram registradas: a primeira referência usa as regras gravadas no momento da emissão. A chave de mês/técnico/cliente e `ON CONFLICT DO NOTHING` preservam o primeiro registro. O backend não tem privilégios de UPDATE/DELETE na tabela, e anon/authenticated não têm acesso. O acesso passa pela autenticação Microsoft e liberação do app no Portal; somente administradores registram demonstrativos.

Meses em andamento não são congelados; podem ser baixados como prévia. Os meses encerrados só passam a ter registro preservado na primeira emissão. Nenhuma regra de pagamento é alterada pelo download. Alterações não gravadas impedem a primeira emissão; uma emissão já registrada continua usando seu registro.

Verificação: testes de autorização, validação de competência e preservação do primeiro registro; download real em Chrome headless; extração e renderização do PDF com próximo objetivo, outubro preservado após alteração de tarifa, novembro parcial, gráficos e lista completa sem equipamentos de outros técnicos.
