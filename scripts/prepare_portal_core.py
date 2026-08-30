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
s = s2

s = s.replace(
    "function formData(){const profile=editing?editing.profile:'OPERACIONAL';const p=catalog.profiles.find(x=>x.key===profile)||catalog.profiles[0];return {name:editing?.name||'',email:editing?.email||'',profile,active:editing?!!editing.active:true,apps:editing?parse(editing.apps_json):[...p.defaultApps],companies:editing?parse(editing.companies_json):[...p.defaultCompanies],actions:editing?parse(editing.actions_json):[...p.defaultActions]}}",
    "function formData(){const profile=editing?editing.profile:'OPERACIONAL';const p=catalog.profiles.find(x=>x.key===profile)||catalog.profiles[0];return {name:editing?.name||'',email:editing?.email||'',profile,user_type:editing?.user_type||'INTERNO',organization_key:editing?.organization_key||'LIVION',client_key:editing?.client_key||'',active:editing?!!editing.active:true,apps:editing?parse(editing.apps_json):[...p.defaultApps],companies:editing?parse(editing.companies_json):[...p.defaultCompanies],actions:editing?parse(editing.actions_json):[...p.defaultActions]}}"
)

s = s.replace(
    "<label class=\"field\">Perfil<select id=\"fProfile\">${catalog.profiles.map(p=>`<option value=\"${p.key}\" ${p.key===f.profile?'selected':''}>${p.label}</option>`).join('')}</select></label><label class=\"check\"><input id=\"fActive\" type=\"checkbox\" ${f.active?'checked':''}> Usuário ativo</label>",
    "<label class=\"field\">Perfil<select id=\"fProfile\">${catalog.profiles.map(p=>`<option value=\"${p.key}\" ${p.key===f.profile?'selected':''}>${p.label}</option>`).join('')}</select></label><label class=\"field\">Tipo de usuário<select id=\"fUserType\">${(catalog.userTypes||['INTERNO','CLIENTE','PARCEIRO']).map(t=>`<option value=\"${t}\" ${t===f.user_type?'selected':''}>${t}</option>`).join('')}</select></label><label class=\"field\">Empresa/organização<input id=\"fOrg\" value=\"${esc(f.organization_key)}\" placeholder=\"Ex.: LIVION ou CLARO\"></label><label class=\"field\">Cliente/escopo<input id=\"fClientKey\" value=\"${esc(f.client_key)}\" placeholder=\"Opcional; usado por apps de clientes\"></label><label class=\"check\"><input id=\"fActive\" type=\"checkbox\" ${f.active?'checked':''}> Usuário ativo</label>"
)

s = s.replace(" ${a.key==='rh'&&f.profile!=='ADMINISTRADOR'?'disabled':''}", "")

s = s.replace(
    "function collect(){return {name:$('fName').value.trim(),email:$('fEmail').value.trim().toLowerCase(),profile:$('fProfile').value,active:$('fActive').checked,apps:[...document.querySelectorAll('[data-app]:checked')].map(x=>x.dataset.app),companies:[...document.querySelectorAll('[data-company]:checked')].map(x=>x.dataset.company),actions:[...document.querySelectorAll('[data-action]:checked')].map(x=>x.dataset.action)}}",
    "function collect(){return {name:$('fName').value.trim(),email:$('fEmail').value.trim().toLowerCase(),profile:$('fProfile').value,user_type:$('fUserType').value,organization_key:$('fOrg').value.trim(),client_key:$('fClientKey').value.trim(),active:$('fActive').checked,apps:[...document.querySelectorAll('[data-app]:checked')].map(x=>x.dataset.app),companies:[...document.querySelectorAll('[data-company]:checked')].map(x=>x.dataset.company),actions:[...document.querySelectorAll('[data-action]:checked')].map(x=>x.dataset.action)}}"
)

s = s.replace(
    "body:JSON.stringify({name:u.name,email:u.email,profile:u.profile,active:!u.active,apps:parse(u.apps_json),companies:parse(u.companies_json),actions:parse(u.actions_json)})",
    "body:JSON.stringify({name:u.name,email:u.email,profile:u.profile,user_type:u.user_type||'INTERNO',organization_key:u.organization_key||'',client_key:u.client_key||'',active:!u.active,apps:parse(u.apps_json),companies:parse(u.companies_json),actions:parse(u.actions_json)})"
)

p.write_text(s, encoding='utf-8')
