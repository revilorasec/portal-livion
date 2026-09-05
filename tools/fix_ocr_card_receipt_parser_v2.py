from pathlib import Path
import runpy

runpy.run_path('tools/fix_ocr_card_receipt_parser.py', run_name='__main__')

p=Path('despesas-reembolsos-v2.js')
s=p.read_text(encoding='utf-8')
s=s.replace('}\\nfunction simpleNorm', '}\nfunction simpleNorm')
p.write_text(s,encoding='utf-8')
print('OCR patch escape fixed')
