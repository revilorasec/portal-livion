# Instalação individual dos aplicativos Livion

O Portal oferece Instalar no cartão de cada um dos dez aplicativos e na barra do aplicativo aberto, inclusive no celular. Cada instalação tem seu próprio nome, ícone e entrada direta no módulo, mantendo o login e as permissões do Portal.

1. Abra o Portal no navegador do dispositivo e entre com sua conta Microsoft.
2. Escolha o aplicativo desejado e toque em Instalar.
3. Confirme a instalação apresentada pelo navegador. Repita para outros aplicativos que desejar.

No Android e Windows, use Chrome ou Edge. Quando o navegador disponibiliza a janela de instalação, o botão a abre; caso contrário, a página mostra como instalar pelo menu do navegador. No iPhone/iPad, abra a página do aplicativo no Safari, toque em Compartilhar, Adicionar à Tela de Início e Adicionar. O iPad em modo de navegação de computador também recebe essas instruções.

A lista de instalações fica em app-installers.js, compartilhada pelo Portal e pela página install-app.html. Cada entrada corresponde a um manifesto com identidade própria e start_url ./?app=CHAVE. A página de abertura usa o mesmo manifesto e os mesmos ícones da instalação. A chave do aplicativo é mantida na URL para reabrir o módulo ao atualizar a janela. Uma chave inválida não seleciona outro aplicativo automaticamente.

Validação desta atualização: testes de identidade/rotas/ícones dos dez aplicativos, aceitação e cancelamento da janela de instalação, instruções iPhone/iPad/Windows, recuperação de uma janela expirada, manutenção do login e conferência visual nos tamanhos de celular e tablet. A instalação efetiva em um dispositivo depende da confirmação do usuário na janela do navegador.
