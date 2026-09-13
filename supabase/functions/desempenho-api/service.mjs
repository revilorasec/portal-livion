import {CLIENTS, VERSION, normalizeBatch} from './domain.mjs';
export const APP_KEY='desempenho-funcionarios';
const TENANT='911e1aee-070e-421b-ae71-439f01c2263e';
const PORTAL_CLIENT='88cf5cba-9f67-467d-8a51-9638200bed52';
const ORIGINS=new Set(['https://portal.livionsolutions.com.br','https://revilorasec.github.io','http://localhost:4178','http://127.0.0.1:4178','http://127.0.0.1:4181']);
export class ApiError extends Error { constructor(status,message){super(message);this.status=status;} }
const sourceNorm=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toUpperCase();
export function includeSourceRow(row,client){
 if(client!=='claro')return true;
 // CLARO_BD contains future/prepared records. They are not received pieces yet.
 const status=row?.Status??row?.status,location=row?.['Onde está']??row?.location,received=row?.['Data recebimento na Livion']??row?.receivedAt;
 const pending=sourceNorm(status)==='01-EM REPARO'&&sourceNorm(location)==='LIVION'&&!String(received??'').trim();
 return !pending;
}
export function authorizedClients(user,grant,registered=CLIENTS.map(c=>c.key)){
 if(!user?.active||user.user_type!=='INTERNO'||!['SOCIO','ADMINISTRADOR'].includes(user.profile))throw new ApiError(403,'Acesso restrito a sócios e administradores internos.');
 if(user.profile!=='ADMINISTRADOR'&&!(user.apps||[]).includes(APP_KEY))throw new ApiError(403,'Aplicativo não liberado no Portal.');
 return [...new Set(grant?.clients||[])].filter(c=>registered.includes(c));
}
function decodeClaims(token){try{const encoded=token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');return JSON.parse(atob(encoded));}catch{throw new ApiError(401,'Sessão inválida.');}}
export function validateClaims(c,now=Date.now()/1000){
 if(c.tid!==TENANT||!c.exp||c.exp<=now||(c.nbf&&c.nbf>now+60)||(c.azp||c.appid)!==PORTAL_CLIENT)throw new ApiError(401,'Sessão inválida.');
}
export function createService(deps){
 const {db,fetchSource,fetchPanelSource,identify}=deps;
 const headers=origin=>({'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, max-age=0','Pragma':'no-cache','Vary':'Origin','Access-Control-Allow-Origin':ORIGINS.has(origin)?origin:'https://portal.livionsolutions.com.br','Access-Control-Allow-Headers':'authorization, content-type','Access-Control-Allow-Methods':'GET, PUT, OPTIONS','X-Content-Type-Options':'nosniff'});
 return async req=>{
 const origin=req.headers.get('origin');const out=(status,body)=>new Response(JSON.stringify(body),{status,headers:headers(origin)});
 try{
  if(origin&&!ORIGINS.has(origin))throw new ApiError(403,'Origem não autorizada.');
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:headers(origin)});
  const path=new URL(req.url).pathname.replace(/^.*\/desempenho-api/,'');
  if(!['/data','/access','/panel-data'].includes(path)||!['GET','PUT'].includes(req.method)||((path==='/data'||path==='/panel-data')&&req.method!=='GET'))throw new ApiError(405,'Operação não permitida.');
  const raw=req.headers.get('authorization')||'';if(!raw.startsWith('Bearer '))throw new ApiError(401,'Sessão necessária.');
  const token=raw.slice(7);validateClaims(decodeClaims(token));
  // Microsoft Graph validates the token cryptographically; decoded claims are only additional constraints.
  const identity=await identify(token);if(!identity.id||!identity.email)throw new ApiError(401,'Sessão inválida.');
  const user=await db.userByEmail(identity.email.toLowerCase());
  if(user?.microsoft_id&&user.microsoft_id!==identity.id)throw new ApiError(403,'Identidade divergente.');
  if(path==='/panel-data'){
   const panel=new URL(req.url).searchParams.get('panel'),appKey=panel==='combined'?'desempenho-funcionarios':panel==='nokia'?'painel-executivo-nokia':'';
   if(!appKey)throw new ApiError(400,'Painel inválido.');
   if(!user?.active||user.user_type!=='INTERNO'||(user.profile!=='ADMINISTRADOR'&&!(user.apps||[]).includes(appKey)))throw new ApiError(403,'Aplicativo não liberado para este usuário.');
   if(!(await db.app(appKey))?.active)throw new ApiError(403,'Aplicativo não liberado.');
   const source=await fetchPanelSource(panel,{force:new URL(req.url).searchParams.get('refresh')==='1'});
   const current=await db.userByEmail(identity.email.toLowerCase());
   if(!current||current.id!==user.id||(current.microsoft_id&&current.microsoft_id!==identity.id)||!current.active||(current.profile!=='ADMINISTRADOR'&&!(current.apps||[]).includes(appKey))||!(await db.app(appKey))?.active)throw new ApiError(403,'Acesso alterado. Atualize a sessão.');
   return out(200,{panel,rows:source.rows,updatedAt:source.updatedAt,stale:source.stale===true});
  }
  const app=await db.app();if(!app?.active)throw new ApiError(403,'Aplicativo não liberado.');
  const grant=user?await db.grant(user.id):null;
  const clients=authorizedClients(user,grant),canManage=user.profile==='ADMINISTRADOR';
  if(path==='/access'){
   if(!canManage)throw new ApiError(403,'Somente administradores gerenciam permissões.');
   if(req.method==='GET')return out(200,{users:(await db.eligibleUsers()).map(u=>({...u,id:String(u.id)})),grants:(await db.grants()).map(g=>({...g,user_id:String(g.user_id)}))});
   if(Number(req.headers.get('content-length')||0)>10000)throw new ApiError(400,'Solicitação inválida.');
   const body=await req.json();
   if(typeof body.user_id!=='string'||!Array.isArray(body.clients)||body.clients.some(c=>!CLIENTS.some(x=>x.key===c))||!Number.isInteger(body.revision)||body.revision<0)throw new ApiError(400,'Permissão inválida.');
   const target=await db.userById(body.user_id);
   if(!target?.active||target.user_type!=='INTERNO'||!['SOCIO','ADMINISTRADOR'].includes(target.profile))throw new ApiError(403,'Pessoa não elegível.');
   const saved=await db.saveGrant({user_id:body.user_id,clients:[...new Set(body.clients)].sort(),revision:body.revision,actor:user.email});
   return out(200,{grant:saved});
  }
  const requestUrl=new URL(req.url),requested=requestUrl.searchParams.get('clients'),force=requestUrl.searchParams.get('refresh')==='1';
  const selected=requested===null?clients:[...new Set(requested.split(',').filter(Boolean))];
  if(selected.some(c=>!clients.includes(c)))throw new ApiError(403,'Cliente não autorizado.');
  // Each authorized source is isolated. One unavailable client must not erase another valid client.
  const reads=await Promise.allSettled(selected.map(async client=>{
   const source=await fetchSource(client,{force}),raw=Array.isArray(source)?source:source.rows;
   return {client,rows:normalizeBatch(raw,client),stale:source?.stale===true,updatedAt:source?.updatedAt||new Date().toISOString()};
  }));
  const good=reads.filter(r=>r.status==='fulfilled').map(r=>r.value);
  if(selected.length&&!good.length)throw new ApiError(502,'Não foi possível ler as bases autorizadas. Os últimos dados válidos permanecem no painel.');
  const sources=Object.fromEntries(reads.map((result,index)=>{
   const client=selected[index];
   return result.status==='fulfilled'
    ?[client,{ok:true,stale:result.value.stale,updatedAt:result.value.updatedAt}]
    :[client,{ok:false,stale:false,message:`A base da ${client==='claro'?'Claro':'Nokia'} não respondeu. Nova tentativa ocorrerá automaticamente.`}];
  }));
  // Check the grant again after slow upstream reads, before releasing any rows.
  const current=await db.userByEmail(identity.email.toLowerCase());
  if(!current||current.id!==user.id||(current.microsoft_id&&current.microsoft_id!==identity.id))throw new ApiError(403,'Acesso alterado.');
  const latest=authorizedClients(current,await db.grant(current.id));
  if(selected.some(c=>!latest.includes(c))||!(await db.app())?.active)throw new ApiError(403,'Acesso alterado. Atualize a sessão.');
  return out(200,{clients:latest,rows:good.flatMap(x=>x.rows),sources,canManage:current.profile==='ADMINISTRADOR',updatedAt:new Date().toISOString(),rulesVersion:VERSION});
 }catch(error){
  if(error instanceof ApiError)return out(error.status,{message:error.message});
  return out(502,{message:'Não foi possível ler uma das bases ou a configuração de acesso. Nenhum resultado parcial foi exibido.'});
 }
 };
}
export function runtimeDependencies(env,fetcher=fetch){
 const base=env('SUPABASE_URL'),key=env('SUPABASE_SERVICE_ROLE_KEY');
 const sourceCache=new Map(),panelCache=new Map(),sourceTtl=25*1000;
 const rest=async(path,options={})=>{const response=await fetcher(base+'/rest/v1/'+path,{...options,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',...(options.headers||{})},signal:AbortSignal.timeout(15000)});if(!response.ok){if(response.status===409)throw new ApiError(409,'Permissões alteradas por outra pessoa. Recarregue antes de salvar.');throw new ApiError(503,'Configuração de acesso indisponível.');}return response.status===204?null:response.json()};
 const first=async path=>(await rest(path))[0]||null;
 const userFields='id,email,name,active,profile,user_type,apps,microsoft_id';
 const readAll=async path=>{let result=[];for(let offset=0;;offset+=1000){const page=await rest(path+`&limit=1000&offset=${offset}`);result=result.concat(page);if(page.length<1000)return result;if(offset>=99000)throw new ApiError(503,'Limite de configuração excedido.');}};
 return {
  identify:async token=>{const response=await fetcher('https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});if(!response.ok)throw new ApiError(401,'Sessão inválida.');const me=await response.json();return {id:me.id,email:String(me.mail||me.userPrincipalName||'').trim()};},
  db:{
   userByEmail:email=>first('portal_users?select='+userFields+'&email=eq.'+encodeURIComponent(email)),
   userById:id=>first('portal_users?select='+userFields+'&id=eq.'+encodeURIComponent(id)),
   app:(appKey=APP_KEY)=>first('portal_apps?select=key,active&key=eq.'+encodeURIComponent(appKey)),
   grant:id=>first('desempenho_access?select=user_id,clients,revision&user_id=eq.'+encodeURIComponent(id)),
   grants:()=>readAll('desempenho_access?select=user_id,clients,revision&order=user_id'),
   eligibleUsers:()=>readAll('portal_users?select=id,name,email&active=eq.true&user_type=eq.INTERNO&profile=in.(SOCIO,ADMINISTRADOR)&order=id'),
   saveGrant:g=>rest('rpc/desempenho_save_access',{method:'POST',body:JSON.stringify({p_user_id:g.user_id,p_clients:g.clients,p_revision:g.revision,p_actor:g.actor})})
  },
  fetchPanelSource:async(panel,options={})=>{
   const cached=panelCache.get(panel);if(!options.force&&cached&&Date.now()-cached.at<sourceTtl)return {rows:cached.rows,updatedAt:cached.updatedAt,stale:false};
   const config=await first('desempenho_panel_sources?select=panel,url,query_client,active&panel=eq.'+encodeURIComponent(panel));
   if(!config?.active||!config.url||!config.query_client)throw new ApiError(503,'Painel sem origem de leitura cadastrada.');
   const target=new URL(config.url);if(target.protocol!=='https:'||target.hostname!=='script.google.com'||!/^\/macros\/s\/[^/]+\/exec$/.test(target.pathname))throw new ApiError(503,'Origem de leitura inválida.');
   target.searchParams.set('cliente',config.query_client);target.searchParams.set('_',String(Date.now()));
   let payload,lastError;
   for(let attempt=0;attempt<2;attempt++){
    try{const response=await fetcher(target,{method:'GET',redirect:'follow',cache:'no-store',signal:AbortSignal.timeout(55000)});if(!response.ok)throw new ApiError(502,'A origem do painel recusou a leitura.');payload=await response.json();break}
    catch(error){lastError=error;if(attempt===0)await new Promise(resolve=>setTimeout(resolve,700));}
   }
   if(!payload){if(cached)return {rows:cached.rows,updatedAt:cached.updatedAt,stale:true};throw lastError||new ApiError(502,'A origem do painel não respondeu.');}
   const rows=Array.isArray(payload)?payload:(payload.rows||payload.data||payload.combined||payload.nokia||[]);if(!Array.isArray(rows)||!rows.length)throw new ApiError(502,'A origem do painel retornou uma resposta vazia.');
   const updatedAt=payload.updatedAt||payload.generatedAt||new Date().toISOString();panelCache.set(panel,{at:Date.now(),rows,updatedAt});return {rows,updatedAt,stale:false};
  },
  fetchSource:async(client,options={})=>{
   const label=client==='claro'?'Claro':'Nokia';
   const cached=sourceCache.get(client);if(!options.force&&cached&&Date.now()-cached.at<sourceTtl)return {rows:cached.rows,updatedAt:cached.updatedAt,stale:false};
   const config=await first('desempenho_sources?select=client,url,secret,active&client=eq.'+encodeURIComponent(client));
   if(!config?.active||!config.url||!config.secret)throw new ApiError(503,'Cliente sem origem de leitura cadastrada.');
   const target=new URL(config.url);if(target.protocol!=='https:'||target.hostname!=='script.google.com'||!/^\/macros\/s\/[^/]+\/exec$/.test(target.pathname))throw new ApiError(503,'Origem de leitura inválida.');
   let payload,lastError;
   for(let attempt=0;attempt<2;attempt++){
    try{
     const response=await fetcher(target,{method:'POST',redirect:'follow',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({client,secret:config.secret}),signal:AbortSignal.timeout(55000)});
     if(!response.ok)throw new ApiError(502,`A base da ${label} recusou a leitura.`);
     payload=await response.json();
     if(payload.ok!==true||payload.client!==client||Number(payload.schemaVersion)<2||!Array.isArray(payload.rows))throw new ApiError(502,`A base da ${label} não corresponde ao formato esperado.`);
     break;
    }catch(error){lastError=error;if(attempt===0)await new Promise(resolve=>setTimeout(resolve,700));}
   }
   if(!payload){if(cached)return {rows:cached.rows,updatedAt:cached.updatedAt,stale:true};throw lastError||new ApiError(502,`A base da ${label} não respondeu.`);}
   const rows=payload.rows.filter(row=>includeSourceRow(row,client));
   const updatedAt=payload.updatedAt||payload.generatedAt||new Date().toISOString();sourceCache.set(client,{at:Date.now(),rows,updatedAt});return {rows,updatedAt,stale:false};
  }
 };
}

