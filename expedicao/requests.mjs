// Bound the whole request, including authentication and reading the response body.
// A timed-out mutation is never replayed: its result must be checked by reading.
export async function requestJson({url,body,getToken,authToken,fetcher=fetch,timeoutMs=140000}){
 const controller=new AbortController();let timer;
 const expired=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();const error=Error(body?'A resposta demorou além do esperado. Atualize o BD e confira se há um salvamento pendente antes de gerar novamente. Nenhum envio foi repetido.':'A consulta demorou além do esperado. Tente Atualizar BD.');error.code='REQUEST_TIMEOUT';reject(error);},timeoutMs);});
 const request=(async()=>{
  const send=async force=>{const token=authToken||await getToken(force);if(controller.signal.aborted)throw Error('REQUEST_TIMEOUT');return fetcher(url,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,cache:'no-store',signal:controller.signal});};
  let response=await send(false);if(!body&&response.status===401)response=await send(true);
  const result=await response.json().catch(()=>({message:'O serviço retornou uma resposta inválida.'}));
  if(!response.ok){const error=Error(result.message||'Não foi possível concluir a operação.');error.code=result.code;throw error;}return result;
 })();
 try{return await Promise.race([expired,request]);}finally{clearTimeout(timer);}
}

export async function generateAndRefresh({generate,refresh,report,key}){
 let result;
 try{result=await generate();}catch(error){report(error.message,'error');try{await refresh(key);}catch{}throw error;}
 const message=result.alreadyDispatched?'Nova cópia salva e conferida na pasta central. A data original da expedição foi preservada.':'Excel salvo e conferido na pasta central. A nota foi marcada como Expedido e está disponível no histórico.';
 // A subsequent Google read cannot hide a confirmed central save.
 report(message,'success');
 try{await refresh(key);}catch{report(message+' A lista não pôde ser atualizada agora; use Atualizar BD.','success');return result;}
 report(message,'success');return result;
}
