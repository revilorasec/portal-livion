from pathlib import Path
import re

js_path=Path('despesas-reembolsos-v2.js')
html_path=Path('despesas-reembolsos-v2.html')
js=js_path.read_text(encoding='utf-8')
html=html_path.read_text(encoding='utf-8')

# Foto deixa de oferecer OCR e passa direto para anexar imagem.
old="function openCaptureMenu(){$('modalTitle').textContent='QR Code e Foto';$('modalBody').innerHTML='';$('modalActions').innerHTML='<button class=\"btn primary\" id=\"captureQr\">QR Code</button><button class=\"btn\" id=\"capturePhoto\">Foto</button><button class=\"btn\" id=\"modalClose\">Cancelar</button>';showModal();$('modalClose').onclick=hideModal;$('captureQr').onclick=()=>{hideModal();startQrScan()};$('capturePhoto').onclick=()=>openPhotoModePicker()}"
new="function openCaptureMenu(){$('modalTitle').textContent='QR Code e Foto';$('modalBody').innerHTML='';$('modalActions').innerHTML='<button class=\"btn primary\" id=\"captureQr\">QR Code</button><button class=\"btn\" id=\"capturePhoto\">Foto</button><button class=\"btn\" id=\"modalClose\">Cancelar</button>';showModal();$('modalClose').onclick=hideModal;$('captureQr').onclick=()=>{hideModal();startQrScan()};$('capturePhoto').onclick=()=>openPhotoSourcePicker(false)}"
if old not in js: raise SystemExit('openCaptureMenu anchor not found')
js=js.replace(old,new,1)

# Mantemos a função antiga inofensiva por compatibilidade, mas sem oferecer OCR.
pattern=r"function openPhotoModePicker\(\)\{.*?\}\nfunction openPhotoSourcePicker"
replacement="function openPhotoModePicker(){openPhotoSourcePicker(false)}\nfunction openPhotoSourcePicker"
js,n=re.subn(pattern,lambda m:replacement,js,count=1,flags=re.S)
if n!=1: raise SystemExit(f'openPhotoModePicker replacement count={n}')

# Fonte da foto sempre sem OCR.
pattern=r"function openPhotoSourcePicker\(useOcr\)\{.*?\}\nfunction handleSelectedReceipt"
replacement="function openPhotoSourcePicker(useOcr){pendingPhotoOcr=false;$('modalTitle').textContent='Anexar foto';$('modalBody').innerHTML='<p style=\"margin:0;color:#6f7f95\">A foto será salva como comprovante. Os campos da despesa devem ser preenchidos manualmente.</p>';$('modalActions').innerHTML='<button class=\"btn\" id=\"photoCamera\">Usar câmera</button><button class=\"btn primary\" id=\"photoGallery\">Escolher foto</button><button class=\"btn\" id=\"modalClose\">Cancelar</button>';showModal();$('modalClose').onclick=hideModal;$('photoCamera').onclick=()=>{hideModal();$('scanFile').click()};$('photoGallery').onclick=()=>{hideModal();$('scanUpload').click()}}\nfunction handleSelectedReceipt"
js,n=re.subn(pattern,lambda m:replacement,js,count=1,flags=re.S)
if n!=1: raise SystemExit(f'openPhotoSourcePicker replacement count={n}')

pattern=r"function handleSelectedReceipt\(file\)\{.*?\}\nfunction markManualScannerFields"
replacement="function handleSelectedReceipt(file){if(!file)return;scannedReceiptFile=file;pendingPhotoOcr=false;$('scanStatus').textContent='Foto anexada. Nenhum campo foi alterado; preencha os dados manualmente.'}\nfunction markManualScannerFields"
js,n=re.subn(pattern,lambda m:replacement,js,count=1,flags=re.S)
if n!=1: raise SystemExit(f'handleSelectedReceipt replacement count={n}')

html=re.sub(r'\\./despesas-reembolsos-v2\\.js\\?v=\\d+', './despesas-reembolsos-v2.js?v=21', html)

js_path.write_text(js,encoding='utf-8')
html_path.write_text(html,encoding='utf-8')
print('Photo OCR disabled; photos are attachment-only and manual entry is explicit')
