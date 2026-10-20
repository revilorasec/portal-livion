const GRAPH='https://graph.microsoft.com/v1.0',enc=encodeURIComponent;
export const defaultFolders={nokia:'@RHCS/@EXPEDIÇÃO RHCS',claro:'@LIVION SOLUTIONS/@EXPEDIÇÃO LIVION'};
const segment=value=>{if(!value||/[\\/:*?"<>|\x00-\x1f]/.test(value)||['.','..'].includes(value))throw Error('Nome de pasta ou arquivo inválido.');return enc(value);};
export async function graphJson(token,path,options={},fetcher=fetch){
 const response=await fetcher(GRAPH+path,{...options,headers:{Authorization:'Bearer '+token,...options.headers},signal:AbortSignal.timeout(60000)});
 if(response.status===404&&options.allowMissing)return null;
 if(!response.ok)throw Error(response.status===401?'Reconecte o OneDrive nas configurações.':response.status===403?'Sua conta não tem acesso a essa pasta do OneDrive.':'O OneDrive não concluiu a operação. Confira a conexão antes de tentar novamente.');
 return response.json();
}
export async function resolveFolder(token,path,fetcher=fetch){
 const clean=String(path||'').trim().replace(/^\/+|\/+$/g,'');if(!clean)throw Error('Informe a pasta no OneDrive.');
 const item=await graphJson(token,'/me/drive/root:/'+clean.split('/').map(segment).join('/')+'?$select=id,name,folder,parentReference,webUrl',{},fetcher);
 if(!item.folder||!item.parentReference?.driveId)throw Error('O endereço informado não é uma pasta do seu OneDrive.');
 return {driveId:item.parentReference.driveId,folderId:item.id,name:item.name,path:clean,webUrl:item.webUrl};
}
export async function saveCloudWorkbook(token,target,result,fetcher=fetch){
 const digest=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
 const bytes=Uint8Array.from(atob(result.bytes),c=>c.charCodeAt(0));if(await digest(bytes)!==result.sha256)throw Error('O Excel recebido não passou na conferência.');
 const base='/drives/'+enc(target.driveId)+'/items/',root=await graphJson(token,base+enc(target.folderId)+'?$select=id,name,folder',{},fetcher);
 if(!root.folder||root.id!==target.folderId)throw Error('A pasta configurada não está mais disponível. Confira as configurações.');
 const folderPath=base+enc(target.folderId)+':/'+segment(result.folder);
 let folder=await graphJson(token,folderPath+'?$select=id,name,folder',{allowMissing:true},fetcher);
 if(!folder){
  folder=await graphJson(token,base+enc(target.folderId)+'/children',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:result.folder,folder:{},'@microsoft.graph.conflictBehavior':'fail'})},fetcher);
 }
 if(!folder.folder)throw Error('Já existe um arquivo com o nome da pasta da nota. Confira o OneDrive.');
 const filename=result.filename.replace(/\.xlsx$/i,' ('+result.exportId+').xlsx'),filePath=base+enc(folder.id)+':/'+segment(filename);
 if(await graphJson(token,filePath+'?$select=id',{allowMissing:true},fetcher))throw Error('Esta cópia já existe no OneDrive. Gere uma nova cópia para preservar o arquivo.');
 const item=await graphJson(token,filePath+':/content?@microsoft.graph.conflictBehavior=fail',{method:'PUT',headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','If-None-Match':'*'},body:bytes},fetcher);
 if(!item.id)throw Error('O OneDrive não confirmou o arquivo salvo. A expedição continua aberta.');
 const stored=await graphJson(token,base+enc(item.id)+'?$select=id,@microsoft.graph.downloadUrl',{},fetcher);
 const download=new URL(stored['@microsoft.graph.downloadUrl']||'about:blank');if(stored.id!==item.id||download.protocol!=='https:')throw Error('O OneDrive não forneceu a conferência do arquivo salvo.');
 // Microsoft requires the preauthenticated URL for browser downloads: no Authorization header or stored URL.
 const readback=await fetcher(download.href,{cache:'no-store',signal:AbortSignal.timeout(60000)});
 if(!readback.ok||await digest(await readback.arrayBuffer())!==result.sha256)throw Error('O arquivo no OneDrive não passou na conferência. A expedição continua aberta.');
 return 'OneDrive/'+target.path+'/'+result.folder+'/'+filename;
}
