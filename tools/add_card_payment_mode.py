from pathlib import Path
import re

js_path=Path('despesas-reembolsos-v2.js')
html_path=Path('despesas-reembolsos-v2.html')
js=js_path.read_text(encoding='utf-8')
html=html_path.read_text(encoding='utf-8')

old_card_label="function cardLabel(c){return `${c.nickname} · •••• ${c.last4}${c.card_type==='EMPRESA'?' · Empresa':c.owner_name?' · '+c.owner_name:''}`}"
new_card_label="function cardModeLabel(c){const m=String(c?.payment_mode||'AMBOS').toUpperCase();return m==='CREDITO'?'Crédito':m==='DEBITO'?'Débito':'Crédito e Débito'}\nfunction cardLabel(c){return `${c.nickname} · •••• ${c.last4} · ${cardModeLabel(c)}${c.card_type==='EMPRESA'?' · Empresa':c.owner_name?' · '+c.owner_name:''}`}"
if old_card_label not in js:
    raise SystemExit('cardLabel not found')
js=js.replace(old_card_label,new_card_label,1)

old_render="function renderCardOptions(){if(!$('eCard'))return;const companyKey=$('eCompany').value,paidBy=String($('ePaidBy').value||B?.user?.id||''),current=$('eCard').value;const rows=cards.filter(c=>c.card_type==='EMPRESA'?c.company_key===companyKey:String(c.owner_user_id)===paidBy);$('eCard').innerHTML='<option value=\"\">Selecione o cartão…</option>'+rows.map(c=>`<option value=\"${c.card_id}\">${esc(cardLabel(c))}</option>`).join('');if(rows.some(c=>c.card_id===current))$('eCard').value=current;cardChanged()}"
new_render="function renderCardOptions(){if(!$('eCard'))return;const companyKey=$('eCompany').value,paidBy=String($('ePaidBy').value||B?.user?.id||''),current=$('eCard').value,pm=by(B.paymentMethods,$('ePayment').value,'payment_method_id'),pmName=String(pm?.name||''),wantsCredit=/cr[eé]dito/i.test(pmName),wantsDebit=/d[eé]bito/i.test(pmName);const rows=cards.filter(c=>{const ownerOk=c.card_type==='EMPRESA'?c.company_key===companyKey:String(c.owner_user_id)===paidBy,mode=String(c.payment_mode||'AMBOS').toUpperCase(),modeOk=(!wantsCredit&&!wantsDebit)||mode==='AMBOS'||(wantsCredit&&mode==='CREDITO')||(wantsDebit&&mode==='DEBITO');return ownerOk&&modeOk});$('eCard').innerHTML='<option value=\"\">Sem cartão identificado</option>'+rows.map(c=>`<option value=\"${c.card_id}\">${esc(cardLabel(c))}</option>`).join('');if(rows.some(c=>c.card_id===current))$('eCard').value=current;else $('eCard').value='';cardChanged()}"
if old_render not in js:
    raise SystemExit('renderCardOptions not found')
js=js.replace(old_render,new_render,1)

old_payment="$('installmentHint').textContent=credit?'Se a compra foi parcelada, informe abaixo quantas vezes.':isCard?'Selecione o cartão utilizado.':'Parcelamento é usado para compras no cartão pessoal que serão reembolsadas.';"
new_payment="$('installmentHint').textContent=credit?'Se a compra foi parcelada, informe abaixo quantas vezes. O cartão é opcional.':isCard?'Você pode identificar o cartão usado, mas isso é opcional.':'Parcelamento é usado para compras no cartão pessoal que serão reembolsadas.';"
if old_payment in js:
    js=js.replace(old_payment,new_payment,1)

old_card_row="${c.card_type==='EMPRESA'?esc(company(c.company_key))+' · corporativo':esc(c.owner_name||'Pessoal')}${c.brand?' · '+esc(c.brand):''}${c.issuer?' · '+esc(c.issuer):''}"
new_card_row="${c.card_type==='EMPRESA'?esc(company(c.company_key))+' · corporativo':esc(c.owner_name||'Pessoal')} · ${esc(cardModeLabel(c))}${c.brand?' · '+esc(c.brand):''}${c.issuer?' · '+esc(c.issuer):''}"
if old_card_row not in js:
    raise SystemExit('catalog card row not found')
js=js.replace(old_card_row,new_card_row,1)

old_form="function cardForm(type,item=null){$('modalTitle').textContent=item?'Editar cartão':type==='EMPRESA'?'Novo cartão da empresa':'Novo cartão pessoal';$('modalBody').innerHTML=`<div class=\"form\">${type==='EMPRESA'?`<div class=\"field\"><label>Empresa *</label><select id=\"cardCompany\">${opts(B.companies,'key','name')}</select></div>`:''}<div class=\"field\"><label>Apelido *</label><input id=\"cardNick\" placeholder=\"Ex.: Itaú Black\" value=\"${esc(item?.nickname||'')}\"></div><div class=\"field\"><label>Número ou 4 finais *</label><input id=\"cardNumber\" inputmode=\"numeric\" autocomplete=\"off\" placeholder=\"Número do cartão ou últimos 4 dígitos\" value=\"${esc(item?.last4||'')}\"><small>O sistema guarda somente os últimos 4 dígitos.</small></div><div class=\"field\"><label>Bandeira</label><input id=\"cardBrand\" placeholder=\"Visa, Mastercard…\" value=\"${esc(item?.brand||'')}\"></div><div class=\"field\"><label>Banco / emissor</label><input id=\"cardIssuer\" placeholder=\"Itaú, Bradesco…\" value=\"${esc(item?.issuer||'')}\"></div></div>`;$('modalActions').innerHTML='<button class=\"btn\" id=\"modalClose\">Cancelar</button><button class=\"btn primary\" id=\"saveCard\">Salvar</button>';showModal();if($('cardCompany')){$('cardCompany').value=item?.company_key||currentCompany()||B.companies[0]?.key||'';if(item)$('cardCompany').disabled=true}$('modalClose').onclick=hideModal;$('saveCard').onclick=async()=>{await cardApi('/cards',{method:'POST',body:JSON.stringify({card_id:item?.card_id||null,card_type:type,company_key:$('cardCompany')?.value||item?.company_key||null,nickname:$('cardNick').value,last4:$('cardNumber').value,brand:$('cardBrand').value,issuer:$('cardIssuer').value})});hideModal();await reload();renderCatalogs();renderCardOptions();flash(item?'Cartão atualizado.':'Cartão cadastrado.')}}"
new_form="function cardForm(type,item=null){$('modalTitle').textContent=item?'Editar cartão':type==='EMPRESA'?'Novo cartão da empresa':'Novo cartão pessoal';$('modalBody').innerHTML=`<div class=\"form\">${type==='EMPRESA'?`<div class=\"field\"><label>Empresa *</label><select id=\"cardCompany\">${opts(B.companies,'key','name')}</select></div>`:''}<div class=\"field\"><label>Apelido *</label><input id=\"cardNick\" placeholder=\"Ex.: Itaú Black\" value=\"${esc(item?.nickname||'')}\"></div><div class=\"field\"><label>Modalidade *</label><select id=\"cardPaymentMode\"><option value=\"CREDITO\">Crédito</option><option value=\"DEBITO\">Débito</option><option value=\"AMBOS\">Crédito e Débito</option></select></div><div class=\"field\"><label>Número ou 4 finais *</label><input id=\"cardNumber\" inputmode=\"numeric\" autocomplete=\"off\" placeholder=\"Número do cartão ou últimos 4 dígitos\" value=\"${esc(item?.last4||'')}\"><small>O sistema guarda somente os últimos 4 dígitos.</small></div><div class=\"field\"><label>Bandeira</label><input id=\"cardBrand\" placeholder=\"Visa, Mastercard…\" value=\"${esc(item?.brand||'')}\"></div><div class=\"field\"><label>Banco / emissor</label><input id=\"cardIssuer\" placeholder=\"Itaú, Bradesco…\" value=\"${esc(item?.issuer||'')}\"></div></div>`;$('modalActions').innerHTML='<button class=\"btn\" id=\"modalClose\">Cancelar</button><button class=\"btn primary\" id=\"saveCard\">Salvar</button>';showModal();if($('cardCompany')){$('cardCompany').value=item?.company_key||currentCompany()||B.companies[0]?.key||'';if(item)$('cardCompany').disabled=true}$('cardPaymentMode').value=String(item?.payment_mode||'AMBOS').toUpperCase();$('modalClose').onclick=hideModal;$('saveCard').onclick=async()=>{await cardApi('/cards',{method:'POST',body:JSON.stringify({card_id:item?.card_id||null,card_type:type,company_key:$('cardCompany')?.value||item?.company_key||null,nickname:$('cardNick').value,last4:$('cardNumber').value,brand:$('cardBrand').value,issuer:$('cardIssuer').value,payment_mode:$('cardPaymentMode').value})});hideModal();await reload();renderCatalogs();renderCardOptions();flash(item?'Cartão atualizado.':'Cartão cadastrado.')}}"
if old_form not in js:
    raise SystemExit('cardForm not found')
js=js.replace(old_form,new_form,1)

html=re.sub(r'\.\/despesas-reembolsos-v2\.js\?v=\d+', './despesas-reembolsos-v2.js?v=12', html)
js_path.write_text(js,encoding='utf-8')
html_path.write_text(html,encoding='utf-8')
print('Card payment mode UI and filtering applied')
