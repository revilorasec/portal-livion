from pathlib import Path
import re

p = Path('index.html')
s = p.read_text(encoding='utf-8')

s = s.replace(
    "const REDIRECT='https://revilorasec.github.io/portal-livion/';",
    "const REDIRECT=new URL('./',window.location.href).href;"
)

pattern = re.compile(r"function renderCards\(\)\{.*?\}\nasync function openApp\(a\)\{", re.S)
replacement = r'''function renderCards(){
const fallback=[{key:'rh',icon:'👥',eyebrow:'Pessoas & Cultura',title:'Recursos Humanos',description:'Colaboradores, documentos, projetos e informações da equipe.',href:'https://revilorasec.github.io/rh-livion/?v=1.8.2'},{key:'fretes',icon:'🚚',eyebrow:'Operações & Logística',title:'Transportadora',description:'Cotações, propostas, coletas, entregas e acompanhamento operacional.',href:'https://revilorasec.github.io/fretes-livion/?v=1.3.5'}];
const registry=(Array.isArray(ctx.appCatalog)&&ctx.appCatalog.length?ctx.appCatalog:fallback);
$('appCards').innerHTML=registry.filter(a=>ctx.apps.includes(a.key)).map(a=>`<article class="card app-card" data-key="${a.key}"><div class="icon">${a.icon||'▣'}</div><div class="kicker">${a.eyebrow||''}</div><h2>${a.title}</h2><p>${a.description||''}</p><button class="btn primary">Abrir aplicativo</button></article>`).join('')||'<div class="card"><h2>Nenhum aplicativo liberado</h2><p>Peça ao administrador para liberar seu acesso.</p></div>';
$('appCards').querySelectorAll('[data-key]').forEach(el=>el.onclick=()=>openApp(registry.find(a=>a.key===el.dataset.key)))}
async function openApp(a){'''

s2, n = pattern.subn(replacement, s, count=1)
if n != 1:
    raise SystemExit('renderCards block not found exactly once')

p.write_text(s2, encoding='utf-8')
