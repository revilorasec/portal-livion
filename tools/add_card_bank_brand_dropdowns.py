from pathlib import Path
import re

js_path=Path('despesas-reembolsos-v2.js')
html_path=Path('despesas-reembolsos-v2.html')
js=js_path.read_text(encoding='utf-8')
html=html_path.read_text(encoding='utf-8')

old="let token='',B=null,events=[],expenses=[],reimbursements=[],agenda=[],cards=[],geo=null,fiscal={},qrScanner=null,sortKey='incurred_at',sortDir=-1,catalogTab='category';"
new="let token='',B=null,events=[],expenses=[],reimbursements=[],agenda=[],cards=[],banks=[],geo=null,fiscal={},qrScanner=null,sortKey='incurred_at',sortDir=-1,catalogTab='category';"
if old not in js: raise SystemExit('global vars anchor not found')
js=js.replace(old,new,1)

old="cards=c.cards||[];renderHome(d);"
new="cards=c.cards||[];banks=c.banks||[];renderHome(d);"
if old not in js: raise SystemExit('reload cards anchor not found')
js=js.replace(old,new,1)

anchor="function cardModeLabel(c){"
helpers="""function bankLabel(c){if(!c)return'';const b=(banks||[]).find(x=>String(x.bank_code)===String(c.bank_code));return b?`${b.bank_code} — ${b.name}`:(c.issuer||'')}\nfunction cardModeLabel(c){"""
if anchor not in js: raise SystemExit('cardModeLabel anchor not found')
js=js.replace(anchor,helpers,1)

old_row="${c.card_type==='EMPRESA'?esc(company(c.company_key))+' · corporativo':esc(c.owner_name||'Pessoal')} · ${esc(cardModeLabel(c))}${c.brand?' · '+esc(c.brand):''}${c.issuer?' · '+esc(c.issuer):''}"
new_row="${c.card_type==='EMPRESA'?esc(company(c.company_key))+' · corporativo':esc(c.owner_name||'Pessoal')} · ${esc(cardModeLabel(c))}${c.brand?' · '+esc(c.brand):''}${bankLabel(c)?' · '+esc(bankLabel(c)):''}"
if old_row not in js: raise SystemExit('card catalog row not found')
js=js.replace(old_row,new_row,1)

pattern=r"function cardForm\(type,item=null\)\{.*?\}\nasync function deleteCard"
replacement=r'''function cardForm(type,item=null){const brandList=['Visa','Mastercard','Elo','American Express','Hipercard'],currentBrand=String(item?.brand||''),knownBrand=brandList.some(x=>x.toLowerCase()===currentBrand.toLowerCase()),bankOptions=(banks||[]).map(b=>`<option value="${esc(b.bank_code)}">${esc(b.bank_code)} — ${esc(b.name)}</option>`).join('');$('modalTitle').textContent=item?'Editar cartão':type==='EMPRESA'?'Novo cartão da empresa':'Novo cartão pessoal';$('modalBody').innerHTML=`<div class="form">${type==='EMPRESA'?`<div class="field"><label>Empresa *</label><select id="cardCompany">${opts(B.companies,'key','name')}</select></div>`:''}<div class="field"><label>Apelido *</label><input id="cardNick" placeholder="Ex.: Itaú Black" value="${esc(item?.nickname||'')}"></div><div class="field"><label>Modalidade *</label><select id="cardPaymentMode"><option value="CREDITO">Crédito</option><option value="DEBITO">Débito</option><option value="AMBOS">Crédito e Débito</option></select></div><div class="field"><label>Número ou 4 finais *</label><input id="cardNumber" inputmode="numeric" autocomplete="off" placeholder="Número do cartão ou últimos 4 dígitos" value="${esc(item?.last4||'')}"><small>O sistema guarda somente os últimos 4 dígitos.</small></div><div class="field"><label>Banco / emissor</label><select id="cardBank"><option value="">Selecione o banco…</option>${bankOptions}<option value="__NEW__">+ Adicionar outro banco</option></select></div><div id="newBankWrap" class="field full hidden"><div class="form"><div class="field"><label>Código do banco *</label><input id="newBankCode" inputmode="numeric" maxlength="3" placeholder="Ex.: 260"></div><div class="field"><label>Nome do banco *</label><input id="newBankName" placeholder="Nome da instituição"></div></div><small>O banco será salvo e ficará disponível nos próximos cartões.</small></div><div class="field"><label>Bandeira</label><select id="cardBrand"><option value="">Selecione a bandeira…</option>${brandList.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('')}<option value="__OTHER__">Outra bandeira…</option></select></div><div id="otherBrandWrap" class="field hidden"><label>Outra bandeira</label><input id="otherBrand" placeholder="Nome da bandeira" value="${esc(!knownBrand?currentBrand:'')}"></div></div>`;$('modalActions').innerHTML='<button class="btn" id="modalClose">Cancelar</button><button class="btn primary" id="saveCard">Salvar</button>';showModal();if($('cardCompany')){$('cardCompany').value=item?.company_key||currentCompany()||B.companies[0]?.key||'';if(item)$('cardCompany').disabled=true}$('cardPaymentMode').value=String(item?.payment_mode||'AMBOS').toUpperCase();$('cardBank').value=(banks||[]).some(b=>String(b.bank_code)===String(item?.bank_code||''))?String(item.bank_code):'';$('cardBrand').value=knownBrand?brandList.find(x=>x.toLowerCase()===currentBrand.toLowerCase()):currentBrand?'__OTHER__':'';const toggleBank=()=>$('newBankWrap').classList.toggle('hidden',$('cardBank').value!=='__NEW__'),toggleBrand=()=>$('otherBrandWrap').classList.toggle('hidden',$('cardBrand').value!=='__OTHER__');$('cardBank').onchange=toggleBank;$('cardBrand').onchange=toggleBrand;toggleBank();toggleBrand();$('modalClose').onclick=hideModal;$('saveCard').onclick=async()=>{let bankCode=$('cardBank').value;if(bankCode==='__NEW__'){const code=digits($('newBankCode').value),name=$('newBankName').value.trim();if(code.length!==3)return alert('Informe o código do banco com 3 dígitos.');if(!name)return alert('Informe o nome do banco.');const br=await cardApi('/banks',{method:'POST',body:JSON.stringify({bank_code:code,name})});bankCode=br.bank?.bank_code||code}const brand=$('cardBrand').value==='__OTHER__'?$('otherBrand').value.trim():$('cardBrand').value;await cardApi('/cards',{method:'POST',body:JSON.stringify({card_id:item?.card_id||null,card_type:type,company_key:$('cardCompany')?.value||item?.company_key||null,nickname:$('cardNick').value,last4:$('cardNumber').value,brand:brand||null,bank_code:bankCode||null,payment_mode:$('cardPaymentMode').value})});hideModal();await reload();renderCatalogs();renderCardOptions();flash(item?'Cartão atualizado.':'Cartão cadastrado.')}}
async function deleteCard'''
js,n=re.subn(pattern,lambda m:replacement,js,count=1,flags=re.S)
if n!=1: raise SystemExit(f'cardForm replacement count={n}')

html=re.sub(r'\.\/despesas-reembolsos-v2\.js\?v=\d+', './despesas-reembolsos-v2.js?v=13', html)
js_path.write_text(js,encoding='utf-8')
html_path.write_text(html,encoding='utf-8')
print('Card bank and brand dropdowns applied')
