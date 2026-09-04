from pathlib import Path
import re

html_path=Path('despesas-reembolsos-v2.html')
js_path=Path('despesas-reembolsos-v2.js')
html=html_path.read_text(encoding='utf-8')
js=js_path.read_text(encoding='utf-8')

# Scanner controls: camera capture + existing image upload for OCR.
old='''<div class="scanbox"><div class="actions"><button id="qrScanBtn" type="button" class="btn primary">Ler QR Code da nota</button><button id="photoScanBtn" type="button" class="btn">Fotografar nota</button><input id="scanFile" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" class="hidden"><span id="scanStatus"></span></div><small><b>QR Code:</b> lê e preenche os dados fiscais automaticamente. <b>Fotografar nota:</b> usa OCR quando o QR não estiver disponível.</small></div>'''
new='''<div class="scanbox"><div class="actions"><button id="qrScanBtn" type="button" class="btn primary">Ler QR Code da nota</button><button id="photoScanBtn" type="button" class="btn">Fotografar nota</button><button id="attachScanBtn" type="button" class="btn">Anexar foto para OCR</button><input id="scanFile" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" class="hidden"><input id="scanUpload" type="file" accept="image/jpeg,image/png,image/webp" class="hidden"><span id="scanStatus"></span></div><small><b>QR Code:</b> lê e preenche automaticamente. <b>Fotografar nota:</b> abre a câmera. <b>Anexar foto:</b> permite usar uma imagem já escaneada/salva no celular e aplicar o mesmo OCR.</small></div>'''
if old not in html: raise SystemExit('scanbox not found')
html=html.replace(old,new,1)

html=html.replace('<button type="button" id="submitExpense" class="btn primary">Enviar para aprovação</button>', '<button type="button" id="submitExpense" class="btn primary">Enviar para aprovação</button>')
html=re.sub(r'\.\/despesas-reembolsos-v2\.js\?v=\d+', './despesas-reembolsos-v2.js?v=9', html)

# New finalization API.
js=js.replace("const FISCAL_API='https://kvfjjtkwxxbvzlicwnrz.supabase.co/functions/v1/fiscal-qr-api';", "const FISCAL_API='https://kvfjjtkwxxbvzlicwnrz.supabase.co/functions/v1/fiscal-qr-api';\nconst FINALIZE_API='https://kvfjjtkwxxbvzlicwnrz.supabase.co/functions/v1/expense-finalize-api';")
js=js.replace("const api=(p,o)=>call(EXP_API,p,o),scheduleApi=(p,o)=>call(SCHEDULE_API,p,o),cardApi=(p,o)=>call(CARD_API,p,o),fiscalApi=(p,o)=>call(FISCAL_API,p,o);", "const api=(p,o)=>call(EXP_API,p,o),scheduleApi=(p,o)=>call(SCHEDULE_API,p,o),cardApi=(p,o)=>call(CARD_API,p,o),fiscalApi=(p,o)=>call(FISCAL_API,p,o),finalizeApi=(p,o)=>call(FINALIZE_API,p,o);")

# Status label.
js=js.replace("const labels={RASCUNHO:'Rascunho',", "const labels={REGISTRADA:'Registrada',RASCUNHO:'Rascunho',")

# Submission mode helper and card/reimbursement behaviors.
anchor="function cardLabel(c){"
helper="""function updateSubmitMode(){if(!$('submitExpense')||!$('eReimbursable'))return;const reimb=$('eReimbursable').value!=='false';$('submitExpense').textContent=reimb?'Enviar para aprovação':'Salvar despesa';$('submitExpense').title=reimb?'A despesa seguirá para aprovação e posterior reembolso.':'Despesa não reembolsável: será registrada diretamente, sem aprovação.'}\n"""
if helper.strip() not in js:
    js=js.replace(anchor,helper+anchor,1)

old_card="function cardChanged(){if(!$('eCard'))return;const c=by(cards,$('eCard').value,'card_id'),note=$('paymentRuleNote'),box=note?.querySelector('.payment-note');if(c?.card_type==='EMPRESA'){$('eReimbursable').value='false';$('eReimbursable').disabled=true;$('cardHint').textContent='Cartão corporativo: esta despesa não gera reembolso.';if(note&&box){box.textContent=`${cardLabel(c)} — despesa paga pela empresa, sem saldo de reembolso.`;box.classList.add('corp');note.classList.remove('hidden')}}else{$('eReimbursable').disabled=false;$('cardHint').textContent=c?.card_type==='PESSOAL'?'Cartão pessoal. Você decide se haverá reembolso.':'';if(note&&box){box.textContent='';box.classList.remove('corp');note.classList.add('hidden')}}}"
new_card="function cardChanged(){if(!$('eCard'))return;const c=by(cards,$('eCard').value,'card_id'),note=$('paymentRuleNote'),box=note?.querySelector('.payment-note');if(c?.card_type==='EMPRESA'){$('eReimbursable').value='false';$('eReimbursable').disabled=true;$('cardHint').textContent='Cartão corporativo: esta despesa não gera reembolso.';if(note&&box){box.textContent=`${cardLabel(c)} — despesa paga pela empresa, sem saldo de reembolso.`;box.classList.add('corp');note.classList.remove('hidden')}}else{$('eReimbursable').disabled=false;$('cardHint').textContent=c?.card_type==='PESSOAL'?'Cartão pessoal. Você decide se haverá reembolso.':'Opcional: você pode salvar sem identificar qual cartão foi usado.';if(note&&box){box.textContent='';box.classList.remove('corp');note.classList.add('hidden')}}updateSubmitMode()}"
if old_card not in js: raise SystemExit('cardChanged not found')
js=js.replace(old_card,new_card,1)

# Remove mandatory card validation and finalize non-reimbursable expenses directly.
old_save="async function saveExpense(submit){persist();const b=formData();if(!b.company_key||!b.description||!b.requested_amount||!b.incurred_at)throw Error('Preencha empresa, descrição, valor e data.');if(b.expense_type==='EVENTO'&&!b.event_id)throw Error('Selecione o evento.');const pm=by(B.paymentMethods,b.payment_method_id,'payment_method_id');if(/cart[aã]o/i.test(pm?.name||'')&&!b.card_id)throw Error('Selecione o cartão utilizado.');const r=await api('/expenses',{method:'POST',body:JSON.stringify(b)});const n=Number($('installments').value||1);const meta=await cardApi('/expense-payment',{method:'POST',body:JSON.stringify({expense_id:r.expense_id,card_id:b.card_id,reimbursable:b.reimbursable,installment_count:n,first_due_date:n>1?$('firstDue').value:null})});const willReimburse=meta.expense?.reimbursable!==false;if(n>1&&willReimburse){await scheduleApi('/schedule',{method:'POST',body:JSON.stringify({expense_id:r.expense_id,installment_count:n,first_due_date:$('firstDue').value,request_id:crypto.randomUUID()})})}let failed=false;for(const [id,type,label] of [['ePhoto1','FOTO','Foto 1'],['ePhoto2','FOTO','Foto 2'],['eReceipt','NOTA_FISCAL','Nota / comprovante']]){const f=$(id).files?.[0];if(f)try{await upload(r.expense_id,f,type,label)}catch{failed=true}}if(submit)await api('/review',{method:'POST',body:JSON.stringify({expense_id:r.expense_id,action:'ENVIAR',request_id:crypto.randomUUID()})});localStorage.removeItem(DRAFT_KEY);flash(failed?'Despesa salva; um anexo falhou e pode ser reenviado.':submit?'Despesa enviada para aprovação.':'Rascunho salvo.');clearForm();await reload();showView('expenses')}"
new_save="async function saveExpense(submit){persist();const b=formData();if(!b.company_key||!b.description||!b.requested_amount||!b.incurred_at)throw Error('Preencha empresa, descrição, valor e data.');if(b.expense_type==='EVENTO'&&!b.event_id)throw Error('Selecione o evento.');const r=await api('/expenses',{method:'POST',body:JSON.stringify(b)});const n=Number($('installments').value||1);const meta=await cardApi('/expense-payment',{method:'POST',body:JSON.stringify({expense_id:r.expense_id,card_id:b.card_id,reimbursable:b.reimbursable,installment_count:n,first_due_date:n>1?$('firstDue').value:null})});const willReimburse=meta.expense?.reimbursable!==false;if(n>1&&willReimburse){await scheduleApi('/schedule',{method:'POST',body:JSON.stringify({expense_id:r.expense_id,installment_count:n,first_due_date:$('firstDue').value,request_id:crypto.randomUUID()})})}let failed=false;for(const [id,type,label] of [['ePhoto1','FOTO','Foto 1'],['ePhoto2','FOTO','Foto 2'],['eReceipt','NOTA_FISCAL','Nota / comprovante']]){const f=$(id).files?.[0];if(f)try{await upload(r.expense_id,f,type,label)}catch{failed=true}}let finalMessage='Rascunho salvo.';if(submit){if(willReimburse){await api('/review',{method:'POST',body:JSON.stringify({expense_id:r.expense_id,action:'ENVIAR',request_id:crypto.randomUUID()})});finalMessage='Despesa enviada para aprovação.'}else{await finalizeApi('/finalize',{method:'POST',body:JSON.stringify({expense_id:r.expense_id,request_id:crypto.randomUUID()})});finalMessage='Despesa registrada. Não requer aprovação nem reembolso.'}}localStorage.removeItem(DRAFT_KEY);flash(failed?'Despesa salva; um anexo falhou e pode ser reenviado.':finalMessage);clearForm();await reload();showView('expenses')}"
if old_save not in js: raise SystemExit('saveExpense not found')
js=js.replace(old_save,new_save,1)

# Modal action: draft non-reimbursable can be directly registered instead of sent for approval.
old_modal="$('modalActions').innerHTML='<button class=\"btn\" id=\"modalClose\">Fechar</button>'+((x.status==='RASCUNHO'||x.status==='AJUSTE_SOLICITADO')&&(B.user.administrator||x.paid_by_user_id===B.user.id)?'<button class=\"btn primary\" id=\"sendExpense\">Enviar para aprovação</button>':'')+(B.permissions.approve&&['ENVIADA_PARA_APROVACAO','EM_ANALISE'].includes(x.status)?'<button class=\"btn good\" id=\"approveExpense\">Aprovar</button><button class=\"btn warn\" id=\"adjustExpense\">Solicitar ajuste</button><button class=\"btn bad\" id=\"rejectExpense\">Recusar</button>':'');showModal();$('modalClose').onclick=hideModal;if($('sendExpense'))$('sendExpense').onclick=async()=>{await api('/review',{method:'POST',body:JSON.stringify({expense_id:x.expense_id,action:'ENVIAR',request_id:crypto.randomUUID()})});hideModal();await reload()};"
new_modal="const canFinish=(x.status==='RASCUNHO'||x.status==='AJUSTE_SOLICITADO')&&(B.user.administrator||x.paid_by_user_id===B.user.id);$('modalActions').innerHTML='<button class=\"btn\" id=\"modalClose\">Fechar</button>'+(canFinish?`<button class=\"btn primary\" id=\"sendExpense\">${x.reimbursable?'Enviar para aprovação':'Registrar despesa'}</button>`:'')+(B.permissions.approve&&x.reimbursable&&['ENVIADA_PARA_APROVACAO','EM_ANALISE'].includes(x.status)?'<button class=\"btn good\" id=\"approveExpense\">Aprovar</button><button class=\"btn warn\" id=\"adjustExpense\">Solicitar ajuste</button><button class=\"btn bad\" id=\"rejectExpense\">Recusar</button>':'');showModal();$('modalClose').onclick=hideModal;if($('sendExpense'))$('sendExpense').onclick=async()=>{if(x.reimbursable)await api('/review',{method:'POST',body:JSON.stringify({expense_id:x.expense_id,action:'ENVIAR',request_id:crypto.randomUUID()})});else await finalizeApi('/finalize',{method:'POST',body:JSON.stringify({expense_id:x.expense_id,request_id:crypto.randomUUID()})});hideModal();await reload()};"
if old_modal not in js: raise SystemExit('openExpense action block not found')
js=js.replace(old_modal,new_modal,1)

# Bind reimbursement selector directly and add attach-image OCR input.
old_bind="$('eCard').onchange=cardChanged;$('eReimbursable').onchange=cardChanged;"
new_bind="$('eCard').onchange=cardChanged;$('eReimbursable').onchange=()=>{cardChanged();updateSubmitMode()};"
if old_bind not in js: raise SystemExit('reimb bind not found')
js=js.replace(old_bind,new_bind,1)

old_scan="$('qrScanBtn').onclick=()=>startQrScan();$('photoScanBtn').onclick=()=>$('scanFile').click();$('qrClose').onclick=()=>stopQrScan();$('scanFile').onchange=()=>scanFiscal($('scanFile').files?.[0]).catch(e=>{$('scanStatus').textContent='Falha na leitura: '+e.message});"
new_scan="$('qrScanBtn').onclick=()=>startQrScan();$('photoScanBtn').onclick=()=>$('scanFile').click();$('attachScanBtn').onclick=()=>$('scanUpload').click();$('qrClose').onclick=()=>stopQrScan();$('scanFile').onchange=()=>scanFiscal($('scanFile').files?.[0]).catch(e=>{$('scanStatus').textContent='Falha na leitura: '+e.message});$('scanUpload').onchange=()=>scanFiscal($('scanUpload').files?.[0]).catch(e=>{$('scanStatus').textContent='Falha na leitura: '+e.message});"
if old_scan not in js: raise SystemExit('scan bind not found')
js=js.replace(old_scan,new_scan,1)

# Ensure initial button label is correct after form boot/reset.
js=js.replace("function initForm(){const now=", "function initForm(){updateSubmitMode();const now=",1)

html_path.write_text(html,encoding='utf-8')
js_path.write_text(js,encoding='utf-8')
print('Expense entry flow improved')
