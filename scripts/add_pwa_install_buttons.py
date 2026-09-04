from pathlib import Path

p = Path('index.html')
s = p.read_text(encoding='utf-8')

# Visual dos botoes dos cards.
needle = ".card .meta{font-size:12px;color:var(--muted)}"
repl = needle + ".app-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}.app-actions .btn{flex:1;min-width:118px}.btn.install{background:#eef3fa;color:var(--blue);border-color:#d6e1f0}"
if needle not in s:
    raise SystemExit('CSS anchor not found')
s = s.replace(needle, repl, 1)

# Botao de instalar o app atualmente aberto.
needle = '<button id="openExternal" class="btn workspace-external">Abrir em nova guia</button>'
repl = '<button id="workspaceInstall" class="btn workspace-external">Instalar este app</button><button id="openExternal" class="btn workspace-external">Abrir em nova guia</button>'
if needle not in s:
    raise SystemExit('workspace anchor not found')
s = s.replace(needle, repl, 1)

# Comportamento de instalacao do Portal principal, incluindo fallback para navegadores sem beforeinstallprompt.
old = """window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;$('installBtn').classList.remove('hidden')});
window.addEventListener('appinstalled',()=>{installPrompt=null;$('installBtn').classList.add('hidden')});
$('installBtn').onclick=async()=>{if(!installPrompt)return;installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;$('installBtn').classList.add('hidden')};"""
new = """const isStandalone=()=>matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;if(!isStandalone())$('installBtn').classList.remove('hidden')});
window.addEventListener('appinstalled',()=>{installPrompt=null;$('installBtn').classList.add('hidden')});
async function installPortal(){if(isStandalone())return alert('O Portal Livion já está aberto em modo instalado.');if(installPrompt){installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;$('installBtn').classList.add('hidden');return}const ios=/iphone|ipad|ipod/i.test(navigator.userAgent);alert(ios?'No iPhone/iPad, toque em Compartilhar e depois em “Adicionar à Tela de Início”.':'Abra o menu do navegador e escolha “Instalar Portal Livion” ou “Instalar aplicativo”.')}
$('installBtn').onclick=installPortal;"""
if old not in s:
    raise SystemExit('install handler anchor not found')
s = s.replace(old, new, 1)

old = "function showPortal(){$('auth').classList.add('hidden');$('app').classList.remove('hidden');$('profilePill').textContent=ctx.profile;$('userPill').textContent=ctx.user.name;$('configBtn').classList.toggle('hidden',!ctx.administrator);renderCards()}"
new = "function showPortal(){$('auth').classList.add('hidden');$('app').classList.remove('hidden');$('profilePill').textContent=ctx.profile;$('userPill').textContent=ctx.user.name;$('configBtn').classList.toggle('hidden',!ctx.administrator);$('installBtn').classList.toggle('hidden',isStandalone());renderCards();const requested=new URLSearchParams(location.search).get('app');if(requested){const a=allowedRegistry().find(x=>x.key===requested);if(a){history.replaceState(null,'',location.pathname);setTimeout(()=>openApp(a),0)}}}"
if old not in s:
    raise SystemExit('showPortal anchor not found')
s = s.replace(old, new, 1)

old = "function renderCards(){const fallback=[{key:'rh',icon:'👥',eyebrow:'Pessoas & Cultura',title:'Recursos Humanos',description:'Colaboradores, documentos, projetos e informações da equipe.',href:'https://revilorasec.github.io/rh-livion/?v=1.8.2'},{key:'fretes',icon:'🚚',eyebrow:'Operações & Logística',title:'Transportadora',description:'Cotações, propostas, coletas, entregas e acompanhamento operacional.',href:'https://revilorasec.github.io/fretes-livion/?v=1.3.5'}];const registry=(Array.isArray(ctx.appCatalog)&&ctx.appCatalog.length?ctx.appCatalog:fallback);$('appCards').innerHTML=registry.filter(a=>ctx.apps.includes(a.key)).map(a=>`<article class=\"card app-card\" data-key=\"${a.key}\"><div class=\"icon\">${appIcon(a.key)}</div><div class=\"kicker\">${a.eyebrow||''}</div><h2>${a.title}</h2><p>${a.description||''}</p><button class=\"btn primary\">Abrir aplicativo</button></article>`).join('')||'<div class=\"card\"><h2>Nenhum aplicativo liberado</h2><p>Peça ao administrador para liberar seu acesso.</p></div>';$('appCards').querySelectorAll('[data-key]').forEach(el=>el.onclick=()=>openApp(registry.find(a=>a.key===el.dataset.key)))}"
new = "function renderCards(){const fallback=[{key:'rh',icon:'👥',eyebrow:'Pessoas & Cultura',title:'Recursos Humanos',description:'Colaboradores, documentos, projetos e informações da equipe.',href:'https://revilorasec.github.io/rh-livion/?v=1.8.3'},{key:'fretes',icon:'🚚',eyebrow:'Operações & Logística',title:'Transportadora',description:'Cotações, propostas, coletas, entregas e acompanhamento operacional.',href:'https://revilorasec.github.io/fretes-livion/?v=1.3.5'}];const registry=(Array.isArray(ctx.appCatalog)&&ctx.appCatalog.length?ctx.appCatalog:fallback);$('appCards').innerHTML=registry.filter(a=>ctx.apps.includes(a.key)).map(a=>`<article class=\"card app-card\" data-key=\"${a.key}\"><div class=\"icon\">${appIcon(a.key)}</div><div class=\"kicker\">${a.eyebrow||''}</div><h2>${a.title}</h2><p>${a.description||''}</p><div class=\"app-actions\"><button class=\"btn primary\" data-open=\"${a.key}\">Abrir aplicativo</button><button class=\"btn install\" data-install=\"${a.key}\">Instalar</button></div></article>`).join('')||'<div class=\"card\"><h2>Nenhum aplicativo liberado</h2><p>Peça ao administrador para liberar seu acesso.</p></div>';$('appCards').querySelectorAll('[data-open]').forEach(b=>b.onclick=e=>{e.stopPropagation();openApp(registry.find(a=>a.key===b.dataset.open))});$('appCards').querySelectorAll('[data-install]').forEach(b=>b.onclick=e=>{e.stopPropagation();window.open('./install-app.html?app='+encodeURIComponent(b.dataset.install),'_blank','noopener')})}"
if old not in s:
    raise SystemExit('renderCards anchor not found')
s = s.replace(old, new, 1)

needle = "$('workspaceHome').onclick=()=>{$('workspace').classList.add('hidden');$('workspaceFrame').src='about:blank';currentApp=null;$('settingsView').classList.add('hidden');$('home').classList.remove('hidden')};$('openExternal').onclick=()=>currentApp&&window.open(currentApp.href,'_blank','noopener');"
repl = "$('workspaceHome').onclick=()=>{$('workspace').classList.add('hidden');$('workspaceFrame').src='about:blank';currentApp=null;$('settingsView').classList.add('hidden');$('home').classList.remove('hidden')};$('workspaceInstall').onclick=()=>currentApp&&window.open('./install-app.html?app='+encodeURIComponent(currentApp.key),'_blank','noopener');$('openExternal').onclick=()=>currentApp&&window.open(currentApp.href,'_blank','noopener');"
if needle not in s:
    raise SystemExit('workspace handlers anchor not found')
s = s.replace(needle, repl, 1)

p.write_text(s, encoding='utf-8')
print('PWA install buttons patched successfully')
