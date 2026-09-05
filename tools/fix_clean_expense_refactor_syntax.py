from pathlib import Path
p=Path('despesas-reembolsos-v2.js')
s=p.read_text(encoding='utf-8')
bad="};geo=null;renderGeoLink();$('draftNote').classList.add('hidden');$('fiscalBox').classList.add('hidden');$('scanStatus').textContent='';$('uploadStatus').innerHTML='';initForm();toggleEvent();installmentChanged()}"
if bad not in s:
    raise SystemExit('expected clearForm leftover not found')
s=s.replace(bad,"}",1)
p.write_text(s,encoding='utf-8')
print('clearForm syntax residue removed')
