from pathlib import Path
p=Path('despesas-reembolsos-v2.js')
s=p.read_text(encoding='utf-8')
bad="if($('fItems'))$('fItems').value=d.items.join('\n');"
# The broken file contains a real newline between the single quotes.
broken="if($('fItems'))$('fItems').value=d.items.join('" + "\n" + "');"
if broken not in s:
    raise SystemExit('broken fItems join not found')
s=s.replace(broken, "if($('fItems'))$('fItems').value=d.items.join('\\n');", 1)
p.write_text(s,encoding='utf-8')
print('fixed literal newline in fillFiscal')
