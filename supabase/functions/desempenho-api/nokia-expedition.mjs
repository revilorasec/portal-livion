// Read-only action through the existing signed Expedition bridge. No boxes/writes.
export async function readNokiaExpedition(env,fetcher=fetch){
 const url=env('EXPEDICAO_NOKIA_URL'),secret=env('EXPEDICAO_NOKIA_SECRET');
 if(!url||!secret)throw Error('Origem de expedição Nokia não configurada.');
 const target=new URL(url);if(target.protocol!=='https:'||target.hostname!=='script.google.com'||!/^\/macros\/s\/[\w-]+\/exec$/.test(target.pathname))throw Error('Origem Nokia inválida.');
 const timestamp=Date.now(),nonce=crypto.randomUUID(),data=JSON.stringify({action:'read'}),input=`${timestamp}\n${nonce}\n${data}`;
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const signature=[...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(input)))].map(n=>n.toString(16).padStart(2,'0')).join('');
 target.searchParams.set('requestId',nonce);
 let response=await fetcher(target,{method:'POST',redirect:'manual',cache:'no-store',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({timestamp,nonce,data,signature}),signal:AbortSignal.timeout(55000)});
 for(let hop=0;response.status>=300&&response.status<400&&hop<3;hop++){
  const next=new URL(response.headers.get('location'),target);if(next.protocol!=='https:'||next.hostname!=='script.googleusercontent.com'||next.pathname!=='/macros/echo'||![302,303].includes(response.status))throw Error('Redirecionamento Nokia recusado.');
  response=await fetcher(next,{method:'GET',redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(55000)});
 }
 if(!response.ok)throw Error('A origem de expedição Nokia recusou a leitura.');
 const result=await response.json();
 if(result.ok!==true||result.client!=='nokia'||result.schemaVersion!==1||result.sheet!=='BD_Nokia'||!Array.isArray(result.rows))throw Error('Resposta da expedição Nokia incompatível: '+String(result.error||'SCHEMA'));
 const seen=new Set();const rows=result.rows.map(row=>{const id=String(row.A??'').trim();if(!id||seen.has(id)||!Object.hasOwn(row,'U'))throw Error('IDs ou coluna U inválidos na origem Nokia.');seen.add(id);return {ID:id,'Data da Expedição':String(row.U??'').trim(),'Status do Atendimento':String(row.Y??'').trim()};});
 if(!rows.length)throw Error('Origem de expedição Nokia vazia.');
 return {rows,updatedAt:result.capturedAt||new Date().toISOString()};
}
