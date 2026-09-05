from pathlib import Path
import re

js_path=Path('despesas-reembolsos-v2.js')
html_path=Path('despesas-reembolsos-v2.html')
js=js_path.read_text(encoding='utf-8')
html=html_path.read_text(encoding='utf-8')

old="let token='',B=null,events=[],expenses=[],reimbursements=[],agenda=[],cards=[],banks=[],shareCandidates=[],geo=null,fiscal={},qrScanner=null,scannedReceiptFile=null,pendingPhotoOcr=true,manualTouched=new Set(),sortKey='incurred_at',sortDir=-1,catalogTab='category';"
new="let token='',B=null,events=[],expenses=[],reimbursements=[],agenda=[],cards=[],banks=[],shareCandidates=[],geo=null,fiscal={},qrScanner=null,qrNativeStream=null,qrNativeTimer=null,qrNativeVideo=null,qrScanDone=false,scannedReceiptFile=null,pendingPhotoOcr=true,manualTouched=new Set(),sortKey='incurred_at',sortDir=-1,catalogTab='category';"
if old not in js: raise SystemExit('global QR state anchor not found')
js=js.replace(old,new,1)

pattern=r"async function stopQrScan\(\)\{.*?\}\nfunction localFiscalFromQr"
replacement=r'''async function stopQrScan(){qrScanDone=true;if(qrNativeTimer){clearTimeout(qrNativeTimer);qrNativeTimer=null}if(qrNativeVideo){try{qrNativeVideo.pause();qrNativeVideo.srcObject=null}catch{}qrNativeVideo=null}if(qrNativeStream){try{qrNativeStream.getTracks().forEach(t=>t.stop())}catch{}qrNativeStream=null}try{if(qrScanner){await qrScanner.stop().catch(()=>{});await qrScanner.clear().catch(()=>{});qrScanner=null}}finally{const r=$('qrReader');if(r)r.innerHTML='';$('qrModal').classList.add('hidden')}}
function localFiscalFromQr'''
js,n=re.subn(pattern,lambda m:replacement,js,count=1,flags=re.S)
if n!=1: raise SystemExit(f'stopQrScan replacement count={n}')

pattern=r"async function startQrScan\(\)\{.*?\}\nasync function loadTesseract"
replacement=r'''function fiscalQrLooksValid(raw){const s=String(raw||'').trim();if(!s)return false;if(/\d{44}/.test(s))return true;try{const u=new URL(s);return /(?:nfce|nfe|fazenda|sefaz)/i.test(u.hostname+u.pathname+u.search)}catch{return s.length>12}}
async function finishQrScan(raw){if(qrScanDone)return;const text=String(raw||'').trim();if(!fiscalQrLooksValid(text))return;qrScanDone=true;const local=localFiscalFromQr(text);fillFiscal(local,true);$('scanStatus').textContent='QR reconhecido. Buscando dados da nota…';await stopQrScan();setTimeout(()=>resolveFiscalQr(text,local),0)}
async function startNativeQrScan(){if(!('BarcodeDetector'in window)||!navigator.mediaDevices?.getUserMedia)throw Error('NATIVE_QR_UNAVAILABLE');let formats=[];try{formats=await BarcodeDetector.getSupportedFormats?.()||[]}catch{}if(formats.length&&!formats.includes('qr_code'))throw Error('NATIVE_QR_UNAVAILABLE');const detector=new BarcodeDetector({formats:['qr_code']});const stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}}});qrNativeStream=stream;const reader=$('qrReader');reader.innerHTML='';const video=document.createElement('video');video.setAttribute('playsinline','');video.setAttribute('autoplay','');video.muted=true;video.style.width='100%';video.style.height='min(70vh,520px)';video.style.objectFit='cover';video.style.borderRadius='12px';reader.appendChild(video);qrNativeVideo=video;video.srcObject=stream;await video.play();const track=stream.getVideoTracks()[0];try{const caps=track.getCapabilities?.()||{},advanced=[];if(Array.isArray(caps.focusMode)&&caps.focusMode.includes('continuous'))advanced.push({focusMode:'continuous'});if(advanced.length)await track.applyConstraints({advanced})}catch{}const tick=async()=>{if(qrScanDone||!qrNativeVideo)return;try{if(video.readyState>=2){const codes=await detector.detect(video);const code=codes?.find(x=>fiscalQrLooksValid(x.rawValue));if(code?.rawValue){await finishQrScan(code.rawValue);return}}}catch(e){console.debug('Leitura QR nativa',e)}qrNativeTimer=setTimeout(tick,55)};tick()}
async function startHtml5QrScan(){await loadQrScanner();const cfg=window.Html5QrcodeSupportedFormats?{formatsToSupport:[Html5QrcodeSupportedFormats.QR_CODE],verbose:false,experimentalFeatures:{useBarCodeDetectorIfSupported:true}}:{verbose:false};qrScanner=new Html5Qrcode('qrReader',cfg);await qrScanner.start({facingMode:{ideal:'environment'}},{fps:24,qrbox:(w,h)=>{const side=Math.floor(Math.min(w,h)*.94);return{width:side,height:side}},disableFlip:true},text=>{finishQrScan(text).catch(console.error)},()=>{})}
async function startQrScan(){try{await stopQrScan();qrScanDone=false;$('qrModal').classList.remove('hidden');$('scanStatus').textContent='Aponte para o QR Code…';try{await startNativeQrScan()}catch(nativeErr){console.info('Scanner QR nativo indisponível; usando compatibilidade.',nativeErr);if(qrNativeStream){try{qrNativeStream.getTracks().forEach(t=>t.stop())}catch{}qrNativeStream=null}const r=$('qrReader');if(r)r.innerHTML='';await startHtml5QrScan()}}catch(e){console.error(e);await stopQrScan();$('scanStatus').textContent='Não foi possível abrir o leitor de QR: '+e.message}}
async function loadTesseract'''
js,n=re.subn(pattern,lambda m:replacement,js,count=1,flags=re.S)
if n!=1: raise SystemExit(f'startQrScan replacement count={n}')

# cache-bust new scanner JS
html=re.sub(r'\.\/despesas-reembolsos-v2\.js\?v=\d+', './despesas-reembolsos-v2.js?v=17', html)

js_path.write_text(js,encoding='utf-8')
html_path.write_text(html,encoding='utf-8')
print('Live QR scanner optimized with native BarcodeDetector + html5-qrcode fallback')
