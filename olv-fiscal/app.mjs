import { VERSION, COMPANIES, emptyDatabase, applyMutation, totals, reviewIssues } from './domain.mjs';
const API = 'https://kvfjjtkwxxbvzlicwnrz.supabase.co/functions/v1/olv-fiscal-hml-api';
const $ = id => document.getElementById(id);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((value || 0) / 100);
const date = value => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(value)) : '—';
const number = value => { const v = BigInt(value || 0); return `${v / 10000n}.${String(v % 10000n).padStart(4, '0')}`.replace(/\.?0+$/, '') || '0'; };
const statusNames = { RASCUNHO:'Rascunho', EM_REVISAO:'Em revisão', PRONTO_PARA_TESTE:'Pronto para teste', ARQUIVADO:'Arquivado' };
const demo = ['localhost','127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).get('demo') === '1';
let context, graphToken, company = 'LIVION', snapshot, page = 'dashboard', editingId = null, catalog = 'customers', dirty = false, busy = false;
let pendingMutation;
const demoDatabases = { LIVION:emptyDatabase('LIVION'), RHCS:emptyDatabase('RHCS') };
function notify(message, error = false) { $('message').textContent = message; $('message').className = error ? 'error' : ''; $('message').hidden = false; }
function gate(title, message, connect = false) {
  $('gate').hidden = false; $('content').hidden = true;
  $('gate').innerHTML = `<h2>${escape(title)}</h2><p>${escape(message)}</p>${connect ? '<button class="button primary" id="connect">Conectar OneDrive</button>' : '<a class="button primary" href="../?app=olv-fiscal" target="_top">Abrir pelo Portal Livion</a>'}`;
  if (connect) $('connect').onclick = () => connectOneDrive().catch(handleError);
}
function handleError(error) { notify(error.message || 'Não foi possível concluir a operação.', true); }
async function portalToken(force = false) {
  try { if (window.parent !== window && window.parent.__PORTAL_GET_TOKEN__) return await window.parent.__PORTAL_GET_TOKEN__(force); } catch {}
  throw new Error('Abra o OLV Fiscal dentro do Portal Livion para usar sua sessão Microsoft.');
}
async function call(path, options = {}, graph = true) {
  const token = graph ? graphToken : await portalToken();
  if (!token) throw new Error('Conecte o OneDrive antes de carregar ou salvar rascunhos.');
  const response = await fetch(API + path, { ...options, headers: { Authorization: 'Bearer ' + token,
    'Content-Type':'application/json', ...options.headers }, cache:'no-store', signal:AbortSignal.timeout(60000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(data.error || 'O serviço de testes não respondeu.'); error.status = response.status; error.code = data.code; throw error; }
  return data;
}
function permitted(action) { return context?.permissions?.[company]?.[action] === true; }
async function connectOneDrive() {
  let broker; try { broker = window.parent.__PORTAL_GET_OLV_GRAPH_TOKEN__; } catch {}
  if (typeof broker !== 'function') throw new Error('Atualize o Portal Livion para conectar o OneDrive do OLV Fiscal.');
  $('connect').disabled = true; $('connect').textContent = 'Conectando…';
  try { graphToken = await broker(true); await loadState(); } finally { if ($('connect')) { $('connect').disabled = false; $('connect').textContent = 'Conectar OneDrive'; } }
}
async function loadState() {
  snapshot = demo ? { data: structuredClone(demoDatabases[company]), etag: `demo-${demoDatabases[company].revision}` } : await call(`/state?company=${company}`);
  $('gate').hidden = true; $('content').hidden = false; $('reload').hidden = false; $('company').disabled = false;
  $('storage-status').textContent = demo ? 'Demonstração local · dados fictícios desta sessão' : `OneDrive · ${COMPANIES[company]} · revisão ${snapshot.data.revision}`;
  render();
}
async function mutate(command) {
  if (busy) return;
  const form = $('draft-form'), signature = JSON.stringify({company,command});
  const requestId = pendingMutation?.signature === signature ? pendingMutation.requestId : crypto.randomUUID();
  pendingMutation = {signature,requestId};
  busy = true; document.querySelectorAll('[data-write]').forEach(button => button.disabled = true);
  try {
    const payload = { ...command, revision: snapshot.data.revision, etag:snapshot.etag, requestId };
    if (demo) {
      demoDatabases[company] = applyMutation(demoDatabases[company], payload, 'Usuário de demonstração', new Date().toISOString(), requestId);
      snapshot = { data: structuredClone(demoDatabases[company]), etag:`demo-${demoDatabases[company].revision}` };
    } else snapshot = await call(`/mutate?company=${company}`, { method:'POST', body:JSON.stringify(payload) });
    dirty = false; pendingMutation = null; editingId = null; page = command.kind === 'save-catalog' ? 'catalogs' : 'drafts'; render();
    $('storage-status').textContent = demo ? 'Demonstração local · dados fictícios desta sessão' : `OneDrive · ${COMPANIES[company]} · revisão ${snapshot.data.revision}`;
    notify(demo ? 'Alteração registrada apenas nesta demonstração local.' : 'Alteração salva e confirmada no OneDrive.');
  } finally { busy = false; document.querySelectorAll('[data-write]').forEach(button => button.disabled = false); }
}
function discard() { return !dirty || confirm('Há alterações não salvas neste rascunho. Deseja sair sem salvar?'); }
function navigate(next) { if (!discard()) return; dirty = false; editingId = null; page = next; render(); }
function badge(status) { return `<span class="badge ${escape(status)}">${escape(statusNames[status] || status)}</span>`; }
function draftRows(rows) {
  if (!rows.length) return '<div class="empty"><strong>Nenhum rascunho por aqui</strong>Crie uma venda ou uma devolução para começar os testes.</div>';
  return `<div class="table-wrap"><table><thead><tr><th>Rascunho</th><th>Operação / destinatário</th><th>Situação</th><th>Atualização</th><th class="money">Valor</th><th></th></tr></thead><tbody>${rows.map(d => `<tr><td><strong>${escape(d.label)}</strong><div class="help">${d.type === 'VENDA' ? 'Venda' : 'Devolução'}</div></td><td>${escape(d.recipient.name || 'Destinatário pendente')}<div class="help">${escape(d.operation || 'Natureza pendente')}</div></td><td>${badge(d.status)}</td><td class="help">${date(d.updatedAt)}</td><td class="money">${money(totals(d).totalCents)}</td><td><button class="button small" data-open="${escape(d.id)}">Abrir</button></td></tr>`).join('')}</tbody></table></div>`;
}
function dashboard() {
  const rows = snapshot.data.drafts, active = rows.filter(d => d.status !== 'ARQUIVADO');
  return `<div class="kpis"><div class="card kpi"><span>Rascunhos em aberto</span><strong>${active.length}</strong><small>Vendas e devoluções</small></div><div class="card kpi"><span>Em revisão</span><strong>${rows.filter(d=>d.status==='EM_REVISAO').length}</strong><small>Para conferência</small></div><div class="card kpi"><span>Prontos para teste</span><strong>${rows.filter(d=>d.status==='PRONTO_PARA_TESTE').length}</strong><small>Emissão ainda bloqueada</small></div><div class="card kpi"><span>Valor dos rascunhos</span><strong>${money(active.reduce((s,d)=>s+totals(d).totalCents,0))}</strong><small>Valores de homologação</small></div></div>
    <div class="grid-two"><section class="card"><div class="panel-head"><h2>Rascunhos recentes</h2><button class="text-button" data-nav="drafts">Ver todos</button></div>${draftRows([...rows].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,5))}</section><section class="card"><h2>Preparar uma nota</h2><p class="help">Organize os dados, salve e compartilhe o rascunho com quem vai revisar.</p><div class="quick"><button class="button primary" data-new="VENDA" ${!permitted('editar_rascunhos')?'disabled':''}>＋ Nova venda</button><button class="button" data-new="DEVOLUCAO" ${!permitted('editar_rascunhos')?'disabled':''}>↩ Nova devolução</button><button class="button" data-nav="catalogs">Cadastros de testes</button></div></section></div>
    <section class="card"><h2>Próximas etapas do OLV web</h2><div class="extension"><div><strong>Emissão de NF-e</strong><small>Motor fiscal e certificado serão validados em uma próxima etapa.</small></div><span class="badge">BLOQUEADA</span></div><div class="extension"><div><strong>XML e DANFE no OneDrive</strong><small>Pastas preparadas para os documentos de cada empresa.</small></div><span class="badge">PREPARADO</span></div><div class="extension"><div><strong>Migração do OLV Windows</strong><small>Os dados atuais permanecem na instalação existente.</small></div><span class="badge">AGUARDANDO TESTES</span></div></section>`;
}
function drafts() {
  return `<div class="toolbar"><button class="button primary" data-new="VENDA" ${!permitted('editar_rascunhos')?'disabled':''}>＋ Nova venda</button><button class="button" data-new="DEVOLUCAO" ${!permitted('editar_rascunhos')?'disabled':''}>Nova devolução</button><span class="spacer"></span><input id="search" aria-label="Buscar rascunhos" placeholder="Buscar destinatário ou rascunho" style="max-width:260px"><select id="status-filter" aria-label="Filtrar situação"><option value="">Todas as situações</option>${Object.entries(statusNames).map(([key,name])=>`<option value="${key}">${name}</option>`).join('')}</select></div><section class="card" id="draft-list">${draftRows(snapshot.data.drafts)}</section>`;
}
function field(label, name, value = '', attrs = '', wide = false) { return `<label class="field ${wide?'wide':''}">${label}<input name="${name}" value="${escape(value)}" ${attrs}></label>`; }
function newDraft(type) {
  if (!discard()) return;
  dirty = false; editingId = null; page = 'editor'; render({ type, recipient:{}, items:[], references:[], notes:'', freightCents:0, discountCents:0 });
}
function editor(draft) {
  const writable = permitted('editar_rascunhos') && draft.status !== 'ARQUIVADO';
  const customers = snapshot.data.catalogs.customers.filter(c=>c.active);
  return `<section class="card"><div class="panel-head"><div><h2>${draft.id ? escape(draft.label) : draft.type==='VENDA'?'Nova venda':'Nova devolução'}</h2><span class="help">Rascunho de homologação · sem número fiscal</span></div>${draft.status?badge(draft.status):''}</div><form id="draft-form" data-type="${draft.type}"><fieldset ${!writable?'disabled':''} style="border:0;padding:0;margin:0">
    <div class="form-grid"><label class="field">Usar cliente cadastrado<select id="customer-pick"><option value="">Preencher manualmente</option>${customers.map(c=>`<option value="${escape(c.id)}">${escape(c.name)}</option>`).join('')}</select></label>${field('Natureza da operação','operation',draft.operation,'maxlength="160"')}${field('CFOP para conferência','cfop',draft.cfop,'maxlength="4" inputmode="numeric" placeholder="Ex.: 5102"')}${field('Destinatário','recipientName',draft.recipient.name,'maxlength="160"')}${field('CPF / CNPJ','recipientDocument',draft.recipient.document,'maxlength="24"')}${field('Inscrição estadual','recipientIE',draft.recipient.ie,'maxlength="24"')}${field('Cidade','recipientCity',draft.recipient.city,'maxlength="120"')}${field('UF','recipientUF',draft.recipient.uf,'maxlength="2"')}${field('Endereço','recipientAddress',draft.recipient.address,'maxlength="200"')}</div>
    <div class="section-heading"><h3>Itens da nota</h3><p class="help">Os valores abaixo são para conferência do rascunho; a tributação será validada na integração fiscal.</p></div><div class="table-wrap"><div class="item-fields item-labels"><span>Código</span><span>Descrição</span><span>NCM</span><span>Unid.</span><span>Qtd.</span><span>Valor unit.</span><span>Total</span><span></span></div><div id="items">${draft.items.map(itemRow).join('')}</div></div><button type="button" class="button small" id="add-item">＋ Adicionar item</button>
    <div class="section-heading"><h3>Referências e informações adicionais</h3></div><div class="form-grid">${field('Frete (R$)','freight',((draft.freightCents||0)/100).toFixed(2),'inputmode="decimal"')}${field('Desconto (R$)','discount',((draft.discountCents||0)/100).toFixed(2),'inputmode="decimal"')}<label class="field wide">Chaves de NF-e referenciadas ${draft.type==='DEVOLUCAO'?'· necessárias para a devolução':''}<textarea name="references" placeholder="Uma chave de 44 dígitos por linha">${escape(draft.references.join('\n'))}</textarea></label><label class="field wide">Observações<textarea name="notes" maxlength="4000">${escape(draft.notes)}</textarea></label></div><div class="totals"><span>Total do rascunho</span><strong id="draft-total">${money(totals(draft).totalCents)}</strong></div></fieldset>
    <div class="form-bottom"><button type="button" class="button" data-nav="drafts">Voltar aos rascunhos</button><div class="actions"><button type="button" class="button" id="preview">Conferir rascunho</button><button type="submit" class="button primary" data-write ${!writable?'disabled':''}>Salvar rascunho</button></div></div></form>
    ${draft.id?`<div class="form-bottom"><div class="actions"><button class="button small" id="duplicate" data-write ${!permitted('editar_rascunhos')?'disabled':''}>Duplicar</button><select id="next-status" aria-label="Nova situação">${Object.entries(statusNames).map(([key,name])=>`<option value="${key}" ${key===draft.status?'selected':''}>${name}</option>`).join('')}</select><button class="button small" id="set-status" data-write ${!permitted('revisar')?'disabled':''}>Atualizar situação</button></div><button class="button" id="emit" disabled title="A emissão fiscal será liberada após a homologação">Emitir nota · bloqueado</button></div>`:''}</section>`;
}
function itemRow(item = {}) {
  return `<div class="item-fields item-row"><input data-item="code" aria-label="Código do item" value="${escape(item.code)}" maxlength="60"><input data-item="description" aria-label="Descrição do item" value="${escape(item.description)}" maxlength="180"><input data-item="ncm" aria-label="NCM do item" value="${escape(item.ncm)}" maxlength="8"><input data-item="unit" aria-label="Unidade do item" value="${escape(item.unit||'UN')}" maxlength="6"><input data-item="quantity" aria-label="Quantidade do item" inputmode="decimal" value="${item.quantity?number(item.quantity):'1'}"><input data-item="unitPrice" aria-label="Valor unitário do item" inputmode="decimal" value="${item.unitPrice?number(item.unitPrice):'0'}"><span class="money help item-total">${money(item.totalCents)}</span><button class="remove" type="button" aria-label="Remover item">×</button></div>`;
}
function readForm() {
  const form = $('draft-form'), data = new FormData(form);
  return { type:form.dataset.type, operation:data.get('operation'), cfop:data.get('cfop'),
    recipient:{name:data.get('recipientName'),document:data.get('recipientDocument'),ie:data.get('recipientIE'),city:data.get('recipientCity'),uf:data.get('recipientUF'),address:data.get('recipientAddress')},
    items:[...document.querySelectorAll('.item-row')].map(row=>Object.fromEntries([...row.querySelectorAll('[data-item]')].map(input=>[input.dataset.item,input.value]))),
    references:data.get('references'),notes:data.get('notes'),freight:data.get('freight'),discount:data.get('discount') };
}
async function formTotals() {
  try {
    const { draftPayload } = await import('./domain.mjs');
    const draft = draftPayload({...readForm(), references:[]});
    $('draft-total').textContent = money(totals(draft).totalCents);
    document.querySelectorAll('.item-total').forEach((node,index)=>node.textContent=money(draft.items[index]?.totalCents));
  } catch { $('draft-total').textContent = 'Verifique os valores'; }
}
function catalogs() {
  const names={customers:'Clientes',products:'Produtos',carriers:'Transportadoras'}, rows=snapshot.data.catalogs[catalog];
  return `<div class="tabs">${Object.entries(names).map(([key,name])=>`<button data-catalog="${key}" class="${catalog===key?'active':''}">${name}</button>`).join('')}</div><section class="card"><h2>${names[catalog]} de homologação</h2><p class="help">Estes cadastros pertencem à empresa selecionada e não foram importados do OLV Windows.</p>${rows.length?`<div class="table-wrap"><table><thead><tr><th>Nome / descrição</th><th>${catalog==='products'?'Código / NCM':'Documento'}</th><th>Estado</th><th></th></tr></thead><tbody>${rows.map(row=>`<tr><td>${escape(row.name)}</td><td>${escape(catalog==='products'?`${row.code} · ${row.ncm}`:row.document)}</td><td>${row.active?'Ativo':'Inativo'}</td><td><button class="button small" data-edit-catalog="${escape(row.id)}">Editar</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">Nenhum cadastro de teste nesta empresa.</div>'}<div class="section-heading"><h3 id="catalog-heading">Novo cadastro</h3></div><form id="catalog-form"><div class="form-grid">${field('Nome / descrição','name','','maxlength="180" required')}${field(catalog==='products'?'Código':'CPF / CNPJ',catalog==='products'?'code':'document')}${field(catalog==='products'?'NCM':'Cidade',catalog==='products'?'ncm':'city')}${field(catalog==='products'?'Unidade':'UF',catalog==='products'?'unit':'uf',catalog==='products'?'UN':'')}<label class="field">Situação<select name="active"><option value="true">Ativo</option><option value="false">Inativo</option></select></label></div><div class="form-bottom"><span class="help">Dados exclusivos do ambiente de testes</span><button class="button primary" data-write ${!permitted('cadastros')?'disabled':''}>Salvar cadastro</button></div></form></section>`;
}
function history() {
  const names={'save-draft':'Rascunho salvo',status:'Situação atualizada',duplicate:'Rascunho duplicado','save-catalog':'Cadastro salvo'};
  return `<section class="card"><div class="panel-head"><h2>Histórico de alterações</h2><button class="button small" id="export" ${!permitted('exportar')?'disabled':''}>Exportar base de testes</button></div>${snapshot.data.audit.length?`<div class="table-wrap"><table><thead><tr><th>Quando</th><th>Responsável</th><th>Ação</th><th>Situação</th></tr></thead><tbody>${[...snapshot.data.audit].reverse().map(event=>`<tr><td>${date(event.at)}</td><td>${escape(event.actor)}</td><td>${escape(names[event.action]||event.action)}</td><td>${event.status?badge(event.status):'—'}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">As alterações confirmadas no OneDrive aparecerão aqui.</div>'}</section>`;
}
function settings() {
  return `<section class="card"><h2>Ambiente do OLV Fiscal</h2><div class="settings-row"><strong>Versão</strong><span>${VERSION}</span></div><div class="settings-row"><strong>Banco de dados</strong><span class="path">C:\\OneDrive - Livion Solutions\\00-PORTAL LIVION\\OLV FISCAL\\Homologacao\\Dados\\${company}.json</span></div><div class="settings-row"><strong>Documentos</strong><span class="path">OLV FISCAL / Homologacao / Arquivos / ${company}</span></div><div class="settings-row"><strong>Gravação</strong><span>Cópia anterior preservada em Backups. Alterações antigas são recusadas.</span></div><div class="settings-row"><strong>Emissão e certificado</strong><span>Bloqueados nesta etapa. Nenhum certificado é solicitado.</span></div><div class="settings-row"><strong>Migração do Windows</strong><span>Não iniciada. Os bancos e as instalações atuais permanecem separados.</span></div><div class="settings-row"><strong>Próximos recursos</strong><span>Importação assistida, regras tributárias, emissão e arquivos fiscais serão integrados por etapas.</span></div></section>`;
}
function render(draft) {
  const titles={dashboard:'Visão geral',drafts:'Rascunhos de notas',editor:'Preparar rascunho',catalogs:'Cadastros',history:'Histórico de alterações',settings:'Configuração'};
  $('page-title').textContent=titles[page]; document.querySelectorAll('nav [data-page]').forEach(button=>button.classList.toggle('active',button.dataset.page===(page==='editor'?'drafts':page)));
  $('content').innerHTML=page==='editor'?editor(draft||snapshot.data.drafts.find(d=>d.id===editingId)):({dashboard,drafts,catalogs,history,settings}[page])();
  document.querySelectorAll('[data-nav]').forEach(button=>button.onclick=()=>navigate(button.dataset.nav));
  document.querySelectorAll('[data-new]').forEach(button=>button.onclick=()=>newDraft(button.dataset.new));
  document.querySelectorAll('[data-open]').forEach(button=>button.onclick=()=>{if(!discard())return;dirty=false;editingId=button.dataset.open;page='editor';render();});
  if(page==='drafts') {
    const filter=()=>{const query=$('search').value.toLowerCase(),status=$('status-filter').value;$('draft-list').innerHTML=draftRows(snapshot.data.drafts.filter(d=>(!status||d.status===status)&&`${d.label} ${d.recipient.name} ${d.operation}`.toLowerCase().includes(query)));document.querySelectorAll('[data-open]').forEach(button=>button.onclick=()=>{editingId=button.dataset.open;page='editor';render();});};
    $('search').oninput=filter; $('status-filter').onchange=filter;
  }
  if(page==='editor') bindEditor();
  if(page==='catalogs') bindCatalogs();
  if($('export')) $('export').onclick=()=>exportData().catch(handleError);
}
function bindEditor() {
  const form=$('draft-form');
  form.oninput=()=>{dirty=true;delete form.dataset.requestId;formTotals();};
  form.onsubmit=event=>{event.preventDefault();mutate({kind:'save-draft',id:editingId,draft:readForm()}).catch(handleError);};
  $('add-item').onclick=()=>{$('items').insertAdjacentHTML('beforeend',itemRow());dirty=true;delete form.dataset.requestId;};
  $('items').onclick=event=>{const button=event.target.closest('.remove');if(button){button.closest('.item-row').remove();dirty=true;delete form.dataset.requestId;formTotals();}};
  $('customer-pick').onchange=()=>{const customer=snapshot.data.catalogs.customers.find(c=>c.id===$('customer-pick').value);if(customer){for(const [key,value] of Object.entries({recipientName:customer.name,recipientDocument:customer.document,recipientCity:customer.city,recipientUF:customer.uf}))form.elements[key].value=value||'';dirty=true;delete form.dataset.requestId;}};
  $('preview').onclick=async()=>{try{const {draftPayload}=await import('./domain.mjs');const draft=draftPayload(readForm());const issues=reviewIssues(draft);notify(issues.length?issues.join(' '):`Conferência do rascunho: ${draft.items.length} item(ns), total ${money(totals(draft).totalCents)}. A validação tributária e a emissão serão feitas em uma próxima etapa.`,issues.length>0);}catch(error){handleError(error);}};
  if($('duplicate')) $('duplicate').onclick=()=>{if(discard())mutate({kind:'duplicate',id:editingId}).catch(handleError);};
  if($('set-status')) $('set-status').onclick=()=>{if(dirty){notify('Salve o rascunho antes de alterar a situação.',true);return;}mutate({kind:'status',id:editingId,status:$('next-status').value}).catch(handleError);};
}
function bindCatalogs() {
  document.querySelectorAll('[data-catalog]').forEach(button=>button.onclick=()=>{catalog=button.dataset.catalog;render();});
  const form=$('catalog-form');form.onsubmit=event=>{event.preventDefault();const item=Object.fromEntries(new FormData(form));item.active=item.active==='true';mutate({kind:'save-catalog',catalog,id:form.dataset.id||null,item}).catch(handleError);};
  document.querySelectorAll('[data-edit-catalog]').forEach(button=>button.onclick=()=>{const item=snapshot.data.catalogs[catalog].find(r=>r.id===button.dataset.editCatalog);form.dataset.id=item.id;$('catalog-heading').textContent='Editar cadastro';for(const [key,value] of Object.entries(item))if(form.elements[key])form.elements[key].value=String(value);form.elements.name.focus();});
}
async function exportData() {
  const data=demo?{environment:'homologacao',company,data:snapshot.data}:await call(`/export?company=${company}`);
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download=`OLV_HOMOLOGACAO_${company}_${new Date().toISOString().slice(0,10)}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function start() {
  if(demo) context={user:{name:'Demonstração local'},companies:Object.entries(COMPANIES).map(([key,name])=>({key,name})),permissions:Object.fromEntries(Object.keys(COMPANIES).map(key=>[key,Object.fromEntries(['visualizar','editar_rascunhos','revisar','cadastros','exportar'].map(action=>[action,true]))]))};
  else context=await call('/context',{},false);
  if(!context.companies.length)throw new Error('Seu usuário não tem empresa liberada para consultar o OLV Fiscal.');
  company=context.companies[0].key;$('company').innerHTML=context.companies.map(c=>`<option value="${c.key}">${escape(c.name)}</option>`).join('');$('user-name').textContent=context.user.name;
  if(demo)await loadState();else gate('Conectar o banco de testes','Use sua conta Microsoft para acessar a pasta exclusiva do OLV Fiscal no OneDrive corporativo.',true);
}
document.querySelectorAll('[data-page]').forEach(button=>button.onclick=()=>{if(snapshot)navigate(button.dataset.page);});
$('company').onchange=async()=>{if(!discard()){$('company').value=company;return;}dirty=false;company=$('company').value;editingId=null;page='dashboard';try{await loadState();}catch(error){gate('Não foi possível carregar esta empresa',error.message,true);}};
$('reload').onclick=async()=>{if(!discard())return;dirty=false;page='dashboard';editingId=null;try{await loadState();notify('Base atualizada.');}catch(error){handleError(error);}};
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
start().catch(error=>gate('Abra o OLV Fiscal pelo Portal',error.message));
