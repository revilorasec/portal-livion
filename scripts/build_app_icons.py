from pathlib import Path
from PIL import Image, ImageDraw
import json, re

ROOT = Path('.')
OUT = ROOT / 'assets' / 'app-icons'
OUT.mkdir(parents=True, exist_ok=True)

APPS = {
    'rh': {'bg':'#24507d','accent':'#39b9aa','label':'Recursos Humanos'},
    'fretes': {'bg':'#0b1733','accent':'#f2b84b','label':'Transportadora'},
    'reparos-claro': {'bg':'#d52b1e','accent':'#ffd54a','label':'Status Reparos Claro'},
    'estoque': {'bg':'#147a5a','accent':'#f0bf4c','label':'Controle de Estoque'},
    'despesas-reembolsos': {'bg':'#5a3c8c','accent':'#f0bf4c','label':'Despesas e Reembolsos'},
}


def sc(v, size):
    return int(round(v * size / 512))


def line(draw, pts, size, fill='white', width=26, joint='curve'):
    draw.line([(sc(x,size),sc(y,size)) for x,y in pts], fill=fill, width=sc(width,size), joint=joint)


def rounded(draw, box, size, radius=24, fill=None, outline=None, width=1):
    draw.rounded_rectangle(tuple(sc(x,size) for x in box), radius=sc(radius,size), fill=fill, outline=outline, width=max(1,sc(width,size)))


def circle(draw, box, size, fill=None, outline=None, width=1):
    draw.ellipse(tuple(sc(x,size) for x in box), fill=fill, outline=outline, width=max(1,sc(width,size)))


def draw_symbol(draw, key, size, accent):
    white = '#ffffff'
    if key == 'rh':
        # Professional ID badge + person
        rounded(draw, (132,108,380,404), size, 38, None, white, 24)
        rounded(draw, (202,72,310,126), size, 22, accent, None)
        circle(draw, (210,164,302,256), size, None, white, 24)
        line(draw, [(176,334),(190,304),(216,282),(256,274),(296,282),(322,304),(336,334)], size, white, 24)
        line(draw, [(182,362),(330,362)], size, accent, 20)
    elif key == 'fretes':
        # Truck with motion / route accent
        rounded(draw, (90,190,300,322), size, 24, None, white, 24)
        line(draw, [(300,224),(354,224),(412,278),(412,322),(300,322)], size, white, 24)
        circle(draw, (132,302,200,370), size, '#0b1733', white, 20)
        circle(draw, (332,302,400,370), size, '#0b1733', white, 20)
        line(draw, [(106,156),(232,156)], size, accent, 22)
        line(draw, [(76,126),(182,126)], size, accent, 16)
    elif key == 'reparos-claro':
        # Telecom antenna + wrench, clearly distinct from the customer logo itself.
        line(draw, [(256,124),(256,356)], size, white, 24)
        circle(draw, (228,194,284,250), size, accent, None)
        line(draw, [(194,176),(160,142),(142,108)], size, white, 20)
        line(draw, [(318,176),(352,142),(370,108)], size, white, 20)
        line(draw, [(174,222),(126,222),(92,240)], size, white, 20)
        line(draw, [(338,222),(386,222),(420,240)], size, white, 20)
        # wrench crossing lower antenna
        circle(draw, (142,300,206,364), size, None, white, 18)
        line(draw, [(196,348),(328,216)], size, white, 28)
        line(draw, [(322,220),(378,164)], size, white, 28)
        line(draw, [(354,142),(396,126),(386,168)], size, accent, 18)
    elif key == 'estoque':
        # Three boxes / inventory stack
        rounded(draw, (104,232,248,362), size, 18, None, white, 22)
        rounded(draw, (264,232,408,362), size, 18, None, white, 22)
        rounded(draw, (184,98,328,220), size, 18, None, white, 22)
        line(draw, [(184,148),(256,184),(328,148)], size, accent, 16)
        line(draw, [(104,280),(176,316),(248,280)], size, accent, 16)
        line(draw, [(264,280),(336,316),(408,280)], size, accent, 16)
    elif key == 'despesas-reembolsos':
        # Receipt + card/coin; compact enough to read at launcher size.
        rounded(draw, (138,86,336,390), size, 28, None, white, 22)
        line(draw, [(178,158),(296,158)], size, accent, 18)
        line(draw, [(178,210),(278,210)], size, white, 18)
        line(draw, [(178,258),(252,258)], size, white, 18)
        line(draw, [(178,310),(236,310)], size, white, 18)
        circle(draw, (274,270,402,398), size, accent, white, 16)
        line(draw, [(338,300),(338,368)], size, '#5a3c8c', 16)
        line(draw, [(312,316),(352,304),(364,326),(326,340),(312,330)], size, '#5a3c8c', 12)


def create_icon(key, size):
    cfg = APPS[key]
    img = Image.new('RGB', (size,size), cfg['bg'])
    d = ImageDraw.Draw(img)
    # subtle internal frame makes all apps visibly part of the same Livion family.
    rounded(d, (38,38,474,474), size, 92, None, '#ffffff', 8)
    rounded(d, (62,62,450,450), size, 72, cfg['bg'], None)
    # small Livion-family accent pill
    rounded(d, (358,72,432,96), size, 12, cfg['accent'], None)
    draw_symbol(d, key, size, cfg['accent'])
    return img


for key in APPS:
    for size in (64,180,192,512):
        create_icon(key,size).save(OUT / f'{key}-{size}.png', 'PNG', optimize=True)

# Update app manifests to use their own launcher images.
manifest_files = {
    'rh':'manifest-rh.webmanifest',
    'fretes':'manifest-fretes.webmanifest',
    'reparos-claro':'manifest-reparos-claro.webmanifest',
    'estoque':'manifest-estoque.webmanifest',
    'despesas-reembolsos':'manifest-despesas-reembolsos.webmanifest',
}
for key, name in manifest_files.items():
    p=ROOT/name
    data=json.loads(p.read_text(encoding='utf-8'))
    data['icons']=[
        {'src':f'./assets/app-icons/{key}-192.png','sizes':'192x192','type':'image/png','purpose':'any'},
        {'src':f'./assets/app-icons/{key}-512.png','sizes':'512x512','type':'image/png','purpose':'any'},
        {'src':f'./assets/app-icons/{key}-192.png','sizes':'192x192','type':'image/png','purpose':'maskable'},
        {'src':f'./assets/app-icons/{key}-512.png','sizes':'512x512','type':'image/png','purpose':'maskable'},
    ]
    data['theme_color']=APPS[key]['bg']
    data['background_color']=APPS[key]['bg']
    p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

# Update Portal navigation to use the same clear app identity at desktop/mobile sizes.
index=ROOT/'index.html'
s=index.read_text(encoding='utf-8')
pattern=r"function appIcon\(key\)\{.*?\}\nfunction renderCards"
replacement="""function appIcon(key){const icons={rh:['./assets/app-icons/rh-64.png?v=2','Recursos Humanos'],fretes:['./assets/app-icons/fretes-64.png?v=2','Transportadora'],'reparos-claro':['./assets/app-icons/reparos-claro-64.png?v=2','Status Reparos Claro'],estoque:['./assets/app-icons/estoque-64.png?v=2','Controle de Estoque'],'despesas-reembolsos':['./assets/app-icons/despesas-reembolsos-64.png?v=2','Despesas e Reembolsos']};const i=icons[key];return i?`<img src=\"${i[0]}\" alt=\"${i[1]}\" width=\"36\" height=\"36\">`:`<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><rect x=\"4\" y=\"4\" width=\"16\" height=\"16\" rx=\"3\"></rect></svg>`}\nfunction renderCards"""
s2,n=re.subn(pattern,replacement,s,flags=re.S)
if n!=1:
    raise SystemExit(f'appIcon replacement count={n}')
index.write_text(s2,encoding='utf-8')

# Installer must expose app-specific favicon + apple-touch-icon BEFORE installation.
installer=ROOT/'install-app.html'
s=installer.read_text(encoding='utf-8')
s=s.replace('<link rel="icon" href="./assets/icons/livion-64.png" type="image/png">\n<link rel="apple-touch-icon" href="./assets/icons/livion-180.png">\n','')
entries={
  'rh':"rh:{name:'Recursos Humanos',short:'RH Livion',manifest:'./manifest-rh.webmanifest',key:'rh',icon:'./assets/app-icons/rh-192.png',touch:'./assets/app-icons/rh-180.png'},",
  'fretes':"fretes:{name:'Transportadora',short:'Transportadora',manifest:'./manifest-fretes.webmanifest',key:'fretes',icon:'./assets/app-icons/fretes-192.png',touch:'./assets/app-icons/fretes-180.png'},",
  "'reparos-claro'":"'reparos-claro':{name:'Status Reparos Claro',short:'Reparos Claro',manifest:'./manifest-reparos-claro.webmanifest',key:'reparos-claro',icon:'./assets/app-icons/reparos-claro-192.png',touch:'./assets/app-icons/reparos-claro-180.png'},",
  'estoque':"estoque:{name:'Controle de Estoque',short:'Estoque Livion',manifest:'./manifest-estoque.webmanifest',key:'estoque',icon:'./assets/app-icons/estoque-192.png',touch:'./assets/app-icons/estoque-180.png'},",
  "'despesas-reembolsos'":"'despesas-reembolsos':{name:'Despesas e Reembolsos',short:'Despesas Livion',manifest:'./manifest-despesas-reembolsos.webmanifest',key:'despesas-reembolsos',icon:'./assets/app-icons/despesas-reembolsos-192.png',touch:'./assets/app-icons/despesas-reembolsos-180.png'}",
}
# Replace current five object entries as a block.
s=re.sub(r"  rh:\{.*?\},\n  fretes:\{.*?\},\n  'reparos-claro':\{.*?\},\n  estoque:\{.*?\},\n  'despesas-reembolsos':\{.*?\}\n",'  '+entries['rh']+'\n  '+entries['fretes']+'\n  '+entries["'reparos-claro'"]+'\n  '+entries['estoque']+'\n  '+entries["'despesas-reembolsos'"]+'\n',s,flags=re.S)
s=s.replace("document.write('<link rel=\"manifest\" href=\"'+selected.manifest+'?v=1\">');", "document.write('<link rel=\"manifest\" href=\"'+selected.manifest+'?v=2\"><link rel=\"icon\" type=\"image/png\" href=\"'+selected.icon+'?v=2\"><link rel=\"apple-touch-icon\" href=\"'+selected.touch+'?v=2\">');")
s=s.replace('<div class="brand"><img src="./assets/icons/livion-192.png" alt="Livion"><div><b>LIVION SOLUTIONS</b><small>Instalação de aplicativo</small></div></div>','<div class="brand"><img id="installerIcon" src="" alt=""><div><b id="installerBrand">LIVION SOLUTIONS</b><small>Instalação de aplicativo</small></div></div>')
s=s.replace("$('appName').textContent=info.name;", "$('installerIcon').src=info.icon;$('installerIcon').alt=info.name;$('appName').textContent=info.name;")
installer.write_text(s,encoding='utf-8')

# Refresh the service-worker cache so installed apps see the new manifest/icons immediately.
sw=ROOT/'sw.js'
s=sw.read_text(encoding='utf-8')
s=s.replace("const CACHE='portal-livion-v1';","const CACHE='portal-livion-v2';")
old="const SHELL=['./','./index.html','./offline.html','./portal-theme.css','./unified-nav.css','./livion-logo.svg','./claro-logo.svg','./msal-browser.min.js','./assets/icons/livion-64.png','./assets/icons/livion-180.png','./assets/icons/livion-192.png','./assets/icons/livion-512.png'];"
apps=[]
for key in APPS:
    for size in (64,180,192,512): apps.append(f"'./assets/app-icons/{key}-{size}.png'")
extra=','.join(apps)
new="const SHELL=['./','./index.html','./install-app.html','./offline.html','./portal-theme.css','./unified-nav.css','./livion-logo.svg','./claro-logo.svg','./msal-browser.min.js','./manifest.webmanifest','./manifest-rh.webmanifest','./manifest-fretes.webmanifest','./manifest-reparos-claro.webmanifest','./manifest-estoque.webmanifest','./manifest-despesas-reembolsos.webmanifest','./assets/icons/livion-64.png','./assets/icons/livion-180.png','./assets/icons/livion-192.png','./assets/icons/livion-512.png',"+extra+"];"
if old not in s:
    raise SystemExit('service worker shell anchor not found')
s=s.replace(old,new,1)
sw.write_text(s,encoding='utf-8')

print('Generated individual icons and updated PWA manifests/installer/navigation.')
