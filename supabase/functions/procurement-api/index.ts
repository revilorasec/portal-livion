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
  const apps=Array.isArray(user?.apps)?user.apps:[];
  if(!user?.active||(!admin&&!apps.some((x:string)=>['compras-cotacoes','estoque'].includes(x))))throw Error('FORBIDDEN');
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
  const currentFx=await latestPtax(a,false);
  const[d,requests,items,offers,orders,orderItems,orderDocuments,suppliers,products,lead,requestSuppliers,contacts,catalog,fx,lastNumber]=await Promise.all([
    db.from('procurement_dashboard').select('*').single(),
    db.from('procurement_requests').select('*').is('deleted_at',null).order('created_at',{ascending:false}).limit(2500),
    db.from('procurement_request_items').select('*').limit(10000),
    db.from('procurement_offers').select('*').order('created_at',{ascending:false}).limit(15000),
    db.from('procurement_orders').select('*').order('created_at',{ascending:false}).limit(5000),
    db.from('procurement_order_items').select('*').limit(15000),
    db.from('procurement_order_documents').select('*').order('created_at',{ascending:false}).limit(10000),
    db.from('inventory_suppliers').select('supplier_id,name,document,email,phone,address,notes,status,photo_url').order('name').limit(2000),
    db.from('inventory_stock_current').select('product_id,pn,description,category,item_type,unit,balance,min_stock,ideal_stock,status').order('description').limit(3000),
    db.from('procurement_lead_time_stats').select('*').limit(3000),
    db.from('procurement_request_suppliers').select('*').limit(10000),
    db.from('inventory_supplier_quote_contacts').select('*').eq('active',true).order('is_primary',{ascending:false}).limit(5000),
    db.from('inventory_catalog_options').select('value,sort_order').eq('option_type','UNIT').eq('active',true).order('sort_order').order('value'),
    db.from('procurement_fx_rates').select('*').eq('base_currency','USD').eq('quote_currency','BRL').order('rate_at',{ascending:false}).limit(1),
    db.from('procurement_requests').select('request_number').order('request_number',{ascending:false}).limit(1).maybeSingle()
  ]);
  for(const r of [d,requests,items,offers,orders,orderItems,orderDocuments,suppliers,products,lead,requestSuppliers,contacts,catalog,fx,lastNumber])if(r.error)throw r.error;
  const supplierIds=(suppliers.data||[]).map((x:any)=>x.supplier_id),supplierLogos=supplierIds.length?await db.from('inventory_media').select('entity_id,bucket,object_path').eq('entity_type','SUPPLIER').eq('position',1).in('entity_id',supplierIds):{data:[],error:null};
  if(supplierLogos.error)throw supplierLogos.error;
  const logoUrls=new Map<string,string>();
  for(const logo of supplierLogos.data||[]){const signed=await db.storage.from(logo.bucket).createSignedUrl(logo.object_path,3600);if(signed.data?.signedUrl)logoUrls.set(logo.entity_id,signed.data.signedUrl)}
  const suppliersWithLogos=(suppliers.data||[]).map((x:any)=>({...x,photo_url:logoUrls.get(x.supplier_id)||x.photo_url||null}));
  const showValues=can(a,'compras.visualizar_valores');
  const cleanOffer=(x:any)=>showValues?x:{...x,unit_price:null,total_price:null,exchange_rate:null,payment_terms:null};
  const cleanOrder=(x:any)=>showValues?x:{...x,total_value:null,payment_terms:null};
  const cleanOrderItem=(x:any)=>showValues?x:{...x,unit_price:null,total_price:null};
  const requestIds=new Set((requests.data||[]).map((x:any)=>x.request_id)),activeItems=(items.data||[]).filter((x:any)=>requestIds.has(x.request_id)),itemIds=new Set(activeItems.map((x:any)=>x.item_id));
  return{dashboard:d.data,requests:requests.data||[],items:activeItems,offers:(offers.data||[]).filter((x:any)=>itemIds.has(x.item_id)).map(cleanOffer),orders:(orders.data||[]).map(cleanOrder),orderItems:(orderItems.data||[]).map(cleanOrderItem),orderDocuments:orderDocuments.data||[],suppliers:suppliersWithLogos,products:products.data||[],units:(catalog.data||[]).map((x:any)=>x.value),nextRequestNumber:Number(lastNumber.data?.request_number||0)+1,leadTimes:lead.data||[],requestSuppliers:(requestSuppliers.data||[]).filter((x:any)=>requestIds.has(x.request_id)),supplierContacts:contacts.data||[],fx:currentFx,user:{name:a.user.name,email:a.email,administrator:a.admin},permissions:{create:can(a,'compras.criar_solicitacao'),quote:can(a,'compras.cotar'),approve:can(a,'compras.aprovar'),order:can(a,'compras.emitir_pedido'),receive:can(a,'compras.receber'),values:showValues,supplier:can(a,'compras.gerenciar_fornecedores'),export:can(a,'compras.exportar')}};
}
async function saveRequest(a:any,b:any){
  need(a,'compras.criar_solicitacao');
  const items=Array.isArray(b.items)?b.items:[],supplierIds=[...new Set((Array.isArray(b.supplier_ids)?b.supplier_ids:[]).map(String).filter(Boolean))];
  const quoteMode=String(b.quote_mode||'SUPPLIER').toUpperCase();
  if(!['SUPPLIER','INTERNAL'].includes(quoteMode))throw Error('INVALID_QUOTE_MODE');
  if(!items.length)throw Error('INVALID_REQUEST');
  if(b.submit&&!supplierIds.length)throw Error('SELECT_SUPPLIERS_FIRST');
  const productIds=[...new Set(items.map((x:any)=>String(x.inventory_product_id||'')).filter(Boolean))];
  if(productIds.length!==items.length)throw Error('SELECT_EXACT_PRODUCTS');
  const products=await db.from('inventory_products').select('product_id,pn,description,category,item_type,unit,status').in('product_id',productIds).eq('status','ATIVO');if(products.error)throw products.error;
  const productMap=new Map((products.data||[]).map((x:any)=>[x.product_id,x]));if(productMap.size!==productIds.length)throw Error('SELECT_EXACT_PRODUCTS');
  const allowedUnits=await db.from('inventory_catalog_options').select('value').eq('option_type','UNIT').eq('active',true);if(allowedUnits.error)throw allowedUnits.error;const unitSet=new Set((allowedUnits.data||[]).map((x:any)=>String(x.value)));
  const preparedItems=items.map((x:any,i:number)=>{const p:any=productMap.get(String(x.inventory_product_id));const unit=String(x.unit||p.unit||'UNIDADE').trim();return{line_number:i+1,inventory_product_id:p.product_id,description:p.description,manufacturer:null,category:p.category||p.item_type||null,quantity:Number(x.quantity),unit,quantity_notes:String(x.quantity_notes||'').trim()||null}});
  if(preparedItems.some((x:any)=>!Number.isFinite(x.quantity)||x.quantity<=0||!unitSet.has(x.unit)))throw Error('INVALID_REQUEST_ITEMS');
  const title=String(b.title||'Cotação em criação').trim();
  const urgency=String(b.urgency||'MEDIA').toUpperCase();
  if(!['BAIXA','MEDIA','ALTA','CRITICA'].includes(urgency))throw Error('INVALID_URGENCY');
  const row={title,requester_email:a.email,department:String(b.department||'').trim()||null,urgency,needed_at:b.needed_at||null,notes:String(b.notes||'').trim()||null,quote_mode:quoteMode,status:b.submit?'SOLICITADA':'RASCUNHO',source:'PORTAL',created_by:a.email,updated_at:new Date().toISOString()};
  let saved:any;
  if(b.request_id){
    const current=await db.from('procurement_requests').select('request_id,status,requester_email').eq('request_id',b.request_id).maybeSingle();if(current.error||!current.data||current.data.status!=='RASCUNHO'||(!a.admin&&current.data.requester_email!==a.email))throw Error('INVALID_REQUEST_EDIT');
    const oldItems=await db.from('procurement_request_items').select('item_id').eq('request_id',b.request_id);if(oldItems.error)throw oldItems.error;
    const oldIds=(oldItems.data||[]).map((x:any)=>x.item_id);if(oldIds.length){const used=await db.from('procurement_offers').select('offer_id',{count:'exact',head:true}).in('item_id',oldIds);if(used.error)throw used.error;if(used.count)throw Error('REQUEST_ALREADY_QUOTED')}
    const updated=await db.from('procurement_requests').update({...row,created_by:undefined}).eq('request_id',b.request_id).select().single();if(updated.error)throw updated.error;saved=updated;
    const removed=await db.from('procurement_request_items').delete().eq('request_id',b.request_id);if(removed.error)throw removed.error;
    await db.from('procurement_request_suppliers').delete().eq('request_id',b.request_id);
  }else{saved=await db.from('procurement_requests').insert(row).select().single();if(saved.error)throw saved.error}
  const createdAt=new Date(saved.data.created_at||Date.now()),quoteDate=createdAt.toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'}),officialTitle=`COT-${String(saved.data.request_number).padStart(6,'0')} - ${quoteDate}`;
  if(saved.data.title!==officialTitle){const named=await db.from('procurement_requests').update({title:officialTitle,updated_at:new Date().toISOString()}).eq('request_id',saved.data.request_id);if(named.error)throw named.error;saved.data.title=officialTitle}
  const itemRows=preparedItems.map((x:any)=>({...x,request_id:saved.data.request_id}));
  const inserted=await db.from('procurement_request_items').insert(itemRows);if(inserted.error)throw inserted.error;
  if(supplierIds.length){const sent=b.submit&&quoteMode==='SUPPLIER',supplierRows=supplierIds.map((supplier_id:string)=>({request_id:saved.data.request_id,supplier_id,status:sent?'ENVIADA':'PENDENTE',sent_at:sent?new Date().toISOString():null,created_by:a.email}));const linked=await db.from('procurement_request_suppliers').insert(supplierRows);if(linked.error)throw linked.error}
  await audit(a,row.status==='SOLICITADA'?'REQUEST_SUBMITTED':'REQUEST_SAVED',saved.data.request_id,{items:itemRows.length,suppliers:supplierIds.length,quote_mode:quoteMode});
  return{ok:true,request_id:saved.data.request_id,request_number:saved.data.request_number,title:officialTitle};
}
async function saveOffer(a:any,b:any){
  need(a,'compras.cotar');
  const item=await db.from('procurement_request_items').select('item_id,request_id,quantity').eq('item_id',b.item_id).maybeSingle();
  if(item.error||!item.data)throw Error('INVALID_ITEM');
  const supplier=await db.from('inventory_suppliers').select('supplier_id,name').eq('supplier_id',b.supplier_id).maybeSingle();
  if(supplier.error||!supplier.data)throw Error('INVALID_SUPPLIER');
  const unit=b.unit_price==null||b.unit_price===''?null:Number(b.unit_price),total=b.total_price==null||b.total_price===''?(unit==null?null:unit*Number(item.data.quantity)):Number(b.total_price);
  if(unit!=null&&(!Number.isFinite(unit)||unit<0)||total!=null&&(!Number.isFinite(total)||total<0))throw Error('INVALID_PRICE');
  const currency=String(b.currency||'BRL').toUpperCase(),fx=currency==='USD'?await latestPtax(a,false):null,rate=currency==='USD'?(b.exchange_rate?Number(b.exchange_rate):Number(fx?.rate)||null):null;
  const row={item_id:b.item_id,supplier_id:b.supplier_id,supplier_name_snapshot:supplier.data.name,requested_at:b.requested_at||new Date().toISOString(),responded_at:b.responded_at||null,currency,exchange_rate:rate,exchange_rate_original:rate,exchange_rate_current:rate,exchange_rate_current_at:currency==='USD'?(fx?.rate_at||new Date().toISOString()):null,unit_price:unit,total_price:total,payment_terms:String(b.payment_terms||'').trim()||null,delivery_days:b.delivery_days===''||b.delivery_days==null?null:Number(b.delivery_days),delivery_method:String(b.delivery_method||'').trim()||null,purchase_url:String(b.purchase_url||'').trim()||null,supplier_reference:String(b.supplier_reference||'').trim()||null,notes:String(b.notes||'').trim()||null,response_source:'MANUAL',created_by:a.email,updated_at:new Date().toISOString()};
  const saved=await db.from('procurement_offers').insert(row).select().single();if(saved.error)throw saved.error;
  await db.from('procurement_request_items').update({status:'COTANDO'}).eq('item_id',b.item_id);
  await db.from('procurement_requests').update({status:'COTANDO',updated_at:new Date().toISOString()}).eq('request_id',item.data.request_id).in('status',['SOLICITADA','RASCUNHO']);
  await audit(a,'OFFER_CREATED',item.data.request_id,{offer_id:saved.data.offer_id,item_id:b.item_id,supplier_id:b.supplier_id});
  return{ok:true,offer_id:saved.data.offer_id};
}
async function selectOffer(a:any,b:any){
  need(a,'compras.aprovar');
  const offer=await db.from('procurement_offers').select('offer_id,item_id,supplier_id,procurement_request_items(request_id)').eq('offer_id',b.offer_id).maybeSingle();
  if(offer.error||!offer.data)throw Error('INVALID_OFFER');
  const requestId=(offer.data as any).procurement_request_items?.request_id;
  const linked=await db.from('procurement_request_suppliers').select('request_supplier_id').eq('request_id',requestId).eq('supplier_id',offer.data.supplier_id).maybeSingle();
  if(linked.error||!linked.data)throw Error('INVALID_REQUEST_SUPPLIER');
  await db.from('procurement_offers').update({selected:false,updated_at:new Date().toISOString()}).eq('item_id',offer.data.item_id);
  const selected=await db.from('procurement_offers').update({selected:true,updated_at:new Date().toISOString()}).eq('offer_id',b.offer_id);if(selected.error)throw selected.error;
  await db.from('procurement_request_items').update({status:'SELECIONADO'}).eq('item_id',offer.data.item_id);
  if(requestId)await db.from('procurement_requests').update({status:'APROVADA',updated_at:new Date().toISOString()}).eq('request_id',requestId);
  await audit(a,'OFFER_SELECTED',requestId||offer.data.item_id,{offer_id:b.offer_id,item_id:offer.data.item_id});
  return{ok:true};
}
async function issueOrders(a:any,b:any){
  need(a,'compras.emitir_pedido');
  const request=await db.from('procurement_requests').select('*').eq('request_id',b.request_id).maybeSingle();if(request.error||!request.data)throw Error('INVALID_REQUEST');
  const items=await db.from('procurement_request_items').select('*').eq('request_id',b.request_id);if(items.error)throw items.error;
  const ids=(items.data||[]).map((x:any)=>x.item_id),offers=ids.length?await db.from('procurement_offers').select('*').in('item_id',ids).eq('selected',true):{data:[],error:null};if(offers.error)throw offers.error;
  if(ids.length){const previousItems=await db.from('procurement_order_items').select('order_id').in('request_item_id',ids);if(previousItems.error)throw previousItems.error;const previousOrderIds=[...new Set((previousItems.data||[]).map((x:any)=>x.order_id))];if(previousOrderIds.length){const active=await db.from('procurement_orders').select('order_id').in('order_id',previousOrderIds).in('status',['RASCUNHO','EMITIDO','PARCIALMENTE_RECEBIDO']);if(active.error)throw active.error;if(active.data?.length)throw Error('ACTIVE_ORDERS_EXIST')}}
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
async function supplierLogo(a:any,r:Request){
  need(a,'compras.gerenciar_fornecedores');
  const form=await r.formData(),supplierId=String(form.get('supplier_id')||''),file=form.get('file');
  if(!supplierId||!(file instanceof File)||!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10485760)throw Error('INVALID_SUPPLIER_LOGO');
  const supplier=await db.from('inventory_suppliers').select('supplier_id').eq('supplier_id',supplierId).maybeSingle();if(supplier.error||!supplier.data)throw Error('INVALID_SUPPLIER');
  const old=(await db.from('inventory_media').select('*').match({entity_type:'SUPPLIER',entity_id:supplierId,position:1}).maybeSingle()).data;
  const ext=file.type.split('/')[1].replace('jpeg','jpg'),path=`supplier/${supplierId}/${crypto.randomUUID()}.${ext}`,stored=await db.storage.from('inventory-media').upload(path,file,{contentType:file.type});if(stored.error)throw stored.error;
  const saved=await db.from('inventory_media').upsert({entity_type:'SUPPLIER',entity_id:supplierId,position:1,bucket:'inventory-media',object_path:path,mime_type:file.type,byte_size:file.size,created_by:a.email},{onConflict:'entity_type,entity_id,position'});if(saved.error){await db.storage.from('inventory-media').remove([path]);throw saved.error}
  if(old)await db.storage.from(old.bucket).remove([old.object_path]);
  await audit(a,'SUPPLIER_LOGO_UPDATED',supplierId,{mime_type:file.type,byte_size:file.size});return{ok:true};
}
async function supplierContacts(a:any,b:any){
  need(a,'compras.gerenciar_fornecedores');
  const supplierId=String(b.supplier_id||''),contacts=Array.isArray(b.contacts)?b.contacts.slice(0,20):[];
  const supplier=await db.from('inventory_suppliers').select('supplier_id').eq('supplier_id',supplierId).maybeSingle();if(supplier.error||!supplier.data)throw Error('INVALID_SUPPLIER');
  const rows=contacts.map((x:any,i:number)=>({supplier_id:supplierId,name:String(x.name||'').trim()||null,email:String(x.email||'').trim().toLowerCase(),phone:String(x.phone||'').trim()||null,is_primary:!!x.is_primary||i===0,active:true}));
  if(rows.some((x:any)=>!/^\S+@\S+\.\S+$/.test(x.email)))throw Error('INVALID_CONTACT_EMAIL');
  const removed=await db.from('inventory_supplier_quote_contacts').delete().eq('supplier_id',supplierId);if(removed.error)throw removed.error;
  if(rows.length){const saved=await db.from('inventory_supplier_quote_contacts').insert(rows);if(saved.error)throw saved.error}
  await audit(a,'SUPPLIER_CONTACTS_UPDATED',supplierId,{contacts:rows.length});return{ok:true};
}
async function getSupplierContacts(a:any,u:URL){
  need(a,'compras.visualizar');const supplierId=String(u.searchParams.get('supplier_id')||'');if(!supplierId)throw Error('INVALID_SUPPLIER');const rows=await db.from('inventory_supplier_quote_contacts').select('*').eq('supplier_id',supplierId).eq('active',true).order('is_primary',{ascending:false});if(rows.error)throw rows.error;return{contacts:rows.data||[]};
}
async function latestPtax(a:any,refresh=false){
  const cached=await db.from('procurement_fx_rates').select('*').eq('base_currency','USD').eq('quote_currency','BRL').order('rate_at',{ascending:false}).limit(1).maybeSingle();if(cached.error)throw cached.error;
  if(!refresh&&cached.data&&Date.now()-new Date(cached.data.fetched_at).getTime()<30*60000)return cached.data;
  let quote:any=null,source='BCB_INDICADOR_CAMBIO';
  try{const response=await fetch('https://www.bcb.gov.br/api/servico/sitebcb/indicadorCambio',{signal:AbortSignal.timeout(12000)});if(response.ok){const payload=await response.json(),values=(Array.isArray(payload?.conteudo)?payload.conteudo:[]).filter((x:any)=>String(x.moeda||'').toLocaleLowerCase('pt-BR')==='dólar'&&Number(x.valorVenda)>0).sort((x:any,y:any)=>new Date(y.dataIndicador).getTime()-new Date(x.dataIndicador).getTime());if(values.length)quote={cotacaoVenda:values[0].valorVenda,dataHoraCotacao:values[0].dataIndicador}}}catch{}
  for(let offset=0;offset<12&&!quote;offset++){
    const d=new Date(Date.now()-offset*86400000),mdy=`${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}-${d.getUTCFullYear()}`;
    const url=`https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarDia(dataCotacao=@dataCotacao)?@dataCotacao='${mdy}'&$top=100&$format=json&$select=cotacaoVenda,dataHoraCotacao`;
    const response=await fetch(url,{signal:AbortSignal.timeout(12000)});if(!response.ok)continue;const payload=await response.json().catch(()=>({value:[]}));const values=Array.isArray(payload.value)?payload.value:[];if(values.length){quote=values.sort((x:any,y:any)=>String(y.dataHoraCotacao).localeCompare(String(x.dataHoraCotacao)))[0];source='BCB_PTAX'}
  }
  if(!quote){if(cached.data)return cached.data;throw Error('FX_UNAVAILABLE')}
  const sourceTime=String(quote.dataHoraCotacao||'').trim().replace(' ','T'),parsedTime=new Date(/(?:Z|[+-]\d\d:\d\d)$/.test(sourceTime)?sourceTime:`${sourceTime}-03:00`);
  if(!Number.isFinite(parsedTime.getTime()))throw Error('FX_UNAVAILABLE');
  const row={base_currency:'USD',quote_currency:'BRL',rate:Number(quote.cotacaoVenda),rate_at:parsedTime.toISOString(),source,fetched_by:a.email};
  const saved=await db.from('procurement_fx_rates').upsert(row,{onConflict:'base_currency,quote_currency,rate_at,source'}).select().single();if(saved.error)throw saved.error;
  await db.from('procurement_offers').update({exchange_rate_current:row.rate,exchange_rate_current_at:row.rate_at}).eq('currency','USD');
  await audit(a,'FX_REFRESHED',saved.data.fx_rate_id,{rate:row.rate,rate_at:row.rate_at,source:row.source});return saved.data;
}
async function bulkOffers(a:any,b:any){
  need(a,'compras.cotar');
  const requestId=String(b.request_id||''),supplierId=String(b.supplier_id||''),responses=Array.isArray(b.items)?b.items.slice(0,500):[];
  if(!requestId||!supplierId||!responses.length)throw Error('INVALID_QUOTE_RESPONSE');
  const link=await db.from('procurement_request_suppliers').select('*').eq('request_id',requestId).eq('supplier_id',supplierId).maybeSingle();if(link.error||!link.data)throw Error('INVALID_REQUEST_SUPPLIER');
  const items=await db.from('procurement_request_items').select('item_id,quantity').eq('request_id',requestId);if(items.error)throw items.error;const itemMap=new Map((items.data||[]).map((x:any)=>[x.item_id,x]));
  const supplier=await db.from('inventory_suppliers').select('name').eq('supplier_id',supplierId).maybeSingle();if(supplier.error||!supplier.data)throw Error('INVALID_SUPPLIER');
  const needsUsd=responses.some((x:any)=>String(x.currency||'BRL').toUpperCase()==='USD'),fx=needsUsd?await latestPtax(a,true):null,now=new Date().toISOString();
  const rows=responses.map((x:any)=>{const item:any=itemMap.get(String(x.item_id||''));if(!item)throw Error('INVALID_ITEM');const currency=String(x.currency||'BRL').toUpperCase(),unit=x.unit_price===''||x.unit_price==null?null:Number(x.unit_price),total=x.total_price===''||x.total_price==null?(unit==null?null:unit*Number(item.quantity)):Number(x.total_price),rate=currency==='USD'?Number(x.exchange_rate||fx?.rate||0)||null:null;if(unit!=null&&(!Number.isFinite(unit)||unit<0)||total!=null&&(!Number.isFinite(total)||total<0))throw Error('INVALID_PRICE');return{item_id:item.item_id,supplier_id:supplierId,supplier_name_snapshot:supplier.data.name,requested_at:link.data.sent_at||link.data.created_at,responded_at:b.responded_at||now,currency,exchange_rate:rate,exchange_rate_original:rate,exchange_rate_current:rate,exchange_rate_current_at:currency==='USD'?(fx?.rate_at||now):null,unit_price:unit,total_price:total,payment_terms:String(x.payment_terms||b.payment_terms||'').trim()||null,delivery_days:x.delivery_days===''||x.delivery_days==null?null:Number(x.delivery_days),delivery_method:String(x.delivery_method||'').trim()||null,supplier_reference:String(x.supplier_reference||'').trim()||null,notes:String(x.notes||'').trim()||null,response_source:'XLSX_IMPORT',response_file_name:String(b.file_name||'').slice(0,240)||null,created_by:a.email,updated_at:now}});
  const saved=await db.from('procurement_offers').insert(rows);if(saved.error)throw saved.error;
  await db.from('procurement_request_suppliers').update({status:'RESPONDIDA',responded_at:b.responded_at||now,updated_at:now}).eq('request_id',requestId).eq('supplier_id',supplierId);
  await db.from('procurement_request_items').update({status:'COTANDO'}).eq('request_id',requestId);
  await db.from('procurement_requests').update({status:'COTANDO',updated_at:now}).eq('request_id',requestId).neq('status','ENCERRADO');
  await audit(a,'QUOTE_RESPONSE_IMPORTED',requestId,{supplier_id:supplierId,items:rows.length,file_name:b.file_name||null});return{ok:true,items:rows.length,fx};
}
async function requestStatus(a:any,b:any){
  if(!can(a,'compras.cotar')&&!can(a,'compras.aprovar'))throw Error('FORBIDDEN');
  const requestId=String(b.request_id||''),target=String(b.status||'').toUpperCase();if(!['ENCERRADO','REABRIR'].includes(target))throw Error('INVALID_STATUS');
  const current=await db.from('procurement_requests').select('request_id,status').eq('request_id',requestId).maybeSingle();if(current.error||!current.data)throw Error('INVALID_REQUEST');
  let status='ENCERRADO',cancelledOrders:string[]=[];if(target==='REABRIR'){
    const items=await db.from('procurement_request_items').select('item_id').eq('request_id',requestId);if(items.error)throw items.error;const ids=(items.data||[]).map((x:any)=>x.item_id);let offerCount=0;
    if(ids.length){
      const offers=await db.from('procurement_offers').select('offer_id',{count:'exact',head:true}).in('item_id',ids);if(offers.error)throw offers.error;offerCount=offers.count||0;
      const orderItems=await db.from('procurement_order_items').select('order_id,received_quantity').in('request_item_id',ids);if(orderItems.error)throw orderItems.error;
      if((orderItems.data||[]).some((x:any)=>Number(x.received_quantity||0)>0))throw Error('REQUEST_HAS_RECEIPTS');
      const orderIds=[...new Set((orderItems.data||[]).map((x:any)=>String(x.order_id)))];
      if(orderIds.length){const orders=await db.from('procurement_orders').select('order_id,status').in('order_id',orderIds);if(orders.error)throw orders.error;cancelledOrders=(orders.data||[]).filter((x:any)=>!['CANCELADO','RECEBIDO'].includes(x.status)).map((x:any)=>x.order_id);if(cancelledOrders.length){const cancelled=await db.from('procurement_orders').update({status:'CANCELADO',updated_at:new Date().toISOString()}).in('order_id',cancelledOrders);if(cancelled.error)throw cancelled.error}}
      const resetOffers=await db.from('procurement_offers').update({selected:false,updated_at:new Date().toISOString()}).in('item_id',ids);if(resetOffers.error)throw resetOffers.error;
      const resetItems=await db.from('procurement_request_items').update({status:offerCount?'COTANDO':'SOLICITADA'}).in('item_id',ids);if(resetItems.error)throw resetItems.error;
    }
    status=offerCount?'COTANDO':'SOLICITADA';
  }
  const updated=await db.from('procurement_requests').update({status,updated_at:new Date().toISOString()}).eq('request_id',requestId);if(updated.error)throw updated.error;await audit(a,status==='ENCERRADO'?'REQUEST_CLOSED':'REQUEST_REOPENED',requestId,{before:current.data.status,after:status,cancelled_orders:cancelledOrders});return{ok:true,status,cancelled_orders:cancelledOrders};
}
async function requestSuppliers(a:any,b:any){
  if(!can(a,'compras.cotar')&&!can(a,'compras.criar_solicitacao'))throw Error('FORBIDDEN');
  const requestId=String(b.request_id||''),supplierIds=[...new Set((Array.isArray(b.supplier_ids)?b.supplier_ids:[]).map(String).filter(Boolean))],now=new Date().toISOString();if(!supplierIds.length)throw Error('SELECT_SUPPLIERS_FIRST');
  const request=await db.from('procurement_requests').select('request_id,status').eq('request_id',requestId).maybeSingle();if(request.error||!request.data||!['SOLICITADA','COTANDO','APROVADA'].includes(request.data.status))throw Error('INVALID_REQUEST_EDIT');
  const suppliers=await db.from('inventory_suppliers').select('supplier_id').in('supplier_id',supplierIds).eq('status','ATIVO');if(suppliers.error)throw suppliers.error;if((suppliers.data||[]).length!==supplierIds.length)throw Error('INVALID_SUPPLIER');
  const items=await db.from('procurement_request_items').select('item_id').eq('request_id',requestId);if(items.error)throw items.error;const itemIds=(items.data||[]).map((x:any)=>x.item_id);
  const offers=itemIds.length?await db.from('procurement_offers').select('supplier_id').in('item_id',itemIds):{data:[],error:null};if(offers.error)throw offers.error;const responded=new Set((offers.data||[]).map((x:any)=>String(x.supplier_id)));
  const removed=await db.from('procurement_request_suppliers').delete().eq('request_id',requestId);if(removed.error)throw removed.error;
  const rows=supplierIds.map((supplier_id:string)=>({request_id:requestId,supplier_id,status:responded.has(supplier_id)?'RESPONDIDA':'PENDENTE',responded_at:responded.has(supplier_id)?now:null,created_by:a.email,updated_at:now}));const saved=await db.from('procurement_request_suppliers').insert(rows);if(saved.error)throw saved.error;
  if(itemIds.length){const selected=await db.from('procurement_offers').update({selected:false,updated_at:now}).in('item_id',itemIds);if(selected.error)throw selected.error;const itemStatus=await db.from('procurement_request_items').update({status:offers.data?.length?'COTANDO':'SOLICITADA'}).in('item_id',itemIds);if(itemStatus.error)throw itemStatus.error}
  const nextStatus=offers.data?.length?'COTANDO':'SOLICITADA';const updated=await db.from('procurement_requests').update({status:nextStatus,updated_at:now}).eq('request_id',requestId);if(updated.error)throw updated.error;
  await audit(a,'REQUEST_SUPPLIERS_UPDATED',requestId,{supplier_ids:supplierIds});return{ok:true,status:nextStatus,supplier_ids:supplierIds};
}
async function deleteRequest(a:any,b:any){
  if(!a.admin)throw Error('FORBIDDEN');
  const requestId=String(b.request_id||''),reason=String(b.reason||'Limpeza de cotações antigas').trim().slice(0,500),now=new Date().toISOString();
  const current=await db.from('procurement_requests').select('request_id,request_number,title,status,deleted_at').eq('request_id',requestId).maybeSingle();if(current.error||!current.data||current.data.deleted_at)throw Error('INVALID_REQUEST');
  const updated=await db.from('procurement_requests').update({deleted_at:now,deleted_by:a.email,deletion_reason:reason,updated_at:now}).eq('request_id',requestId).is('deleted_at',null).select('request_id');if(updated.error||!updated.data?.length)throw Error('INVALID_REQUEST');
  await audit(a,'REQUEST_DELETED',requestId,{request_number:current.data.request_number,title:current.data.title,status:current.data.status,reason});return{ok:true,deleted_at:now};
}
async function orderTracking(a:any,b:any){
  if(!can(a,'compras.cotar')&&!can(a,'compras.emitir_pedido')&&!can(a,'compras.receber'))throw Error('FORBIDDEN');
  const orderId=String(b.order_id||''),status=String(b.tracking_status||'').toUpperCase();if(!['AGUARDANDO_ENVIO','EM_TRANSPORTE','ENTREGUE'].includes(status))throw Error('INVALID_TRACKING_STATUS');
  const now=new Date().toISOString(),row={tracking_status:status,tracking_code:String(b.tracking_code||'').trim().slice(0,200)||null,tracking_url:String(b.tracking_url||'').trim().slice(0,1000)||null,shipped_at:b.shipped_at||null,tracking_updated_at:now,tracking_updated_by:a.email,updated_at:now};
  const updated=await db.from('procurement_orders').update(row).eq('order_id',orderId).select('order_id');if(updated.error||!updated.data?.length)throw Error('INVALID_ORDER');await audit(a,'ORDER_TRACKING_UPDATED',orderId,row);return{ok:true};
}
async function orderDocument(a:any,r:Request){
  if(!can(a,'compras.receber')&&!can(a,'compras.emitir_pedido'))throw Error('FORBIDDEN');const form=await r.formData(),file=form.get('file'),orderId=String(form.get('order_id')||''),requestedKind=String(form.get('kind')||'').toUpperCase();
  if(!(file instanceof File)||!orderId||file.size<=0||file.size>20971520)throw Error('INVALID_ORDER_DOCUMENT');
  const lower=file.name.toLowerCase(),isSupplierOrder=requestedKind==='SUPPLIER_PURCHASE_ORDER',allowedSupplier=/\.(pdf|png|jpe?g|xlsx?|docx?)$/.test(lower);let kind=isSupplierOrder&&allowedSupplier?'SUPPLIER_PURCHASE_ORDER':lower.endsWith('.xml')?'NFE_XML':lower.endsWith('.pdf')?'DANFE_PDF':'';if(!kind)throw Error('INVALID_ORDER_DOCUMENT');
  const order=await db.from('procurement_orders').select('order_id').eq('order_id',orderId).maybeSingle();if(order.error||!order.data)throw Error('INVALID_ORDER');
  const ext=(lower.match(/\.([a-z0-9]+)$/)?.[1]||'bin'),path=`orders/${orderId}/${crypto.randomUUID()}.${ext}`,mime=file.type||(kind==='NFE_XML'?'application/xml':kind==='DANFE_PDF'?'application/pdf':'application/octet-stream'),uploaded=await db.storage.from('procurement-documents').upload(path,file,{contentType:mime});if(uploaded.error)throw uploaded.error;
  const saved=await db.from('procurement_order_documents').insert({order_id:orderId,kind,bucket:'procurement-documents',object_path:path,file_name:file.name.slice(0,240),mime_type:file.type||mime,file_size:file.size,created_by:a.email}).select().single();if(saved.error){await db.storage.from('procurement-documents').remove([path]);throw saved.error}await audit(a,'ORDER_DOCUMENT_ADDED',orderId,{document_id:saved.data.document_id,kind,file_name:saved.data.file_name});return{ok:true,document:saved.data};
}
async function getOrderDocument(a:any,u:URL){
  need(a,'compras.visualizar');const documentId=String(u.searchParams.get('document_id')||'');if(!documentId)throw Error('INVALID_ORDER_DOCUMENT');const document=await db.from('procurement_order_documents').select('*').eq('document_id',documentId).maybeSingle();if(document.error||!document.data)throw Error('INVALID_ORDER_DOCUMENT');const signed=await db.storage.from(document.data.bucket).createSignedUrl(document.data.object_path,300);if(signed.error)throw signed.error;return{url:signed.data.signedUrl,file_name:document.data.file_name};
}
async function quoteResponseDocument(a:any,r:Request){
  need(a,'compras.cotar');const form=await r.formData(),file=form.get('file'),requestId=String(form.get('request_id')||''),supplierId=String(form.get('supplier_id')||'');if(!(file instanceof File)||!requestId||!supplierId||file.size<=0||file.size>20971520||!(/\.xlsx?$/i.test(file.name)))throw Error('INVALID_QUOTE_RESPONSE');const link=await db.from('procurement_request_suppliers').select('request_supplier_id').eq('request_id',requestId).eq('supplier_id',supplierId).maybeSingle();if(link.error||!link.data)throw Error('INVALID_REQUEST_SUPPLIER');const ext=file.name.toLowerCase().endsWith('.xls')?'xls':'xlsx',path=`responses/${requestId}/${supplierId}/${crypto.randomUUID()}.${ext}`,mime=file.type||(ext==='xlsx'?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'application/vnd.ms-excel'),uploaded=await db.storage.from('procurement-documents').upload(path,file,{contentType:mime});if(uploaded.error)throw uploaded.error;const saved=await db.from('procurement_response_documents').insert({request_id:requestId,supplier_id:supplierId,object_path:path,file_name:file.name.slice(0,240),mime_type:mime,file_size:file.size,uploaded_by:a.email}).select().single();if(saved.error){await db.storage.from('procurement-documents').remove([path]);throw saved.error}await audit(a,'QUOTE_RESPONSE_DOCUMENT_ADDED',requestId,{document_id:saved.data.document_id,supplier_id:supplierId,file_name:saved.data.file_name});return{ok:true,document:saved.data};
}
async function markSent(a:any,b:any){
  if(!can(a,'compras.cotar')&&!can(a,'compras.exportar'))throw Error('FORBIDDEN');const requestId=String(b.request_id||''),supplierId=String(b.supplier_id||''),now=new Date().toISOString();const updated=await db.from('procurement_request_suppliers').update({status:'ENVIADA',sent_at:now,updated_at:now}).eq('request_id',requestId).eq('supplier_id',supplierId).select('request_supplier_id');if(updated.error||!updated.data?.length)throw Error('INVALID_REQUEST_SUPPLIER');await audit(a,'QUOTE_SENT',requestId,{supplier_id:supplierId});return{ok:true,sent_at:now};
}
async function requestHistory(a:any,u:URL){
  need(a,'compras.visualizar_valores');const requestId=String(u.searchParams.get('request_id')||'');if(!requestId)throw Error('INVALID_REQUEST');const items=await db.from('procurement_request_items').select('item_id,inventory_product_id,description').eq('request_id',requestId);if(items.error)throw items.error;const productIds=[...new Set((items.data||[]).map((x:any)=>x.inventory_product_id).filter(Boolean))];if(!productIds.length)return{history:[]};const prices=await db.from('inventory_supplier_price_history').select('*').in('product_id',productIds).order('purchased_at',{ascending:false}).limit(500);if(prices.error)throw prices.error;const supplierIds=[...new Set((prices.data||[]).map((x:any)=>x.supplier_id).filter(Boolean))],suppliers=supplierIds.length?await db.from('inventory_suppliers').select('supplier_id,name').in('supplier_id',supplierIds):{data:[]};const names=new Map((suppliers.data||[]).map((x:any)=>[x.supplier_id,x.name]));return{history:(prices.data||[]).map((x:any)=>({...x,supplier_name:names.get(x.supplier_id)||'Fornecedor não informado'}))};
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
    if(req.method==='GET'&&path==='health')return reply({ok:true,version:2});
    if(req.method==='GET'&&path==='bootstrap')return reply(await bootstrap(a));
    if(req.method==='GET'&&path==='fx')return reply({fx:await latestPtax(a,new URL(req.url).searchParams.get('refresh')==='1')});
    if(req.method==='GET'&&path==='request-history')return reply(await requestHistory(a,new URL(req.url)));
    if(req.method==='GET'&&path==='order-document')return reply(await getOrderDocument(a,new URL(req.url)));
    if(req.method==='GET'&&path==='supplier-contacts')return reply(await getSupplierContacts(a,new URL(req.url)));
    if(req.method==='POST'&&path==='request')return reply(await saveRequest(a,await req.json()));
    if(req.method==='POST'&&path==='offer')return reply(await saveOffer(a,await req.json()));
    if(req.method==='POST'&&path==='select-offer')return reply(await selectOffer(a,await req.json()));
    if(req.method==='POST'&&path==='issue-orders')return reply(await issueOrders(a,await req.json()));
    if(req.method==='POST'&&path==='receive')return reply(await receive(a,await req.json()));
    if(req.method==='POST'&&path==='supplier')return reply(await supplier(a,await req.json()));
    if(req.method==='POST'&&path==='supplier-logo')return reply(await supplierLogo(a,req));
    if(req.method==='POST'&&path==='supplier-contacts')return reply(await supplierContacts(a,await req.json()));
    if(req.method==='POST'&&path==='bulk-offers')return reply(await bulkOffers(a,await req.json()));
    if(req.method==='POST'&&path==='request-status')return reply(await requestStatus(a,await req.json()));
    if(req.method==='POST'&&path==='request-suppliers')return reply(await requestSuppliers(a,await req.json()));
    if(req.method==='POST'&&path==='delete-request')return reply(await deleteRequest(a,await req.json()));
    if(req.method==='POST'&&path==='order-tracking')return reply(await orderTracking(a,await req.json()));
    if(req.method==='POST'&&path==='order-document')return reply(await orderDocument(a,req));
    if(req.method==='POST'&&path==='quote-response-document')return reply(await quoteResponseDocument(a,req));
    if(req.method==='POST'&&path==='mark-sent')return reply(await markSent(a,await req.json()));
    if(req.method==='POST'&&path==='suggest-product')return reply(await suggestProduct(a,await req.json()));
    if(req.method==='POST'&&path==='link-item')return reply(await linkItem(a,await req.json()));
    return reply({error:'NOT_FOUND'},404);
  }catch(error){
    const message=String(error?.message||error),status=message.includes('UNAUTHORIZED')?401:message.includes('FORBIDDEN')?403:message==='REQUEST_HAS_RECEIPTS'||message==='ACTIVE_ORDERS_EXIST'?409:message.includes('INVALID')||message.includes('SELECT_')?400:500;
    if(a&&status===403)await db.from('access_audit').insert({actor_email:a.email,action:'PROCUREMENT_ACCESS_DENIED',target:'procurement-api',detail:{message}}).catch(()=>{});
    return reply({error:message},status);
  }
});
