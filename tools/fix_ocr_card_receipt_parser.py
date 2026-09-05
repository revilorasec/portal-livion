from pathlib import Path
import re

js_path=Path('despesas-reembolsos-v2.js')
html_path=Path('despesas-reembolsos-v2.html')
js=js_path.read_text(encoding='utf-8')
html=html_path.read_text(encoding='utf-8')

old="function chooseVendor(lines,cnpjIndex){const bad=/DOCUMENTO|AUXILIAR|NFC|NF-E|CNPJ|CPF|CONSUMIDOR|CHAVE|CUPOM|EXTRATO|SAT|SEFAZ/i;for(let i=Math.max(0,cnpjIndex-1);i>=Math.max(0,cnpjIndex-4);i--){const s=lines[i];if(s&&s.length>3&&!bad.test(s)&&!/^\\d/.test(s))return s}return lines.find(s=>s.length>4&&!bad.test(s)&&/[A-Za-zÁ-ú]/.test(s))||''}"
new=r'''function vendorCandidate(s){const v=String(s||'').replace(/\s+/g,' ').trim(),bad=/DOCUMENTO|AUXILIAR|NFC|NF-E|CNPJ|CPF|CONSUMIDOR|CHAVE|CUPOM|EXTRATO|SAT|SEFAZ|VIA CLIENTE|CR[EÉ]DITO|D[EÉ]BITO|VISA|MASTERCARD|ELO\b|AMEX|POS\s*[=: -]|DOC\s*[=: -]|VALOR|APP\b|AUTORIZA[CÇ][AÃ]O|NSU\b/i;if(v.length<4||v.length>90||bad.test(v)||/^\d/.test(v)||!/([A-Za-zÀ-ÿ].*){3}/.test(v))return'';const letters=(v.match(/[A-Za-zÀ-ÿ]/g)||[]).length;if(letters/Math.max(v.length,1)<.45)return'';return v}
function chooseVendor(lines,cnpjIndex){if(cnpjIndex>=0){for(let i=cnpjIndex+1;i<=Math.min(lines.length-1,cnpjIndex+4);i++){const s=vendorCandidate(lines[i]);if(s)return s}for(let i=cnpjIndex-1;i>=Math.max(0,cnpjIndex-4);i--){const s=vendorCandidate(lines[i]);if(s)return s}}return lines.map(vendorCandidate).find(Boolean)||''}'''
if old not in js: raise SystemExit('chooseVendor anchor not found')
js=js.replace(old,new,1)

old_re=r"function parseFiscalText\(text,qr=''\)\{.*?\}\nfunction simpleNorm"
new_re=r'''function normalizeOcrDatePart(raw){const m=String(raw||'').match(/^(\d{2})[\/.-](\d{2})[\/.-](\d{2}|\d{4})$/);if(!m)return'';let y=Number(m[3]);if(m[3].length===2)y=y>=70?1900+y:2000+y;return `${String(m[1]).padStart(2,'0')}/${String(m[2]).padStart(2,'0')}/${y}`}
function parseFiscalText(text,qr=''){const lines=String(text||'').split(/\r?\n/).map(s=>s.replace(/\s+/g,' ').trim()).filter(Boolean),joined=lines.join('\n'),key=parseKey(qr+' '+joined),cnpjLabel=joined.match(/CNPJ[^0-9]{0,8}([0-9.\/\-\s]{14,26})/i),cnpjMatch=joined.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}[\s-]?\d{2}/),cnpj=key.cnpj||digits(cnpjLabel?.[1]||cnpjMatch?.[0]||'').slice(0,14),cnpjIndex=lines.findIndex(l=>digits(l).includes(cnpj)&&cnpj),addr=lines.find(l=>/\b(RUA|AVENIDA|AV\.?|RODOVIA|ROD\.?|ESTRADA|ALAMEDA|PRA[CÇ]A)\b/i.test(l))||'',dateMatch=joined.match(/\b(\d{2}[\/.-]\d{2}[\/.-](?:\d{2}|\d{4}))(?:\s+(\d{2}:\d{2}(?::\d{2})?))?/),datePart=normalizeOcrDatePart(dateMatch?.[1]||''),totalLine=lines.filter(l=>(/TOTAL|VALOR A PAGAR/i.test(l)||/^\s*VALOR\s*[:=-]/i.test(l))&&!/TRIBUT|ICMS|TROCO|DESCONTO|SUBTOTAL|ITENS/i.test(l)).reverse().find(l=>brMoney(l)!=null)||'',payLine=lines.find(l=>/PIX|CR[EÉ]DITO|D[EÉ]BITO|DINHEIRO/i.test(l))||'',numMatch=joined.match(/(?:N[ÚU]MERO|N[ºO]\.?|NFC-E|NF-E)[^\d]{0,10}(\d{1,9})/i),last4=(joined.match(/\*{3,}\s*(\d{4})\b/)||joined.match(/(?:CART[AÃ]O|CARD)[^\d]{0,20}(\d{4})\b/i)||[])[1]||'',documentType=/VIA CLIENTE|POS\s*[=: -]|CR[EÉ]DITO\s+A\s+VISTA|D[EÉ]BITO\s+A\s+VISTA/i.test(joined)?'COMPROVANTE_CARTAO':'DOCUMENTO_FISCAL',installmentCount=/\bA\s+VISTA\b/i.test(joined)?1:null;return{establishment:chooseVendor(lines,cnpjIndex),cnpj,address:addr,number:key.number||numMatch?.[1]||'',series:key.series||'',access_key:key.access_key||'',date_time:datePart?`${datePart}${dateMatch?.[2]?' '+dateMatch[2]:''}`:'',value:brMoney(totalLine),payment_method:payLine,official_query_url:qr||'',ocr_text:joined.slice(0,8000),card_last4:last4,document_type:documentType,installment_count:installmentCount}}\nfunction simpleNorm'''
js,n=re.subn(old_re,lambda m:new_re,js,count=1,flags=re.S)
if n!=1: raise SystemExit(f'parseFiscalText replacement count={n}')

old="if(d.date_time&&!manualTouched.has('eDate')){const x=String(d.date_time).match(/(\\d{2})[\\/.-](\\d{2})[\\/.-](\\d{4})(?:\\s+(\\d{2}:\\d{2}))?/);if(x)$('eDate').value=`${x[3]}-${x[2]}-${x[1]}T${x[4]||'12:00'}`}"
new="if(d.date_time&&!manualTouched.has('eDate')){const x=String(d.date_time).match(/(\\d{2})[\\/.-](\\d{2})[\\/.-](\\d{2}|\\d{4})(?:\\s+(\\d{2}:\\d{2}))?/);if(x){let y=Number(x[3]);if(x[3].length===2)y=y>=70?1900+y:2000+y;$('eDate').value=`${y}-${x[2]}-${x[1]}T${x[4]||'12:00'}`}}"
if old not in js: raise SystemExit('apply date anchor not found')
js=js.replace(old,new,1)

old="if(d.payment_method&&!manualTouched.has('ePayment')){const p=B.paymentMethods.find(x=>String(d.payment_method).toLowerCase().includes('pix')?/pix/i.test(x.name):/cr[eé]dito/i.test(d.payment_method)?/cr[eé]dito/i.test(x.name):/d[eé]bito/i.test(d.payment_method)?/d[eé]bito/i.test(x.name):/dinheiro/i.test(d.payment_method)?/dinheiro/i.test(x.name):false);if(p&&scannerSetSelect('ePayment',p.payment_method_id))paymentChanged()}const count=fiscalInstallmentCount(d);"
new="if(d.payment_method&&!manualTouched.has('ePayment')){const p=B.paymentMethods.find(x=>String(d.payment_method).toLowerCase().includes('pix')?/pix/i.test(x.name):/cr[eé]dito/i.test(d.payment_method)?/cr[eé]dito/i.test(x.name):/d[eé]bito/i.test(d.payment_method)?/d[eé]bito/i.test(x.name):/dinheiro/i.test(d.payment_method)?/dinheiro/i.test(x.name):false);if(p&&scannerSetSelect('ePayment',p.payment_method_id))paymentChanged()}if(d.card_last4&&!manualTouched.has('eCard')&&$('eCard')){const matches=[...$('eCard').options].filter(o=>o.value&&String(by(cards,o.value,'card_id')?.last4||'')===String(d.card_last4));if(matches.length===1){$('eCard').value=matches[0].value;cardChanged()}}const count=fiscalInstallmentCount(d);"
if old not in js: raise SystemExit('payment/card anchor not found')
js=js.replace(old,new,1)

old="d.installment_count=raw?.installment_count||d.installment_count||null;d.ocr_text=raw?.ocr_text||d.ocr_text||'';"
new="d.installment_count=raw?.installment_count||d.installment_count||null;d.card_last4=raw?.card_last4||d.card_last4||'';d.document_type=raw?.document_type||d.document_type||'';d.ocr_text=raw?.ocr_text||d.ocr_text||'';"
if old not in js: raise SystemExit('fillFiscal metadata anchor not found')
js=js.replace(old,new,1)

html=re.sub(r'\.\/despesas-reembolsos-v2\.js\?v=\d+', './despesas-reembolsos-v2.js?v=19', html)
js_path.write_text(js,encoding='utf-8')
html_path.write_text(html,encoding='utf-8')
print('OCR parser improved for card receipts, short dates, vendor after CNPJ, value line and card last4')
