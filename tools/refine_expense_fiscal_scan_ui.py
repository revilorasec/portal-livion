from pathlib import Path
import re

html_path=Path('despesas-reembolsos-v2.html')
js_path=Path('despesas-reembolsos-v2.js')
html=html_path.read_text(encoding='utf-8')
js=js_path.read_text(encoding='utf-8')

# Compact fiscal card: important information appears as a summary; technical/edit fields stay collapsed.
old_box='''<div id="fiscalBox" class="fiscal hidden"><h4>Dados fiscais identificados</h4><div class="form"><div class="field"><label>Estabelecimento</label><input id="fVendor"></div><div class="field"><label>CNPJ</label><input id="fCnpj"></div><div class="field full"><label>Endereço</label><input id="fAddress"></div><div class="field"><label>Número</label><input id="fNumber"></div><div class="field"><label>Série</label><input id="fSeries"></div><div class="field full"><label>Chave de acesso</label><input id="fKey"></div><div class="field"><label>Data/hora</label><input id="fDate"></div><div class="field"><label>Valor</label><input id="fValue" type="number" step="0.01"></div><div class="field"><label>Pagamento lido</label><input id="fPayment"></div><div class="field"><label>Consulta/QR</label><input id="fQr"></div></div></div>'''
new_box='''<div id="fiscalBox" class="fiscal hidden"><div class="fiscal-head"><h4>Nota fiscal identificada</h4><span id="fiscalQuality" class="fiscal-quality"></span></div><div id="fiscalSummary" class="fiscal-summary"></div><details id="fiscalDetails" class="fiscal-details"><summary>Ver / editar detalhes da nota</summary><div class="form fiscal-detail-form"><div class="field"><label>Estabelecimento</label><input id="fVendor"></div><div class="field"><label>CNPJ</label><input id="fCnpj" inputmode="numeric" maxlength="18"></div><div class="field full"><label>Endereço</label><input id="fAddress"></div><div class="field"><label>Número da nota</label><input id="fNumber" inputmode="numeric"></div><div class="field"><label>Série</label><input id="fSeries" inputmode="numeric"></div><div class="field full"><label>Chave de acesso</label><input id="fKey" inputmode="numeric"></div><div class="field"><label>Data/hora</label><input id="fDate"></div><div class="field"><label>Valor</label><input id="fValue" type="number" step="0.01"></div><div class="field"><label>Forma de pagamento lida</label><input id="fPayment"></div><div class="field full"><label>Consulta oficial / QR</label><input id="fQr"></div></div></details></div>'''
if old_box not in html:
    raise SystemExit('Fiscal box antigo nao encontrado')
html=html.replace(old_box,new_box,1)

css_anchor='.fiscal h4{margin:0 0 10px}'
css_add='''.fiscal h4{margin:0}.fiscal-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}.fiscal-quality{font-size:10px;font-weight:700;color:#116b3d;background:#e4f5eb;border-radius:999px;padding:4px 7px}.fiscal-summary{display:flex;flex-wrap:wrap;gap:7px}.fiscal-summary .fitem{display:grid;gap:1px;min-width:110px;background:#f7f9fc;border:1px solid #e5ebf2;border-radius:9px;padding:7px 9px}.fiscal-summary .fitem.wide{flex:1 1 220px}.fiscal-summary small{font-size:9px;color:var(--muted);text-transform:uppercase}.fiscal-summary b{font-size:12px;font-weight:700;overflow-wrap:anywhere}.fiscal-details{margin-top:9px;border-top:1px solid #edf1f5;padding-top:8px}.fiscal-details summary{cursor:pointer;color:var(--blue);font-size:11px;font-weight:700;list-style-position:inside}.fiscal-detail-form{margin-top:10px}'''
if css_anchor in html:
    html=html.replace(css_anchor,css_add,1)
else:
    raise SystemExit('CSS fiscal anchor nao encontrado')

html=html.replace('<input id="eVendorDoc">','<input id="eVendorDoc" inputmode="numeric" maxlength="18">')
html=html.replace('<b>QR Code:</b> usa a câmera como leitor e tenta consultar os dados fiscais. <b>Fotografar nota:</b> usa OCR como alternativa.','<b>QR Code:</b> lê e preenche os dados fiscais automaticamente. <b>Fotografar nota:</b> usa OCR quando o QR não estiver disponível.')
html=re.sub(r'\.\/despesas-reembolsos-v2\.js\?v=\d+', './despesas-reembolsos-v2.js?v=6', html)

# Replace basic digits helper with standard Brazilian masks and fiscal sanitation.
old_digits="function digits(v){return String(v||'').replace(/\\D/g,'')}"
new_digits=r'''function digits(v){return String(v||'').replace(/\D/g,'')}
function formatDocument(v){const n=digits(v).slice(0,14);if(n.length<=11){return n.replace(/^(\d{3})(\d)/,'$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/,'$1.$2.$3').replace(/\.(\d{3})(\d{1,2})$/,'.$1-$2')}return n.replace(/^(\d{2})(\d)/,'$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/,'$1.$2.$3').replace(/\.(\d{3})(\d)/,'.$1/$2').replace(/(\d{4})(\d{1,2})$/,'$1-$2')}
function formatPhone(v){const n=digits(v).slice(0,11);if(n.length<=10)return n.replace(/^(\d{2})(\d)/,'($1) $2').replace(/(\d{4})(\d{1,4})$/,'$1-$2');return n.replace(/^(\d{2})(\d)/,'($1) $2').replace(/(\d{5})(\d{1,4})$/,'$1-$2')}
function formatCep(v){return digits(v).slice(0,8).replace(/^(\d{5})(\d)/,'$1-$2')}
function formatAccessKey(v){return digits(v).slice(0,44).replace(/(.{4})/g,'$1 ').trim()}
function formatCardNumber(v){return digits(v).slice(0,19).replace(/(.{4})/g,'$1 ').trim()}
function normalizedDocument(v){const n=digits(v);return n.length===11||n.length===14?n:String(v||'').trim()}
const BAD_FISCAL_LABEL=/INFORMA[CÇ][ÕO]ES?\s+DE\s+INTERESSE|CONTRIBUINTE|DOCUMENTO\s+AUXILIAR|CONSULTA\s+PELA\s+CHAVE|VALOR\s+PAGO\s*R\$?\s*:?\s*$/i;
function sanitizeFiscalResult(raw={}){const d={...raw};if(BAD_FISCAL_LABEL.test(String(d.establishment||'')))d.establishment='';if(d.payment_method&&!/(PIX|CR[EÉ]DITO|D[EÉ]BITO|DINHEIRO|BOLETO|CART[AÃ]O)/i.test(String(d.payment_method)))d.payment_method='';d.cnpj=digits(d.cnpj||'').slice(0,14);d.access_key=digits(d.access_key||'').slice(0,44);if(d.value!=null&&(!(Number(d.value)>0)||!Number.isFinite(Number(d.value))))d.value=null;return d}
function maskTarget(el){if(!el||el.tagName!=='INPUT'||el.type==='number'||el.type==='datetime-local'||el.type==='date')return;const sig=((el.id||'')+' '+(el.name||'')+' '+(el.placeholder||'')).toLowerCase();if(el.id==='fCnpj'||el.id==='eVendorDoc'||/\b(cpf|cnpj)\b/.test(sig)){el.value=formatDocument(el.value);return}if(el.id==='fKey'||/chave.*acesso/.test(sig)){el.value=formatAccessKey(el.value);return}if(el.id==='cardNumber'){el.value=formatCardNumber(el.value);return}if(el.type==='tel'||/(telefone|celular|whatsapp|phone)/.test(sig)){el.value=formatPhone(el.value);return}if(/\bcep\b/.test(sig)){el.value=formatCep(el.value)}}
function bindStandardMasks(){document.addEventListener('input',e=>maskTarget(e.target));document.querySelectorAll('input').forEach(maskTarget)}'''
if old_digits not in js:
    raise SystemExit('digits helper nao encontrado')
js=js.replace(old_digits,new_digits,1)

# Normalize fiscal values stored in the payload.
old_collect="function collectFiscal(){return{establishment:$('fVendor').value||null,cnpj:$('fCnpj').value||null,address:$('fAddress').value||null,number:$('fNumber').value||null,series:$('fSeries').value||null,access_key:$('fKey').value||null,date_time:$('fDate').value||null,value:$('fValue').value?Number($('fValue').value):null,payment_method:$('fPayment').value||null,official_query_url:$('fQr').value||null,ocr_used:Boolean(fiscal.ocr_used),qr_used:Boolean(fiscal.qr_used)}}"
new_collect="function collectFiscal(){return{establishment:$('fVendor').value||null,cnpj:digits($('fCnpj').value)||null,address:$('fAddress').value||null,number:digits($('fNumber').value)||null,series:digits($('fSeries').value)||null,access_key:digits($('fKey').value)||null,date_time:$('fDate').value||null,value:$('fValue').value?Number($('fValue').value):null,payment_method:$('fPayment').value||null,official_query_url:$('fQr').value||null,ocr_used:Boolean(fiscal.ocr_used),qr_used:Boolean(fiscal.qr_used)}}"
if old_collect not in js:
    raise SystemExit('collectFiscal nao encontrado')
js=js.replace(old_collect,new_collect,1)

# Store CPF/CNPJ normalized even though the UI displays the standard mask.
js=js.replace("vendor_document:$('eVendorDoc').value,", "vendor_document:normalizedDocument($('eVendorDoc').value),", 1)

# Replace fillFiscal with a guarded version and compact summary renderer.
pattern=r"function fillFiscal\(d,sync=true\)\{.*?renderInstallmentPreview\(\)\}\}"
m=re.search(pattern,js,re.S)
if not m:
    raise SystemExit('fillFiscal nao encontrado')
new_fill=r'''function renderFiscalSummary(d){const items=[];if(d.establishment)items.push(`<span class="fitem wide"><small>Estabelecimento</small><b>${esc(d.establishment)}</b></span>`);if(d.cnpj)items.push(`<span class="fitem"><small>CNPJ</small><b>${esc(formatDocument(d.cnpj))}</b></span>`);if(d.number)items.push(`<span class="fitem"><small>Nota</small><b>${esc(String(d.number))}</b></span>`);if(d.value>0)items.push(`<span class="fitem"><small>Valor</small><b>${money(d.value)}</b></span>`);if(d.date_time)items.push(`<span class="fitem"><small>Data</small><b>${esc(d.date_time)}</b></span>`);if(d.payment_method)items.push(`<span class="fitem"><small>Pagamento</small><b>${esc(d.payment_method)}</b></span>`);$('fiscalSummary').innerHTML=items.join('')||'<span class="fitem wide"><small>Leitura</small><b>QR reconhecido. Abra os detalhes para conferir os dados técnicos.</b></span>';const strong=[d.establishment,d.cnpj,d.number,d.value,d.date_time,d.payment_method].filter(Boolean).length;$('fiscalQuality').textContent=strong>=5?'Dados principais preenchidos':strong>=3?'Dados parciais':'QR identificado'}
function fillFiscal(raw,sync=true){const d=sanitizeFiscalResult(raw);fiscal={...fiscal,...d};$('fiscalBox').classList.remove('hidden');$('fVendor').value=d.establishment||'';$('fCnpj').value=formatDocument(d.cnpj||'');$('fAddress').value=d.address||'';$('fNumber').value=d.number||'';$('fSeries').value=d.series||'';$('fKey').value=formatAccessKey(d.access_key||'');$('fDate').value=d.date_time||'';$('fValue').value=d.value??'';$('fPayment').value=d.payment_method||'';$('fQr').value=d.official_query_url||'';renderFiscalSummary(d);if(sync){if(d.establishment)$('eVendor').value=d.establishment;if(d.cnpj)$('eVendorDoc').value=formatDocument(d.cnpj);if(d.address)$('eAddress').value=d.address;if(d.value!=null)$('eAmount').value=d.value;if(d.date_time){const x=d.date_time.match(/(\d{2})[\/.-](\d{2})[\/.-](\d{4})(?:\s+(\d{2}:\d{2}))?/);if(x)$('eDate').value=`${x[3]}-${x[2]}-${x[1]}T${x[4]||'12:00'}`}if(d.payment_method){const p=B.paymentMethods.find(x=>String(d.payment_method).toLowerCase().includes('pix')?/pix/i.test(x.name):/cr[eé]dito/i.test(d.payment_method)?/cr[eé]dito/i.test(x.name):/d[eé]bito/i.test(d.payment_method)?/d[eé]bito/i.test(x.name):/dinheiro/i.test(d.payment_method)?/dinheiro/i.test(x.name):false);if(p){$('ePayment').value=p.payment_method_id;paymentChanged()}}renderInstallmentPreview();maskTarget($('eVendorDoc'))}}'''
js=js[:m.start()]+new_fill+js[m.end():]

# Mark remote source while preserving all locally extracted key data.
js=js.replace("const merged={...(localData||localFiscalFromQr(raw)),...Object.fromEntries(Object.entries(remote).filter(([,v])=>v!==null&&v!==undefined&&v!=='')),qr_used:true};", "const merged={...(localData||localFiscalFromQr(raw)),...Object.fromEntries(Object.entries(remote).filter(([,v])=>v!==null&&v!==undefined&&v!=='')),qr_used:true,qr_source:r.source};", 1)

# Activate masks before app load; event delegation also handles dynamic modal fields such as phone/card fields.
if "bindStandardMasks();load();" not in js:
    js=js.replace("window.addEventListener('beforeunload',()=>{if($('eDesc')?.value||$('eAmount')?.value)persist()});load();", "window.addEventListener('beforeunload',()=>{if($('eDesc')?.value||$('eAmount')?.value)persist()});bindStandardMasks();load();", 1)

html_path.write_text(html,encoding='utf-8')
js_path.write_text(js,encoding='utf-8')
print('Fiscal UI, validation and masks updated')
