from pathlib import Path
import re

html_path=Path('despesas-reembolsos-v2.html')
js_path=Path('despesas-reembolsos-v2.js')
html=html_path.read_text(encoding='utf-8')
js=js_path.read_text(encoding='utf-8')

# -------- HTML: replace only the New Expense view --------
new_section='''<section id="new" class="view"><div class="hero"><div><h2>Nova despesa</h2></div></div><div class="card"><div id="draftNote" class="draft hidden">Há um rascunho local preservado neste dispositivo.</div><div class="scanbox"><div class="actions"><button id="qrScanBtn" type="button" class="btn primary">QR Code</button><button id="photoScanBtn" type="button" class="btn">Foto com OCR</button><input id="scanFile" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" class="hidden"><input id="scanUpload" type="file" accept="image/jpeg,image/png,image/webp" class="hidden"><span id="scanStatus"></span></div></div><form id="expenseForm" class="form" style="margin-top:12px"><input id="eType" type="hidden" value="DIA_A_DIA"><input id="eEvent" type="hidden"><input id="eCost" type="hidden"><input id="eProject" type="hidden"><div class="field"><label>Valor *</label><input id="eAmount" type="number" step="0.01" min="0.01"></div><div class="field"><label>Fornecedor / estabelecimento</label><input id="eVendor"></div><div class="field"><label>CNPJ / CPF do estabelecimento</label><input id="eVendorDoc" inputmode="numeric" maxlength="18"></div><div class="field"><label>Data e hora *</label><input id="eDate" type="datetime-local"></div><div class="field"><label>CPF/CNPJ do consumidor</label><input id="eConsumerDoc" inputmode="numeric" maxlength="18"></div><div class="field full"><label>Endereço do estabelecimento</label><input id="eAddress"><div class="actions"><button type="button" id="geoBtn" class="btn">Usar localização atual</button><a id="eAddressMap" class="map-link hidden" target="_blank" rel="noopener">Abrir endereço no mapa</a><a id="geoText" class="map-link hidden" target="_blank" rel="noopener"></a></div></div><div class="field"><label>Empresa *</label><select id="eCompany"></select></div><div class="field"><label>Quem pagou *</label><select id="ePaidBy"></select></div><div class="field full"><label>Centro de Custo</label><select id="eCostUnified"></select></div><div class="field"><label>Categoria</label><select id="eCategory"></select></div><div class="field full"><label>Motivo da despesa *</label><input id="eDesc" placeholder="Ex.: Visita ao cliente, reunião, atendimento em campo…"></div><div class="field full"><label>Itens / consumos</label><textarea id="eItems"></textarea></div><div class="field"><label>Forma de pagamento</label><select id="ePayment"></select><small id="installmentHint"></small></div><div id="eCardWrap" class="field hidden"><label>Cartão utilizado</label><select id="eCard"></select><small id="cardHint"></small></div><div class="field"><label>Número de parcelas</label><select id="installments"><option value="1">1x / à vista</option><option value="2">2x</option><option value="3">3x</option><option value="4">4x</option><option value="5">5x</option><option value="6">6x</option><option value="7">7x</option><option value="8">8x</option><option value="9">9x</option><option value="10">10x</option><option value="11">11x</option><option value="12">12x</option><option value="18">18x</option><option value="24">24x</option></select></div><div id="firstDueWrap" class="field hidden"><label>Vencimento da 1ª parcela</label><input id="firstDue" type="date"></div><div class="field"><label>Reembolsável? *</label><select id="eReimbursable"><option value="true">Sim</option><option value="false">Não</option></select></div><div id="paymentRuleNote" class="field full hidden"><div class="payment-note"></div></div><div class="field full"><div id="installmentPreview" class="installments"></div></div><div class="field"><label>Foto 1</label><input id="ePhoto1" type="file" accept="image/jpeg,image/png,image/webp" capture="environment"></div><div class="field"><label>Foto 2</label><input id="ePhoto2" type="file" accept="image/jpeg,image/png,image/webp" capture="environment"></div><div class="field full"><label>Observações</label><textarea id="eNotes"></textarea></div><div class="field full"><div id="uploadStatus"></div></div><div class="field full"><div class="actions"><button type="button" id="saveDraft" class="btn">Salvar rascunho</button><button type="button" id="submitExpense" class="btn primary">Enviar para aprovação</button><button type="button" id="clearDraft" class="btn">Limpar</button></div></div></form></div></section>'''
html,n=re.subn(r'<section id="new" class="view">.*?</section><section id="expenses" class="view">', new_section+'<section id="expenses" class="view">', html, count=1, flags=re.S)
if n!=1: raise SystemExit(f'new expense section replacement count={n}')
html=re.sub(r'\.\/despesas-reembolsos-v2\.js\?v=\d+', './despesas-reembolsos-v2.js?v=15', html)

# -------- JS globals --------
old="let token='',B=null,events=[],expenses=[],reimbursements=[],agenda=[],cards=[],banks=[],shareCandidates=[],geo=null,fiscal={},qrScanner=null,sortKey='incurred_at',sortDir=-1,catalogTab='category';"
new="let token='',B=null,events=[],expenses=[],reimbursements=[],agenda=[],cards=[],banks=[],shareCandidates=[],geo=null,fiscal={},qrScanner=null,scannedReceiptFile=null,manualTouched=new Set(),sortKey='incurred_at',sortDir=-1,catalogTab='category';"
if old not in js: raise SystemExit('globals anchor not found')
js=js.replace(old,new,1)

# -------- Unified Centro de Custo selector --------
pattern=r"function fillCompany\(\)\{.*?\}\nfunction initForm"
replacement=r'''function unifiedCostOptions(companyKey){const costs=(B.costCenters||[]).filter(x=>x.company_key===companyKey),projects=(B.projects||[]).filter(x=>x.company_key===companyKey),evs=events.filter(x=>x.company_key===companyKey&&!['CANCELADO','ARQUIVADO'].includes(x.status));let h='<option value="">Selecione…</option>';if(costs.length)h+='<optgroup label="Centros de custo">'+costs.map(x=>`<option value="cost:${x.cost_center_id}">${esc(x.name)}</option>`).join('')+'</optgroup>';if(projects.length)h+='<optgroup label="Projetos">'+projects.map(x=>`<option value="project:${x.project_id}">${esc(x.name)}</option>`).join('')+'</optgroup>';if(evs.length)h+='<optgroup label="Eventos">'+evs.map(x=>`<option value="event:${x.event_id}">${esc(x.name)}</option>`).join('')+'</optgroup>';return h}
function syncUnifiedCostSelection(){const v=$('eCostUnified')?.value||'';$('eCost').value='';$('eProject').value='';$('eEvent').value='';$('eType').value='DIA_A_DIA';const [kind,id]=v.split(':');if(kind==='cost')$('eCost').value=id||'';if(kind==='project')$('eProject').value=id||'';if(kind==='event'){$('eEvent').value=id||'';$('eType').value='EVENTO'}}
function syncUnifiedFromHidden(){if(!$('eCostUnified'))return;const v=$('eEvent').value?'event:'+$('eEvent').value:$('eProject').value?'project:'+$('eProject').value:$('eCost').value?'cost:'+$('eCost').value:'';if([...$('eCostUnified').options].some(o=>o.value===v))$('eCostUnified').value=v;else $('eCostUnified').value=''}
function fillCompany(){const c=$('eCompany').value,keepUnified=$('eCostUnified')?.value||'';$('eCategory').innerHTML=opts(B.categories.filter(x=>x.company_key===c),'category_id','name');$('ePayment').innerHTML=opts(B.paymentMethods.filter(x=>x.company_key===c),'payment_method_id','name');if($('eCostUnified')){$('eCostUnified').innerHTML=unifiedCostOptions(c);if([...$('eCostUnified').options].some(o=>o.value===keepUnified))$('eCostUnified').value=keepUnified;else syncUnifiedFromHidden()}paymentChanged();renderCardOptions()}
function initForm'''
js,n=re.subn(pattern,lambda m:replacement,js,count=1,flags=re.S)
if n!=1: raise SystemExit(f'fillCompany replacement count={n}')

# toggleEvent no longer controls UI.
js=re.sub(r"function toggleEvent\(\)\{.*?\}", "function toggleEvent(){syncUnifiedCostSelection()}", js, count=1, flags=re.S)

# -------- Scanner write protection + learned categories --------
anchor='function inferredCategory(d)'
helpers=r'''function scannerSet(id,value){const el=$(id);if(!el||value===null||value===undefined||value===''||manualTouched.has(id))return false;el.value=value;return true}
function scannerSetSelect(id,value){const el=$(id);if(!el||manualTouched.has(id)||value===null||value===undefined||value==='')return false;const v=String(value);if(![...el.options].some(o=>o.value===v))return false;el.value=v;return true}
function rememberedCategoryId(d){const companyKey=$('eCompany').value,doc=digits(d?.cnpj||''),vendor=simpleNorm([d?.trade_name,d?.legal_name,d?.establishment].find(validFiscalVendor)||'');const row=(expenses||[]).find(x=>x.company_key===companyKey&&x.category_id&&((doc&&digits(x.vendor_document||'')===doc)||(!doc&&vendor&&simpleNorm(x.vendor_name||'')===vendor)));return row?.category_id||''}
function fiscalInstallmentCount(d){const direct=Number(d?.installment_count||0);if(Number.isInteger(direct)&&direct>0&&direct<=24)return direct;const s=[d?.payment_method,d?.description_hint,d?.ocr_text].filter(Boolean).join(' ');let m=s.match(/(?:PARCELAD[OA]\s*(?:EM)?\s*|)(\d{1,2})\s*[xX]\b/i)||s.match(/(\d{1,2})\s+PARCELAS?/i);const n=Number(m?.[1]||0);return Number.isInteger(n)&&n>0&&n<=24?n:0}
'''
if anchor not in js: raise SystemExit('inferredCategory anchor not found')
js=js.replace(anchor,helpers+anchor,1)

# setCategoryByName honors manual edits.
old="function setCategoryByName(name){if(!name||!B)return false;const target=simpleNorm(name),companyKey=$('eCompany').value;const cat=(B.categories||[]).find(x=>x.company_key===companyKey&&simpleNorm(x.name)===target);if(!cat)return false;$('eCategory').value=cat.category_id;return true}"
new="function setCategoryByName(name){if(!name||!B||manualTouched.has('eCategory'))return false;const target=simpleNorm(name),companyKey=$('eCompany').value;const cat=(B.categories||[]).find(x=>x.company_key===companyKey&&simpleNorm(x.name)===target);if(!cat)return false;$('eCategory').value=cat.category_id;return true}"
if old not in js: raise SystemExit('setCategoryByName not found')
js=js.replace(old,new,1)

# applyFiscalToExpense: populate only untouched fields, use history for category, never Description.
pattern=r"function applyFiscalToExpense\(d\)\{.*?return cat\}"
replacement=r'''function applyFiscalToExpense(d){const cat=inferredCategory(d),vendor=[d.trade_name,d.legal_name,d.establishment].find(validFiscalVendor);if(vendor)scannerSet('eVendor',vendor);if(d.cnpj)scannerSet('eVendorDoc',formatDocument(d.cnpj));if(d.address)scannerSet('eAddress',d.address);if(Array.isArray(d.items)&&d.items.length)scannerSet('eItems',d.items.join('\n'));if(d.consumer_document)scannerSet('eConsumerDoc',formatDocument(d.consumer_document));if(d.value!=null&&Number(d.value)>0)scannerSet('eAmount',Number(d.value));if(d.date_time&&!manualTouched.has('eDate')){const x=String(d.date_time).match(/(\d{2})[\/.-](\d{2})[\/.-](\d{4})(?:\s+(\d{2}:\d{2}))?/);if(x)$('eDate').value=`${x[3]}-${x[2]}-${x[1]}T${x[4]||'12:00'}`}let categorySet=false;if(cat)categorySet=setCategoryByName(cat);if(!categorySet&&!manualTouched.has('eCategory')){const remembered=rememberedCategoryId(d);if(remembered)scannerSetSelect('eCategory',remembered)}if(d.payment_method&&!manualTouched.has('ePayment')){const p=B.paymentMethods.find(x=>String(d.payment_method).toLowerCase().includes('pix')?/pix/i.test(x.name):/cr[eé]dito/i.test(d.payment_method)?/cr[eé]dito/i.test(x.name):/d[eé]bito/i.test(d.payment_method)?/d[eé]bito/i.test(x.name):/dinheiro/i.test(d.payment_method)?/dinheiro/i.test(x.name):false);if(p&&scannerSetSelect('ePayment',p.payment_method_id))paymentChanged()}const count=fiscalInstallmentCount(d);if(count&&!manualTouched.has('installments')&&scannerSetSelect('installments',String(count)))installmentChanged();renderInstallmentPreview();maskTarget($('eVendorDoc'));maskTarget($('eConsumerDoc'));updateMapLinks();return cat}'''
js,n=re.subn(pattern,lambda m:replacement,js,count=1,flags=re.S)
if n!=1: raise SystemExit(f'applyFiscalToExpense replacement count={n}')

# Hidden fiscal metadata only: no duplicated fiscal panel in UI.
pattern=r"function fillFiscal\(raw,sync=true\)\{.*?\}\nasync function loadQrScanner"
replacement=r'''function fillFiscal(raw,sync=true){const d=sanitizeFiscalResult(raw);d.items=cleanFiscalItems(raw?.items);d.category_hint=raw?.category_hint||d.category_hint||'';d.legal_name=raw?.legal_name||d.legal_name||'';d.trade_name=raw?.trade_name||d.trade_name||'';d.cnae=raw?.cnae||d.cnae||'';d.cnae_description=raw?.cnae_description||d.cnae_description||'';d.consumer_document=digits(raw?.consumer_document||d.consumer_document||'').slice(0,14);d.installment_count=raw?.installment_count||d.installment_count||null;d.ocr_text=raw?.ocr_text||d.ocr_text||'';fiscal={...fiscal,...d};if(sync)applyFiscalToExpense(d);updateMapLinks()}
async function loadQrScanner'''
js,n=re.subn(pattern,lambda m:replacement,js,count=1,flags=re.S)
if n!=1: raise SystemExit(f'fillFiscal replacement count={n}')

# -------- Fiscal collection without duplicated technical form --------
pattern=r"function collectFiscal\(\)\{.*?\}\nfunction persist"
replacement=r'''function collectFiscal(){const pm=by(B?.paymentMethods,$('ePayment')?.value,'payment_method_id');return{...fiscal,establishment:$('eVendor').value||fiscal.establishment||null,cnpj:digits($('eVendorDoc').value)||fiscal.cnpj||null,address:$('eAddress').value||fiscal.address||null,date_time:fiscal.date_time||null,value:$('eAmount').value?Number($('eAmount').value):(fiscal.value??null),payment_method:fiscal.payment_method||pm?.name||null,items:cleanFiscalItems(String($('eItems')?.value||'').split(/\r?\n/)),consumer_document:digits($('eConsumerDoc')?.value)||fiscal.consumer_document||null,category_hint:fiscal.category_hint||null,ocr_used:Boolean(fiscal.ocr_used),qr_used:Boolean(fiscal.qr_used)}}
function persist'''
js,n=re.subn(pattern,lambda m:replacement,js,count=1,flags=re.S)
if n!=1: raise SystemExit(f'collectFiscal replacement count={n}')

# -------- Draft restore / clear --------
pattern=r"function restoreDraft\(\)\{.*?\}\nfunction clearForm\(\)\{.*?\}"
replacement=r'''function restoreDraft(){try{const d=JSON.parse(localStorage.getItem(DRAFT_KEY)||'null');if(!d)return;$('draftNote').classList.remove('hidden');$('eCompany').value=d.company_key||'';fillCompany();for(const [id,k] of [['eType','expense_type'],['eEvent','event_id'],['eCost','cost_center_id'],['eProject','project_id'],['eDesc','description'],['eAmount','requested_amount'],['eVendor','vendor_name'],['eVendorDoc','vendor_document'],['eAddress','vendor_address'],['eNotes','notes'],['eCategory','category_id'],['ePayment','payment_method_id'],['ePaidBy','paid_by_user_id'],['installments','installments'],['firstDue','first_due_date']])if($(id)&&d[k]!=null&&d[k]!=='')$(id).value=d[k];if(d.fiscal_data){fiscal={...d.fiscal_data};if(!$('eItems').value&&Array.isArray(d.fiscal_data.items))$('eItems').value=d.fiscal_data.items.join('\n');if(!$('eConsumerDoc').value&&d.fiscal_data.consumer_document)$('eConsumerDoc').value=formatDocument(d.fiscal_data.consumer_document)}geo=d.latitude!=null?{latitude:d.latitude,longitude:d.longitude}:null;if(d.card_id){renderCardOptions();$('eCard').value=d.card_id}if(d.reimbursable!=null)$('eReimbursable').value=String(d.reimbursable);syncUnifiedFromHidden();paymentChanged();cardChanged();installmentChanged();updateMapLinks();renderGeoLink();for(const id of ['eVendor','eVendorDoc','eAddress','eItems','eCategory','ePayment','installments','eAmount','eDate','eConsumerDoc'])if($(id)?.value)manualTouched.add(id)}catch{}}
function clearForm(){localStorage.removeItem(DRAFT_KEY);$('expenseForm').reset();fiscal={};geo=null;scannedReceiptFile=null;manualTouched.clear();renderGeoLink();$('draftNote').classList.add('hidden');$('scanStatus').textContent='';$('uploadStatus').innerHTML='';if($('scanFile'))$('scanFile').value='';if($('scanUpload'))$('scanUpload').value='';initForm();installmentChanged()}'''
js,n=re.subn(pattern,lambda m:replacement,js,count=1,flags=re.S)
if n!=1: raise SystemExit(f'restore/clear replacement count={n}')

# -------- OCR: keep selected image as receipt and preserve OCR text for installment extraction --------
old="const parsed=parseFiscalText(text,qr);parsed.qr_used=qrUsed;parsed.ocr_used=ocrUsed;parsed.consumer_document=localConsumerFromText(text,parsed.cnpj);parsed.items=localItemsFromText(text);parsed.category_hint=inferredCategory({...parsed,ocr_text:text});fillFiscal(parsed,true);"
new="const parsed=parseFiscalText(text,qr);parsed.qr_used=qrUsed;parsed.ocr_used=ocrUsed;parsed.ocr_text=text;parsed.consumer_document=localConsumerFromText(text,parsed.cnpj);parsed.items=localItemsFromText(text);parsed.category_hint=inferredCategory({...parsed,ocr_text:text});fillFiscal(parsed,true);"
if old not in js: raise SystemExit('scanFiscal parsed block not found')
js=js.replace(old,new,1)

# -------- Save scanned OCR image automatically as receipt --------
old="for(const [id,type,label] of [['ePhoto1','FOTO','Foto 1'],['ePhoto2','FOTO','Foto 2'],['eReceipt','NOTA_FISCAL','Nota / comprovante']]){const f=$(id).files?.[0];if(f)try{await upload(r.expense_id,f,type,label)}catch{failed=true}}"
new="if(scannedReceiptFile)try{await upload(r.expense_id,scannedReceiptFile,'NOTA_FISCAL','Nota / comprovante')}catch{failed=true}for(const [id,type,label] of [['ePhoto1','FOTO','Foto 1'],['ePhoto2','FOTO','Foto 2']]){const f=$(id).files?.[0];if(f)try{await upload(r.expense_id,f,type,label)}catch{failed=true}}"
if old not in js: raise SystemExit('saveExpense upload loop not found')
js=js.replace(old,new,1)

# Event validation remains valid because unified event sets expense_type/event_id.

# -------- OCR source picker --------
anchor="$('nav').onclick=e=>"
picker=r'''function openOcrSourcePicker(){$('modalTitle').textContent='Foto com OCR';$('modalBody').innerHTML='';$('modalActions').innerHTML='<button class="btn" id="ocrCamera">Usar câmera</button><button class="btn primary" id="ocrGallery">Escolher foto</button><button class="btn" id="modalClose">Cancelar</button>';showModal();$('modalClose').onclick=hideModal;$('ocrCamera').onclick=()=>{hideModal();$('scanFile').click()};$('ocrGallery').onclick=()=>{hideModal();$('scanUpload').click()}}
function markManualScannerFields(){for(const id of ['eVendor','eVendorDoc','eAddress','eItems','eCategory','ePayment','installments','eAmount','eDate','eConsumerDoc']){const el=$(id);if(!el)continue;const ev=(el.tagName==='SELECT')?'change':'input';el.addEventListener(ev,()=>manualTouched.add(id))}}
'''
if anchor not in js: raise SystemExit('bindings anchor not found')
js=js.replace(anchor,picker+anchor,1)

# Replace bindings affected by removed fields/buttons and unified selector.
js=js.replace("$('eType').onchange=toggleEvent;", "$('eCostUnified').onchange=syncUnifiedCostSelection;",1)
old_bind="$('qrScanBtn').onclick=()=>startQrScan();$('photoScanBtn').onclick=()=>$('scanFile').click();$('attachScanBtn').onclick=()=>$('scanUpload').click();$('qrClose').onclick=()=>stopQrScan();$('scanFile').onchange=()=>scanFiscal($('scanFile').files?.[0]).catch(e=>{$('scanStatus').textContent='Falha na leitura: '+e.message});$('scanUpload').onchange=()=>scanFiscal($('scanUpload').files?.[0]).catch(e=>{$('scanStatus').textContent='Falha na leitura: '+e.message});"
new_bind="$('qrScanBtn').onclick=()=>startQrScan();$('photoScanBtn').onclick=openOcrSourcePicker;$('qrClose').onclick=()=>stopQrScan();$('scanFile').onchange=()=>{const f=$('scanFile').files?.[0];if(f)scannedReceiptFile=f;scanFiscal(f).catch(e=>{$('scanStatus').textContent='Falha na leitura: '+e.message})};$('scanUpload').onchange=()=>{const f=$('scanUpload').files?.[0];if(f)scannedReceiptFile=f;scanFiscal(f).catch(e=>{$('scanStatus').textContent='Falha na leitura: '+e.message})};"
if old_bind not in js: raise SystemExit('scanner bindings not found')
js=js.replace(old_bind,new_bind,1)

# Start manual-field tracking before load.
old_tail="bindStandardMasks();load();"
new_tail="bindStandardMasks();markManualScannerFields();load();"
if old_tail not in js: raise SystemExit('tail binding not found')
js=js.replace(old_tail,new_tail,1)

html_path.write_text(html,encoding='utf-8')
js_path.write_text(js,encoding='utf-8')
print('Clean expense entry refactor applied')
