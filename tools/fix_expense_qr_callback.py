from pathlib import Path

js_path=Path('despesas-reembolsos-v2.js')
html_path=Path('despesas-reembolsos-v2.html')
js=js_path.read_text(encoding='utf-8')
html=html_path.read_text(encoding='utf-8')

old="""async function resolveFiscalQr(raw){$('scanStatus').textContent='QR Code lido. Consultando dados fiscais…';const r=await fiscalApi('/resolve',{method:'POST',body:JSON.stringify({qr:raw})});fillFiscal({...r.fiscal,qr_used:true},true);$('scanStatus').textContent=r.source==='SEFAZ_AND_QR'?'QR lido e dados fiscais consultados. Confira antes de salvar.':'QR lido. Preenchi os dados disponíveis pela chave fiscal; confira os demais campos.';if(r.warning)console.warn('Consulta SEFAZ:',r.warning)}
async function startQrScan(){try{await loadQrScanner();$('qrModal').classList.remove('hidden');$('scanStatus').textContent='Aguardando QR Code…';qrScanner=new Html5Qrcode('qrReader');let done=false;await qrScanner.start({facingMode:'environment'},{fps:10,qrbox:(w,h)=>{const s=Math.floor(Math.min(w,h)*.72);return{width:s,height:s}},aspectRatio:1},async text=>{if(done)return;done=true;await stopQrScan();try{await resolveFiscalQr(text)}catch(e){$('scanStatus').textContent='QR lido, mas não consegui consultar: '+e.message}},()=>{})}catch(e){console.error(e);await stopQrScan();$('scanStatus').textContent='Não foi possível abrir o leitor de QR: '+e.message}}
"""
new="""function localFiscalFromQr(raw){const k=parseKey(raw);return{...k,official_query_url:String(raw||''),qr_used:true}}
async function resolveFiscalQr(raw,localData=null){$('scanStatus').textContent='QR Code lido. Consultando dados fiscais…';try{const r=await fiscalApi('/resolve',{method:'POST',body:JSON.stringify({qr:raw})});const remote=r?.fiscal||{};const merged={...(localData||localFiscalFromQr(raw)),...Object.fromEntries(Object.entries(remote).filter(([,v])=>v!==null&&v!==undefined&&v!=='')),qr_used:true};fillFiscal(merged,true);$('scanStatus').textContent=r.source==='SEFAZ_AND_QR'?'QR lido e dados fiscais consultados. Confira antes de salvar.':'QR lido. Os dados disponíveis na chave fiscal foram preenchidos; confira os demais campos.';if(r.warning)console.warn('Consulta SEFAZ:',r.warning)}catch(e){console.error('Consulta fiscal do QR',e);const local=localData||localFiscalFromQr(raw);fillFiscal(local,true);$('scanStatus').textContent=local.access_key?'QR lido. Preenchi os dados da chave fiscal; a consulta complementar não respondeu.':'QR lido, mas a consulta fiscal não respondeu. O endereço do QR foi preservado para conferência.'}}
async function startQrScan(){try{await loadQrScanner();$('qrModal').classList.remove('hidden');$('scanStatus').textContent='Aguardando QR Code…';qrScanner=new Html5Qrcode('qrReader');let done=false;await qrScanner.start({facingMode:'environment'},{fps:10,qrbox:(w,h)=>{const s=Math.floor(Math.min(w,h)*.72);return{width:s,height:s}},aspectRatio:1},text=>{if(done)return;done=true;const raw=String(text||'').trim();const local=localFiscalFromQr(raw);fillFiscal(local,true);$('scanStatus').textContent=local.access_key?'QR reconhecido. Dados da chave preenchidos; consultando detalhes…':'QR reconhecido. Consultando dados fiscais…';$('qrModal').classList.add('hidden');const scanner=qrScanner;qrScanner=null;setTimeout(async()=>{try{if(scanner){await scanner.stop().catch(()=>{});await scanner.clear().catch(()=>{})}}catch(e){console.warn('Encerramento do scanner',e)}},0);setTimeout(()=>resolveFiscalQr(raw,local),0)},()=>{})}catch(e){console.error(e);await stopQrScan();$('scanStatus').textContent='Não foi possível abrir o leitor de QR: '+e.message}}
"""
if old not in js:
    raise SystemExit('Trecho QR esperado nao encontrado')
js=js.replace(old,new,1)

html=html.replace('./despesas-reembolsos-v2.js?v=3','./despesas-reembolsos-v2.js?v=4')
js_path.write_text(js,encoding='utf-8')
html_path.write_text(html,encoding='utf-8')
print('QR callback fixed')
