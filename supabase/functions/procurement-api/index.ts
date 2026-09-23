import { createClient } from 'jsr:@supabase/supabase-js@2';

const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
const TENANT='911e1aee-070e-421b-ae71-439f01c2263e';
const cors={'Access-Control-Allow-Origin':'https://portal.livionsolutions.com.br','Access-Control-Allow-Headers':'authorization,content-type','Access-Control-Allow-Methods':'GET,POST,PUT,OPTIONS'};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'content-type':'application/json','cache-control':'no-store'}});
function jwt(token:string){try{return JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')))}catch{return{}}}
async function auth(req:Request){
  const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  if(!token||jwt(token).tid!==TENANT)throw Error('UNAUTHORIZED');
  const graph=await fetch('https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName',{headers:{authorization:`Bearer ${token}`}});
  if(!graph.ok)throw Error('UNAUTHORIZED');
  const me=await graph.json(),email=String(me.mail||me.userPrincipalName||'').toLowerCase();
  let found=await db.from('portal_users').select('*').eq('microsoft_id',me.id).maybeSingle();
  if(!found.data)found=await db.from('portal_users').select('*').ilike('email',email).maybeSingle();
  const user=found.data,admin=user?.profile==='ADMINISTRADOR';
  if(!user?.active||(!admin&&!(user.apps||[]).includes('compras-cotacoes')))throw Error('FORBIDDEN');
  return{user,email,admin,actions:Array.isArray(user.actions)?user.actions:[]};
}
const can=(a:any,key:string)=>a.admin||a.actions.includes(key);
const need=(a:any,key:string)=>{if(!can(a,key))throw Error('FORBIDDEN')};
async function audit(a:any,event:string,id:string,detail:unknown={}){
  await Promise.all([
    db.from('procurement_events').insert({entity_type:event.startsWith('ORDER')?'ORDER':'REQUEST',entity_id:id,event_type:event,actor_email:a.email,detail}),
    db.from('access_audit').insert({actor_email:a.email,action:'PROCUREMENT_'+event,target:id,detail})
  ]);
}
async function bootstrap(a:any){
  need(a,'compras.visualizar');
  const[d,requests,items,offers,orders,orderItems,suppliers,products,lead]=await Promise.all([
    db.from('procurement_dashboard').select('*').single(),
    db.from('procurement_requests').select('*').order('created_at',{ascending:false}).limit(2500),
    db.from('procurement_request_items').select('*').limit(10000),
    db.from('procurement_offers').select('*').order('created_at',{ascending:false}).limit(15000),
    db.from('procurement_orders').select('*').order('created_at',{ascending:false}).limit(5000),
    db.from('procurement_order_items').select('*').limit(15000),
    db.from('inventory_suppliers').select('supplier_id,name,document,email,phone,status').order('name').limit(2000),
    db.from('inventory_stock_current').select('product_id,pn,description,category,item_type,unit,balance,min_stock,ideal_stock,status').order('description').limit(3000),
    db.from('procurement_lead_time_stats').select('*').limit(3000)
  ]);
  for(const r of [d,requests,items,offers,orders,orderItems,suppliers,products,lead])if(r.error)throw r.error;
  const showValues=can(a,'compras.visualizar_valores');
  const cleanOffer=(x:any)=>showValues?x:{...x,unit_price:null,total_price:null,exchange_rate:null,payment_terms:null};
  const cleanOrder=(x:any)=>showValues?x:{...x,total_value:null,payment_terms:null};
  const cleanOrderItem=(x:any)=>showValues?x:{...x,unit_price:null,total_price:null};
  return{dashboard:d.data,requests:requests.data||[],items:items.data||[],offers:(offers.data||[]).map(cleanOffer),orders:(orders.data||[]).map(cleanOrder),orderItems:(orderItems.data||[]).map(cleanOrderItem),suppliers:suppliers.data||[],products:products.data||[],leadTimes:lead.data||[],user:{name:a.user.name,email:a.email,administrator:a.admin},permissions:{create:can(a,'compras.criar_solicitacao'),quote:can(a,'compras.cotar'),approve:can(a,'compras.aprovar'),order:can(a,'compras.emitir_pedido'),receive:can(a,'compras.receber'),values:showValues,supplier:can(a,'compras.gerenciar_fornecedores'),export:can(a,'compras.exportar')}};
}
async function saveRequest(a:any,b:any){
  need(a,'compras.criar_solicitacao');
  const items=Array.isArray(b.items)?b.items:[];
  if(!String(b.title||'').trim()||!items.length)throw Error('INVALID_REQUEST');
  const urgency=String(b.urgency||'MEDIA').toUpperCase();
  if(!['BAIXA','MEDIA','ALTA','CRITICA'].includes(urgency))throw Error('INVALID_URGENCY');
  const row={title:String(b.title).trim(),requester_email:a.email,department:String(b.department||'').trim()||null,urgency,needed_at:b.needed_at||null,notes:String(b.notes||'').trim()||null,status:b.submit?'SOLICITADA':'RASCUNHO',source:'PORTAL',created_by:a.email,updated_at:new Date().toISOString()};
  const saved=await db.from('procurement_requests').insert(row).select().single();if(saved.error)throw saved.error;
  const itemRows=items.map((x:any,i:number)=>({request_id:saved.data.request_id,line_number:i+1,inventory_product_id:x.inventory_product_id||null,description:String(x.description||'').trim(),manufacturer:String(x.manufacturer||'').trim()||null,category:String(x.category||'').trim()||null,quantity:Number(x.quantity),unit:String(x.unit||'UNIDADE').trim(),quantity_notes:String(x.quantity_notes||'').trim()||null}));
  if(itemRows.some((x:any)=>!x.description||!Number.isFinite(x.quantity)||x.quantity<=0)){await db.from('procurement_requests').delete().eq('request_id',saved.data.request_id);throw Error('INVALID_REQUEST_ITEMS')}
  const inserted=await db.from('procurement_request_items').insert(itemRows);if(inserted.error){await db.from('procurement_requests').delete().eq('request_id',saved.data.request_id);throw inserted.error}
  await audit(a,row.status==='SOLICITADA'?'REQUEST_SUBMITTED':'REQUEST_CREATED',saved.data.request_id,{items:itemRows.length});
  return{ok:true,request_id:saved.data.request_id,request_number:saved.data.request_number};
}
async function saveOffer(a:any,b:any){
  need(a,'compras.cotar');
  const item=await db.from('procurement_request_items').select('item_id,request_id,quantity').eq('item_id',b.item_id).maybeSingle();
  if(item.error||!item.data)throw Error('INVALID_ITEM');
  const supplier=await db.from('inventory_suppliers').select('supplier_id,name').eq('supplier_id',b.supplier_id).maybeSingle();
  if(supplier.error||!supplier.data)throw Error('INVALID_SUPPLIER');
  const unit=b.unit_price==null||b.unit_price===''?null:Number(b.unit_price),total=b.total_price==null||b.total_price===''?(unit==null?null:unit*Number(item.data.quantity)):Number(b.total_price);
  if(unit!=null&&(!Number.isFinite(unit)||unit<0)||total!=null&&(!Number.isFinite(total)||total<0))throw Error('INVALID_PRICE');
  const row={item_id:b.item_id,supplier_id:b.supplier_id,supplier_name_snapshot:supplier.data.name,requested_at:b.requested_at||new Date().toISOString(),responded_at:b.responded_at||null,currency:String(b.currency||'BRL').toUpperCase(),exchange_rate:b.exchange_rate?Number(b.exchange_rate):null,unit_price:unit,total_price:total,payment_terms:String(b.payment_terms||'').trim()||null,delivery_days:b.delivery_days===''||b.delivery_days==null?null:Number(b.delivery_days),delivery_method:String(b.delivery_method||'').trim()||null,purchase_url:String(b.purchase_url||'').trim()||null,supplier_reference:String(b.supplier_reference||'').trim()||null,notes:String(b.notes||'').trim()||null,created_by:a.email,updated_at:new Date().toISOString()};
  const saved=await db.from('procurement_offers').insert(row).select().single();if(saved.error)throw saved.error;
  await db.from('procurement_request_items').update({status:'COTANDO'}).eq('item_id',b.item_id);
  await db.from('procurement_requests').update({status:'COTANDO',updated_at:new Date().toISOString()}).eq('request_id',item.data.request_id).in('status',['SOLICITADA','RASCUNHO']);
  await audit(a,'OFFER_CREATED',item.data.request_id,{offer_id:saved.data.offer_id,item_id:b.item_id,supplier_id:b.supplier_id});
  return{ok:true,offer_id:saved.data.offer_id};
}
async function selectOffer(a:any,b:any){
  need(a,'compras.aprovar');
  const offer=await db.from('procurement_offers').select('offer_id,item_id,procurement_request_items(request_id)').eq('offer_id',b.offer_id).maybeSingle();
  if(offer.error||!offer.data)throw Error('INVALID_OFFER');
  await db.from('procurement_offers').update({selected:false,updated_at:new Date().toISOString()}).eq('item_id',offer.data.item_id);
  const selected=await db.from('procurement_offers').update({selected:true,updated_at:new Date().toISOString()}).eq('offer_id',b.offer_id);if(selected.error)throw selected.error;
  await db.from('procurement_request_items').update({status:'SELECIONADO'}).eq('item_id',offer.data.item_id);
  const requestId=(offer.data as any).procurement_request_items?.request_id;
  if(requestId)await db.from('procurement_requests').update({status:'APROVADA',updated_at:new Date().toISOString()}).eq('request_id',requestId);
  await audit(a,'OFFER_SELECTED',requestId||offer.data.item_id,{offer_id:b.offer_id,item_id:offer.data.item_id});
  return{ok:true};
}
async function issueOrders(a:any,b:any){
  need(a,'compras.emitir_pedido');
  const request=await db.from('procurement_requests').select('*').eq('request_id',b.request_id).maybeSingle();if(request.error||!request.data)throw Error('INVALID_REQUEST');
  const items=await db.from('procurement_request_items').select('*').eq('request_id',b.request_id);if(items.error)throw items.error;
  const ids=(items.data||[]).map((x:any)=>x.item_id),offers=ids.length?await db.from('procurement_offers').select('*').in('item_id',ids).eq('selected',true):{data:[],error:null};if(offers.error)throw offers.error;
  if(!(offers.data||[]).length||(offers.data||[]).some((x:any)=>!x.supplier_id))throw Error('SELECT_OFFERS_FIRST');
  const missing=(items.data||[]).filter((x:any)=>!(offers.data||[]).some((o:any)=>o.item_id===x.item_id));if(missing.length)throw Error('SELECT_ALL_OFFERS');
  const groups=new Map<string,any[]>();for(const o of offers.data||[]){const arr=groups.get(o.supplier_id)||[];arr.push(o);groups.set(o.supplier_id,arr)}
  const created:any[]=[];
  for(const [supplierId,group] of groups){
    const total=group.reduce((n,o)=>n+Number(o.total_price||0),0),first=group[0],orderedAt=b.ordered_at||new Date().toISOString();
    const order=await db.from('procurement_orders').insert({supplier_id:supplierId,supplier_name_snapshot:first.supplier_name_snapshot,status:'EMITIDO',ordered_at:orderedAt,expected_at:b.expected_at||null,currency:first.currency||'BRL',total_value:total||null,payment_terms:first.payment_terms||null,delivery_method:first.delivery_method||null,notes:String(b.notes||'').trim()||null,created_by:a.email}).select().single();if(order.error)throw order.error;
    const rows=group.map(o=>{const item=(items.data||[]).find((x:any)=>x.item_id===o.item_id);return{order_id:order.data.order_id,request_item_id:item.item_id,offer_id:o.offer_id,inventory_product_id:item.inventory_product_id,description:item.description,quantity:item.quantity,unit:item.unit,unit_price:o.unit_price,total_price:o.total_price}});
    const oi=await db.from('procurement_order_items').insert(rows);if(oi.error)throw oi.error;
    await db.from('procurement_request_items').update({status:'PEDIDO'}).in('item_id',group.map(o=>o.item_id));
    created.push(order.data);
  }
  await db.from('procurement_requests').update({status:'PEDIDO_EMITIDO',updated_at:new Date().toISOString()}).eq('request_id',b.request_id);
  await audit(a,'ORDER_ISSUED',b.request_id,{orders:created.map(x=>x.order_id)});
  return{ok:true,orders:created};
}
async function receive(a:any,b:any){
  need(a,'compras.receber');
  const items=Array.isArray(b.items)?b.items.map((x:any)=>({order_item_id:x.order_item_id,quantity:Number(x.quantity),idempotency_key:x.idempotency_key||crypto.randomUUID()})):[];
  const saved=await db.rpc('procurement_receive_order',{p_order_id:b.order_id,p_items:items,p_actor_email:a.email,p_invoice_number:String(b.invoice_number||'').trim()||null,p_notes:String(b.notes||'').trim()||null,p_received_at:b.received_at||new Date().toISOString()});
  if(saved.error)throw saved.error;
  return saved.data;
}
async function supplier(a:any,b:any){
  need(a,'compras.gerenciar_fornecedores');
  const name=String(b.name||'').trim();if(!name)throw Error('INVALID_SUPPLIER');
  const row={supplier_id:b.supplier_id||crypto.randomUUID(),name,document:String(b.document||'').trim()||null,email:String(b.email||'').trim()||null,phone:String(b.phone||'').trim()||null,address:String(b.address||'').trim()||null,status:'ATIVO',notes:String(b.notes||'').trim()||null,updated_at:new Date().toISOString()};
  const saved=await db.from('inventory_suppliers').upsert(row,{onConflict:'supplier_id'}).select().single();if(saved.error)throw saved.error;return{ok:true,supplier:saved.data};
}
async function linkItem(a:any,b:any){
  if(!can(a,'compras.cotar')&&!can(a,'compras.criar_solicitacao'))throw Error('FORBIDDEN');
  const item=await db.from('procurement_request_items').select('item_id,request_id,inventory_product_id').eq('item_id',b.item_id).maybeSingle();if(item.error||!item.data)throw Error('INVALID_ITEM');
  const product=await db.from('inventory_products').select('product_id,pn,description').eq('product_id',b.inventory_product_id).eq('status','ATIVO').maybeSingle();if(product.error||!product.data)throw Error('INVALID_PRODUCT');
  const updated=await db.from('procurement_request_items').update({inventory_product_id:product.data.product_id}).eq('item_id',item.data.item_id);if(updated.error)throw updated.error;
  const orderUpdated=await db.from('procurement_order_items').update({inventory_product_id:product.data.product_id}).eq('request_item_id',item.data.item_id);if(orderUpdated.error)throw orderUpdated.error;
  await audit(a,'ITEM_LINKED',item.data.request_id,{item_id:item.data.item_id,before:item.data.inventory_product_id,after:product.data.product_id});
  return{ok:true,product:product.data};
}
const normalized=(value:any)=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
async function suggestProduct(a:any,b:any){
  need(a,'compras.criar_solicitacao');
  const description=String(b.description||'').trim();if(description.length<2||description.length>1000)throw Error('INVALID_DESCRIPTION');
  const products=await db.from('inventory_products').select('product_id,pn,description,category,item_type,unit,internal_code,barcode,status').eq('status','ATIVO').limit(3000);if(products.error)throw products.error;
  const queryTokens=new Set(normalized(description).split(' ').filter((x:string)=>x.length>1));
  const ranked=(products.data||[]).map((product:any)=>{const productTokens=new Set(normalized([product.pn,product.description,product.category,product.item_type,product.internal_code,product.barcode].filter(Boolean).join(' ')).split(' '));let matches=0;for(const token of queryTokens)if(productTokens.has(token))matches++;const exact=normalized(product.description)===normalized(description)||[product.pn,product.internal_code,product.barcode].some((v:any)=>v&&normalized(v)===normalized(description));const confidence=exact?1:(queryTokens.size?matches/queryTokens.size:0);return{product,confidence,exact}}).sort((x:any,y:any)=>Number(y.exact)-Number(x.exact)||y.confidence-x.confidence);
  const best=ranked[0];if(!best||(!best.exact&&best.confidence<0.86))return{suggestion:null,confidence:best?.confidence||0};
  return{suggestion:{product_id:best.product.product_id,pn:best.product.pn,description:best.product.description},confidence:best.confidence,method:'LOCAL_DETERMINISTIC'};
}

Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response('',{headers:cors});let a:any;
  try{
    a=await auth(req);const path=new URL(req.url).pathname.split('/').pop();
    if(req.method==='GET'&&path==='health')return reply({ok:true,version:1});
    if(req.method==='GET'&&path==='bootstrap')return reply(await bootstrap(a));
    if(req.method==='POST'&&path==='request')return reply(await saveRequest(a,await req.json()));
    if(req.method==='POST'&&path==='offer')return reply(await saveOffer(a,await req.json()));
    if(req.method==='POST'&&path==='select-offer')return reply(await selectOffer(a,await req.json()));
    if(req.method==='POST'&&path==='issue-orders')return reply(await issueOrders(a,await req.json()));
    if(req.method==='POST'&&path==='receive')return reply(await receive(a,await req.json()));
    if(req.method==='POST'&&path==='supplier')return reply(await supplier(a,await req.json()));
    if(req.method==='POST'&&path==='suggest-product')return reply(await suggestProduct(a,await req.json()));
    if(req.method==='POST'&&path==='link-item')return reply(await linkItem(a,await req.json()));
    return reply({error:'NOT_FOUND'},404);
  }catch(error){
    const message=String(error?.message||error),status=message.includes('UNAUTHORIZED')?401:message.includes('FORBIDDEN')?403:message.includes('INVALID')||message.includes('SELECT_')?400:500;
    if(a&&status===403)await db.from('access_audit').insert({actor_email:a.email,action:'PROCUREMENT_ACCESS_DENIED',target:'procurement-api',detail:{message}}).catch(()=>{});
    return reply({error:message},status);
  }
});
