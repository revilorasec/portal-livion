from pathlib import Path
import re

html_path=Path('despesas-reembolsos-v2.html')
js_path=Path('despesas-reembolsos-v2.js')
html=html_path.read_text(encoding='utf-8')
js=js_path.read_text(encoding='utf-8')

# Fiscal data becomes technical-only. Main expense form is the source of truth shown to the user.
pattern=r'<div id="fiscalBox" class="fiscal hidden">.*?</div><form id="expenseForm"'
new='''<div id="fiscalBox" class="fiscal hidden"><details id="fiscalDetails" class="fiscal-details"><summary id="fiscalTechnicalSummary">Nota fiscal reconhecida · Ver dados da nota</summary><div class="form fiscal-detail-form"><div class="field"><label>Estabelecimento fiscal</label><input id="fVendor"></div><div class="field"><label>CNPJ</label><input id="fCnpj" inputmode="numeric" maxlength="18"></div><div class="field full"><label>Endereço fiscal</label><input id="fAddress"></div><div class="field"><label>Número da nota</label><input id="fNumber" inputmode="numeric"></div><div class="field"><label>Série</label><input id="fSeries" inputmode="numeric"></div><div class="field full"><label>Itens identificados</label><textarea id="fItems" readonly></textarea></div><div class="field full"><label>Chave de acesso</label><input id="fKey" inputmode="numeric"></div><div class="field"><label>Data/hora</label><input id="fDate"></div><div class="field"><label>Valor</label><input id="fValue" type="number" step="0.01"></div><div class="field"><label>Forma de pagamento lida</label><input id="fPayment"></div><div class="field full"><label>Consulta oficial / QR</label><input id="fQr"></div></div></details></div><form id="expenseForm"'''
html,n=re.subn(pattern,new,html,count=1,flags=re.S)
if n!=1: raise SystemExit(f'fiscal box replacement count={n}')

# Remove the large duplicated fiscal summary styling; keep a subtle technical disclosure only.
html += '' if '.fiscal-details summary' in html else ''
html=html.replace('.fiscal{margin-top:10px;background:#fff;border:1px solid var(--line);border-radius:12px;padding:12px}', '.fiscal{margin-top:8px;background:transparent;border:0;padding:0}')
html=html.replace('.fiscal-details{margin-top:9px;border-top:1px solid #edf1f5;padding-top:8px}', '.fiscal-details{margin-top:4px;padding:0}')
html=html.replace('.fiscal-details summary{cursor:pointer;color:var(--blue);font-size:11px;font-weight:700;list-style-position:inside}', '.fiscal-details summary{cursor:pointer;color:var(--blue);font-size:11px;font-weight:700;list-style-position:inside;padding:5px 0}.fiscal-details[open]{background:#fbfcfe;border:1px solid var(--line);border-radius:10px;padding:10px}')
html=html.replace('<p>Fotografe a nota para preencher os dados e informe se a compra foi parcelada.</p>', '<p>Escaneie o QR Code para preencher a despesa automaticamente.</p>')
html=re.sub(r'\.\/despesas-reembolsos-v2\.js\?v=\d+', './despesas-reembolsos-v2.js?v=7', html)

# Add smart classification helpers before the fiscal UI functions.
anchor='function renderFiscalSummary(d)'
idx=js.find(anchor)
if idx<0: raise SystemExit('renderFiscalSummary anchor not found')
helpers=r'''function simpleNorm(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').trim()}
function inferredCategory(d){if(d?.category_hint)return d.category_hint;const s=simpleNorm([d?.items?.join?.(' '),d?.description_hint,d?.establishment,d?.legal_name,d?.cnae_description,d?.ocr_text].filter(Boolean).join(' '));if(/GASOLINA|ETANOL|ALCOOL|DIESEL|GNV|COMBUST|AUTO POSTO|POSTO DE COMBUST|4731.?8.?00/.test(s))return'Combustível';if(/PEDAGIO|TARIFA DE PEDAGIO/.test(s))return'Pedágio';if(/ESTACIONAMENTO|PARKING/.test(s))return'Estacionamento';if(/HOTEL|POUSADA|HOSPEDAGEM|MOTEL/.test(s))return'Hospedagem';if(/RESTAURANTE|LANCHONETE|PADARIA|PIZZARIA|ALIMENTACAO|REFEICAO|MARMITA|CAFE/.test(s))return'Alimentação';if(/UBER|TAXI|TRANSPORTE|PASSAGEM|LOCACAO DE VEICULO/.test(s))return'Transporte';if(/FERRAGEM|FERRAMENTA|MATERIAL|ELETRONIC|PAPELARIA/.test(s))return'Material';if(/SERVICO|SERVICOS/.test(s))return'Serviços';return''}
function setCategoryByName(name){if(!name||!B)return false;const target=simpleNorm(name),companyKey=$('eCompany').value;const cat=(B.categories||[]).find(x=>x.company_key===companyKey&&simpleNorm(x.name)===target);if(!cat)return false;$('eCategory').value=cat.category_id;return true}
function bestExpenseDescription(d,cat){const items=Array.isArray(d?.items)?d.items.filter(Boolean):[];if(cat==='Combustível'){const fuel=items.find(x=>/GASOLINA|ETANOL|ALCOOL|DIESEL|GNV|COMBUST/i.test(x));if(fuel)return fuel}return d?.description_hint||items[0]||cat||''}
function applyFiscalToExpense(d){const cat=inferredCategory(d);if(d.establishment)$('eVendor').value=d.establishment;if(d.cnpj)$('eVendorDoc').value=formatDocument(d.cnpj);if(d.address)$('eAddress').value=d.address;if(d.value!=null&&Number(d.value)>0)$('eAmount').value=Number(d.value);if(d.date_time){const x=String(d.date_time).match(/(\d{2})[\/.-](\d{2})[\/.-](\d{4})(?:\s+(\d{2}:\d{2}))?/);if(x)$('eDate').value=`${x[3]}-${x[2]}-${x[1]}T${x[4]||'12:00'}`}if(cat)setCategoryByName(cat);const desc=bestExpenseDescription(d,cat);if(desc)$('eDesc').value=desc;if(d.payment_method){const p=B.paymentMethods.find(x=>String(d.payment_method).toLowerCase().includes('pix')?/pix/i.test(x.name):/cr[eé]dito/i.test(d.payment_method)?/cr[eé]dito/i.test(x.name):/d[eé]bito/i.test(d.payment_method)?/d[eé]bito/i.test(x.name):/dinheiro/i.test(d.payment_method)?/dinheiro/i.test(x.name):false);if(p){$('ePayment').value=p.payment_method_id;paymentChanged()}}renderInstallmentPreview();maskTarget($('eVendorDoc'));return cat}
'''
js=js[:idx]+helpers+js[idx:]

# Replace duplicated summary + old fill with technical-only storage and direct main-form sync.
pattern=r'function renderFiscalSummary\(d\)\{.*?\}\nfunction fillFiscal\(raw,sync=true\)\{.*?\}\nasync function loadQrScanner'
replacement=r'''function fillFiscal(raw,sync=true){const d=sanitizeFiscalResult(raw);d.items=Array.isArray(raw?.items)?raw.items.filter(Boolean):[];d.category_hint=raw?.category_hint||d.category_hint||'';d.description_hint=raw?.description_hint||d.description_hint||'';d.legal_name=raw?.legal_name||d.legal_name||'';d.cnae=raw?.cnae||d.cnae||'';d.cnae_description=raw?.cnae_description||d.cnae_description||'';fiscal={...fiscal,...d};$('fiscalBox').classList.remove('hidden');$('fVendor').value=d.establishment||'';$('fCnpj').value=formatDocument(d.cnpj||'');$('fAddress').value=d.address||'';$('fNumber').value=d.number||'';$('fSeries').value=d.series||'';if($('fItems'))$('fItems').value=d.items.join('\n');$('fKey').value=formatAccessKey(d.access_key||'');$('fDate').value=d.date_time||'';$('fValue').value=d.value??'';$('fPayment').value=d.payment_method||'';$('fQr').value=d.official_query_url||'';const cat=sync?applyFiscalToExpense(d):inferredCategory(d);const bits=[d.number?'NF '+d.number:'',cat||'',d.establishment||''].filter(Boolean);$('fiscalTechnicalSummary').textContent=(bits.length?bits.join(' · '):'Nota fiscal reconhecida')+' · Ver dados da nota'}
async function loadQrScanner'''
js,n=re.subn(pattern,replacement,js,count=1,flags=re.S)
if n!=1: raise SystemExit(f'fillFiscal replacement count={n}')

# Preserve smart fiscal metadata in saved record.
old="function collectFiscal(){return{establishment:$('fVendor').value||null,cnpj:digits($('fCnpj').value)||null,address:$('fAddress').value||null,number:digits($('fNumber').value)||null,series:digits($('fSeries').value)||null,access_key:digits($('fKey').value)||null,date_time:$('fDate').value||null,value:$('fValue').value?Number($('fValue').value):null,payment_method:$('fPayment').value||null,official_query_url:$('fQr').value||null,ocr_used:Boolean(fiscal.ocr_used),qr_used:Boolean(fiscal.qr_used)}}"
new="function collectFiscal(){return{establishment:$('fVendor').value||null,cnpj:digits($('fCnpj').value)||null,address:$('fAddress').value||null,number:digits($('fNumber').value)||null,series:digits($('fSeries').value)||null,access_key:digits($('fKey').value)||null,date_time:$('fDate').value||null,value:$('fValue').value?Number($('fValue').value):null,payment_method:$('fPayment').value||null,official_query_url:$('fQr').value||null,items:Array.isArray(fiscal.items)?fiscal.items:[],category_hint:fiscal.category_hint||null,description_hint:fiscal.description_hint||null,legal_name:fiscal.legal_name||null,cnae:fiscal.cnae||null,cnae_description:fiscal.cnae_description||null,ocr_used:Boolean(fiscal.ocr_used),qr_used:Boolean(fiscal.qr_used)}}"
if old not in js: raise SystemExit('collectFiscal exact block not found')
js=js.replace(old,new,1)

# QR status becomes useful and concise, based on what was actually filled.
old="$('scanStatus').textContent=r.source==='SEFAZ_AND_QR'?'QR lido e dados fiscais consultados. Confira antes de salvar.':'QR lido. Os dados disponíveis na chave fiscal foram preenchidos; confira os demais campos.';"
new="const cat=inferredCategory(merged),parts=[merged.establishment,cat,merged.value?money(merged.value):''].filter(Boolean);$('scanStatus').textContent=parts.length?'Preenchido automaticamente: '+parts.join(' · '):'Nota fiscal reconhecida. Confira os campos preenchidos.';"
if old in js: js=js.replace(old,new,1)
else:
    # Current source label may have changed; replace generic assignment in resolveFiscalQr.
    js=re.sub(r"\$\('scanStatus'\)\.textContent=r\.source===.*?;if\(r\.warning\)",new+"if(r.warning)",js,count=1)

# OCR/photo path also classifies from the text even when there is no structured SEFAZ item list.
old="const p1=parseFiscalText(r1.text,qr),p2=parseFiscalText(r2.text,qr),parsed=mergeFiscalReads(p1,p2);"
new="const p1=parseFiscalText(r1.text,qr),p2=parseFiscalText(r2.text,qr),parsed=mergeFiscalReads(p1,p2);parsed.items=[];parsed.category_hint=inferredCategory({...parsed,ocr_text:[r1.text,r2.text].join(' ')});parsed.description_hint=parsed.category_hint;"
if old in js: js=js.replace(old,new,1)

html_path.write_text(html,encoding='utf-8')
js_path.write_text(js,encoding='utf-8')
print('Scanner simplified and smart form autofill enabled')
