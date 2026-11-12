import { portalContext } from '../_shared/portal-context.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const TENANT_ID='911e1aee-070e-421b-ae71-439f01c2263e';
const CLIENT_ID='88cf5cba-9f67-467d-8a51-9638200bed52';
const SOURCE='https://script.google.com/macros/s/AKfycbzjKSmVCIHSPx2exz41wG42-oC-wkW6Hrzr5Axw_F2krNtjHEZH5G-j4hOLb58nSjcxyg/exec';
const ORIGINS=new Set(['https://portal.livionsolutions.com.br','https://revilorasec.github.io']);
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});

function cors(origin:string|null){const o=origin&&ORIGINS.has(origin)?origin:'https://portal.livionsolutions.com.br';return {'Access-Control-Allow-Origin':o,'Vary':'Origin','Access-Control-Allow-Headers':'authorization, content-type','Access-Control-Allow-Methods':'GET,OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};}
function bearer(req:Request){const v=req.headers.get('authorization')||'';if(!v.startsWith('Bearer ')||v.length>9000)throw new Error('UNAUTHENTICATED');return v.slice(7);}
function claims(token:string){try{const p=token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');return JSON.parse(atob(p));}catch{return {};}}
async function identity(req:Request){const context=await portalContext(req,'reparos-claro');return {email:context.user.email,name:context.user.name,context};}
async function authorize(req:Request){const me=await identity(req);const q=await db.from('portal_users').select('email,profile,active,apps,companies,user_type,client_key,microsoft_id').eq('email',me.email).maybeSingle();if(q.error||!q.data||!q.data.active)throw new Error('FORBIDDEN');const u=q.data;const admin=u.profile==='ADMINISTRADOR';const apps=Array.isArray(u.apps)?u.apps:[];if(!admin&&!apps.includes('reparos-claro'))throw new Error('FORBIDDEN');if(!admin&&u.user_type==='CLIENTE'){const companies=Array.isArray(u.companies)?u.companies:[];if(String(u.client_key||'').toUpperCase()!=='CLARO'&&!companies.includes('CLARO'))throw new Error('FORBIDDEN');}return u;}

Deno.serve(async(req)=>{const origin=req.headers.get('origin');if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors(origin)});if(req.method!=='GET')return new Response(JSON.stringify({error:'METHOD_NOT_ALLOWED'}),{status:405,headers:cors(origin)});try{await authorize(req);const url=new URL(SOURCE);url.searchParams.set('cliente','claro');url.searchParams.set('_',Date.now().toString());const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),45000);try{const upstream=await fetch(url.toString(),{cache:'no-store',signal:ctrl.signal});if(!upstream.ok)throw new Error('UPSTREAM_'+upstream.status);const body=await upstream.text();JSON.parse(body);return new Response(body,{status:200,headers:cors(origin)});}finally{clearTimeout(timer)}}catch(e){const m=e instanceof Error?e.message:'ERROR';const status=m==='UNAUTHENTICATED'?401:m==='FORBIDDEN'?403:502;return new Response(JSON.stringify({error:m}),{status,headers:cors(origin)});}});

