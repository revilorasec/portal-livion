from pathlib import Path
import re

js_path=Path('despesas-reembolsos-v2.js')
html_path=Path('despesas-reembolsos-v2.html')
js=js_path.read_text(encoding='utf-8')
html=html_path.read_text(encoding='utf-8')

anchor="function simpleNorm(v){return String(v||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toUpperCase().replace(/\\s+/g,' ').trim()}"
helper=r'''function simpleNorm(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').trim()}
const FISCAL_ITEM_META=/^(?:C[ÓO]DIGO|AMBIENTE|VERS[AÃ]O|RAZ[AÃ]O SOCIAL|NOME FANTASIA|NOME EMPRESARIAL|EMITENTE|DESTINAT[AÁ]RIO|CONSUMIDOR|CNPJ|CPF|IE|INSCRI[CÇ][AÃ]O|ENDERE[CÇ]O|LOGRADOURO|BAIRRO|MUNIC[IÍ]PIO|CEP|UF|CHAVE|PROTOCOLO|AUTORIZA[CÇ][AÃ]O|DATA|HORA|EMISS[AÃ]O|S[EÉ]RIE|N[ÚU]MERO|MODELO|CONSULTA|SEFAZ|SECRETARIA|FAZENDA|DOCUMENTO AUXILIAR|NFC-?E|NF-?E|NATUREZA DA OPERA[CÇ][AÃ]O|TRIBUT|ICMS|ISS|XML|XSLT)\b|VERS[AÃ]O\s+(?:XML|XSLT)|AMBIENTE\s+DE\s+PRODU[CÇ][AÃ]O|INFORMA[CÇ][ÕO]ES?\s+DE\s+INTERESSE/i;
function cleanFiscalItems(items){const out=[];for(const raw of Array.isArray(items)?items:[]){const v=String(raw||'').replace(/\s+/g,' ').trim();if(!v||v.length<2||v.length>160||/:\s*$/.test(v)||FISCAL_ITEM_META.test(v))continue;if(/^(?:-+|\d+|[A-Z]?\d+[.:/-]?)+$/i.test(v))continue;if(!/[A-Za-zÀ-ÿ]/.test(v))continue;if(!out.some(x=>simpleNorm(x)===simpleNorm(v)))out.push(v)}return out.slice(0,20)}'''
if anchor not in js:
    raise SystemExit('simpleNorm anchor not found')
js=js.replace(anchor,helper,1)

old="d.items=Array.isArray(raw?.items)?raw.items.filter(Boolean):[];"
new="d.items=cleanFiscalItems(raw?.items);"
if old not in js:
    raise SystemExit('fillFiscal items assignment not found')
js=js.replace(old,new,1)

pattern=r"function localItemsFromText\(text\)\{.*?return out\.slice\(0,20\)\}"
replacement=r'''function localItemsFromText(text){const lines=String(text||'').split(/\r?\n/).map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean),out=[];for(let i=0;i<lines.length;i++){const line=lines[i],near=[lines[i-1],lines[i+1],lines[i+2],lines[i+3]].filter(Boolean).join(' '),candidate=cleanFiscalItems([line])[0];if(!candidate)continue;const productContext=/QTD|QTDE|QUANTIDADE|VL\.?\s*UNIT|VALOR\s*UNIT|PRE[CÇ]O|LITRO|\bLT\b|\bKG\b|\bUN\b|UNIDADE|X\s*R\$|VALOR\s+(?:DO\s+)?ITEM/i.test(near);const strongProduct=/GASOLINA|ETANOL|ALCOOL|DIESEL|GNV|COMBUST|REFEI[CÇ][AÃ]O|LANCHE|CAF[EÉ]|PED[AÁ]GIO|ESTACIONAMENTO|HOSPEDAGEM|DI[AÁ]RIA|PASSAGEM|SERVI[CÇ]O|PE[CÇ]A|MATERIAL|PRODUTO/i.test(candidate);if((productContext||strongProduct)&&!out.some(x=>simpleNorm(x)===simpleNorm(candidate)))out.push(candidate)}return out.slice(0,20)}'''
js,n=re.subn(pattern,lambda m: replacement,js,count=1,flags=re.S)
if n!=1:
    raise SystemExit(f'localItemsFromText replacement count={n}')

# Apply the same cleanup before persisting fiscal items, including manually/previously filled values.
old_collect="items:String($('eItems')?.value||'').split(/\\r?\\n/).map(x=>x.trim()).filter(Boolean),"
new_collect="items:cleanFiscalItems(String($('eItems')?.value||'').split(/\\r?\\n/)),"
if old_collect not in js:
    raise SystemExit('collectFiscal items not found')
js=js.replace(old_collect,new_collect,1)

html=re.sub(r'\.\/despesas-reembolsos-v2\.js\?v=\d+', './despesas-reembolsos-v2.js?v=11', html)
js_path.write_text(js,encoding='utf-8')
html_path.write_text(html,encoding='utf-8')
print('Strict fiscal item filtering applied')
