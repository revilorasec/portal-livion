from pathlib import Path

JS = Path('despesas-reembolsos-v2.js')
HTML = Path('despesas-reembolsos-v2.html')
js = JS.read_text(encoding='utf-8')
html = HTML.read_text(encoding='utf-8')

if 'EXPENSE_SCANNER_V22' in js:
    print('v22 already applied')
    raise SystemExit(0)

def between(src, start, end, repl):
    a = src.find(start)
    if a < 0:
        raise RuntimeError(f'start anchor not found: {start[:80]}')
    b = src.find(end, a)
    if b < 0:
        raise RuntimeError(f'end anchor not found: {end[:80]}')
    return src[:a] + repl + '\n' + src[b:]

# State for selectable fiscal items.
old = "let token='',B=null,events=[],expenses=[],reimbursements=[],agenda=[],cards=[],banks=[],shareCandidates=[],geo=null,fiscal={},qrScanner=null,qrNativeStream=null,qrNativeTimer=null,qrNativeVideo=null,qrScanDone=false,scannedReceiptFile=null,pendingPhotoOcr=true,manualTouched=new Set(),editingExpenseId=null,editingGranted=false,sortKey='incurred_at',sortDir=-1,catalogTab='category';"
new = "let token='',B=null,events=[],expenses=[],reimbursements=[],agenda=[],cards=[],banks=[],shareCandidates=[],geo=null,fiscal={},fiscalItemState=[],qrScanner=null,qrNativeStream=null,qrNativeTimer=null,qrNativeVideo=null,qrScanDone=false,scannedReceiptFile=null,pendingPhotoOcr=true,manualTouched=new Set(),editingExpenseId=null,editingGranted=false,sortKey='incurred_at',sortDir=-1,catalogTab='category'; // EXPENSE_SCANNER_V22"
if old not in js:
    raise RuntimeError('state anchor not found')
js = js.replace(old, new, 1)

# Replace fiscal parsing helpers with safer date selection, discounts and richer OCR item details.
start = 'function parseKey(raw){'
end = 'function rememberedCategoryId(d){'
replacement = r'''function parseKey(raw){const k=(String(raw||'').match(/\d{44}/)||[])[0];if(!k)return{};const aamm=k.slice(2,6),yy=Number(aamm.slice(0,2)),mm=aamm.slice(2,4);return{access_key:k,cnpj:k.slice(6,20),model:k.slice(20,22),series:String(Number(k.slice(22,25))),number:String(Number(k.slice(25,34))),year_month:`20${String(yy).padStart(2,'0')}-${mm}`}}
function brMoney(v){const m=String(v||'').match(/(?:R\$\s*)?([\d.]+,\d{2})/g);if(!m?.length)return null;const s=m[m.length-1].replace(/R\$\s*/i,'').replace(/\./g,'').replace(',','.');const n=Number(s);return Number.isFinite(n)?n:null}
function vendorCandidate(s){const v=String(s||'').replace(/\s+/g,' ').trim(),bad=/DOCUMENTO|AUXILIAR|NFC|NF-E|CNPJ|CPF|CONSUMIDOR|CHAVE|CUPOM|EXTRATO|SAT|SEFAZ|VIA CLIENTE|CR[EÉ]DITO|D[EÉ]BITO|VISA|MASTERCARD|ELO\b|AMEX|POS\s*[=: -]|DOC\s*[=: -]|VALOR|APP\b|AUTORIZA[CÇ][AÃ]O|NSU\b/i;if(v.length<5||v.length>90||bad.test(v)||/^\d/.test(v))return'';const letters=(v.match(/[A-Za-zÀ-ÿ]/g)||[]).length,words=v.replace(/[^A-Za-zÀ-ÿ0-9 ]/g,' ').trim().split(/\s+/).filter(Boolean);if(letters<5||letters/Math.max(v.length,1)<.5||(words.length<2&&letters<10))return'';return v}
function chooseVendor(lines,cnpjIndex){if(cnpjIndex>=0){for(let i=cnpjIndex+1;i<=Math.min(lines.length-1,cnpjIndex+4);i++){const s=vendorCandidate(lines[i]);if(s)return s}for(let i=cnpjIndex-1;i>=Math.max(0,cnpjIndex-4);i--){const s=vendorCandidate(lines[i]);if(s)return s}}return lines.map(vendorCandidate).find(Boolean)||''}
function ocrDigitFix(v){return String(v||'').toUpperCase().replace(/[OQD]/g,'0').replace(/[IL|]/g,'1').replace(/Z/g,'2').replace(/S/g,'5').replace(/G/g,'6').replace(/B/g,'8')}
function receiptDateParts(raw){const s=String(raw||'').trim();let m=s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}))?/);if(m)return{y:+m[1],mo:+m[2],d:+m[3],hh:+(m[4]||12),mm:+(m[5]||0)};m=s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2}|\d{4})(?:\s+(?:ÀS\s*)?(\d{1,2})[:.](\d{2}))?/i);if(!m)return null;let y=+m[3];if(m[3].length===2)y=y>=70?1900+y:2000+y;return{d:+m[1],mo:+m[2],y,hh:+(m[4]||12),mm:+(m[5]||0)}}
function validReceiptDateParts(p,expectedYm=''){if(!p||p.d<1||p.d>31||p.mo<1||p.mo>12||p.hh<0||p.hh>23||p.mm<0||p.mm>59)return false;const dt=new Date(p.y,p.mo-1,p.d,p.hh,p.mm),ok=dt.getFullYear()===p.y&&dt.getMonth()===p.mo-1&&dt.getDate()===p.d;if(!ok)return false;const now=new Date(),future=new Date(now.getTime()+3*86400000);if(dt>future)return false;if(expectedYm&&/^\d{4}-\d{2}$/.test(expectedYm)){const [ey,em]=expectedYm.split('-').map(Number),diff=Math.abs((p.y-ey)*12+(p.mo-em));if(diff>2)return false}else if(p.y<now.getFullYear()-2||p.y>now.getFullYear()+1)return false;return true}
function receiptLocalInput(raw,ctx={}){const p=receiptDateParts(raw),expected=ctx?.year_month||fiscal?.year_month||'';if(!validReceiptDateParts(p,expected))return'';return`${String(p.y).padStart(4,'0')}-${String(p.mo).padStart(2,'0')}-${String(p.d).padStart(2,'0')}T${String(p.hh).padStart(2,'0')}:${String(p.mm).padStart(2,'0')}`}
function findOcrDateTime(text,expectedYm=''){const s=String(text||''),rx=/([0-9OQDIL|ZSBG]{1,2})[\/.\-]([0-9OQDIL|ZSBG]{1,2})[\/.\-]([0-9OQDIL|ZSBG]{2,4})(?:\s+(?:ÀS\s*)?([0-9OQDIL|ZSBG]{1,2})[:.]([0-9OQDIL|ZSBG]{2})(?::([0-9OQDIL|ZSBG]{2}))?)?/gi,rows=[];for(const m of s.matchAll(rx)){const raw=`${ocrDigitFix(m[1])}/${ocrDigitFix(m[2])}/${ocrDigitFix(m[3])} ${ocrDigitFix(m[4]??'12')}:${ocrDigitFix(m[5]??'00')}`,p=receiptDateParts(raw);if(!validReceiptDateParts(p,expectedYm))continue;const around=s.slice(Math.max(0,m.index-70),Math.min(s.length,(m.index||0)+m[0].length+70)),tag=/(?:DATA\s*(?:DE\s*)?EMISS|EMISS[AÃ]O|DATA\s*\/\s*HORA|DATA\s+DA\s+COMPRA)/i.test(around)?100:0,now=new Date(),dist=Math.abs(new Date(p.y,p.mo-1,p.d).getTime()-now.getTime())/86400000,score=tag+(p.y===now.getFullYear()?25:0)-Math.min(dist/30,20);rows.push({raw:`${String(p.d).padStart(2,'0')}/${String(p.mo).padStart(2,'0')}/${p.y} ${String(p.hh).padStart(2,'0')}:${String(p.mm).padStart(2,'0')}`,score})}rows.sort((a,b)=>b.score-a.score);return rows[0]?.raw||''}
function localDiscountFromText(text){const lines=String(text||'').split(/\r?\n/).map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean),tagged=[];for(const line of lines){if(!/(?:DESCONTO|DESC\.?)/i.test(line))continue;const vals=(line.match(/(?:R\$\s*)?[\d.]+,\d{2}/g)||[]).map(brMoney).filter(v=>Number(v)>0);if(vals.length)tagged.push({line,value:vals[vals.length-1]})}const total=tagged.find(x=>/(?:TOTAL|VALOR)\s+(?:DO\s+)?DESCONTO|DESCONTO\s+TOTAL/i.test(x.line));if(total)return Number(total.value);const sum=tagged.reduce((a,x)=>a+Number(x.value||0),0);return sum>0?Number(sum.toFixed(2)):0}
function parseFiscalText(text,qr=''){const lines=String(text||'').split(/\r?\n/).map(s=>s.replace(/\s+/g,' ').trim()).filter(Boolean),joined=lines.join('\n'),key=parseKey(qr+' '+joined),cnpjLabel=joined.match(/CNPJ[^0-9]{0,8}([0-9.\/\-\s]{14,26})/i),cnpjMatch=joined.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}[\s-]?\d{2}/),cnpj=key.cnpj||digits(cnpjLabel?.[1]||cnpjMatch?.[0]||'').slice(0,14),cnpjIndex=lines.findIndex(l=>digits(l).includes(cnpj)&&cnpj),addr=lines.find(l=>/\b(RUA|AVENIDA|AV\.?|RODOVIA|ROD\.?|ESTRADA|ALAMEDA|PRA[CÇ]A)\b/i.test(l))||'',totalLine=lines.filter(l=>(/TOTAL|VALOR A PAGAR/i.test(l)||/^\s*VALOR\s*[:=-]/i.test(l))&&!/TRIBUT|ICMS|TROCO|DESCONTO|SUBTOTAL|ITENS/i.test(l)).reverse().find(l=>brMoney(l)!=null)||'',payLine=lines.find(l=>/PIX|CR[EÉ]DITO|D[EÉ]BITO|DINHEIRO/i.test(l))||'',numMatch=joined.match(/(?:N[ÚU]MERO|N[ºO]\.?|NFC-E|NF-E)[^\d]{0,10}(\d{1,9})/i),last4=(joined.match(/\*{3,}\s*(\d{4})\b/)||joined.match(/(?:CART[AÃ]O|CARD)[^\d]{0,20}(\d{4})\b/i)||[])[1]||'',documentType=/VIA CLIENTE|POS\s*[=: -]|CR[EÉ]DITO\s+A\s+VISTA|D[EÉ]BITO\s+A\s+VISTA/i.test(joined)?'COMPROVANTE_CARTAO':'DOCUMENTO_FISCAL',installmentCount=/\bA\s+VISTA\b/i.test(joined)?1:null,date_time=findOcrDateTime(joined,key.year_month||'');return{...key,establishment:chooseVendor(lines,cnpjIndex),cnpj,address:addr,number:key.number||numMatch?.[1]||'',series:key.series||'',access_key:key.access_key||'',date_time,value:brMoney(totalLine),discount_total:localDiscountFromText(joined),payment_method:payLine,official_query_url:qr||'',ocr_text:joined.slice(0,8000),card_last4:last4,document_type:documentType,installment_count:installmentCount}}
function simpleNorm(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').trim()}
const FISCAL_ITEM_META=/^(?:C[ÓO]DIGO|AMBIENTE|VERS[AÃ]O|RAZ[AÃ]O SOCIAL|NOME FANTASIA|NOME EMPRESARIAL|EMITENTE|DESTINAT[AÁ]RIO|CONSUMIDOR|CNPJ|CPF|IE|INSCRI[CÇ][AÃ]O|ENDERE[CÇ]O|LOGRADOURO|BAIRRO|MUNIC[IÍ]PIO|CEP|UF|CHAVE|PROTOCOLO|AUTORIZA[CÇ][AÃ]O|DATA|HORA|EMISS[AÃ]O|S[EÉ]RIE|N[ÚU]MERO|MODELO|CONSULTA|SEFAZ|SECRETARIA|FAZENDA|DOCUMENTO AUXILIAR|NFC-?E|NF-?E|NATUREZA DA OPERA[CÇ][AÃ]O|TRIBUT|ICMS|ISS|XML|XSLT)\b|VERS[AÃ]O\s+(?:XML|XSLT)|AMBIENTE\s+DE\s+PRODU[CÇ][AÃ]O|INFORMA[CÇ][ÕO]ES?\s+DE\s+INTERESSE/i;
function cleanFiscalItems(items){const out=[];for(const raw of Array.isArray(items)?items:[]){const v=String(raw||'').replace(/\s+/g,' ').trim();if(!v||v.length<2||v.length>240||/:\s*$/.test(v)||FISCAL_ITEM_META.test(v))continue;if(/^(?:-+|\d+|[A-Z]?\d+[.:/-]?)+$/i.test(v))continue;if(!/[A-Za-zÀ-ÿ]/.test(v))continue;if(!out.some(x=>simpleNorm(x)===simpleNorm(v)))out.push(v)}return out.slice(0,40)}
function fiscalItemText(x){if(typeof x==='string')return String(x).trim();const parts=[String(x?.description||x?.name||x?.text||'').trim()];if(x?.quantity)parts.push(`${x.quantity}${x.unit?' '+x.unit:''}`);if(x?.unit_value!=null&&Number.isFinite(Number(x.unit_value)))parts.push(`x ${money(x.unit_value)}`);if(Number(x?.discount)>0)parts.push(`desconto -${money(x.discount)}`);if(x?.total_value!=null&&Number.isFinite(Number(x.total_value)))parts.push(money(x.total_value));return parts.filter(Boolean).join(' — ')}
function buildFiscalItemState(d){const details=Array.isArray(d?.item_details)?d.item_details.filter(x=>x&&x.description):[];if(details.length)return details.map((x,i)=>({...x,_id:`fi-${i}-${simpleNorm(x.description).slice(0,18)}`,selected:x.selected!==false,text:fiscalItemText(x)}));return cleanFiscalItems(d?.items||[]).map((text,i)=>({_id:`fi-${i}-${simpleNorm(text).slice(0,18)}`,description:text,text,selected:true,discount:0}))}
function selectedFiscalItemState(){return fiscalItemState.filter(x=>x.selected!==false)}
function selectedFiscalItemTexts(){return selectedFiscalItemState().map(x=>x.text||fiscalItemText(x)).filter(Boolean)}
function fiscalItemPlain(x){const y={};for(const k of ['description','quantity','unit','unit_value','total_value','discount'])if(x?.[k]!=null&&x[k]!=='')y[k]=x[k];return y}
function syncFiscalItemsTextarea(){if(!$('eItems'))return;$('eItems').value=selectedFiscalItemTexts().join('\n')}
function renderFiscalItemPicker(){const host=$('fiscalItemPicker');if(!host)return;if(!fiscalItemState.length){host.classList.add('hidden');host.innerHTML='';return}const discount=Number(fiscal?.discount_total||0),selected=selectedFiscalItemState().length;host.classList.remove('hidden');host.innerHTML=`<div class="fiscal-items-head"><b>Itens identificados</b><span>${selected}/${fiscalItemState.length} selecionados</span></div>${fiscalItemState.map((x,i)=>`<label class="fiscal-item-row"><input type="checkbox" data-fi="${i}" ${x.selected!==false?'checked':''}><span><b>${esc(x.description||x.text||'Item')}</b>${(x.quantity||x.unit_value!=null||x.total_value!=null||Number(x.discount)>0)?`<small>${[x.quantity?`${esc(x.quantity)}${x.unit?' '+esc(x.unit):''}`:'',x.unit_value!=null?`unit. ${money(x.unit_value)}`:'',Number(x.discount)>0?`desconto -${money(x.discount)}`:'',x.total_value!=null?`total ${money(x.total_value)}`:''].filter(Boolean).join(' · ')}</small>`:''}</span></label>`).join('')}${discount>0?`<div class="fiscal-discount"><span>Desconto identificado na nota</span><b>− ${money(discount)}</b></div>`:''}`;host.querySelectorAll('input[data-fi]').forEach(el=>el.onchange=()=>{const x=fiscalItemState[Number(el.dataset.fi)];if(x)x.selected=el.checked;syncFiscalItemsTextarea();renderFiscalItemPicker();manualTouched.add('eItems')})}
function setDetectedFiscalItems(d,keepSelected=false){const before=new Map(fiscalItemState.map(x=>[simpleNorm(x.description||x.text||''),x.selected!==false])),next=buildFiscalItemState(d);if(keepSelected)for(const x of next){const k=simpleNorm(x.description||x.text||'');if(before.has(k))x.selected=before.get(k)}fiscalItemState=next;syncFiscalItemsTextarea();renderFiscalItemPicker()}
'''
js = between(js, start, end, replacement)

# Replace fiscal application/fill logic.
start = 'function applyFiscalToExpense(d){'
end = 'async function loadQrScanner(){'
replacement = r'''function bestExpenseDescription(d,cat){const items=Array.isArray(d?.items)?d.items.filter(Boolean):[];if(cat==='Combustível'){const fuel=items.find(x=>/GASOLINA|ETANOL|ALCOOL|DIESEL|GNV|COMBUST/i.test(x));if(fuel)return fuel}return d?.description_hint||items[0]||cat||''}
function applyFiscalToExpense(d){const cat=inferredCategory(d),vendor=[d.trade_name,d.legal_name,d.establishment].find(validFiscalVendor);if(vendor)scannerSet('eVendor',vendor);if(d.cnpj)scannerSet('eVendorDoc',formatDocument(d.cnpj));if(d.address)scannerSet('eAddress',d.address);if(fiscalItemState.length)syncFiscalItemsTextarea();else if(Array.isArray(d.items)&&d.items.length)scannerSet('eItems',d.items.join('\n'));if(d.consumer_document)scannerSet('eConsumerDoc',formatDocument(d.consumer_document));if(d.value!=null&&Number(d.value)>0)scannerSet('eAmount',Number(d.value));if(d.date_time&&!manualTouched.has('eDate')){const safe=receiptLocalInput(d.date_time,d);if(safe)$('eDate').value=safe}let categorySet=false;if(cat)categorySet=setCategoryByName(cat);if(!categorySet&&!manualTouched.has('eCategory')){const remembered=rememberedCategoryId(d);if(remembered)scannerSetSelect('eCategory',remembered)}if(d.payment_method&&!manualTouched.has('ePayment')){const p=B.paymentMethods.find(x=>String(d.payment_method).toLowerCase().includes('pix')?/pix/i.test(x.name):/cr[eé]dito/i.test(d.payment_method)?/cr[eé]dito/i.test(x.name):/d[eé]bito/i.test(d.payment_method)?/d[eé]bito/i.test(x.name):/dinheiro/i.test(d.payment_method)?/dinheiro/i.test(x.name):false);if(p&&scannerSetSelect('ePayment',p.payment_method_id))paymentChanged()}if(d.card_last4&&!manualTouched.has('eCard')&&$('eCard')){const matches=[...$('eCard').options].filter(o=>o.value&&String(by(cards,o.value,'card_id')?.last4||'')===String(d.card_last4));if(matches.length===1){$('eCard').value=matches[0].value;cardChanged()}}const count=fiscalInstallmentCount(d);if(count&&!manualTouched.has('installments')&&scannerSetSelect('installments',String(count)))installmentChanged();renderInstallmentPreview();maskTarget($('eVendorDoc'));maskTarget($('eConsumerDoc'));updateMapLinks();return cat}
function fillFiscal(raw,sync=true){const d=sanitizeFiscalResult(raw);d.items=cleanFiscalItems(raw?.items||d.items);d.item_details=Array.isArray(raw?.item_details)?raw.item_details:(Array.isArray(d.item_details)?d.item_details:[]);d.discount_total=Number(raw?.discount_total??d.discount_total??0)||0;d.category_hint=raw?.category_hint||d.category_hint||'';d.legal_name=raw?.legal_name||d.legal_name||'';d.trade_name=raw?.trade_name||d.trade_name||'';d.cnae=raw?.cnae||d.cnae||'';d.cnae_description=raw?.cnae_description||d.cnae_description||'';d.consumer_document=digits(raw?.consumer_document||d.consumer_document||'').slice(0,14);d.installment_count=raw?.installment_count||d.installment_count||null;d.card_last4=raw?.card_last4||d.card_last4||'';d.document_type=raw?.document_type||d.document_type||'';d.ocr_text=raw?.ocr_text||d.ocr_text||'';fiscal={...fiscal,...d};setDetectedFiscalItems(fiscal,true);if(sync)applyFiscalToExpense(fiscal);updateMapLinks()}
'''
js = between(js, start, end, replacement)

# Replace local item/OCR block up to image preparation (ocrDigitFix now defined above).
start = 'function localConsumerFromText(text,issuer=' 
# find exact beginning separately because quotes differ
idx = js.find("function localConsumerFromText(text,issuer=''){")
end_idx = js.find('async function prepareOcrImage', idx)
if idx < 0 or end_idx < 0:
    raise RuntimeError('OCR local block anchors missing')
local_block = r'''function localConsumerFromText(text,issuer=''){const flat=String(text||'').replace(/\s+/g,' '),p=[/(?:CONSUMIDOR|DESTINAT[AÁ]RIO)[\s\S]{0,160}?(?:CPF|CNPJ)\s*[:\-]?\s*([0-9.\/\-]{11,20})/i,/(?:CPF|CNPJ)\s+(?:DO\s+)?(?:CONSUMIDOR|DESTINAT[AÁ]RIO)\s*[:\-]?\s*([0-9.\/\-]{11,20})/i];for(const r of p){const m=flat.match(r),d=digits(m?.[1]||'');if((d.length===11||d.length===14)&&d!==digits(issuer))return d}return''}
function localItemsFromText(text){const lines=String(text||'').split(/\r?\n/).map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean),out=[];for(let i=0;i<lines.length;i++){const line=lines[i],near=[lines[i-1],lines[i+1],lines[i+2],lines[i+3]].filter(Boolean).join(' '),candidate=cleanFiscalItems([line])[0];if(!candidate)continue;const productContext=/QTD|QTDE|QUANTIDADE|VL\.?\s*UNIT|VALOR\s*UNIT|PRE[CÇ]O|LITRO|\bLT\b|\bKG\b|\bUN\b|UNIDADE|X\s*R\$|VALOR\s+(?:DO\s+)?ITEM/i.test(near);const strongProduct=/GASOLINA|ETANOL|ALCOOL|DIESEL|GNV|COMBUST|REFEI[CÇ][AÃ]O|LANCHE|CAF[EÉ]|PED[AÁ]GIO|ESTACIONAMENTO|HOSPEDAGEM|DI[AÁ]RIA|PASSAGEM|SERVI[CÇ]O|PE[CÇ]A|MATERIAL|PRODUTO/i.test(candidate);if((productContext||strongProduct)&&!out.some(x=>simpleNorm(x)===simpleNorm(candidate)))out.push(candidate)}return out.slice(0,40)}
'''
js = js[:idx] + local_block + '\n' + js[end_idx:]

# Re-enable photo OCR and use remote QR resolution when QR is detected in a photo.
scan_start = js.find('async function scanFiscal(file){')
scan_end = js.find('function openCaptureMenu(){', scan_start)
if scan_start < 0 or scan_end < 0:
    raise RuntimeError('scanFiscal anchors missing')
scan_func = r'''async function scanFiscal(file){if(!file)return;$('scanStatus').textContent='Preparando imagem para leitura…';for(const id of ['eVendor','eVendorDoc','eAmount'])if($(id)&&!manualTouched.has(id))$(id).value='';let qr='',qrUsed=false,ocrUsed=false;try{if('BarcodeDetector'in window){const detector=new BarcodeDetector({formats:['qr_code']}),bmp=await createImageBitmap(file),codes=await detector.detect(bmp);qr=codes?.find(x=>fiscalQrLooksValid(x.rawValue))?.rawValue||codes?.[0]?.rawValue||'';qrUsed=Boolean(qr)}}catch(e){console.warn('QR foto',e)}const remotePromise=qr?fiscalApi('/resolve',{method:'POST',body:JSON.stringify({qr})}).catch(e=>{console.warn('Consulta fiscal da foto',e);return null}):Promise.resolve(null);let text='',parsed={};try{const T=await loadTesseract(),img=await prepareOcrImage(file,false);const result=await T.recognize(img,'por',{logger:m=>{if(m.status==='recognizing text')$('scanStatus').textContent=`Lendo comprovante… ${Math.round((m.progress||0)*100)}%`;}},{tessedit_pageseg_mode:'6',preserve_interword_spaces:'1'});text=result?.data?.text||'';parsed=parseFiscalText(text,qr);let quality=ocrParsedQuality(parsed);if(quality<7){$('scanStatus').textContent='Refinando leitura do comprovante…';const img2=await prepareOcrImage(file,true),result2=await T.recognize(img2,'por',{}, {tessedit_pageseg_mode:'11',preserve_interword_spaces:'1'}),text2=result2?.data?.text||'',merged=[text,text2].filter(Boolean).join('\n'),p2=parseFiscalText(merged,qr);if(ocrParsedQuality(p2)>=quality){text=merged;parsed=p2;quality=ocrParsedQuality(p2)}}ocrUsed=Boolean(text.trim())}catch(e){console.warn('OCR',e);parsed=parseFiscalText('',qr)}const remote=await remotePromise;if(remote?.fiscal){const r=remote.fiscal;parsed={...parsed,...Object.fromEntries(Object.entries(r).filter(([,v])=>v!==null&&v!==undefined&&v!=='')),ocr_text:text||parsed.ocr_text||'',qr_used:true}}if(parsed.cnpj){$('scanStatus').textContent='Confirmando estabelecimento pelo CNPJ…';const co=await lookupCompanyByCnpj(parsed.cnpj);if(co){parsed.trade_name=co.trade_name||parsed.trade_name||'';parsed.legal_name=co.legal_name||parsed.legal_name||'';parsed.establishment=co.trade_name||co.legal_name||parsed.establishment;if(!parsed.address&&co.address)parsed.address=co.address}}if(!validFiscalVendor(parsed.establishment)){parsed.establishment='';if(!validFiscalVendor(parsed.trade_name)&&!validFiscalVendor(parsed.legal_name)){parsed.trade_name='';parsed.legal_name=''}}parsed.qr_used=qrUsed||Boolean(parsed.qr_used);parsed.ocr_used=ocrUsed;parsed.ocr_text=text||parsed.ocr_text||'';parsed.consumer_document=parsed.consumer_document||localConsumerFromText(text,parsed.cnpj);if(!Array.isArray(parsed.items)||!parsed.items.length)parsed.items=localItemsFromText(text);if(!Number(parsed.discount_total))parsed.discount_total=localDiscountFromText(text);parsed.category_hint=inferredCategory({...parsed,ocr_text:text});fillFiscal(parsed,true);const missing=[];if(!validFiscalVendor([parsed.trade_name,parsed.legal_name,parsed.establishment].find(validFiscalVendor)||''))missing.push('estabelecimento');if(!receiptLocalInput(parsed.date_time,parsed))missing.push('data');$('scanStatus').textContent=(qrUsed||ocrUsed)?(missing.length?`Leitura concluída, mas não identifiquei com segurança: ${missing.join(' e ')}. Confira os campos.`:'Leitura concluída. Confira os dados e desmarque itens que não pertencem à compra.'):'Não consegui ler automaticamente. Você ainda pode anexar o comprovante e preencher os dados manualmente.'}
'''
js = js[:scan_start] + scan_func + '\n' + js[scan_end:]

# Re-enable OCR from Camera/Gallery.
photo_start = js.find('function openCaptureMenu(){')
photo_end = js.find('function markManualScannerFields(){', photo_start)
if photo_start < 0 or photo_end < 0:
    raise RuntimeError('photo flow anchors missing')
photo_block = r'''function openCaptureMenu(){$('modalTitle').textContent='Ler nota / comprovante';$('modalBody').innerHTML='<p style="margin:0;color:#6f7f95">Use o QR Code quando existir. Para cupom ou comprovante sem QR, tire uma foto e o app tentará reconhecer os dados e os itens.</p>';$('modalActions').innerHTML='<button class="btn primary" id="captureQr">Ler QR Code</button><button class="btn" id="capturePhoto">Fotografar / escolher nota</button><button class="btn" id="modalClose">Cancelar</button>';showModal();$('modalClose').onclick=hideModal;$('captureQr').onclick=()=>{hideModal();startQrScan()};$('capturePhoto').onclick=()=>openPhotoSourcePicker(true)}
function openPhotoModePicker(){openPhotoSourcePicker(true)}
function openPhotoSourcePicker(useOcr=true){pendingPhotoOcr=useOcr!==false;$('modalTitle').textContent='Ler nota por foto';$('modalBody').innerHTML='<p style="margin:0;color:#6f7f95">O app vai procurar QR Code, estabelecimento, data, valor, itens e descontos. Depois você poderá desmarcar qualquer item reconhecido por engano.</p>';$('modalActions').innerHTML='<button class="btn primary" id="photoCamera">Usar câmera</button><button class="btn" id="photoGallery">Escolher foto</button><button class="btn" id="modalClose">Cancelar</button>';showModal();$('modalClose').onclick=hideModal;$('photoCamera').onclick=()=>{hideModal();$('scanFile').click()};$('photoGallery').onclick=()=>{hideModal();$('scanUpload').click()}}
async function handleSelectedReceipt(file){if(!file)return;scannedReceiptFile=file;if(!pendingPhotoOcr){$('scanStatus').textContent='Foto anexada.';return}try{await scanFiscal(file)}catch(e){console.error(e);$('scanStatus').textContent='A foto foi anexada, mas a leitura automática falhou. Você pode preencher ou corrigir os campos manualmente.'}finally{pendingPhotoOcr=true}}
'''
js = js[:photo_start] + photo_block + '\n' + js[photo_end:]

# Fiscal collection: selected items only; persist discount and the editable purchase date.
collect_start = js.find('function collectFiscal(){')
collect_end = js.find('function persist(){', collect_start)
if collect_start < 0 or collect_end < 0:
    raise RuntimeError('collectFiscal anchors missing')
collect = r'''function collectFiscal(){const pm=by(B?.paymentMethods,$('ePayment')?.value,'payment_method_id'),selected=selectedFiscalItemState(),manual=cleanFiscalItems(String($('eItems')?.value||'').split(/\r?\n/)),items=fiscalItemState.length?selectedFiscalItemTexts():manual;return{...fiscal,establishment:$('eVendor').value||fiscal.establishment||null,cnpj:digits($('eVendorDoc').value)||fiscal.cnpj||null,address:$('eAddress').value||fiscal.address||null,date_time:$('eDate').value||fiscal.date_time||null,value:$('eAmount').value?Number($('eAmount').value):(fiscal.value??null),payment_method:fiscal.payment_method||pm?.name||null,items,item_details:fiscalItemState.length?selected.map(fiscalItemPlain):(Array.isArray(fiscal.item_details)?fiscal.item_details:[]),discount_total:Number(fiscal.discount_total||0),consumer_document:digits($('eConsumerDoc')?.value)||fiscal.consumer_document||null,category_hint:fiscal.category_hint||null,ocr_used:Boolean(fiscal.ocr_used),qr_used:Boolean(fiscal.qr_used)}}
'''
js = js[:collect_start] + collect + '\n' + js[collect_end:]

# Clear item state when starting over.
old = "function clearForm(){localStorage.removeItem(DRAFT_KEY);editingExpenseId=null;editingGranted=false;$('expenseForm').reset();fiscal={};geo=null;"
new = "function clearForm(){localStorage.removeItem(DRAFT_KEY);editingExpenseId=null;editingGranted=false;$('expenseForm').reset();fiscal={};fiscalItemState=[];renderFiscalItemPicker();geo=null;"
if old not in js:
    raise RuntimeError('clearForm anchor missing')
js = js.replace(old, new, 1)

# Restore checklist from drafts.
old = "if(d.fiscal_data){fiscal={...d.fiscal_data};if(!$('eItems').value&&Array.isArray(d.fiscal_data.items))$('eItems').value=d.fiscal_data.items.join('\\n');if(!$('eConsumerDoc').value&&d.fiscal_data.consumer_document)$('eConsumerDoc').value=formatDocument(d.fiscal_data.consumer_document)}"
new = "if(d.fiscal_data){fiscal={...d.fiscal_data};if(!$('eItems').value&&Array.isArray(d.fiscal_data.items))$('eItems').value=d.fiscal_data.items.join('\\n');if(!$('eConsumerDoc').value&&d.fiscal_data.consumer_document)$('eConsumerDoc').value=formatDocument(d.fiscal_data.consumer_document);setDetectedFiscalItems(fiscal,false)}"
if old not in js:
    raise RuntimeError('restore draft fiscal anchor missing')
js = js.replace(old, new, 1)

# Existing expense: date is explicitly editable and fiscal checklist is restored.
old = "$('eDate').value=toLocalDateTime(x.incurred_at);$('eReimbursable').value=String(x.reimbursable!==false);if($('eItems'))$('eItems').value=Array.isArray(fiscal.items)?fiscal.items.join('\\n'):'';"
new = "$('eDate').value=toLocalDateTime(x.incurred_at);$('eDate').disabled=false;$('eDate').readOnly=false;$('eReimbursable').value=String(x.reimbursable!==false);if($('eItems'))$('eItems').value=Array.isArray(fiscal.items)?fiscal.items.join('\\n'):'';setDetectedFiscalItems(fiscal,false);"
if old not in js:
    raise RuntimeError('edit expense date/items anchor missing')
js = js.replace(old, new, 1)

# Do not treat auto-populated checklist synchronization as a manual overwrite just because textarea got a value.
# Keep current manual listeners so users can still manually correct date/items.

# HTML: selectable fiscal item list, clearer editable date, cache busting.
css_anchor = '.fiscal h4{margin:0}'
css_add = '''.fiscal-items{border:1px solid var(--line);border-radius:11px;background:#fbfcfe;overflow:hidden}.fiscal-items-head{display:flex;justify-content:space-between;gap:10px;padding:9px 10px;background:#f1f5fa;border-bottom:1px solid var(--line);font-size:11px}.fiscal-items-head span{color:var(--muted)}.fiscal-item-row{display:grid;grid-template-columns:auto 1fr;gap:9px;align-items:start;padding:9px 10px;border-bottom:1px solid #edf1f5;cursor:pointer}.fiscal-item-row:last-of-type{border-bottom:0}.fiscal-item-row input{width:auto!important;margin-top:3px}.fiscal-item-row b{font-size:12px}.fiscal-item-row small{display:block;color:var(--muted);margin-top:2px}.fiscal-discount{display:flex;justify-content:space-between;gap:10px;padding:9px 10px;background:#f0fbf5;color:#116b3d;border-top:1px solid #d9eee2}.fiscal-manual summary{cursor:pointer;color:var(--blue);font-weight:700;font-size:11px;margin:7px 0}.date-hint{display:block;color:var(--muted);font-size:10px;margin-top:2px}'''
if css_anchor not in html:
    raise RuntimeError('css anchor missing')
html = html.replace(css_anchor, css_add + css_anchor, 1)

old = '<div class="field"><label>Data e hora *</label><input id="eDate" type="datetime-local"></div>'
new = '<div class="field"><label>Data e hora da compra *</label><input id="eDate" type="datetime-local"><small class="date-hint">Você pode corrigir esta data a qualquer momento, inclusive ao editar uma compra.</small></div>'
if old not in html:
    raise RuntimeError('date html anchor missing')
html = html.replace(old, new, 1)

old = '<div class="field full"><label>Itens / consumos</label><textarea id="eItems"></textarea></div>'
new = '<div class="field full"><label>Itens da nota</label><div id="fiscalItemPicker" class="fiscal-items hidden"></div><details class="fiscal-manual"><summary>Adicionar ou corrigir itens manualmente</summary><textarea id="eItems" placeholder="Um item por linha"></textarea></details></div>'
if old not in html:
    raise RuntimeError('items html anchor missing')
html = html.replace(old, new, 1)

if './despesas-reembolsos-v2.js?v=21' not in html:
    raise RuntimeError('script version anchor missing')
html = html.replace('./despesas-reembolsos-v2.js?v=21','./despesas-reembolsos-v2.js?v=22',1)

JS.write_text(js, encoding='utf-8')
HTML.write_text(html, encoding='utf-8')
print('expense scanner v22 patched')
