import {need,ExpeditionError} from './common.mjs';
import {centralFolder,saveCentralFile,findCentralFile,verifyCentralFile} from './cloud-drive.mjs';
const TENANT='911e1aee-070e-421b-ae71-439f01c2263e';
const SCOPE='User.Read Files.ReadWrite offline_access',OWNER='cesar.oliver@livionsolutions.com.br',AUTH='https://login.microsoftonline.com/'+TENANT+'/oauth2/v2.0/';
const enc=encodeURIComponent,to64=b=>btoa(String.fromCharCode(...b)),from64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
export function centralCloud({env,rest,rpc,fetcher=fetch,now=()=>Date.now()}){
 const first=async q=>(await rest(q))[0]||null;
 async function encryptionKey(salt){const master=env('EXPEDICAO_CLOUD_KEY')||env('EXPEDICAO_CLARO_SECRET');need(master&&master.length>=24,'A proteção da conexão central precisa ser configurada pelo administrador.',503);const raw=await crypto.subtle.importKey('raw',new TextEncoder().encode(master),'HKDF',false,['deriveKey']);return crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt,info:new TextEncoder().encode('livion/expedicao/central-cloud/v1')},raw,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
 async function seal(value,context){const salt=crypto.getRandomValues(new Uint8Array(32)),iv=crypto.getRandomValues(new Uint8Array(12));const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(context)},await encryptionKey(salt),new TextEncoder().encode(value));return ['v1',to64(salt),to64(iv),to64(new Uint8Array(cipher))].join('.');}
 async function open(value,context){try{const [v,salt,iv,cipher]=value.split('.');need(v==='v1','Conexão central inválida.');return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:from64(iv),additionalData:new TextEncoder().encode(context)},await encryptionKey(from64(salt)),from64(cipher)));}catch{throw new ExpeditionError(503,'O administrador precisa reconectar o armazenamento central.','CLOUD_RECONNECT');}}
 async function oauth(path,body){const r=await fetcher(AUTH+path,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(body),signal:AbortSignal.timeout(20000)});return {ok:r.ok,value:await r.json()};}
 const connection=()=>first('expedicao_cloud_connection?select=*&id=eq.central');
 const settings=client=>first('expedicao_cloud_settings?select=*&client=eq.'+enc(client));
 async function getToken(){const c=await connection();need(c?.state==='ACTIVE','O administrador precisa conectar o armazenamento central. A equipe não precisa conectar OneDrive.',503,'CLOUD_RECONNECT');
  const token=await oauth('token',{client_id:c.client_id,grant_type:'refresh_token',refresh_token:await open(c.credential,'connection:'+c.owner_email),scope:SCOPE});
  if(!token.ok){if(['invalid_grant','interaction_required'].includes(token.value.error))await rest('expedicao_cloud_connection?id=eq.central&revision=eq.'+c.revision,{method:'PATCH',body:JSON.stringify({state:'RECONNECT',updated_at:new Date(now()).toISOString()})});throw new ExpeditionError(503,'A Microsoft pediu uma nova conexão da conta central. Peça ao administrador para reconectar.','CLOUD_RECONNECT');}
  need(token.value.access_token,'A Microsoft não confirmou a conexão central.',503);
  if(token.value.refresh_token)await rest('expedicao_cloud_connection?id=eq.central&revision=eq.'+c.revision,{method:'PATCH',body:JSON.stringify({credential:await seal(token.value.refresh_token,'connection:'+c.owner_email),revision:c.revision+1,updated_at:new Date(now()).toISOString()})});
  return token.value.access_token;
 }
 async function patchJob(id,patch){return firstUpdate('expedicao_cloud_jobs?id=eq.'+enc(id),{...patch,updated_at:new Date(now()).toISOString()});}
 async function firstUpdate(path,body){return (await rest(path,{method:'PATCH',body:JSON.stringify(body)}))[0]||null;}
 return {
  async status(client,admin){const [c,s]=await Promise.all([connection(),settings(client)]);return {central:true,connected:c?.state==='ACTIVE',ready:c?.state==='ACTIVE'&&Boolean(s),...(admin?{owner:OWNER,settings:s?{client,folder:s.folder,revision:s.revision}:null}:{})};},
  async connect(actor){need(actor===OWNER,'A conexão central deve ser autorizada pela conta '+OWNER+'.',403);const c=await connection();need(c?.client_id,'A integração central Microsoft aguarda ativação pelo administrador.',503);const data=await oauth('devicecode',{client_id:c.client_id,scope:SCOPE});need(data.ok&&data.value.device_code,'Não foi possível iniciar a conexão central Microsoft.',503);
   const uri=new URL(data.value.verification_uri);need(uri.protocol==='https:'&&['microsoft.com','www.microsoft.com','login.microsoftonline.com'].includes(uri.hostname),'A Microsoft retornou um endereço de conexão inválido.',503);
   const id=crypto.randomUUID(),interval=Math.max(5,Number(data.value.interval)||5),expires=new Date(now()+Math.min(900,Number(data.value.expires_in)||900)*1000).toISOString();
   await rest('expedicao_cloud_sessions?actor_email=eq.'+enc(actor)+'&state=eq.OPEN',{method:'PATCH',body:JSON.stringify({state:'EXPIRED'})});
   await rest('expedicao_cloud_sessions',{method:'POST',body:JSON.stringify({id,client_id:c.client_id,actor_email:actor,credential:await seal(data.value.device_code,'session:'+id+':'+actor),expires_at:expires,next_poll_at:new Date(now()+interval*1000).toISOString(),interval_seconds:interval,state:'OPEN'})});
   return {sessionId:id,userCode:data.value.user_code,verificationUri:uri.href,expiresAt:expires,interval,owner:OWNER};
  },
  async poll(actor,id){need(actor===OWNER&&/^[\da-f-]{36}$/.test(id),'Conexão inválida.',403);const s=await rpc('cloud_claim_session',{p:{id,actor}});need(s,'Esta solicitação expirou. Inicie uma nova conexão.',409);if(s.waiting)return {pending:true};
   const token=await oauth('token',{client_id:s.client_id,grant_type:'urn:ietf:params:oauth:grant-type:device_code',device_code:await open(s.credential,'session:'+id+':'+actor)});
   if(!token.ok){if(['authorization_pending','slow_down'].includes(token.value.error)){if(token.value.error==='slow_down')await rest('expedicao_cloud_sessions?id=eq.'+enc(id),{method:'PATCH',body:JSON.stringify({interval_seconds:s.interval_seconds+5,next_poll_at:new Date(now()+(s.interval_seconds+5)*1000).toISOString()})});return {pending:true};}throw new ExpeditionError(503,'A Microsoft não concluiu a conexão central. Confirme a entrada com a conta '+OWNER+'.','CLOUD_AUTH');}
   need(token.value.refresh_token&&String(token.value.scope||'').split(' ').some(v=>v.toLowerCase()==='files.readwrite'),'A Microsoft não autorizou o salvamento central com manutenção da conexão.',403);
   const meResponse=await fetcher('https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName',{headers:{Authorization:'Bearer '+token.value.access_token},signal:AbortSignal.timeout(15000)});need(meResponse.ok,'A Microsoft não confirmou a conta central.',403);const me=await meResponse.json();need(String(me.mail||me.userPrincipalName||'').toLowerCase()===OWNER&&me.id,'Use apenas a conta central '+OWNER+'.',403);
   const old=await connection();need(old?.client_id===s.client_id,'A integração central mudou. Inicie uma nova conexão.',409);const payload={id:'central',client_id:s.client_id,owner_email:OWNER,owner_id:me.id,credential:await seal(token.value.refresh_token,'connection:'+OWNER),scope:token.value.scope,state:'ACTIVE',revision:(old?.revision||0)+1,updated_at:new Date(now()).toISOString()};
   await rest('expedicao_cloud_connection'+(old?'?id=eq.central':''),{method:old?'PATCH':'POST',body:JSON.stringify(payload)});
   await rest('expedicao_cloud_sessions?id=eq.'+enc(id),{method:'PATCH',body:JSON.stringify({state:'COMPLETE',credential:''})});
   return {connected:true};
  },
  async saveFolder(client,path,revision,actor){const token=await getToken(),folder=await centralFolder(token,path,fetcher);return rpc('cloud_save_folder',{p:{client,folder,revision,actor}});},
  async begin(p){need(/^[\da-f-]{36}$/.test(p.id),'Atualize o aplicativo antes de gerar.');const [c,s]=await Promise.all([connection(),settings(p.client)]);need(c?.state==='ACTIVE'&&s,'O administrador precisa configurar o destino central desta empresa. A equipe não precisa conectar OneDrive.',503);return rpc('cloud_begin_job',{p:{...p,target:s.folder}});},
  async save(job,record,result,output){const token=await getToken();await patchJob(job.id,{state:'UPLOADING',export_id:record.id});
   try{const receipt=await saveCentralFile(token,job.target,output,record.id,result.bytes,result.sha256,fetcher);await patchJob(job.id,{state:'VERIFIED',receipt});return receipt;}catch(e){await patchJob(job.id,{state:'PENDING'});throw new ExpeditionError(502,'O salvamento central ficou pendente. Use Conferir salvamento; a gravação não será repetida automaticamente.','CLOUD_PENDING');}
  },
  async verify(job,record){const token=await getToken();const receipt=job.receipt?await verifyCentralFile(token,job.receipt,record.file_hash,fetcher):await findCentralFile(token,job.target,record.output,record.id,record.file_hash,fetcher);await patchJob(job.id,{state:'VERIFIED',receipt});return receipt;},
  job:id=>first('expedicao_cloud_jobs?select=*&id=eq.'+enc(id)),
  pending:client=>rest('expedicao_cloud_jobs?select=id,group_key,state,actor_email&client=eq.'+enc(client)+'&state=in.(PREPARED,UPLOADING,VERIFIED,PENDING)&order=created_at'),
  complete:id=>patchJob(id,{state:'COMPLETED'}),
  async failBeforeUpload(id){await rest('expedicao_cloud_jobs?id=eq.'+enc(id)+'&state=eq.PREPARED',{method:'PATCH',body:JSON.stringify({state:'FAILED',updated_at:new Date(now()).toISOString()})});}
 };
}
