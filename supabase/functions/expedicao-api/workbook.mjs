// ZIP/XML engine derived from the validated Claro v3.5 reference. No source data or credentials.
export function createWorkbookEngine(JSZip) {
const root={JSZip,crypto:globalThis.crypto};
const ABAS=['01 Pesagem v2','02 Romaneio v2','03 Etiquetas','04 Configurações'];
const text=v=>v==null?'':String(v).trim();
const norm=v=>text(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').toUpperCase();
const digits=v=>String(v??'').replace(/\D/g,'');
const cep=v=>String(v??'').match(/(?<!\d)(\d{2})[.\s]?(\d{3})[-.\s]?(\d{3})(?!\d)/)?.slice(1).join('')||'';
const fail=message=>{throw Error(message);};
const decode=s=>String(s).replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi,(_,v)=>v[0]==='#'?String.fromCodePoint(v[1].toLowerCase()==='x'?parseInt(v.slice(2),16):Number(v.slice(1))):({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"})[v.toLowerCase()]);
const encode=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const attrs=s=>Object.fromEntries([...s.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(m=>[m[1],decode(m[2]??m[3])]));
const nodes=(xml,tag)=>[...xml.matchAll(new RegExp('<(?:\\w+:)?'+tag+'\\b[^>]*?(?:/>|>[\\s\\S]*?</(?:\\w+:)?'+tag+'>)','g'))].map(m=>m[0]);
const inner=xml=>xml.slice(xml.indexOf('>')+1,xml.lastIndexOf('</'));
const strings=xml=>nodes(xml,'t').map(t=>decode(inner(t))).join('');
const formula=xml=>nodes(xml,'f')[0]||'';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const bytesSame=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
async function hash(data){return [...new Uint8Array(await root.crypto.subtle.digest('SHA-256',typeof data==='string'?new TextEncoder().encode(data):data))].map(n=>n.toString(16).padStart(2,'0')).join('');}
function decimal(v,label,positive=false){let s=text(v);if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');if(!/^\d+(?:\.\d+)?$/.test(s)||!Number.isFinite(Number(s))||(positive&&Number(s)<=0))fail(label+': informe um número '+(positive?'maior que zero.':'igual ou maior que zero.'));s=s.replace(/^0+(?=\d)/,'');if(s.includes('.'))s=s.replace(/0+$/,'').replace(/\.$/,'');return s;}
function partPath(base,target){if(target.startsWith('/'))return target.slice(1);const chunks=base.split('/');chunks.pop();for(const p of target.split('/')){if(p==='..')chunks.pop();else if(p&&p!=='.')chunks.push(p);}return chunks.join('/');}
class Book{
 static async open(data,name='modelo.xlsx'){
  const book=new Book();book.name=name;book.hash=await hash(data);book.zip=await root.JSZip.loadAsync(data,{checkCRC32:true,createFolders:false});book.parts={};
  for(const [k,entry]of Object.entries(book.zip.files)){if(!entry.dir)book.parts[k]=await entry.async('uint8array');}
  book.xml=k=>{if(!book.parts[k])fail('Parte Excel ausente: '+k);return new TextDecoder().decode(book.parts[k]);};
  const links=Object.fromEntries(nodes(book.xml('xl/_rels/workbook.xml.rels'),'Relationship').map(x=>{const a=attrs(x);return[a.Id,partPath('xl/workbook.xml',a.Target)];}));
  book.sheets={};book.cells={};book.shared=book.parts['xl/sharedStrings.xml']?nodes(book.xml('xl/sharedStrings.xml'),'si').map(strings):[];
  for(const x of nodes(book.xml('xl/workbook.xml'),'sheet')){const a=attrs(x),part=links[a['r:id']];if(!part)fail('Relação de aba não reconhecida.');book.sheets[a.name]=part;const cells={};for(const raw of nodes(book.xml(part),'c')){const ca=attrs(raw.split('>')[0]);if(cells[ca.r])fail('Célula duplicada: '+ca.r);const vt=nodes(raw,'v')[0];let value=vt?decode(inner(vt)):'';if(ca.t==='s')value=book.shared[Number(value)]??'';else if(ca.t==='inlineStr')value=strings(raw);cells[ca.r]={attrs:ca,raw,value,formula:formula(raw)};}book.cells[a.name]=cells;}
  return book;
 }
 value(sheet,addr){return this.cells[sheet]?.[addr]?.value??'';}
 formulas(){return Object.fromEntries(Object.entries(this.cells).map(([s,c])=>[s,Object.fromEntries(Object.entries(c).filter(([,v])=>v.formula).map(([k,v])=>[k,v.formula]))]));}
 rows(sheet,limit=40){if(!this.cells[sheet])fail('Aba ausente: '+sheet);const rows=[];for(const [addr,c]of Object.entries(this.cells[sheet])){const [,col,r]=addr.match(/^([A-Z]+)(\d+)$/)||[];if(!col)continue;let ci=0;for(const ch of col)ci=ci*26+ch.charCodeAt(0)-64;if(ci>limit)continue;rows[Number(r)-1]??=Array(limit).fill('');rows[Number(r)-1][ci-1]=c.value;}return Array.from({length:rows.length},(_,i)=>rows[i]||Array(limit).fill(''));}
 inspect(){
  if(ABAS.some(s=>!this.sheets[s]))fail('Modelo não contém as quatro abas esperadas.');
  for(const a of ['D4','D5','D6','B11']){const c=this.cells[ABAS[0]][a];if(!c||c.formula)fail('Destino interno '+a+' precisa de revisão.');}
  const cnpj=digits(this.value(ABAS[0],'D4'));if(cnpj.length!==14)fail('CNPJ interno do modelo inválido.');const suffix=this.name.match(/\((\d{4})[-.](\d{2})\)/);if(suffix&&suffix[1]+suffix[2]!==cnpj.slice(-6))fail('CNPJ do nome contradiz o CNPJ interno.');
  for(const [i,title]of ['ITEM','CAIXA','COD. SAP','PART NUMBER','SERIAL','IW','SGP','NF CLARO','STATUS'].entries())if(norm(this.value(ABAS[1],String.fromCharCode(65+i)+'14'))!==title)fail('Cabeçalho do modelo incompatível.');
  const style=this.xml('xl/styles.xml'),xfs=nodes(inner(nodes(style,'cellXfs')[0]),'xf').map(attrs),borders=nodes(inner(nodes(style,'borders')[0]),'border');
  const bordered=a=>{const c=this.cells[ABAS[1]][a],xf=xfs[Number(c?.attrs.s||0)],b=borders[Number(xf?.borderId||0)];return Boolean(c&&b&&/\bstyle=/.test(b));};
  let last=14;for(let rn=15;rn<10015;rn++){if(![...'ABCDEFGHI'].every(col=>bordered(col+rn)))break;if([...'ABCDEFGHI'].some(col=>this.cells[ABAS[1]][col+rn].formula))fail('Fórmula na área de peças.');last=rn;}
  const refs=['C10','C11','C12'].map(a=>{const match=this.cells[ABAS[1]][a]?.formula.match(/\$I\$15:\$I\$(\d+)/);if(!match)fail('Resumo de status não reconhecido.');return Number(match[1]);});const capacity=Math.min(last,...refs)-14;if(capacity<1)fail('Grade de peças não identificada.');
  const forms=this.formulas(),labelRows=[...new Set(Object.values(forms[ABAS[2]]).filter(f=>f.includes('VOLUME ')).map(f=>Number(decode(f).match(/'01 Pesagem v2'!\$A\$(\d+)/)?.[1]||0)))].sort((a,b)=>a-b);
  if(!labelRows.length||labelRows.some((n,k)=>n!==33+k))fail('Posições de etiquetas não reconhecidas.');
  for(const row of labelRows)for(const col of 'HIJK')if(!forms[ABAS[0]][col+row])fail('Fórmulas de pesagem incompletas.');
  for(const a of ['F5','B7','D7'])if(!forms[ABAS[0]][a])fail('Fórmula de pesagem ausente: '+a);
  const errors=Object.entries(this.cells).flatMap(([s,cs])=>Object.entries(cs).filter(([,c])=>c.attrs.t==='e').map(([a])=>s+'!'+a));
  return {name:this.name,sha256:this.hash,cnpj,uf:norm(this.value(ABAS[0],'D5')),city:this.value(ABAS[0],'D6'),address:this.value(ABAS[0],'B11'),capacity,box_capacity:labelRows.length,formula_counts:Object.fromEntries(Object.entries(forms).map(([s,f])=>[s,Object.keys(f).length])),inherited_error_cells:errors,ok:true};
 }
 async writeCopy(changes){
  const zip=await root.JSZip.loadAsync(await this.zip.generateAsync({type:'uint8array'}),{createFolders:false}),allowed=new Set(['xl/workbook.xml']);
  const rx=()=>/<(?:(\w+):)?c\b[^>]*?(?:\/>|>[\s\S]*?<\/(?:\w+:)?c>)/g;
  for(const [sheet,updates]of Object.entries(changes)){
   const part=this.sheets[sheet];if(!part)fail('Aba de destino ausente.');allowed.add(part);
   for(const addr of Object.keys(updates)){const c=this.cells[sheet][addr];if(!c||c.formula||c.attrs.vm||c.attrs.cm)fail('Célula não permitida: '+sheet+'!'+addr);}
   const original=this.xml(part),seen={};const after=original.replace(rx(),(raw,prefix)=>{const addr=attrs(raw.split('>')[0]).r;if(!Object.hasOwn(updates,addr))return raw;seen[addr]=(seen[addr]||0)+1;let tag=raw.slice(0,raw.indexOf('>')).replace(/\/$/,'').replace(/\s+t="[^"]*"/,'');const {value,kind}=updates[addr];prefix=prefix?prefix+':':'';if(value==null||value==='')return tag+'/>';if(kind==='number')return tag+'><'+prefix+'v>'+decimal(value,addr)+'</'+prefix+'v></'+prefix+'c>';if(/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(String(value)))fail('Texto inválido: '+addr);return tag+' t="inlineStr"><'+prefix+'is><'+prefix+'t xml:space="preserve">'+encode(value)+'</'+prefix+'t></'+prefix+'is></'+prefix+'c>';});
   if(Object.keys(updates).some(a=>seen[a]!==1))fail('Célula não localizada exclusivamente no modelo.');
   const mask=xml=>xml.replace(rx(),raw=>{const a=attrs(raw.split('>')[0]).r;return Object.hasOwn(updates,a)?'{CELL:'+a+'}':raw;});if(mask(original)!==mask(after))fail('Alteração fora das células permitidas.');zip.file(part,after,{createFolders:false});
  }
  const wb=this.xml('xl/workbook.xml');let found=false;zip.file('xl/workbook.xml',wb.replace(/<(?:\w+:)?calcPr\b[^>]*\/>/,raw=>{found=true;for(const [key,v]of Object.entries({calcMode:'auto',fullCalcOnLoad:'1',forceFullCalc:'1',calcOnSave:'1'})){raw=raw.replace(new RegExp('\\s'+key+'="[^"]*"'),'');raw=raw.slice(0,-2)+' '+key+'="'+v+'"/>';}return raw;}),{createFolders:false});if(!found)fail('Configuração de cálculo não reconhecida.');
  const bytes=await zip.generateAsync({type:'uint8array',compression:'DEFLATE',compressionOptions:{level:6}}),result=await Book.open(bytes,this.name);
  if(!same(this.formulas(),result.formulas()))fail('Verificação falhou: fórmulas alteradas.');if(!same(Object.keys(this.parts).sort(),Object.keys(result.parts).sort()))fail('Partes Excel alteradas.');for(const k of Object.keys(this.parts))if(!allowed.has(k)&&!bytesSame(this.parts[k],result.parts[k]))fail('Parte Excel não autorizada alterada: '+k);
  for(const [s,updates]of Object.entries(changes))for(const [a,u]of Object.entries(updates))if(result.value(s,a)!==(u.value==null?'':u.kind==='number'&&u.value!==''?decimal(u.value,a):String(u.value)))fail('Leitura de volta divergente: '+s+'!'+a);
  return {bytes,validation:{sha256:result.hash,model_sha256:this.hash,verified_formulas:Object.fromEntries(Object.entries(this.formulas()).map(([s,f])=>[s,Object.keys(f).length])),recalculate_on_open:true}};
 }
}

return {Book,hash,norm,attrs,nodes,decode};
}
