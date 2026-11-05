// The authenticated wrapper keeps credentials. Opaque content receives only bounded module data.
export function attachTransceiversBridge({frame,isActive,call,version}){
 const busy=new Set();
 addEventListener('message',async event=>{
  const m=event.data;if(event.source!==frame.contentWindow||event.origin!=='null'||!isActive()||m?.type!=='LIVION_TRANSCEIVERS_REQUEST'||!['load','catalog','operation','accounting-stock','bank-notes','bank-note'].includes(m.action)||typeof m.requestId!=='string'||!/^[a-f0-9-]{36}$/.test(m.requestId)||busy.has(m.requestId)||busy.size>=12)return;
  let encoded;try{encoded=JSON.stringify(m.payload??{});}catch{return;}if(new TextEncoder().encode(encoded).length>12000)return;
  const current=version();busy.add(m.requestId);
  try{
   const path=['bank-notes','bank-note'].includes(m.action)?'/bank-notes':m.action==='accounting-stock'?'/accounting-stock':m.action==='load'?'/transceivers':m.action==='catalog'?'/transceivers/catalog':'/transceivers/operations';
   const response=await call(path,['load','accounting-stock','bank-notes'].includes(m.action)?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:encoded});
   const result=await response.json();if(current===version()&&isActive()&&event.source===frame.contentWindow)event.source.postMessage({type:'LIVION_TRANSCEIVERS_RESPONSE',requestId:m.requestId,ok:true,result},'*');
  }catch(error){if(current===version()&&isActive())event.source.postMessage({type:'LIVION_TRANSCEIVERS_RESPONSE',requestId:m.requestId,ok:false,error:String(error.message).slice(0,80)},'*');}
  finally{busy.delete(m.requestId);}
 });
}
