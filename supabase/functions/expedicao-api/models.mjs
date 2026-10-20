import { need, norm, text, digits } from './common.mjs';
import { createWorkbookEngine } from './workbook.mjs';
import { labelTargets } from './excel.mjs';
import { destination as nokiaDestination } from './adapters/nokia.mjs';
import * as claro from './adapters/claro.mjs';

export function guardModelZip(bytes) {
 need(bytes.length>100 && bytes.length<=2*1024*1024,'Envie um arquivo XLSX de até 2 MB.');
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let end=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(v.getUint32(i,true)===0x06054b50){end=i;break;}
 need(end>=0,'Arquivo XLSX inválido.');const count=v.getUint16(end+10,true);let pos=v.getUint32(end+16,true),total=0;
 need(count>0&&count<512,'A estrutura do arquivo não é permitida.');
 for(let i=0;i<count;i++){
  need(pos+46<=bytes.length&&v.getUint32(pos,true)===0x02014b50,'Estrutura ZIP inválida.');
  const size=v.getUint32(pos+24,true),nameLength=v.getUint16(pos+28,true),extra=v.getUint16(pos+30,true),comment=v.getUint16(pos+32,true);
  need(pos+46+nameLength+extra+comment<=bytes.length && !(v.getUint16(pos+8,true)&1),'Arquivo protegido ou inválido.');
  total+=size;need(size<=8*1024*1024&&total<=32*1024*1024,'O conteúdo descompactado excede o limite.');
  const name=new TextDecoder().decode(bytes.subarray(pos+46,pos+46+nameLength));
  need(!/vbaProject|externalLinks\/|embeddings\/|activeX\/|(^|\/)\.\.(\/|$)/i.test(name),'Use um XLSX sem macros, objetos incorporados ou vínculos externos.');
  pos+=46+nameLength+extra+comment;
 }
}
export function decodeModel(body){
 need(typeof body.filename==='string'&&body.filename.length<=220&&/\.xlsx$/i.test(body.filename),'Selecione um arquivo .xlsx.');
 need(typeof body.bytes==='string'&&body.bytes.length<2800000&&/^[A-Za-z0-9+/]+={0,2}$/.test(body.bytes),'Conteúdo do arquivo inválido.');
 try{return Uint8Array.from(atob(body.bytes),c=>c.charCodeAt(0));}catch{need(false,'Conteúdo do arquivo inválido.');}
}
export async function inspectModel(JSZip,client,bytes,name){
 guardModelZip(bytes);const {Book}=createWorkbookEngine(JSZip);let book,info;
 try{
  book=await Book.open(bytes,name);
  need(['01 Pesagem v2','02 Romaneio v2','03 Etiquetas','04 Configurações'].every(s=>book.sheets[s]),'O modelo precisa conter as quatro abas padrão.');
  if(client==='claro')info=book.inspect();else{
   need(client==='nokia','Empresa inválida.');
   for(const [i,title]of ['ITEM','CAIXA','COD. BARRAS','PART NUMBER','SERIAL','SLA','GARANTIA','NF NOKIA','STATUS'].entries())need(norm(book.value('02 Romaneio v2',String.fromCharCode(65+i)+'14'))===title,'Cabeçalhos do modelo Nokia incompatíveis.');
   let capacity=0;for(let row=15;row<10015;row++){if(![...'ABCDEFGHI'].every(c=>book.cells['02 Romaneio v2'][c+row]&&!book.cells['02 Romaneio v2'][c+row].formula))break;capacity++;}need(capacity>0,'A grade de peças Nokia não foi reconhecida.');
   info={cnpj:digits(book.value('01 Pesagem v2','D4'))||nokiaDestination.cnpj,city:book.value('01 Pesagem v2','D6')||nokiaDestination.city,uf:norm(book.value('01 Pesagem v2','D5'))||'MG',address:book.value('01 Pesagem v2','B11')||nokiaDestination.address,capacity,box_capacity:labelTargets(book).length,inherited_error_cells:[]};
  }
  labelTargets(book);
 }catch(e){need(false,e.message||'O modelo não é compatível.');}
 need(info.cnpj.length===14&&info.city&&/^[A-Z]{2}$/.test(info.uf)&&info.address,'Confira CNPJ, cidade, UF e endereço do modelo.');
 return {id:client+'-'+book.hash.slice(0,20),client,name,sha256:book.hash,cnpj:info.cnpj,city:info.city,uf:info.uf,address:info.address,capacity:info.capacity,boxCapacity:info.box_capacity,inheritedErrors:info.inherited_error_cells,defaults:{invoiceAddress:book.value('01 Pesagem v2','B13'),observation:book.value('01 Pesagem v2','B14')},...(client==='nokia'?{destinationKey:'NOKIA-BH'}:{})};
}
export function modelDestinations(client,model,source,models){
 const rows=client==='nokia'?[nokiaDestination]:source.destinations.filter(d=>digits(d.cnpj)===model.cnpj);
 const seen=new Map();for(const row of rows){const d={...row,cnpj:digits(row.cnpj),center:norm(row.center),uf:client==='nokia'?'MG':norm(row.ufRegional).split(' - ').pop()};if(!/^[A-Z]{2}$/.test(d.uf))continue;const key=d.cnpj+'|'+d.center;seen.set(key,seen.has(key)?null:d);}
 return [...seen].filter(([,d])=>d).map(([key,d])=>({key,...d,matches:client==='nokia'?model.cnpj===d.cnpj&&norm(model.city)===norm(d.city)&&model.uf===d.uf&&norm(model.address)===norm(d.address):claro.modelMatches({...model,overrideDestination:false,centers:[d.center]},{destination:d}),activeIds:models.filter(m=>client==='nokia'||m.cnpj===d.cnpj&&m.centers?.map(norm).includes(d.center)).map(m=>m.id).sort()}));
}
export async function editModel(JSZip,model,bytes,fields){
 const clean={};for(const [key,max]of Object.entries({cnpj:30,city:160,uf:2,address:2000,invoiceAddress:2000,observation:4000})){
  need(typeof fields?.[key]==='string'&&fields[key].length<=max&&!/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(fields[key]),'Dados do modelo inválidos.');clean[key]=fields[key].trim();
 }
 clean.cnpj=digits(clean.cnpj);clean.uf=norm(clean.uf);need(clean.cnpj.length===14&&clean.city&&/^[A-Z]{2}$/.test(clean.uf)&&clean.address,'Confira CNPJ, cidade, UF e endereço.');
 const {Book}=createWorkbookEngine(JSZip),book=await Book.open(bytes,model.name);
 const changes={D4:clean.cnpj,D5:clean.uf,D6:clean.city,B11:clean.address,B13:clean.invoiceAddress,B14:clean.observation};
 const result=await book.writeCopy({'01 Pesagem v2':Object.fromEntries(Object.entries(changes).map(([a,value])=>[a,{kind:'text',value}]))});
 // The name is descriptive. Destination identifiers are checked from the workbook and current registry.
 const name=model.name.replace(/\s*\(\d{4}[-.]\d{2}\)/g,'').replace(/\.xlsx$/i,'').replace(/\s*-\s*versão editada/gi,'').slice(0,180)+' - versão editada.xlsx';
 return {bytes:result.bytes,model:await inspectModel(JSZip,model.client,result.bytes,name)};
}
