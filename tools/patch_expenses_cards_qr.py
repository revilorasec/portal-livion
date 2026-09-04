from pathlib import Path

html_path = Path('despesas-reembolsos-v2.html')
js_path = Path('despesas-reembolsos-v2.js')
portal_path = Path('index.html')

html = html_path.read_text(encoding='utf-8')
js = js_path.read_text(encoding='utf-8')
portal = portal_path.read_text(encoding='utf-8')

# ---------- HTML ----------
html = html.replace(
    '.scanbox{border:1px dashed #9fb1c8;background:#f8fbff;border-radius:12px;padding:12px}',
    '.scanbox{border:1px dashed #9fb1c8;background:#f8fbff;border-radius:12px;padding:12px}.qr-reader{min-height:300px;border-radius:12px;overflow:hidden;background:#0c1527}.qr-reader video{border-radius:12px}.payment-note{padding:9px 10px;border-radius:9px;background:#f6f8fb;color:var(--muted);font-size:11px}.payment-note.corp{background:#fff2d7;color:#7a4c00}.card-list{display:grid;gap:7px;margin-top:10px}.card-item{display:flex;align-items:center;gap:9px;padding:9px;border:1px solid var(--line);border-radius:10px}.card-item .grow{min-width:0}.card-item small{display:block;color:var(--muted)}'
)

old_scan = '<div class="scanbox"><div class="actions"><button id="scanBtn" type="button" class="btn primary">Escanear nota fiscal</button><input id="scanFile" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" class="hidden"><span id="scanStatus"></span></div><small>A leitura tenta identificar QR Code e texto da nota. Confira os dados antes de salvar.</small></div>'
new_scan = '<div class="scanbox"><div class="actions"><button id="qrScanBtn" type="button" class="btn primary">Ler QR Code da nota</button><button id="photoScanBtn" type="button" class="btn">Fotografar nota</button><input id="scanFile" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" class="hidden"><span id="scanStatus"></span></div><small><b>QR Code:</b> usa a câmera como leitor e tenta consultar os dados fiscais. <b>Fotografar nota:</b> usa OCR como alternativa.</small></div>'
if old_scan in html:
    html = html.replace(old_scan, new_scan, 1)

old_payment = '<div class="field"><label>Forma de pagamento</label><select id="ePayment"></select><small id="installmentHint"></small></div><div class="field"><label>Data e hora *</label><input id="eDate" type="datetime-local"></div>'
new_payment = '<div class="field"><label>Forma de pagamento</label><select id="ePayment"></select><small id="installmentHint"></small></div><div id="eCardWrap" class="field hidden"><label>Cartão utilizado</label><select id="eCard"></select><small id="cardHint"></small></div><div class="field"><label>Esta despesa será reembolsada? *</label><select id="eReimbursable"><option value="true">Sim</option><option value="false">Não</option></select><small>Cartão da empresa define automaticamente como “Não”.</small></div><div class="field"><label>Data e hora *</label><input id="eDate" type="datetime-local"></div><div id="paymentRuleNote" class="field full hidden"><div class="payment-note"></div></div>'
if old_payment in html:
    html = html.replace(old_payment, new_payment, 1)

html = html.replace('Despesas pessoais a reembolsar pelas empresas.', 'Despesas empresariais, aprovações e reembolsos.')
html = html.replace('Categorias, centros de custo, projetos e formas de pagamento.', 'Categorias, centros de custo, projetos, formas de pagamento e cartões.')

qr_modal = '<div id="qrModal" class="modal-bg hidden"><div class="modal" style="max-width:560px"><h3>Ler QR Code da nota fiscal</h3><p style="color:var(--muted)">Aponte a câmera para o QR Code. A leitura acontece automaticamente, sem tirar foto.</p><div id="qrReader" class="qr-reader"></div><div class="modal-actions"><button id="qrClose" class="btn">Cancelar</button></div></div></div>'
marker = '<div id="modal" class="modal-bg hidden">'
if 'id="qrModal"' not in html and marker in html:
    html = html.replace(marker, qr_modal + marker, 1)

html = html.replace('./despesas-reembolsos-v2.js?v=2', './despesas-reembolsos-v2.js?v=3')

# ---------- JS ----------
js = js.replace(
    "const SCHEDULE_API='https://kvfjjtkwxxbvzlicwnrz.supabase.co/functions/v1/expenses-schedule-api';",
    "const SCHEDULE_API='https://kvfjjtkwxxbvzlicwnrz.supabase.co/functions/v1/expenses-schedule-api';\nconst CARD_API='https://kvfjjtkwxxbvzlicwnrz.supabase.co/functions/v1/expense-cards-api';\nconst FISCAL_API='https://kvfjjtkwxxbvzlicwnrz.supabase.co/functions/v1/fiscal-qr-api';"
)
js = js.replace(
    "let token='',B=null,events=[],expenses=[],reimbursements=[],agenda=[],geo=null,fiscal={},sortKey='incurred_at',sortDir=-1;",
    "let token='',B=null,events=[],expenses=[],reimbursements=[],agenda=[],cards=[],geo=null,fiscal={},qrScanner=null,sortKey='incurred_at',sortDir=-1;"
)
js = js.replace(
    "const api=(p,o)=>call(EXP_API,p,o),scheduleApi=(p,o)=>call(SCHEDULE_API,p,o);",
    "const api=(p,o)=>call(EXP_API,p,o),scheduleApi=(p,o)=>call(SCHEDULE_API,p,o),cardApi=(p,o)=>call(CARD_API,p,o),fiscalApi=(p,o)=>call(FISCAL_API,p,o);"
)

old_reload = "async function reload(){const q=currentCompany()?'?company='+encodeURIComponent(currentCompany()):'';const [ev,ex,d,r,a]=await Promise.all([api('/events'+q),api('/expenses'+q),api('/dashboard'+q),api('/reimbursements'+q),scheduleApi('/agenda'+q)]);events=ev.events||[];expenses=ex.expenses||[];reimbursements=r.reimbursements||[];agenda=a.agenda||[];renderHome(d);renderExpenses();renderEvents();renderReimbursements();renderAgenda();refreshSelects()}"
new_reload = "async function reload(){const q=currentCompany()?'?company='+encodeURIComponent(currentCompany()):'';const [ev,ex,d,r,a,c]=await Promise.all([api('/events'+q),api('/expenses'+q),api('/dashboard'+q),api('/reimbursements'+q),scheduleApi('/agenda'+q),cardApi('/cards')]);events=ev.events||[];expenses=ex.expenses||[];reimbursements=r.reimbursements||[];agenda=a.agenda||[];cards=c.cards||[];renderHome(d);renderExpenses();renderEvents();renderReimbursements();renderAgenda();refreshSelects()}"
if old_reload in js:
    js = js.replace(old_reload, new_reload, 1)

old_refresh = "function refreshSelects(){const keep=$('eCompany').value||B.companies[0]?.key||'';$('eCompany').innerHTML=opts(B.companies,'key','name','Selecione a empresa');$('eCompany').value=keep;$('ePaidBy').innerHTML=opts(B.users,'id','name');$('ePaidBy').value=String(B.user.id);$('ePaidBy').disabled=!B.user.administrator;$('expensePerson').innerHTML='<option value=\"\">Todas as pessoas</option>'+B.users.map(u=>`<option value=\"${u.id}\">${esc(u.name)}</option>`).join('');fillCompany()}"
new_refresh = "function refreshSelects(){const keep=$('eCompany').value||B.companies[0]?.key||'';$('eCompany').innerHTML=opts(B.companies,'key','name','Selecione a empresa');$('eCompany').value=keep;$('ePaidBy').innerHTML=opts(B.users,'id','name');$('ePaidBy').value=String(B.user.id);$('ePaidBy').disabled=!B.user.administrator;$('expensePerson').innerHTML='<option value=\"\">Todas as pessoas</option>'+B.users.map(u=>`<option value=\"${u.id}\">${esc(u.name)}</option>`).join('');fillCompany();renderCardOptions()}"
if old_refresh in js:
    js = js.replace(old_refresh, new_refresh, 1)

old_fill = "function fillCompany(){const c=$('eCompany').value;$('eCategory').innerHTML=opts(B.categories.filter(x=>x.company_key===c),'category_id','name');$('eCost').innerHTML=opts(B.costCenters.filter(x=>x.company_key===c),'cost_center_id','name');$('eProject').innerHTML=opts(B.projects.filter(x=>x.company_key===c),'project_id','name');$('ePayment').innerHTML=opts(B.paymentMethods.filter(x=>x.company_key===c),'payment_method_id','name');$('eEvent').innerHTML=opts(events.filter(x=>x.company_key===c&&!['CANCELADO','ARQUIVADO'].includes(x.status)),'event_id','name','Selecione o evento');paymentChanged()}"
new_fill = "function fillCompany(){const c=$('eCompany').value;$('eCategory').innerHTML=opts(B.categories.filter(x=>x.company_key===c),'category_id','name');$('eCost').innerHTML=opts(B.costCenters.filter(x=>x.company_key===c),'cost_center_id','name');$('eProject').innerHTML=opts(B.projects.filter(x=>x.company_key===c),'project_id','name');$('ePayment').innerHTML=opts(B.paymentMethods.filter(x=>x.company_key===c),'payment_method_id','name');$('eEvent').innerHTML=opts(events.filter(x=>x.company_key===c&&!['CANCELADO','ARQUIVADO'].includes(x.status)),'event_id','name','Selecione o evento');paymentChanged();renderCardOptions()}"
if old_fill in js:
    js = js.replace(old_fill, new_fill, 1)

old_payment_js = "function paymentChanged(){const pm=by(B.paymentMethods,$('ePayment').value,'payment_method_id'),credit=/cr[eé]dito/i.test(pm?.name||'');$('installmentHint').textContent=credit?'Se a compra foi parcelada, informe abaixo quantas vezes.':'Use parcelamento somente se esta despesa gerar cobranças futuras no seu cartão pessoal.'}"
new_payment_js = "function paymentChanged(){const pm=by(B.paymentMethods,$('ePayment').value,'payment_method_id'),isCard=/cart[aã]o/i.test(pm?.name||''),credit=/cr[eé]dito/i.test(pm?.name||'');$('eCardWrap').classList.toggle('hidden',!isCard);$('installmentHint').textContent=credit?'Se a compra foi parcelada, informe abaixo quantas vezes.':isCard?'Selecione o cartão utilizado.':'Parcelamento é usado para compras no cartão pessoal que serão reembolsadas.';renderCardOptions();cardChanged()}\nfunction cardLabel(c){return `${c.nickname} · •••• ${c.last4}${c.card_type==='EMPRESA'?' · Empresa':c.owner_name?' · '+c.owner_name:''}`}\nfunction renderCardOptions(){if(!$('eCard'))return;const companyKey=$('eCompany').value,paidBy=String($('ePaidBy').value||B?.user?.id||''),current=$('eCard').value;const rows=cards.filter(c=>c.card_type==='EMPRESA'?c.company_key===companyKey:String(c.owner_user_id)===paidBy);$('eCard').innerHTML='<option value=\"\">Selecione o cartão…</option>'+rows.map(c=>`<option value=\"${c.card_id}\">${esc(cardLabel(c))}</option>`).join('');if(rows.some(c=>c.card_id===current))$('eCard').value=current;cardChanged()}\nfunction cardChanged(){if(!$('eCard'))return;const c=by(cards,$('eCard').value,'card_id'),note=$('paymentRuleNote'),box=note?.querySelector('.payment-note');if(c?.card_type==='EMPRESA'){$('eReimbursable').value='false';$('eReimbursable').disabled=true;$('cardHint').textContent='Cartão corporativo: esta despesa não gera reembolso.';if(note&&box){box.textContent=`${cardLabel(c)} — despesa paga pela empresa, sem saldo de reembolso.`;box.classList.add('corp');note.classList.remove('hidden')}}else{$('eReimbursable').disabled=false;$('cardHint').textContent=c?.card_type==='PESSOAL'?'Cartão pessoal. Você decide se haverá reembolso.':'';if(note&&box){box.textContent='';box.classList.remove('corp');note.classList.add('hidden')}}}"
if old_payment_js in js:
    js = js.replace(old_payment_js, new_payment_js, 1)

old_form = "function formData(){return{company_key:$('eCompany').value,expense_type:$('eType').value,event_id:$('eEvent').value,paid_by_user_id:$('ePaidBy').value,description:$('eDesc').value,category_id:$('eCategory').value,cost_center_id:$('eCost').value,project_id:$('eProject').value,requested_amount:$('eAmount').value,vendor_name:$('eVendor').value,vendor_document:$('eVendorDoc').value,vendor_address:$('eAddress').value,payment_method_id:$('ePayment').value,incurred_at:$('eDate').value?new Date($('eDate').value).toISOString():null,notes:$('eNotes').value,latitude:geo?.latitude??null,longitude:geo?.longitude??null,fiscal_data:collectFiscal(),idempotency_key:crypto.randomUUID()}}"
new_form = "function formData(){return{company_key:$('eCompany').value,expense_type:$('eType').value,event_id:$('eEvent').value,paid_by_user_id:$('ePaidBy').value,description:$('eDesc').value,category_id:$('eCategory').value,cost_center_id:$('eCost').value,project_id:$('eProject').value,requested_amount:$('eAmount').value,vendor_name:$('eVendor').value,vendor_document:$('eVendorDoc').value,vendor_address:$('eAddress').value,payment_method_id:$('ePayment').value,card_id:$('eCard')?.value||null,reimbursable:$('eReimbursable')?.value!=='false',incurred_at:$('eDate').value?new Date($('eDate').value).toISOString():null,notes:$('eNotes').value,latitude:geo?.latitude??null,longitude:geo?.longitude??null,fiscal_data:collectFiscal(),idempotency_key:crypto.randomUUID()}}"
if old_form in js:
    js = js.replace(old_form, new_form, 1)

restore_anchor = "geo=d.latitude!=null?{latitude:d.latitude,longitude:d.longitude}:null;if(d.fiscal_data)fillFiscal(d.fiscal_data,false);toggleEvent();installmentChanged()"
restore_new = "geo=d.latitude!=null?{latitude:d.latitude,longitude:d.longitude}:null;if(d.card_id){renderCardOptions();$('eCard').value=d.card_id}if(d.reimbursable!=null)$('eReimbursable').value=String(d.reimbursable);cardChanged();if(d.fiscal_data)fillFiscal(d.fiscal_data,false);toggleEvent();installmentChanged()"
if restore_anchor in js:
    js = js.replace(restore_anchor, restore_new, 1)

old_save = "async function saveExpense(submit){persist();const b=formData();if(!b.company_key||!b.description||!b.requested_amount||!b.incurred_at)throw Error('Preencha empresa, descrição, valor e data.');if(b.expense_type==='EVENTO'&&!b.event_id)throw Error('Selecione o evento.');const r=await api('/expenses',{method:'POST',body:JSON.stringify(b)});const n=Number($('installments').value||1);if(n>1){await scheduleApi('/schedule',{method:'POST',body:JSON.stringify({expense_id:r.expense_id,installment_count:n,first_due_date:$('firstDue').value,request_id:crypto.randomUUID()})})}let failed=false;"
new_save = "async function saveExpense(submit){persist();const b=formData();if(!b.company_key||!b.description||!b.requested_amount||!b.incurred_at)throw Error('Preencha empresa, descrição, valor e data.');if(b.expense_type==='EVENTO'&&!b.event_id)throw Error('Selecione o evento.');const pm=by(B.paymentMethods,b.payment_method_id,'payment_method_id');if(/cart[aã]o/i.test(pm?.name||'')&&!b.card_id)throw Error('Selecione o cartão utilizado.');const r=await api('/expenses',{method:'POST',body:JSON.stringify(b)});const n=Number($('installments').value||1);const meta=await cardApi('/expense-payment',{method:'POST',body:JSON.stringify({expense_id:r.expense_id,card_id:b.card_id,reimbursable:b.reimbursable,installment_count:n,first_due_date:n>1?$('firstDue').value:null})});const willReimburse=meta.expense?.reimbursable!==false;if(n>1&&willReimburse){await scheduleApi('/schedule',{method:'POST',body:JSON.stringify({expense_id:r.expense_id,installment_count:n,first_due_date:$('firstDue').value,request_id:crypto.randomUUID()})})}let failed=false;"
if old_save in js:
    js = js.replace(old_save, new_save, 1)

# Add card / reimbursement visibility in expense detail.
old_detail = "<p><b>Solicitado:</b> ${money(x.requested_amount)} · <b>Aprovado:</b> ${x.approved_amount==null?'—':money(x.approved_amount)} · <b>Reembolsado:</b> ${money(x.reimbursed_amount)} · <b>Pendente:</b> ${money(x.pending_amount)}</p>"
new_detail = "<p><b>Solicitado:</b> ${money(x.requested_amount)} · <b>Aprovado:</b> ${x.approved_amount==null?'—':money(x.approved_amount)} · <b>Reembolsado:</b> ${money(x.reimbursed_amount)} · <b>Pendente:</b> ${money(x.pending_amount)}</p><p><b>Reembolsável:</b> ${x.reimbursable?'Sim':'Não'}${x.card_id?' · <b>Cartão:</b> '+esc(cardLabel(by(cards,x.card_id,'card_id')||{nickname:'Cartão',last4:'????',card_type:'PESSOAL'})):''}</p>"
if old_detail in js:
    js = js.replace(old_detail, new_detail, 1)

old_catalog = "function renderCatalogs(){const groups=[['Categorias','category',B.categories],['Centros de custo','cost_center',B.costCenters],['Projetos','project',B.projects],['Formas de pagamento','payment_method',B.paymentMethods]];$('catalogGrid').innerHTML=groups.map(([label,type,rows])=>`<div class=\"catalog\"><h3>${label}</h3><button class=\"btn\" data-add=\"${type}\">+ Adicionar</button>${rows.filter(x=>!currentCompany()||x.company_key===currentCompany()).map(x=>`<div class=\"catalog-item\"><b>${esc(x.name)}</b><small>${esc(company(x.company_key))}</small></div>`).join('')}</div>`).join('');document.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>catalogForm(b.dataset.add))}"
new_catalog = "function renderCatalogs(){const groups=[['Categorias','category',B.categories],['Centros de custo','cost_center',B.costCenters],['Projetos','project',B.projects],['Formas de pagamento','payment_method',B.paymentMethods]];$('catalogGrid').innerHTML=groups.map(([label,type,rows])=>`<div class=\"catalog\"><h3>${label}</h3><button class=\"btn\" data-add=\"${type}\">+ Adicionar</button>${rows.filter(x=>!currentCompany()||x.company_key===currentCompany()).map(x=>`<div class=\"catalog-item\"><b>${esc(x.name)}</b><small>${esc(company(x.company_key))}</small></div>`).join('')}</div>`).join('')+`<div class=\"catalog\"><h3>Cartões</h3><div class=\"actions\"><button class=\"btn\" id=\"addPersonalCard\">+ Cartão pessoal</button>${B.permissions.admin?'<button class=\"btn\" id=\"addCompanyCard\">+ Cartão da empresa</button>':''}</div><div class=\"card-list\">${cards.map(c=>`<div class=\"card-item\"><div class=\"grow\"><b>${esc(c.nickname)} · •••• ${esc(c.last4)}</b><small>${c.card_type==='EMPRESA'?esc(company(c.company_key))+' · corporativo':esc(c.owner_name||'Pessoal')}</small></div><button class=\"btn\" data-card-del=\"${c.card_id}\">Remover</button></div>`).join('')||'<div class=\"empty\">Nenhum cartão cadastrado.</div>'}</div></div>`;document.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>catalogForm(b.dataset.add));if($('addPersonalCard'))$('addPersonalCard').onclick=()=>cardForm('PESSOAL');if($('addCompanyCard'))$('addCompanyCard').onclick=()=>cardForm('EMPRESA');document.querySelectorAll('[data-card-del]').forEach(b=>b.onclick=()=>deleteCard(b.dataset.cardDel))}\nfunction cardForm(type){$('modalTitle').textContent=type==='EMPRESA'?'Novo cartão da empresa':'Novo cartão pessoal';$('modalBody').innerHTML=`<div class=\"form\">${type==='EMPRESA'?`<div class=\"field\"><label>Empresa *</label><select id=\"cardCompany\">${opts(B.companies,'key','name')}</select></div>`:''}<div class=\"field\"><label>Apelido *</label><input id=\"cardNick\" placeholder=\"Ex.: Itaú Black\"></div><div class=\"field\"><label>Número do cartão *</label><input id=\"cardNumber\" inputmode=\"numeric\" autocomplete=\"off\" placeholder=\"Digite o número\"><small>Por segurança, o sistema salva apenas os últimos 4 dígitos.</small></div><div class=\"field\"><label>Bandeira</label><input id=\"cardBrand\" placeholder=\"Visa, Mastercard…\"></div><div class=\"field\"><label>Banco / emissor</label><input id=\"cardIssuer\" placeholder=\"Itaú, Bradesco…\"></div></div>`;$('modalActions').innerHTML='<button class=\"btn\" id=\"modalClose\">Cancelar</button><button class=\"btn primary\" id=\"saveCard\">Salvar cartão</button>';showModal();if($('cardCompany'))$('cardCompany').value=currentCompany()||B.companies[0]?.key||'';$('modalClose').onclick=hideModal;$('saveCard').onclick=async()=>{await cardApi('/cards',{method:'POST',body:JSON.stringify({card_type:type,company_key:$('cardCompany')?.value||null,nickname:$('cardNick').value,card_number:$('cardNumber').value,brand:$('cardBrand').value,issuer:$('cardIssuer').value})});hideModal();const c=await cardApi('/cards');cards=c.cards||[];renderCatalogs();renderCardOptions();flash('Cartão cadastrado.')}}\nasync function deleteCard(id){if(!confirm('Remover este cartão do cadastro?'))return;await cardApi('/cards?id='+encodeURIComponent(id),{method:'DELETE'});const c=await cardApi('/cards');cards=c.cards||[];renderCatalogs();renderCardOptions();flash('Cartão removido.')}"
if old_catalog in js:
    js = js.replace(old_catalog, new_catalog, 1)

# QR live scanner functions before Tesseract.
qr_functions = r'''async function loadQrScanner(){if(window.Html5Qrcode)return window.Html5Qrcode;await new Promise((res,rej)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js';s.onload=res;s.onerror=rej;document.head.appendChild(s)});return window.Html5Qrcode}
async function stopQrScan(){try{if(qrScanner){await qrScanner.stop().catch(()=>{});await qrScanner.clear().catch(()=>{});qrScanner=null}}finally{$('qrModal').classList.add('hidden')}}
async function resolveFiscalQr(raw){$('scanStatus').textContent='QR Code lido. Consultando dados fiscais…';const r=await fiscalApi('/resolve',{method:'POST',body:JSON.stringify({qr:raw})});fillFiscal({...r.fiscal,qr_used:true},true);$('scanStatus').textContent=r.source==='SEFAZ_AND_QR'?'QR lido e dados fiscais consultados. Confira antes de salvar.':'QR lido. Preenchi os dados disponíveis pela chave fiscal; confira os demais campos.';if(r.warning)console.warn('Consulta SEFAZ:',r.warning)}
async function startQrScan(){try{await loadQrScanner();$('qrModal').classList.remove('hidden');$('scanStatus').textContent='Aguardando QR Code…';qrScanner=new Html5Qrcode('qrReader');let done=false;await qrScanner.start({facingMode:'environment'},{fps:10,qrbox:(w,h)=>{const s=Math.floor(Math.min(w,h)*.72);return{width:s,height:s}},aspectRatio:1},async text=>{if(done)return;done=true;await stopQrScan();try{await resolveFiscalQr(text)}catch(e){$('scanStatus').textContent='QR lido, mas não consegui consultar: '+e.message}},()=>{})}catch(e){console.error(e);await stopQrScan();$('scanStatus').textContent='Não foi possível abrir o leitor de QR: '+e.message}}
'''
if 'async function loadQrScanner()' not in js:
    js = js.replace('async function loadTesseract()', qr_functions + 'async function loadTesseract()', 1)

old_bind = "$('eCompany').onchange=fillCompany;$('eType').onchange=toggleEvent;$('ePayment').onchange=paymentChanged;$('installments').onchange=installmentChanged;"
new_bind = "$('eCompany').onchange=fillCompany;$('ePaidBy').onchange=renderCardOptions;$('eType').onchange=toggleEvent;$('ePayment').onchange=paymentChanged;$('eCard').onchange=cardChanged;$('eReimbursable').onchange=cardChanged;$('installments').onchange=installmentChanged;"
if old_bind in js:
    js = js.replace(old_bind, new_bind, 1)

old_scan_bind = "$('scanBtn').onclick=()=>$('scanFile').click();$('scanFile').onchange=()=>scanFiscal($('scanFile').files?.[0]).catch(e=>{$('scanStatus').textContent='Falha na leitura: '+e.message});"
new_scan_bind = "$('qrScanBtn').onclick=()=>startQrScan();$('photoScanBtn').onclick=()=>$('scanFile').click();$('qrClose').onclick=()=>stopQrScan();$('scanFile').onchange=()=>scanFiscal($('scanFile').files?.[0]).catch(e=>{$('scanStatus').textContent='Falha na leitura: '+e.message});"
if old_scan_bind in js:
    js = js.replace(old_scan_bind, new_scan_bind, 1)

# Export card/reimbursement columns.
js = js.replace("'Saldo pendente':Number(x.pending_amount||0),Status:labels[x.status]||x.status", "'Saldo pendente':Number(x.pending_amount||0),Reembolsável:x.reimbursable?'Sim':'Não',Cartão:x.card_id?cardLabel(by(cards,x.card_id,'card_id')||{nickname:'Cartão',last4:'????',card_type:'PESSOAL'}):'',Status:labels[x.status]||x.status")

# ---------- Portal iframe permission ----------
portal = portal.replace('<iframe id="workspaceFrame" title="Aplicativo Livion"></iframe>', '<iframe id="workspaceFrame" title="Aplicativo Livion" allow="camera; geolocation"></iframe>')

html_path.write_text(html, encoding='utf-8')
js_path.write_text(js, encoding='utf-8')
portal_path.write_text(portal, encoding='utf-8')
print('Expense QR/card/reimbursement UI patch applied')
