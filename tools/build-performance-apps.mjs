import fs from 'node:fs';
import path from 'node:path';

const sourceRoot = 'C:/OneDrive - Livion Solutions/00-PORTAL LIVION/DESEMPENHO FUNCIONARIOS/Fontes-Originais-20260913/ANALISES REPARO';
const publishRoot = 'C:/OneDrive - Livion Solutions/00-PORTAL LIVION/PORTAL LIVION/Publicacao-Desempenho-v6';

const panelApi = 'https://kvfjjtkwxxbvzlicwnrz.supabase.co/functions/v1/desempenho-api/panel-data';

const presentationCss = `
.presentation-status{display:none;background:#fff3cd;color:#73510d;border:1px solid #efd27a;border-radius:999px;padding:7px 10px;font-weight:800;font-size:11px}
body.presentation-mode .presentation-status{display:inline-flex}
body.presentation-mode [data-presentation-money]{filter:blur(8px);user-select:none}
body.presentation-mode #settingsBtn{display:none!important}
body.presentation-mode #tab-finance,body.presentation-mode .nav button[data-tab="finance"]{display:none!important}
.presentation-list{display:grid;grid-template-columns:repeat(2,minmax(180px,1fr));gap:8px;max-height:320px;overflow:auto;margin:12px 0;padding:4px}
.presentation-choice{display:flex;align-items:center;gap:8px;border:1px solid #dfe6f0;border-radius:9px;padding:9px;background:#fff;font-weight:650}
.presentation-choice input{width:auto}
.presentation-help{color:#68768b;line-height:1.45}
@media(max-width:700px){.presentation-list{grid-template-columns:1fr}}
`;

function replaceOnce(text, find, replacement, label) {
  const first = text.indexOf(find);
  if (first < 0) throw new Error(`Trecho ausente: ${label}`);
  if (text.indexOf(find, first + find.length) >= 0) throw new Error(`Trecho duplicado: ${label}`);
  return text.slice(0, first) + replacement + text.slice(first + find.length);
}

function stripSnapshot(html) {
  const pattern = /const SNAPSHOT=\[[\s\S]*?\];\r?\nconst /;
  if (!pattern.test(html)) throw new Error('Snapshot original não encontrado');
  return html.replace(pattern, 'const SNAPSHOT=[];\nconst ');
}

const portalSourceRuntime = `
const PANEL_API='${panelApi}';
async function portalToken(forceRefresh=false){let parentApi=window.parent&&window.parent!==window&&window.parent.__PORTAL_GET_TOKEN__;if(typeof parentApi!=='function')throw new Error('PORTAL_REQUIRED');return parentApi(forceRefresh)}
async function fetchPanelPayload(panel){let run=async force=>{let token=await portalToken(force);return fetch(PANEL_API+'?panel='+encodeURIComponent(panel),{cache:'no-store',headers:{Authorization:'Bearer '+token}})},res=await run(false);if(res.status===401)res=await run(true);let body=await res.json().catch(()=>({}));if(!res.ok)throw new Error(body.message||body.error||'Falha na leitura');return body}
`;

function presentationModal(buttonClass) {
  return `<div id="presentationModal" class="modal"><div class="dialog modal-card"><h2>Modo apresentação</h2><p class="presentation-help">Escolha os técnicos cujos nomes poderão aparecer. Os demais serão identificados como Técnico 01, Técnico 02 e assim por diante. Todos os valores em reais serão ocultados.</p><div class="toolbar"><button id="presentationSelectAll" class="${buttonClass}">Marcar todos</button><button id="presentationClearAll" class="${buttonClass}">Desmarcar todos</button></div><div id="presentationNames" class="presentation-list"></div><div class="toolbar"><button id="presentationStart" class="btn">Iniciar apresentação</button><button id="presentationHideAll" class="${buttonClass}">Ocultar todos</button><button data-close="presentationModal" class="${buttonClass}">Cancelar</button></div></div></div>`;
}

function presentationRuntime(kind) {
  const techExpr = kind === 'combined' ? 'r.tecnico' : 'r.__tech';
  const testerExpr = kind === 'combined' ? 'r.testador' : 'r.__tester';
  const storageKey = kind === 'combined' ? 'combinedPresentationNames' : 'nokiaPresentationNames';
  const restore = kind === 'combined'
    ? `populateFilters();setupTeam();applyFilters();`
    : `populateFilters();renderTeamControls();renderAll();`;
  const financeGuard = kind === 'nokia' ? `if(document.querySelector('.nav button[data-tab="finance"]')?.classList.contains('active'))openTab('overview');` : '';
  return `
function presentationPeople(){return [...new Set(RAW.flatMap(r=>[${techExpr},${testerExpr}]).map(txt).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'))}
function rebuildPresentationAliases(){presentationAliases.clear();presentationPeople().forEach((name,index)=>presentationAliases.set(name,'Técnico '+String(index+1).padStart(2,'0')))}
function presentationName(name){let value=txt(name);if(!presentationMode||presentationVisible.has(value))return value;return presentationAliases.get(value)||'Técnico oculto'}
function presentationChart(config,id){if(!presentationMode||!config)return config;let labels=config.data?.labels;if(Array.isArray(labels))config.data.labels=labels.map(label=>presentationName(label));if(/^billing/i.test(id||'')){config.options=config.options||{};config.options.plugins=config.options.plugins||{};config.options.plugins.tooltip={enabled:false}}return config}
function presentationScrub(root=document.body){if(!presentationMode||!root)return;rebuildPresentationAliases();let people=presentationPeople().sort((a,b)=>b.length-a.length),walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);for(let node of nodes){let parent=node.parentElement;if(!parent||parent.closest('#presentationModal,script,style'))continue;let value=node.nodeValue||'',next=value.replace(/R\\$\\s*[0-9.]+(?:,[0-9]{1,2})?/g,'Valor oculto');for(let name of people){if(presentationVisible.has(name))continue;next=next.split(name).join(presentationAliases.get(name))}if(next!==value)node.nodeValue=next}}
function fillPresentationNames(){let names=presentationPeople(),saved=[];try{saved=JSON.parse(localStorage.getItem('${storageKey}')||'[]')}catch{}presentationVisible=new Set(Array.isArray(saved)?saved.filter(n=>names.includes(n)):[]);$('presentationNames').innerHTML=names.map(n=>\`<label class="presentation-choice"><input type="checkbox" value="\${esc(n)}" \${presentationVisible.has(n)?'checked':''}> <span>\${esc(n)}</span></label>\`).join('')||'<div class="empty">Nenhum técnico encontrado.</div>'}
function openPresentation(){fillPresentationNames();$('presentationModal').classList.add('open')}
function readPresentationSelection(){presentationVisible=new Set([...$('presentationNames').querySelectorAll('input:checked')].map(x=>x.value));localStorage.setItem('${storageKey}',JSON.stringify([...presentationVisible]))}
function setPresentation(active){presentationMode=active;document.body.classList.toggle('presentation-mode',active);$('presentationBtn').textContent=active?'Encerrar apresentação':'Apresentação';$('presentationStatus').textContent=active?(presentationVisible.size?presentationVisible.size+' nome(s) visível(is)':'Todos os nomes ocultos'):'';${financeGuard}${restore}if(active){requestAnimationFrame(()=>presentationScrub());$('detailModal')?.classList.remove('open')}}
function startPresentation(hideAll=false){if(hideAll){$('presentationNames').querySelectorAll('input').forEach(x=>x.checked=false)}readPresentationSelection();$('presentationModal').classList.remove('open');setPresentation(true)}
const presentationObserver=new MutationObserver(mutations=>{if(!presentationMode)return;for(let mutation of mutations)for(let node of mutation.addedNodes)if(node.nodeType===Node.ELEMENT_NODE||node.nodeType===Node.TEXT_NODE)presentationScrub(node.nodeType===Node.TEXT_NODE?node.parentElement:node)});
presentationObserver.observe(document.body,{childList:true,subtree:true});
$('presentationBtn').onclick=()=>presentationMode?setPresentation(false):openPresentation();
$('presentationSelectAll').onclick=()=>$('presentationNames').querySelectorAll('input').forEach(x=>x.checked=true);
$('presentationClearAll').onclick=()=>$('presentationNames').querySelectorAll('input').forEach(x=>x.checked=false);
$('presentationStart').onclick=()=>startPresentation(false);
$('presentationHideAll').onclick=()=>startPresentation(true);
`;
}

function buildCombined() {
  let html = stripSnapshot(fs.readFileSync(path.join(sourceRoot, 'Painel_Desempenho_Tecnicos_CLARO_NOKIA.html'), 'utf8'));
  html = html.replaceAll('combinedActiveTechs', 'portalCombinedActiveTechsV8');
  html = replaceOnce(html, '</style></head>', presentationCss + '</style></head>', 'CSS combinado');
  html = replaceOnce(html, '<span id="sourceStatus" class="status">Snapshot local</span>', '<span id="sourceStatus" class="status">Conectando ao Portal</span>', 'status inicial combinado');
  html = replaceOnce(html, '<button id="refreshBtn" class="btn">Atualizar</button><button id="settingsBtn" class="btn alt">Configurar</button>', '<span id="presentationStatus" class="presentation-status"></span><button id="presentationBtn" class="btn alt">Apresentação</button><button id="refreshBtn" class="btn">Atualizar</button>', 'ações combinado');
  html = html.replace(/^<div id="settingsModal" class="modal">.*\r?\n/m, presentationModal('btn alt') + '\n');
  html = replaceOnce(html, '<script>\nconst SNAPSHOT=', `<script>\n${portalSourceRuntime}\nlet presentationMode=false,presentationVisible=new Set(),presentationAliases=new Map();\nconst SNAPSHOT=`, 'config combinado');
  html = replaceOnce(html, `money=n=>(Number(n)||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})`, `money=n=>presentationMode?'Valor oculto':(Number(n)||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})`, 'moeda combinado');
  html = replaceOnce(html, 'function chart(id,cfg){if(charts[id])charts[id].destroy();charts[id]=new Chart($(id),cfg)}', 'function chart(id,cfg){cfg=presentationChart(cfg,id);if(charts[id])charts[id].destroy();charts[id]=new Chart($(id),cfg)}', 'gráficos combinado');
  html = replaceOnce(html, `async function refreshData(){let endpoint=localStorage.getItem('combinedEndpoint')||'';`, `async function refreshData(){if($('refreshBtn').disabled)return;`, 'endpoint combinado');
  html = replaceOnce(html, `try{if(!endpoint){$('sourceStatus').textContent='Snapshot local';return}let url=endpoint+(endpoint.includes('?')?'&':'?')+'cliente=ambos&_='+Date.now(),res=await fetch(url,{cache:'no-store'});if(!res.ok)throw new Error('HTTP '+res.status);let p=await res.json(),rows=`, `try{let p=await fetchPanelPayload('combined'),rows=`, 'leitura autenticada combinado');
  html = replaceOnce(html, `catch(e){console.error(e);$('sourceStatus').textContent='Falha · snapshot mantido'}`, `catch(e){console.error(e);$('sourceStatus').textContent=e.message==='PORTAL_REQUIRED'?'Abra pelo Portal':'Falha na atualização'}`, 'falha combinado');
  html = replaceOnce(html, 'Object.values(FILTERS).forEach(id=>$(id).onchange=applyFilters);', presentationRuntime('combined') + '\nObject.values(FILTERS).forEach(id=>$(id).onchange=applyFilters);', 'runtime combinado');
  html = replaceOnce(html, `$('settingsBtn').onclick=()=>{$('endpointInput').value=localStorage.getItem('combinedEndpoint')||'';$('settingsModal').classList.add('open')};$('saveEndpoint').onclick=()=>{localStorage.setItem('combinedEndpoint',$('endpointInput').value.trim());$('settingsModal').classList.remove('open');refreshData()};`, '', 'configuração antiga combinado');
  html = replaceOnce(html, `init(SNAPSHOT);if(localStorage.getItem('combinedEndpoint'))refreshData();setInterval(()=>{if(localStorage.getItem('combinedEndpoint'))refreshData()},60000);`, 'if(SNAPSHOT.length)init(SNAPSHOT);refreshData();setInterval(refreshData,30000);', 'inicialização combinado');
  return html;
}

function buildNokia() {
  let html = stripSnapshot(fs.readFileSync(path.join(sourceRoot, 'Painel_Executivo_NOKIA.html'), 'utf8'));
  html = html.replaceAll('Painel Executivo Nokia', 'Desempenho Técnico Nokia');
  html = html.replaceAll('nokiaActiveTechs', 'portalNokiaActiveTechsV2');
  html = replaceOnce(html, '</style>\n</head>', presentationCss + '</style>\n</head>', 'CSS Nokia');
  html = replaceOnce(html, '<span id="sourceStatus" class="status-pill">Snapshot local</span><button class="btn secondary small" id="settingsBtn">Configurar</button><button class="btn small" id="refreshBtn">Atualizar informações</button>', '<span id="sourceStatus" class="status-pill">Conectando ao Portal</span><span id="presentationStatus" class="presentation-status"></span><button class="btn secondary small" id="presentationBtn">Apresentação</button><button class="btn small" id="refreshBtn">Atualizar informações</button>', 'ações Nokia');
  html = html.replace(/^<div class="modal" id="settingsModal">.*\r?\n/m, presentationModal('btn secondary') + '\n');
  html = replaceOnce(html, '<script>\nconst SNAPSHOT=', `<script>\n${portalSourceRuntime}\nlet presentationMode=false,presentationVisible=new Set(),presentationAliases=new Map();\nconst SNAPSHOT=`, 'config Nokia');
  html = replaceOnce(html, `const money=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:2}).format(v||0);`, `const money=v=>presentationMode?'Valor oculto':new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:2}).format(v||0);`, 'moeda Nokia');
  html = replaceOnce(html, 'function chart(id,config){if(charts[id])charts[id].destroy();charts[id]=new Chart($(id),config)}', 'function chart(id,config){config=presentationChart(config,id);if(charts[id])charts[id].destroy();charts[id]=new Chart($(id),config)}', 'gráficos Nokia');
  html = replaceOnce(html, `async function refreshData(){let endpoint=localStorage.getItem('nokiaEndpoint')||'';`, `async function refreshData(){if($('refreshBtn').disabled)return;`, 'endpoint Nokia');
  html = replaceOnce(html, `try{if(endpoint){let res=await fetch(endpoint+(endpoint.includes('?')?'&':'?')+'cliente=nokia&_='+Date.now(),{cache:'no-store'});if(!res.ok)throw new Error('HTTP '+res.status);let payload=await res.json(),rows=`, `try{let payload=await fetchPanelPayload('nokia'),rows=`, 'leitura autenticada Nokia');
  html = replaceOnce(html, `;$('sourceStatus').textContent='Tempo real · '+new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}else{RAW=SNAPSHOT.map(normalizeRow);$('sourceStatus').textContent='Snapshot local'}initAfterData()`, `;$('sourceStatus').textContent='Tempo real · '+new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});initAfterData()`, 'resultado Nokia');
  html = replaceOnce(html, `catch(e){console.error(e);$('sourceStatus').textContent='Falha na atualização';alert('Não foi possível atualizar o endpoint. O snapshot local continuará disponível.')}`, `catch(e){console.error(e);$('sourceStatus').textContent=e.message==='PORTAL_REQUIRED'?'Abra pelo Portal':'Falha na atualização'}`, 'falha Nokia');
  html = replaceOnce(html, `function initAfterData(){populateFilters();`, `function initAfterData(){rebuildPresentationAliases();populateFilters();`, 'aliases Nokia');
  html = replaceOnce(html, 'document.querySelectorAll(\'.nav button\').forEach(b=>b.onclick=()=>openTab(b.dataset.tab));', presentationRuntime('nokia') + `\nif(typeof exportRows==='function'){const originalExportRows=exportRows;exportRows=function(){let rows=originalExportRows();if(!presentationMode)return rows;return rows.map(row=>{let safe={...row};for(let key of Object.keys(safe)){let n=norm(key);if(n.includes('TECNICO')||n.includes('TESTADO'))safe[key]=presentationName(safe[key]);if(n.includes('VALOR'))safe[key]='Oculto'}return safe})}}\ndocument.querySelectorAll('.nav button').forEach(b=>b.onclick=()=>openTab(b.dataset.tab));`, 'runtime Nokia');
  html = replaceOnce(html, `$('settingsBtn').onclick=()=>{$('endpointInput').value=localStorage.getItem('nokiaEndpoint')||'';$('settingsModal').classList.add('open')};$('saveEndpoint').onclick=()=>{localStorage.setItem('nokiaEndpoint',$('endpointInput').value.trim());$('settingsModal').classList.remove('open');refreshData()};`, '', 'configuração antiga Nokia');
  html = replaceOnce(html, `RAW=SNAPSHOT.map(normalizeRow);initAfterData();if(localStorage.getItem('nokiaEndpoint'))refreshData();setInterval(()=>{if(localStorage.getItem('nokiaEndpoint'))refreshData()},60000);`, 'RAW=SNAPSHOT.map(normalizeRow);initAfterData();refreshData();setInterval(refreshData,30000);', 'inicialização Nokia');
  return html;
}

const outputs = [
  ['desempenho-funcionarios/index.html', buildCombined()],
  ['painel-executivo-nokia/index.html', buildNokia()],
];

for (const [relative, html] of outputs) {
  const target = path.join(publishRoot, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, html, 'utf8');
  console.log(`${relative}: ${Buffer.byteLength(html).toLocaleString('pt-BR')} bytes`);
}
