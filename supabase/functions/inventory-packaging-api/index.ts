import {createClient} from 'jsr:@supabase/supabase-js@2';

function requirePositiveNumber(value:any,code='INVALID_QUANTITY'){const number=Number(value);if(!Number.isFinite(number)||number<=0)throw Error(code);return number}
function calculateDispatchFactor(baseBalance:any,dispatchCount:any){const balance=requirePositiveNumber(baseBalance,'BALANCE_REQUIRED'),count=requirePositiveNumber(dispatchCount,'INVALID_DISPATCH_COUNT');if(!Number.isInteger(count))throw Error('INVALID_DISPATCH_COUNT');return Number((balance/count).toFixed(6))}
function calculateBaseQuantity(dispatchQuantity:any,factor:any){const quantity=requirePositiveNumber(dispatchQuantity,'INVALID_DISPATCH_QUANTITY');if(!Number.isInteger(quantity))throw Error('INVALID_DISPATCH_QUANTITY');return Number((quantity*requirePositiveNumber(factor,'INVALID_DISPATCH_FACTOR')).toFixed(6))}
function availableDispatchUnits(balance:any,factor:any){const current=Math.max(0,Number(balance)||0),unitFactor=requirePositiveNumber(factor,'INVALID_DISPATCH_FACTOR');return Math.floor((current+0.0000001)/unitFactor)}

const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
const TENANT='911e1aee-070e-421b-ae71-439f01c2263e';
const cors={'Access-Control-Allow-Origin':'https://portal.livionsolutions.com.br','Access-Control-Allow-Headers':'authorization,content-type','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{...cors,'content-type':'application/json','cache-control':'no-store'}});

function jwt(token:string){try{return JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')))}catch{return{}}}
async function auth(request:Request){
  const token=(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  if(!token||jwt(token).tid!==TENANT)throw Error('UNAUTHORIZED');
  const graph=await fetch('https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName',{headers:{authorization:`Bearer ${token}`}});
  if(!graph.ok)throw Error('UNAUTHORIZED');
  const me=await graph.json(),email=String(me.mail||me.userPrincipalName||'').toLowerCase();
  let result=await db.from('portal_users').select('*').eq('microsoft_id',me.id).maybeSingle();
  if(!result.data)result=await db.from('portal_users').select('*').ilike('email',email).maybeSingle();
  const user=result.data,admin=user?.profile==='ADMINISTRADOR';
  if(!user?.active||(!admin&&!(user.apps||[]).includes('estoque')))throw Error('FORBIDDEN');
  return{user,email,admin,actions:Array.isArray(user.actions)?user.actions:[]};
}
const can=(actor:any,action:string)=>actor.admin||actor.actions.includes(action);
async function audit(actor:any,action:string,target:string,detail:any={}){await db.from('access_audit').insert({actor_email:actor.email,action,target,detail:{...detail,server_at:new Date().toISOString()}})}

async function configurations(){
  const [products,stock]=await Promise.all([
    db.from('inventory_products').select('product_id,dispatch_unit,base_quantity_per_dispatch_unit').not('dispatch_unit','is',null),
    db.from('inventory_stock_current').select('product_id,balance,unit')
  ]);
  if(products.error)throw products.error;if(stock.error)throw stock.error;
  const balances=new Map((stock.data||[]).map((row:any)=>[row.product_id,row]));
  return (products.data||[]).map((row:any)=>{const current:any=balances.get(row.product_id)||{};return{...row,balance:Number(current.balance||0),base_unit:current.unit||null,available_dispatch_quantity:availableDispatchUnits(current.balance,row.base_quantity_per_dispatch_unit)}});
}

async function configure(actor:any,body:any){
  if(!can(actor,'estoque.editar_produto')&&!can(actor,'estoque.cadastrar_produto'))throw Error('FORBIDDEN');
  const productId=String(body.product_id||'');if(!productId)throw Error('INVALID_PRODUCT');
  const current=await db.from('inventory_products').select('product_id,dispatch_unit,base_quantity_per_dispatch_unit').eq('product_id',productId).maybeSingle();
  if(current.error)throw current.error;if(!current.data)throw Error('NOT_FOUND');
  if(body.disable){const updated=await db.from('inventory_products').update({dispatch_unit:null,base_quantity_per_dispatch_unit:null,updated_at:new Date().toISOString()}).eq('product_id',productId);if(updated.error)throw updated.error;await audit(actor,'INVENTORY_DISPATCH_CONFIG_REMOVE',productId,{before:current.data});return{ok:true,product_id:productId,disabled:true}}
  const stock=await db.from('inventory_stock_current').select('balance,unit').eq('product_id',productId).maybeSingle();
  if(stock.error)throw stock.error;if(!stock.data)throw Error('NOT_FOUND');
  const dispatchUnit=String(body.dispatch_unit||'').trim().toUpperCase(),baseUnit=String(body.base_unit||stock.data.unit||'').trim().toUpperCase(),dispatchCount=Number(body.dispatch_count);
  if(!dispatchUnit)throw Error('INVALID_DISPATCH_UNIT');if(!baseUnit)throw Error('INVALID_BASE_UNIT');
  const factor=calculateDispatchFactor(stock.data.balance,dispatchCount);
  const updated=await db.from('inventory_products').update({unit:baseUnit,dispatch_unit:dispatchUnit,base_quantity_per_dispatch_unit:factor,updated_at:new Date().toISOString()}).eq('product_id',productId);
  if(updated.error)throw updated.error;
  await audit(actor,'INVENTORY_DISPATCH_CONFIG_SET',productId,{before:current.data,after:{unit:baseUnit,dispatch_unit:dispatchUnit,base_quantity_per_dispatch_unit:factor},balance:Number(stock.data.balance),base_unit:baseUnit,dispatch_count:dispatchCount});
  return{ok:true,product_id:productId,dispatch_unit:dispatchUnit,base_quantity_per_dispatch_unit:factor,balance:Number(stock.data.balance),base_unit:baseUnit,available_dispatch_quantity:availableDispatchUnits(stock.data.balance,factor)};
}

function occurredAt(value:any){if(!value)return null;const date=new Date(value);if(!Number.isFinite(date.getTime())||date.getTime()>Date.now()+300000)throw Error('INVALID_OCCURRED_AT');return date.toISOString()}
async function exitByDispatchUnit(actor:any,body:any){
  if(!can(actor,'estoque.movimentar_saida'))throw Error('FORBIDDEN');
  const productId=String(body.product_id||''),dispatchQuantity=Number(body.dispatch_quantity);if(!productId)throw Error('INVALID_PRODUCT');
  const [product,stock]=await Promise.all([
    db.from('inventory_products').select('product_id,dispatch_unit,base_quantity_per_dispatch_unit').eq('product_id',productId).maybeSingle(),
    db.from('inventory_stock_current').select('balance,unit').eq('product_id',productId).maybeSingle()
  ]);
  if(product.error)throw product.error;if(stock.error)throw stock.error;if(!product.data||!stock.data)throw Error('NOT_FOUND');
  if(!product.data.dispatch_unit||!product.data.base_quantity_per_dispatch_unit)throw Error('DISPATCH_NOT_CONFIGURED');
  const baseQuantity=calculateBaseQuantity(dispatchQuantity,product.data.base_quantity_per_dispatch_unit),available=availableDispatchUnits(stock.data.balance,product.data.base_quantity_per_dispatch_unit);
  if(dispatchQuantity>available||baseQuantity>Number(stock.data.balance)+0.0000001)throw Error('INSUFFICIENT_STOCK');
  const key=String(body.idempotency_key||crypto.randomUUID());
  const result=await db.rpc('inventory_register_movement',{p_movement_type:'SAIDA',p_product_id:productId,p_quantity:baseQuantity,p_actor_email:actor.email,p_idempotency_key:key,p_total_value:null,p_unit_value:null,p_requester_id:body.requester_id||null,p_supplier_id:null,p_document_number:String(body.document_number||'').trim()||null,p_notes:String(body.notes||'').trim()||null,p_from_location:null,p_to_location:null,p_purpose:body.purpose||'CONSUMO_INTERNO',p_source:'PORTAL',p_reversal_of:null,p_reference_type:null,p_reference_id:null,p_occurred_at:occurredAt(body.occurred_at)});
  if(result.error)throw result.error;
  const row:any=result.data||{},movementId=row.movement_id;
  const tagged=await db.from('inventory_movements').update({dispatch_quantity:dispatchQuantity,dispatch_unit:product.data.dispatch_unit,base_quantity_per_dispatch_unit:product.data.base_quantity_per_dispatch_unit}).eq('movement_id',movementId);
  if(tagged.error)throw tagged.error;
  await audit(actor,'INVENTORY_SAIDA',productId,{movement_id:movementId,quantity:baseQuantity,dispatch_quantity:dispatchQuantity,dispatch_unit:product.data.dispatch_unit,base_quantity_per_dispatch_unit:Number(product.data.base_quantity_per_dispatch_unit)});
  return{ok:true,id:movementId,idempotency_key:key,quantity:baseQuantity,base_unit:stock.data.unit,dispatch_quantity:dispatchQuantity,dispatch_unit:product.data.dispatch_unit,base_quantity_per_dispatch_unit:Number(product.data.base_quantity_per_dispatch_unit),occurred_at:row.occurred_at,recorded_at:row.recorded_at};
}

Deno.serve(async request=>{if(request.method==='OPTIONS')return new Response('',{headers:cors});let actor:any;try{actor=await auth(request);const path=new URL(request.url).pathname.split('/').pop();if(request.method==='GET'&&path==='bootstrap')return json({configurations:await configurations()});if(request.method==='POST'&&path==='configure')return json(await configure(actor,await request.json()));if(request.method==='POST'&&path==='exit')return json(await exitByDispatchUnit(actor,await request.json()));return json({error:'NOT_FOUND'},404)}catch(error){const message=String((error as any)?.message||error),status=message.includes('UNAUTHORIZED')?401:message.includes('FORBIDDEN')?403:message.includes('NOT_FOUND')?404:message.includes('INSUFFICIENT')?409:message.includes('INVALID')||message.includes('REQUIRED')||message.includes('NOT_CONFIGURED')?400:500;if(actor&&status===403)await audit(actor,'INVENTORY_ACCESS_DENIED','inventory-packaging-api',{message}).catch(()=>{});return json({error:message},status)}});
