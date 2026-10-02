import { createClient } from 'jsr:@supabase/supabase-js@2';

const TENANT_ID='911e1aee-070e-421b-ae71-439f01c2263e';
const CLIENT_ID='88cf5cba-9f67-467d-8a51-9638200bed52';
const ALLOWED_ORIGINS=new Set(['https://revilorasec.github.io','https://portal.livionsolutions.com.br','https://portal-livion.revilorasec.chatgpt.site','http://localhost:3000','http://localhost:5173']);
const PROFILE_REGISTRY=[
 {key:'ADMINISTRADOR',label:'Administrador',description:'Administra o Portal, usuários, entidades e permissões.',defaultApps:['*'],defaultCompanies:['*'],defaultActions:['*']},
 {key:'SOCIO',label:'Sócio',description:'Acesso gerencial aos aplicativos liberados, com permissões ajustáveis.',defaultApps:['fretes'],defaultCompanies:['LIVION'],defaultActions:['fretes.visualizar_valores','fretes.editar_cotacao','fretes.aprovar_cotacao']},
 {key:'OPERACIONAL',label:'Operacional',description:'Executa as rotinas liberadas em cada aplicativo.',defaultApps:['fretes'],defaultCompanies:['LIVION'],defaultActions:['fretes.visualizar_valores','fretes.criar_cotacao','fretes.editar_cotacao']},
 {key:'VISUALIZADOR',label:'Visualizador',description:'Somente visualização. Não edita, aprova, cria ou exclui.',defaultApps:[],defaultCompanies:[],defaultActions:[]},
];
const PROFILES=PROFILE_REGISTRY.map(p=>p.key);
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});

function cors(origin:string|null){
 const allowed=origin&&ALLOWED_ORIGINS.has(origin)?origin:'https://portal.livionsolutions.com.br';
 return {'Access-Control-Allow-Origin':allowed,'Vary':'Origin','Access-Control-Allow-Headers':'authorization, content-type','Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS','Content-Type':'application/json'};
}
function reply(origin:string|null,status:number,data:unknown){return new Response(JSON.stringify(data),{status,headers:cors(origin)});}
function bearer(req:Request){const v=req.headers.get('authorization')||'';if(!v.startsWith('Bearer ')||v.length>9000)throw new Error('UNAUTHENTICATED');return v.slice(7);}
function norm(v:any){return String(v||'').trim().toLowerCase();}
function decodeClaims(token:string){
 try{
  const raw=token.split('.')[1]; if(!raw)return {};
  const b64=raw.replace(/-/g,'+').replace(/_/g,'/');
  const padded=b64+'='.repeat((4-b64.length%4)%4);
  return JSON.parse(atob(padded));
 }catch{return {};}
}
const JWKS_URL=`https://login.microsoftonline.com/${TENANT_ID}/discovery/keys`;
const GRAPH_AUDIENCES=new Set(['00000003-0000-0000-c000-000000000000','https://graph.microsoft.com']);
let jwksCache:any[]=[],jwksFetchedAt=0;
function decodePart(part:string){const raw=part.replace(/-/g,'+').replace(/_/g,'/'),padded=raw+'='.repeat((4-raw.length%4)%4);return JSON.parse(atob(padded));}
function decodeBytes(part:string){const raw=part.replace(/-/g,'+').replace(/_/g,'/'),padded=raw+'='.repeat((4-raw.length%4)%4),bin=atob(padded);return Uint8Array.from(bin,c=>c.charCodeAt(0));}
function authFail(stage:string):never{console.warn('portal-auth-failed',stage);throw new Error('UNAUTHENTICATED');}
async function signingKeys(force=false){
 if(!force&&jwksCache.length&&Date.now()-jwksFetchedAt<86400000)return jwksCache;
 const r=await fetch(JWKS_URL,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(4000)});
 if(!r.ok)throw new Error('UNAUTHENTICATED');
 const body=await r.json(),keys=Array.isArray(body.keys)?body.keys:[];
 if(!keys.length)throw new Error('UNAUTHENTICATED');
 jwksCache=keys;jwksFetchedAt=Date.now();return keys;
}
async function graphIdentity(token:string,c:any){
 const r=await fetch('https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName',{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(7000)});
 if(!r.ok)authFail('graph');
 const me=await r.json(),id=String(me.id||'').trim();
 if(!id||id!==String(c.oid||''))authFail('graph-identity');
 const email=norm(me.mail||me.userPrincipalName||c.preferred_username||c.upn||c.email||c.unique_name);
 if(!email)authFail('graph-email');
 return {id,email,name:String(me.displayName||c.name||email),token};
}
async function identity(req:Request){
 const token=bearer(req),parts=token.split('.');
 if(parts.length!==3)authFail('parts');
 let header:any,c:any;try{header=decodePart(parts[0]);c=decodePart(parts[1]);}catch{authFail('decode');}
 const issuer=String(c.iss||''),now=Math.floor(Date.now()/1000),aud=Array.isArray(c.aud)?c.aud.map(String):[String(c.aud||'')];
 if(header.alg!=='RS256'||!header.kid)authFail('header');
 if(c.tid!==TENANT_ID)authFail('tenant');
 if(![`https://sts.windows.net/${TENANT_ID}/`,`https://login.microsoftonline.com/${TENANT_ID}/v2.0`].includes(issuer))authFail('issuer');
 if(!Number.isFinite(Number(c.exp))||Number(c.exp)<=now-60||(c.nbf&&Number(c.nbf)>now+60))authFail('time');
 if(!aud.some((x:string)=>GRAPH_AUDIENCES.has(x)))authFail('audience');
 const clientClaim=String(c.azp||c.appid||'');
 if(clientClaim!==CLIENT_ID)authFail('client');
 let keys=await signingKeys(),jwk=keys.find((k:any)=>k.kid===header.kid&&k.kty==='RSA'&&(!k.use||k.use==='sig'));
 if(!jwk){keys=await signingKeys(true);jwk=keys.find((k:any)=>k.kid===header.kid&&k.kty==='RSA'&&(!k.use||k.use==='sig'));}
 if(!jwk)authFail('key');
 try{
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  const valid=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decodeBytes(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1]));
  if(!valid)throw new Error('UNAUTHENTICATED');
 }catch{return await graphIdentity(token,c);}
 const id=String(c.oid||'').trim(),email=norm(c.preferred_username||c.upn||c.email||c.unique_name);
 if(!id)authFail('identity');
 return {id,email,name:String(c.name||email),token};
}
async function appsRegistry(all=false){let q=db.from('portal_apps').select('key,title,description,icon,eyebrow,href,active,audience,audience_types,companies,actions,sort_order').order('sort_order');if(!all)q=q.eq('active',true);const r=await q;if(r.error)throw r.error;return r.data||[];}
function audiences(app:any){const x=Array.isArray(app.audience_types)?app.audience_types:[];if(x.length)return x.map((v:any)=>String(v).toUpperCase());if(app.audience==='BOTH')return ['INTERNO','CLIENTE'];return [String(app.audience||'INTERNO').toUpperCase()];}
function appAllowedForType(app:any,userType:string){return audiences(app).includes(userType);}
async function entities(all=false){let q=db.from('portal_entities').select('*').order('entity_type').order('name');if(!all)q=q.eq('active',true);const r=await q;if(r.error)throw r.error;return r.data||[];}
function viewOnlyAction(k:string){const x=k.toLowerCase();return x.includes('visualizar')||x.includes('ver_')||x.includes('.ver')||x.includes('acompanhar')||x.includes('exportar')||x.includes('consultar')||x.includes('listar');}
function contextFromRow(row:any,apps:any[]){if(!row||!row.active||!PROFILES.includes(row.profile))return null;const admin=row.profile==='ADMINISTRADOR';const userType=String(row.user_type||'INTERNO').toUpperCase();const available=apps.filter(a=>admin||appAllowedForType(a,userType));const requested=Array.isArray(row.apps)?row.apps:[];const appKeys=admin?available.map(a=>a.key):available.filter(a=>requested.includes(a.key)).map(a=>a.key);let actions=admin?['*']:(Array.isArray(row.actions)?row.actions:[]);if(row.profile==='VISUALIZADOR')actions=actions.filter((x:string)=>viewOnlyAction(x));const companies=admin?['*']:(Array.isArray(row.companies)?row.companies:[]);const appCatalog=available.filter(a=>appKeys.includes(a.key)).map(a=>({key:a.key,title:a.title,description:a.description,icon:a.icon,eyebrow:a.eyebrow,href:a.href,audience:a.audience,audience_types:audiences(a)}));return {authenticated:true,user:{name:row.name||row.email,email:row.email},profile:row.profile,userType,entityKey:row.entity_key||null,organizationKey:row.organization_key||null,clientKey:row.client_key||null,administrator:admin,apps:appKeys,appCatalog,actions,companies,permissions:appKeys.map((a:string)=>`${a}.acessar`)};}
async function findUserByIdentity(me:any){let row:any=null;if(me.id){const q=await db.from('portal_users').select('*').eq('microsoft_id',me.id).maybeSingle();if(q.error)throw q.error;row=q.data;}if(!row&&me.email){const q=await db.from('portal_users').select('*').eq('email',me.email).maybeSingle();if(q.error)throw q.error;row=q.data;}return row;}
async function access(req:Request){const me=await identity(req);let row=await findUserByIdentity(me);if(!row||!row.active)throw new Error('FORBIDDEN');if(row.microsoft_id&&row.microsoft_id!==me.id)throw new Error('FORBIDDEN');if(!row.microsoft_id){const u=await db.from('portal_users').update({microsoft_id:me.id,entra_invite_status:row.user_type==='INTERNO'?row.entra_invite_status:'ACCEPTED',entra_redeemed_at:row.user_type==='INTERNO'?row.entra_redeemed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',row.id).is('microsoft_id',null).select('*').maybeSingle();if(u.error||!u.data)throw new Error('FORBIDDEN');row=u.data;}const ctx=contextFromRow({...row,name:row.name||me.name},await appsRegistry());if(!ctx)throw new Error('FORBIDDEN');return ctx;}
async function admin(req:Request){const ctx=await access(req);if(!ctx.administrator)throw new Error('FORBIDDEN');return ctx;}
async function audit(actor:string,action:string,target:string,detail:any={}){await db.from('access_audit').insert({actor_email:actor,action,target,detail});}
async function activeAdminCount(){const q=await db.from('portal_users').select('id',{count:'exact',head:true}).eq('profile','ADMINISTRADOR').eq('active',true);if(q.error)throw q.error;return q.count||0;}
async function guardLastAdmin(existing:any,nextProfile?:string,nextActive?:boolean,deleting=false){if(!existing||existing.profile!=='ADMINISTRADOR'||!existing.active)return;const removesAdmin=deleting||nextProfile!=='ADMINISTRADOR'||nextActive===false;if(removesAdmin&&await activeAdminCount()<=1)throw new Error('LAST_ADMIN');}
const keyify=(v:any)=>String(v||'').trim().toUpperCase().replace(/[^A-Z0-9_-]+/g,'_').replace(/^_+|_+$/g,'');

Deno.serve(async(req)=>{const origin=req.headers.get('origin');if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors(origin)});try{const url=new URL(req.url),base='/portal-api',idx=url.pathname.indexOf(base),path=idx>=0?url.pathname.slice(idx+base.length)||'/':'/';
 if(path==='/health'&&req.method==='GET')return reply(origin,200,{ok:true,service:'portal-api',version:14,auth:'entra-jwt-signature-validated'});
 if(path==='/context'&&req.method==='GET')return reply(origin,200,await access(req));
 if(path==='/audit-event'&&req.method==='POST'){const ctx=await access(req),b=await req.json();const allowed=new Set(['LOGIN','APP_OPEN','LOGOUT']);const event=String(b.event||'').toUpperCase();if(!allowed.has(event))return reply(origin,400,{error:'Evento inválido'});await audit(ctx.user.email,event,String(b.target||'PORTAL'),{profile:ctx.profile,entity_key:ctx.entityKey||null});return reply(origin,200,{ok:true});}
 if(path==='/catalog'&&req.method==='GET'){await admin(req);const apps=await appsRegistry(true),ents=await entities();const companies=ents.filter((e:any)=>e.entity_type==='EMPRESA').map((e:any)=>({key:e.key,label:e.name,...e}));const clients=ents.filter((e:any)=>e.entity_type==='CLIENTE').map((e:any)=>({key:e.key,label:e.name,...e}));const profiles=PROFILE_REGISTRY.map(p=>({...p,defaultApps:p.defaultApps.includes('*')?apps.filter((a:any)=>a.active).map((a:any)=>a.key):p.defaultApps,defaultCompanies:p.defaultCompanies.includes('*')?companies.map((c:any)=>c.key):p.defaultCompanies}));return reply(origin,200,{apps,entities:ents,companies,clients,profiles});}
 if(path==='/entities'&&req.method==='GET'){await admin(req);return reply(origin,200,{entities:await entities(true)});}
 if(path==='/entities'&&req.method==='POST'){const ctx=await admin(req),b=await req.json(),key=keyify(b.key||b.name),name=String(b.name||'').trim(),entityType=String(b.entity_type||'').toUpperCase();if(!key||!name||!['EMPRESA','CLIENTE'].includes(entityType))return reply(origin,400,{error:'Dados da empresa/cliente inválidos'});const payload={key,entity_type:entityType,name,legal_name:String(b.legal_name||'').trim()||null,tax_id:String(b.tax_id||'').trim()||null,email:String(b.email||'').trim()||null,phone:String(b.phone||'').trim()||null,website:String(b.website||'').trim()||null,address:String(b.address||'').trim()||null,notes:String(b.notes||'').trim()||null,logo_url:String(b.logo_url||'').trim()||null,photos:Array.isArray(b.photos)?b.photos:[],active:b.active!==false,updated_at:new Date().toISOString()};const r=await db.from('portal_entities').upsert(payload,{onConflict:'key'});if(r.error)throw r.error;await audit(ctx.user.email,'ENTITY_UPSERT',key,payload);return reply(origin,200,{ok:true,key});}
 if(path==='/entities'&&req.method==='DELETE'){const ctx=await admin(req),key=keyify(url.searchParams.get('key'));const inUse=await db.from('portal_users').select('id',{count:'exact',head:true}).eq('entity_key',key);if(inUse.error)throw inUse.error;if((inUse.count||0)>0)return reply(origin,409,{error:'Empresa/cliente possui usuários vinculados'});const r=await db.from('portal_entities').update({active:false,updated_at:new Date().toISOString()}).eq('key',key);if(r.error)throw r.error;await audit(ctx.user.email,'ENTITY_DISABLE',key,{});return reply(origin,200,{ok:true});}
 if(path==='/apps/config'&&req.method==='PUT'){const ctx=await admin(req),b=await req.json(),key=String(b.key||'').trim();const audienceTypes=Array.isArray(b.audience_types)?b.audience_types.map((x:any)=>keyify(x)).filter((x:string)=>['INTERNO','CLIENTE'].includes(x)):[];if(!key||!audienceTypes.length)return reply(origin,400,{error:'Aplicativo e público são obrigatórios'});const patch:any={audience_types:audienceTypes,updated_at:new Date().toISOString()};if(Array.isArray(b.actions))patch.actions=b.actions.filter((a:any)=>a&&String(a.key||'').trim()&&String(a.label||'').trim()).map((a:any)=>({key:String(a.key).trim(),label:String(a.label).trim()}));const r=await db.from('portal_apps').update(patch).eq('key',key);if(r.error)throw r.error;await audit(ctx.user.email,'APP_CONFIG_UPDATE',key,patch);return reply(origin,200,{ok:true});}
 if(path==='/users'&&req.method==='GET'){await admin(req);const q=await db.from('portal_users').select('id,email,name,profile,active,apps,actions,companies,user_type,organization_key,client_key,entity_key,phone,document_number,photo_url,photo_url_2,photo_url_3,photo_url_4,personal_notes,entra_guest_id,entra_invite_status,entra_invited_at,entra_redeemed_at,updated_at').order('name');if(q.error)throw q.error;return reply(origin,200,{users:(q.data||[]).map((u:any)=>({...u,active:u.active?1:0,apps_json:JSON.stringify(u.apps||[]),actions_json:JSON.stringify(u.actions||[]),companies_json:JSON.stringify(u.companies||[])}))});}
 if(path==='/users'&&req.method==='POST'){const ctx=await admin(req),body=await req.json(),email=String(body.email||'').trim().toLowerCase(),name=String(body.name||'').trim();if(!email||!name||!PROFILES.includes(body.profile))return reply(origin,400,{error:'Dados inválidos'});const entityKey=keyify(body.entity_key);if(!entityKey)return reply(origin,400,{error:'Selecione a empresa/cliente do usuário'});const eq=await db.from('portal_entities').select('*').eq('key',entityKey).eq('active',true).maybeSingle();if(eq.error||!eq.data)return reply(origin,400,{error:'Empresa/cliente inválido'});const ent=eq.data,userType=ent.entity_type==='CLIENTE'?'CLIENTE':'INTERNO';const existingQ=await db.from('portal_users').select('*').eq('email',email).maybeSingle();if(existingQ.error)throw existingQ.error;const before=existingQ.data||null;await guardLastAdmin(before,body.profile,Boolean(body.active),false);const apps=await appsRegistry(true),allowedApps=apps.filter((a:any)=>a.active&&appAllowedForType(a,userType)),appKeys=allowedApps.map((a:any)=>a.key),actionOwners=new Map(apps.flatMap((a:any)=>Array.isArray(a.actions)?a.actions.map((x:any)=>[x.key,a.key]):[]));const selectedApps=Array.isArray(body.apps)?body.apps.filter((x:string)=>appKeys.includes(x)):[];let selectedActions=Array.isArray(body.actions)?body.actions.filter((x:string)=>x==='*'||selectedApps.includes(actionOwners.get(x))):[];if(body.profile==='VISUALIZADOR')selectedActions=selectedActions.filter(viewOnlyAction);const companies=userType==='INTERNO'?[entityKey]:[];const validPhoto=(v:any)=>{const x=String(v||'').trim();if(!x)return null;if(x.length>1500000||(!x.startsWith('data:image/')&&!x.startsWith('https://')))throw new Error('Foto inválida');return x};const payload={email,name,profile:body.profile,active:Boolean(body.active),user_type:userType,entity_key:entityKey,organization_key:userType==='INTERNO'?entityKey:null,client_key:userType==='CLIENTE'?entityKey:null,phone:String(body.phone||'').trim()||null,document_number:String(body.document_number||'').trim()||null,photo_url:validPhoto(body.photo_url),photo_url_2:validPhoto(body.photo_url_2),photo_url_3:validPhoto(body.photo_url_3),photo_url_4:validPhoto(body.photo_url_4),personal_notes:String(body.personal_notes||'').trim()||null,apps:selectedApps,actions:selectedActions,companies,updated_at:new Date().toISOString()};const r=await db.from('portal_users').upsert(payload,{onConflict:'email'});if(r.error)throw r.error;await audit(ctx.user.email,'USER_UPSERT',email,{entity_key:entityKey,profile:body.profile,apps:selectedApps});return reply(origin,200,{ok:true,external:userType==='CLIENTE',inviteRequired:userType==='CLIENTE'&&!before?.entra_guest_id});}
 if(path==='/users/entra-status'&&req.method==='POST'){const ctx=await admin(req),body=await req.json(),email=String(body.email||'').trim().toLowerCase();if(!email)return reply(origin,400,{error:'E-mail obrigatório'});const allowed=['PENDING','INVITED','ACCEPTED','ERROR'],status=allowed.includes(String(body.status||'').toUpperCase())?String(body.status).toUpperCase():'PENDING',patch:any={entra_invite_status:status,updated_at:new Date().toISOString()};if(body.guest_id)patch.entra_guest_id=String(body.guest_id);if(status==='INVITED')patch.entra_invited_at=new Date().toISOString();if(status==='ACCEPTED')patch.entra_redeemed_at=new Date().toISOString();const r=await db.from('portal_users').update(patch).eq('email',email);if(r.error)throw r.error;await audit(ctx.user.email,'ENTRA_INVITE_STATUS',email,{status});return reply(origin,200,{ok:true});}
 if(path==='/users'&&req.method==='DELETE'){const ctx=await admin(req),email=String(url.searchParams.get('email')||'').trim().toLowerCase();if(!email)return reply(origin,400,{error:'E-mail obrigatório'});const existingQ=await db.from('portal_users').select('*').eq('email',email).maybeSingle();if(existingQ.error)throw existingQ.error;const before=existingQ.data;if(!before)return reply(origin,404,{error:'Usuário não encontrado'});await guardLastAdmin(before,undefined,undefined,true);const r=await db.from('portal_users').delete().eq('email',email);if(r.error)throw r.error;await audit(ctx.user.email,'USER_DELETE',email,{entity_key:before.entity_key});return reply(origin,200,{ok:true});}
 if(path==='/audit'&&req.method==='GET'){await admin(req);const r=await db.from('access_audit').select('id,actor_email,action,target,detail,created_at').order('id',{ascending:false}).limit(500);if(r.error)throw r.error;return reply(origin,200,{audit:(r.data||[]).map((x:any)=>({...x,detail_json:JSON.stringify(x.detail||{})}))});}
 return reply(origin,404,{error:'NOT_FOUND'});
}catch(e){const m=e instanceof Error?e.message:'ERROR',status=m==='UNAUTHENTICATED'?401:m==='FORBIDDEN'?403:m==='LAST_ADMIN'?409:500;return reply(origin,status,{error:m==='LAST_ADMIN'?'Não é permitido remover ou desativar o último administrador ativo.':m});}});