import {need,sha256} from './common.mjs';
const GRAPH='https://graph.microsoft.com/v1.0',enc=encodeURIComponent;
const segment=v=>{need(v&&!/[\\/:*?"<>|\x00-\x1f]/.test(v)&&!['.','..'].includes(v),'Nome de pasta ou arquivo inválido.');return enc(v);};
export async function cloudGraph(token,path,options={},fetcher=fetch){
 const r=await fetcher(GRAPH+path,{...options,headers:{Authorization:'Bearer '+token,...options.headers},signal:AbortSignal.timeout(30000)});
 if(r.status===404&&options.allowMissing)return null;
 const messages={401:'A conexão central expirou. Peça ao administrador para reconectar.',403:'A conta central não tem permissão para essa pasta.',404:'A pasta não foi encontrada no OneDrive da conta central. Confira o caminho; reconectar não corrige um caminho inexistente.',429:'O OneDrive está ocupado. Aguarde antes de tentar novamente.'};
 need(r.ok,messages[r.status]||'O OneDrive central não concluiu a operação. Nenhuma gravação será repetida automaticamente.',502,'CLOUD_'+r.status);
 return r.json();
}
export async function centralFolder(token,path,fetcher=fetch){
 const clean=String(path||'').trim().replace(/^\/+|\/+$/g,'');need(clean&&clean.length<=1000,'Informe a pasta central no OneDrive.');
 const item=await cloudGraph(token,'/me/drive/root:/'+clean.split('/').map(segment).join('/')+'?$select=id,name,folder,parentReference,webUrl',{},fetcher);
 need(item.folder&&item.parentReference?.driveId,'O endereço informado não é uma pasta do OneDrive central.');
 return {driveId:item.parentReference.driveId,folderId:item.id,name:item.name,path:clean};
}
export async function verifyCentralFile(token,receipt,expectedHash,fetcher=fetch){
 const base='/drives/'+enc(receipt.driveId)+'/items/';
 // Request full metadata: this tenant omitted downloadUrl under an explicit projection.
 const file=await cloudGraph(token,base+enc(receipt.itemId),{},fetcher);
 const url=new URL(file['@microsoft.graph.downloadUrl']||'about:blank');
 need(file.id===receipt.itemId&&url.protocol==='https:'&&url.hostname.endsWith('.sharepoint.com')&&!url.username&&!url.password&&Number(file.size)<=10000000,'O OneDrive central não forneceu uma conferência válida.',502);
 const read=await fetcher(url,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(30000)});
 need(read.ok&&await sha256(await read.arrayBuffer())===expectedHash,'O arquivo salvo não passou na conferência. A expedição continua aberta.',502);
 return receipt;
}
export async function findCentralFile(token,target,output,exportId,hash,fetcher=fetch){
 const base='/drives/'+enc(target.driveId)+'/items/'+enc(target.folderId)+':/';
 const filename=output.filename.replace(/\.xlsx$/i,' ('+exportId+').xlsx');
 const file=await cloudGraph(token,base+segment(output.folder)+'/'+segment(filename)+'?$select=id',{},fetcher);
 return verifyCentralFile(token,{driveId:target.driveId,itemId:file.id,path:'OneDrive/'+target.path+'/'+output.folder+'/'+filename},hash,fetcher);
}
export async function saveCentralFile(token,target,output,exportId,bytes,hash,fetcher=fetch){
 need(await sha256(bytes)===hash,'O Excel gerado não passou na conferência.',502);
 const base='/drives/'+enc(target.driveId)+'/items/';
 const root=await cloudGraph(token,base+enc(target.folderId)+'?$select=id,folder',{},fetcher);
 need(root.folder&&root.id===target.folderId,'A pasta central não está mais disponível. Peça ao administrador para conferir.',502);
 let folder=await cloudGraph(token,base+enc(target.folderId)+':/'+segment(output.folder)+'?$select=id,folder',{allowMissing:true},fetcher);
 if(!folder)folder=await cloudGraph(token,base+enc(target.folderId)+'/children',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:output.folder,folder:{},'@microsoft.graph.conflictBehavior':'fail'})},fetcher);
 need(folder.folder,'Já existe um arquivo com o nome da pasta da nota.',409);
 const filename=output.filename.replace(/\.xlsx$/i,' ('+exportId+').xlsx'),path=base+enc(folder.id)+':/'+segment(filename);
 need(!await cloudGraph(token,path+'?$select=id',{allowMissing:true},fetcher),'Esta cópia já existe. Confira o salvamento pendente.',409);
 const file=await cloudGraph(token,path+':/content?@microsoft.graph.conflictBehavior=fail',{method:'PUT',headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','If-None-Match':'*'},body:bytes},fetcher);
 need(file.id,'O OneDrive não confirmou o arquivo. A expedição continua aberta.',502);
 return verifyCentralFile(token,{driveId:target.driveId,itemId:file.id,path:'OneDrive/'+target.path+'/'+output.folder+'/'+filename},hash,fetcher);
}
