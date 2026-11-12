# Acesso por PIN para clientes e parceiros

O administrador escolhe Microsoft ou e-mail + PIN no cadastro do usuário. Nenhum usuário existente recebe PIN automaticamente. PIN exige 6 a 12 números, preserva zeros iniciais e substitui exclusivamente o login Microsoft daquele usuário. Usuários internos, Administradores e usuários com Transportadora usam Microsoft. A Transportadora continua dependendo de acesso delegado ao OneDrive.

Na edição de uma conta com PIN, deixar o novo PIN vazio mantém o atual. Selecionar Microsoft remove o PIN; trocar ou remover o PIN invalida todas as sessões de PIN. Desativar o usuário impede acesso imediatamente. O servidor verifica a versão da credencial e o cadastro ativo a cada consulta.

## Servidor

- `portal-api/pin-auth.mjs`: PBKDF2 SHA-256 com sal aleatório e 600.000 iterações; comparação de hash sem saída antecipada. O PIN não é retornado nem incluído na auditoria.
- `POST /portal-api/pin/login`: credenciais válidas criam sessão opaca de oito horas. Apenas o hash da sessão fica no banco; o token fica no `sessionStorage` da aba, nunca no `localStorage`.
- `POST /portal-api/pin/logout`: exclui a sessão atual.
- `GET /portal-api/context`: valida PIN ou Microsoft e rejeita Microsoft quando existe PIN.
- `portal_save_user_with_pin`: salva dados e credencial na mesma transação, restrita ao serviço. `portal_pin_reserve_attempt` serializa os contadores: cinco tentativas por e-mail e sessenta por IP a cada quinze minutos. Respostas de login inválido são genéricas.
- Claro (`claro-data` e o endpoint legado `client-repairs-api`) e RH verificam o contexto central. Financeiro já utilizava essa validação. As permissões e os escopos dos aplicativos continuam sendo verificados.

## Publicação e verificação

O SQL revisado está em `supabase/schema/portal-pin-auth.sql`, aplicado no projeto como migração `portal_external_pin_auth`. As três tabelas têm RLS e acesso direto revogado para público/anon/authenticated; somente service_role acessa as credenciais, sessões e contadores. As funções SQL são SECURITY INVOKER e têm search_path fixo.

Publicar primeiro o schema, depois portal-api, depois os adaptadores Claro/RH e por último o frontend. Versões anteriores implantadas devem ser preservadas para retorno. Para retirar a funcionalidade, remover os PINs administrativamente antes de retornar ao backend anterior; não restaurar um backend que aceite Microsoft enquanto usuários ainda estiverem configurados como somente PIN.

Testes: `node --test tests/portal-pin-auth.test.mjs tests/partners.test.mjs tests/portal-editable-profiles.test.mjs tests/portal-user-categories.test.mjs tests/trusted-session.test.mjs tests/finance-security.test.mjs`. As verificações SQL de criação, troca, remoção, rejeição de PIN interno/Transportadora, revogação e permissões foram executadas em transação com ROLLBACK, sem manter contas de teste.

O código de RH e das duas funções Claro foi recuperado das funções implantadas para esta integração. Mudanças futuras no RH devem coordenar esta fonte com o repositório rh-livion.
