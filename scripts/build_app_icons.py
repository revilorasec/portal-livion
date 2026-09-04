from pathlib import Path
from PIL import Image, ImageDraw
from io import BytesIO
import base64, json, re

ROOT = Path('.')
OUT = ROOT / 'assets' / 'app-icons'
OUT.mkdir(parents=True, exist_ok=True)

NAVY = '#174579'
LIGHT = '#ffffff'
BORDER = '#dfe8f2'
SOFT = '#f7f9fc'

APPS = ['rh','fretes','reparos-claro','estoque','despesas-reembolsos']


def sc(v, size):
    return int(round(v * size / 512))


def pt(x, y, size):
    return (sc(x,size), sc(y,size))


def line(draw, points, size, fill=NAVY, width=22):
    draw.line([pt(x,y,size) for x,y in points], fill=fill, width=max(2,sc(width,size)), joint='curve')


def rounded(draw, box, size, radius=24, fill=None, outline=None, width=1):
    draw.rounded_rectangle(tuple(sc(x,size) for x in box), radius=sc(radius,size), fill=fill, outline=outline, width=max(1,sc(width,size)))


def ellipse(draw, box, size, fill=None, outline=None, width=1):
    draw.ellipse(tuple(sc(x,size) for x in box), fill=fill, outline=outline, width=max(1,sc(width,size)))


def base_icon(size):
    img = Image.new('RGBA', (size,size), LIGHT)
    d = ImageDraw.Draw(img)
    rounded(d,(42,42,470,470),size,88,SOFT,BORDER,8)
    return img,d


def draw_rh(size):
    img,d=base_icon(size)
    # Novo, mas na linguagem antiga: cracha simples + pessoa.
    rounded(d,(132,104,380,408),size,34,None,NAVY,22)
    rounded(d,(202,78,310,126),size,16,LIGHT,NAVY,18)
    ellipse(d,(210,158,302,250),size,None,NAVY,22)
    line(d,[(174,334),(184,308),(208,286),(236,276),(276,276),(304,286),(328,308),(338,334)],size,width=22)
    line(d,[(184,366),(328,366)],size,width=18)
    return img


def draw_fretes(size):
    img,d=base_icon(size)
    # Caminhao novo, mais leve e geometrico, como o icone anterior.
    rounded(d,(92,184,292,316),size,18,None,NAVY,22)
    line(d,[(292,220),(350,220),(410,274),(410,316),(292,316)],size,width=22)
    line(d,[(332,222),(332,270),(392,270)],size,width=18)
    ellipse(d,(128,292,196,360),size,LIGHT,NAVY,20)
    ellipse(d,(330,292,398,360),size,LIGHT,NAVY,20)
    line(d,[(112,146),(238,146)],size,width=18)
    line(d,[(80,120),(188,120)],size,width=14)
    return img


def draw_estoque(size):
    img,d=base_icon(size)
    # Caixas em perspectiva simples.
    rounded(d,(104,238,246,358),size,16,None,NAVY,20)
    rounded(d,(266,238,408,358),size,16,None,NAVY,20)
    rounded(d,(185,104,327,224),size,16,None,NAVY,20)
    line(d,[(185,146),(256,184),(327,146)],size,width=16)
    line(d,[(104,278),(175,316),(246,278)],size,width=16)
    line(d,[(266,278),(337,316),(408,278)],size,width=16)
    return img


def draw_despesas(size):
    img,d=base_icon(size)
    # Recibo + moeda, sem bloco colorido.
    rounded(d,(132,88,334,398),size,26,None,NAVY,22)
    line(d,[(176,154),(290,154)],size,width=18)
    line(d,[(176,204),(278,204)],size,width=16)
    line(d,[(176,252),(252,252)],size,width=16)
    line(d,[(176,300),(226,300)],size,width=16)
    ellipse(d,(278,270,408,400),size,LIGHT,NAVY,20)
    line(d,[(342,298),(342,372)],size,width=14)
    line(d,[(318,316),(350,304),(366,320),(352,338),(324,342),(310,330)],size,width=12)
    return img


def claro_original():
    # O arquivo claro-logo.svg ja continha a arte correta embutida em PNG.
    svg=(ROOT/'claro-logo.svg').read_text(encoding='utf-8')
    m=re.search(r'data:image/png;base64,([^\"]+)',svg)
    if not m:
        raise SystemExit('PNG original da Claro nao encontrado em claro-logo.svg')
    return Image.open(BytesIO(base64.b64decode(m.group(1)))).convert('RGBA')


def draw_claro(size):
    # Sem redesenho: usa exatamente a arte original e apenas redimensiona para o launcher.
    src=claro_original()
    canvas=Image.new('RGBA',(size,size),'white')
    margin=max(4,int(size*.035))
    src.thumbnail((size-2*margin,size-2*margin),Image.Resampling.LANCZOS)
    x=(size-src.width)//2; y=(size-src.height)//2
    canvas.alpha_composite(src,(x,y))
    return canvas


def create_icon(key,size):
    if key=='rh': return draw_rh(size)
    if key=='fretes': return draw_fretes(size)
    if key=='estoque': return draw_estoque(size)
    if key=='despesas-reembolsos': return draw_despesas(size)
    if key=='reparos-claro': return draw_claro(size)
    raise KeyError(key)


for key in APPS:
    for size in (64,180,192,512):
        create_icon(key,size).convert('RGB').save(OUT/f'{key}-{size}.png','PNG',optimize=True)

manifest_files={
    'rh':'manifest-rh.webmanifest',
    'fretes':'manifest-fretes.webmanifest',
    'reparos-claro':'manifest-reparos-claro.webmanifest',
    'estoque':'manifest-estoque.webmanifest',
    'despesas-reembolsos':'manifest-despesas-reembolsos.webmanifest',
}
for key,name in manifest_files.items():
    p=ROOT/name
    data=json.loads(p.read_text(encoding='utf-8'))
    data['icons']=[
        {'src':f'./assets/app-icons/{key}-192.png?v=3','sizes':'192x192','type':'image/png','purpose':'any'},
        {'src':f'./assets/app-icons/{key}-512.png?v=3','sizes':'512x512','type':'image/png','purpose':'any'},
        {'src':f'./assets/app-icons/{key}-192.png?v=3','sizes':'192x192','type':'image/png','purpose':'maskable'},
        {'src':f'./assets/app-icons/{key}-512.png?v=3','sizes':'512x512','type':'image/png','purpose':'maskable'},
    ]
    # Mantem o Portal claro/neutral; a Claro preserva sua propria identidade vermelha.
    data['background_color']='#ffffff'
    data['theme_color']='#d52b1e' if key=='reparos-claro' else '#174579'
    p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

# Barra do Portal: restaura a Claro exatamente como era e usa SVGs de traco nos outros apps.
index=ROOT/'index.html'
s=index.read_text(encoding='utf-8')
pattern=r"function appIcon\(key\)\{.*?\}\nfunction renderCards"
replacement=r'''function appIcon(key){const icons={
 rh:`<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="3"></rect><path d="M9 3V2h6v1"></path><circle cx="12" cy="9" r="2.4"></circle><path d="M7.5 17c.8-2.3 2.3-3.5 4.5-3.5s3.7 1.2 4.5 3.5"></path></svg>`,
 fretes:`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h11v9H3z"></path><path d="M14 10h4l3 3v3h-7z"></path><path d="M17 10v3h4"></path><circle cx="7" cy="18" r="2"></circle><circle cx="18" cy="18" r="2"></circle><path d="M4 4h7"></path></svg>`,
 'reparos-claro':`<img src="./claro-logo.svg?v=7" alt="Claro" width="34" height="34">`,
 estoque:`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 13h7v7H4zM13 13h7v7h-7zM8.5 4h7v7h-7z"></path><path d="M8.5 6.5 12 8.5l3.5-2M4 15.5 7.5 18l3.5-2.5M13 15.5l3.5 2.5 3.5-2.5"></path></svg>`,
 'despesas-reembolsos':`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h11v18l-2-1.5L12 21l-2-1.5L8 21l-3-2z"></path><path d="M8 8h5M8 12h4M8 16h2"></path><circle cx="17.5" cy="15.5" r="3.5"></circle><path d="M17.5 13.5v4M16.2 14.4c.8-.7 2.4-.4 2.4.6 0 1.2-2.3.7-2.3 1.7 0 .9 1.6 1.2 2.5.4"></path></svg>`
};return icons[key]||`<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3"></rect></svg>`}
function renderCards'''
s2,n=re.subn(pattern,replacement,s,flags=re.S)
if n!=1:
    raise SystemExit(f'appIcon replacement count={n}')
index.write_text(s2,encoding='utf-8')

# Instalador continua individual, mas mostra a arte nova; Claro recebe a arte original.
installer=ROOT/'install-app.html'
s=installer.read_text(encoding='utf-8')
s=s.replace("?v=2\"><link rel=\"icon", "?v=3\"><link rel=\"icon")
s=s.replace("?v=2\"><link rel=\"apple-touch-icon", "?v=3\"><link rel=\"apple-touch-icon")
s=s.replace("?v=2\">');", "?v=3\">');")
installer.write_text(s,encoding='utf-8')

sw=ROOT/'sw.js'
s=sw.read_text(encoding='utf-8')
s=re.sub(r"const CACHE='portal-livion-v\d+';","const CACHE='portal-livion-v3';",s)
sw.write_text(s,encoding='utf-8')

print('Claro restored; other app icons rebuilt in the original line-icon style.')
