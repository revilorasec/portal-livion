from pathlib import Path
import re

html_path=Path('despesas-reembolsos-v2.html')
js_path=Path('despesas-reembolsos-v2.js')
html=html_path.read_text(encoding='utf-8')
js=js_path.read_text(encoding='utf-8')

# 1) Main capture UI: one clean entry point.
old='''<div class="scanbox"><div class="actions"><button id="qrScanBtn" type="button" class="btn primary">QR Code</button><button id="photoScanBtn" type="button" class="btn">Foto com OCR</button><input id="scanFile" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" class="hidden"><input id="scanUpload" type="file" accept="image/jpeg,image/png,image/webp" class="hidden"><span id="scanStatus"></span></div></div>'''
new='''<div class="scanbox"><div class="actions"><button id="captureMenuBtn" type="button" class="btn primary">QR Code e Foto</button><input id="scanFile" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" class="hidden"><input id="scanUpload" type="file" accept="image/jpeg,image/png,image/webp" class="hidden"><span id="scanStatus"></span></div></div>'''
if old not in html: raise SystemExit('capture HTML anchor not found')
html=html.replace(old,new,1)
html=re.sub(r'\.\/despesas-reembolsos-v2\.js\?v=\d+', './despesas-reembolsos-v2.js?v=16', html)

# 2) State for photo mode.
old="let token='',B=null,events=[],expenses=[],reimbursements=[],agenda=[],cards=[],banks=[],shareCandidates=[],geo=null,fiscal={},qrScanner=null,scannedReceiptFile=null,manualTouched=new Set(),sortKey='incurred_at',sortDir=-1,catalogTab='category';"
new="let token='',B=null,events=[],expenses=[],reimbursements=[],agenda=[],cards=[],banks=[],shareCandidates=[],geo=null,fiscal={},qrScanner=null,scannedReceiptFile=null,pendingPhotoOcr=true,manualTouched=new Set(),sortKey='incurred_at',sortDir=-1,catalogTab='category';"
if old not in js: raise SystemExit('global state anchor not found')
js=js.replace(old,new,1)

# 3) Card labels: picker highlights nickname; report uses transaction modality.
old="function cardLabel(c){return `${c.nickname} · •••• ${c.last4} · ${cardModeLabel(c)}${c.card_type==='EMPRESA'?' · Empresa':c.owner_name?' · '+c.owner_name:''}`}\nfunction expenseCardLabel(x){const c=by(cards,x?.card_id,'card_id');return c?cardLabel(c):String(x?.card_alias||'').trim()}"
new="""function cardPickerLabel(c){return `${c.nickname}${c.last4?' · •••• '+c.last4:''}`}
function cardLabel(c){return `${c.nickname} · •••• ${c.last4} · ${cardModeLabel(c)}${c.card_type==='EMPRESA'?' · Empresa':c.owner_name?' · '+c.owner_name:''}`}
function transactionCardMode(x,c=null){const pm=by(B?.paymentMethods,x?.payment_method_id,'payment_method_id'),name=String(pm?.name||'');if(/cr[eé]dito/i.test(name))return'Crédito';if(/d[eé]bito/i.test(name))return'Débito';if(c){const m=String(c.payment_mode||'').toUpperCase();if(m==='CREDITO')return'Crédito';if(m==='DEBITO')return'Débito'}return''}
function expenseCardLabel(x){const c=by(cards,x?.card_id,'card_id');return c?cardLabel(c):String(x?.card_alias||'').trim()}
function expenseCardReportLabel(x){const c=by(cards,x?.card_id,'card_id');if(!c)return String(x?.card_alias||'').trim();return [c.nickname,c.last4?'•••• '+c.last4:'',c.brand||'',transactionCardMode(x,c)].filter(Boolean).join(' · ')}"""
if old not in js: raise SystemExit('card label anchor not found')
js=js.replace(old,new,1)

old="$('eCard').innerHTML='<option value=\"\">Sem cartão identificado</option>'+rows.map(c=>`<option value=\"${c.card_id}\">${esc(cardLabel(c))}</option>`).join('');"
new="$('eCard').innerHTML='<option value=\"\">Sem cartão identificado</option>'+rows.map(c=>`<option value=\"${c.card_id}\">${esc(cardPickerLabel(c))}</option>`).join('');"
if old not in js: raise SystemExit('card picker options anchor not found')
js=js.replace(old,new,1)

# History/detail should use report label.
old="${expenseCardLabel(x)?' · <b>Cartão:</b> '+esc(expenseCardLabel(x)):''}"
new="${expenseCardReportLabel(x)?' · <b>Cartão:</b> '+esc(expenseCardReportLabel(x)):''}"
if old not in js: raise SystemExit('openExpense card label anchor not found')
js=js.replace(old,new,1)

# Excel report uses the same privacy-aware transaction label.
old="Cartão:x.card_id?cardLabel(by(cards,x.card_id,'card_id')||{nickname:'Cartão',last4:'????',card_type:'PESSOAL'}):''"
new="Cartão:expenseCardReportLabel(x)"
if old not in js: raise SystemExit('export card anchor not found')
js=js.replace(old,new,1)

# 4) Hierarchical capture menu.
old="function openOcrSourcePicker(){$('modalTitle').textContent='Foto com OCR';$('modalBody').innerHTML='';$('modalActions').innerHTML='<button class=\"btn\" id=\"ocrCamera\">Usar câmera</button><button class=\"btn primary\" id=\"ocrGallery\">Escolher foto</button><button class=\"btn\" id=\"modalClose\">Cancelar</button>';showModal();$('modalClose').onclick=hideModal;$('ocrCamera').onclick=()=>{hideModal();$('scanFile').click()};$('ocrGallery').onclick=()=>{hideModal();$('scanUpload').click()}}"
new="""function openCaptureMenu(){$('modalTitle').textContent='QR Code e Foto';$('modalBody').innerHTML='';$('modalActions').innerHTML='<button class="btn primary" id="captureQr">QR Code</button><button class="btn" id="capturePhoto">Foto</button><button class="btn" id="modalClose">Cancelar</button>';showModal();$('modalClose').onclick=hideModal;$('captureQr').onclick=()=>{hideModal();startQrScan()};$('capturePhoto').onclick=()=>openPhotoModePicker()}
function openPhotoModePicker(){$('modalTitle').textContent='Foto';$('modalBody').innerHTML='';$('modalActions').innerHTML='<button class="btn primary" id="photoWithOcr">Foto com OCR</button><button class="btn" id="photoWithoutOcr">Foto sem OCR</button><button class="btn" id="modalClose">Cancelar</button>';showModal();$('modalClose').onclick=hideModal;$('photoWithOcr').onclick=()=>openPhotoSourcePicker(true);$('photoWithoutOcr').onclick=()=>openPhotoSourcePicker(false)}
function openPhotoSourcePicker(useOcr){pendingPhotoOcr=Boolean(useOcr);$('modalTitle').textContent=useOcr?'Foto com OCR':'Foto sem OCR';$('modalBody').innerHTML='';$('modalActions').innerHTML='<button class="btn" id="photoCamera">Usar câmera</button><button class="btn primary" id="photoGallery">Escolher foto</button><button class="btn" id="modalClose">Cancelar</button>';showModal();$('modalClose').onclick=hideModal;$('photoCamera').onclick=()=>{hideModal();$('scanFile').click()};$('photoGallery').onclick=()=>{hideModal();$('scanUpload').click()}}
function handleSelectedReceipt(file){if(!file)return;scannedReceiptFile=file;if(pendingPhotoOcr){scanFiscal(file).catch(e=>{$('scanStatus').textContent='Falha na leitura: '+e.message})}else{$('scanStatus').textContent='Foto anexada sem OCR. Nenhum campo foi alterado.'}}"""
if old not in js: raise SystemExit('OCR picker anchor not found')
js=js.replace(old,new,1)

# 5) Bind new menu and common photo handler.
old="$('qrScanBtn').onclick=()=>startQrScan();$('photoScanBtn').onclick=openOcrSourcePicker;$('qrClose').onclick=()=>stopQrScan();$('scanFile').onchange=()=>{const f=$('scanFile').files?.[0];if(f)scannedReceiptFile=f;scanFiscal(f).catch(e=>{$('scanStatus').textContent='Falha na leitura: '+e.message})};$('scanUpload').onchange=()=>{const f=$('scanUpload').files?.[0];if(f)scannedReceiptFile=f;scanFiscal(f).catch(e=>{$('scanStatus').textContent='Falha na leitura: '+e.message})};"
new="$('captureMenuBtn').onclick=openCaptureMenu;$('qrClose').onclick=()=>stopQrScan();$('scanFile').onchange=()=>handleSelectedReceipt($('scanFile').files?.[0]);$('scanUpload').onchange=()=>handleSelectedReceipt($('scanUpload').files?.[0]);"
if old not in js: raise SystemExit('capture bindings anchor not found')
js=js.replace(old,new,1)

html_path.write_text(html,encoding='utf-8')
js_path.write_text(js,encoding='utf-8')
print('Capture flow and card report labels updated')
