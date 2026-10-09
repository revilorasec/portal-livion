/* OpenAI Decisions API suggests duplicate inventory registrations; users approve every merge. */
(function(){
  const AI_API='https://kvfjjtkwxxbvzlicwnrz.supabase.co/functions/v1/inventory-duplicate-ai';
  const hero=document.querySelector('#cadastros .hero');
  if(!hero)return;
  let actions=hero.querySelector('.actions');
  if(!actions){actions=document.createElement('div');actions.className='actions';hero.appendChild(actions)}
  const button=document.createElement('button');
  button.type='button';button.className='btn';button.id='analyzeDuplicates';
  button.textContent='Analisar duplicidades';button.hidden=true;actions.appendChild(button);

  async function analyze(){
    const send=async currentToken=>fetch(AI_API,{
      method:'POST',
      headers:{authorization:'Bearer '+currentToken,'content-type':'application/json'},
      body:JSON.stringify({maximum:24}),
      cache:'no-store'
    });
    token=await renewToken(false)||token;
    let response=await send(token);
    if(response.status===401){token=await renewToken(true)||token;response=await send(token)}
    const body=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(body.error||'AI_UNAVAILABLE');
    return body;
  }

  function productLabel(product){
    return '<b>'+esc(product.pn||'Sem PN')+'</b><span>'+esc(product.description||'Sem descrição')+'</span>'+
      '<small>'+esc(product.item_type||'')+' · '+esc(product.category||'')+' · '+esc(product.unit||'')+' · Saldo '+fmt(product.balance)+'</small>';
  }

  function renderCandidates(result){
    const rows=(result.candidates||[]).filter(row=>Number(row.probability)>=.40);
    if(!rows.length){
      $('modalBody').innerHTML='<div class="empty"><b>Nenhuma duplicidade provável foi encontrada.</b><p>Os cadastros continuam disponíveis para revisão manual.</p></div>';
      return;
    }
    $('modalBody').innerHTML='<div class="duplicate-summary"><b>'+rows.length+' possíveis duplicidades para revisar</b><p>A IA somente sugere. A mesclagem depende da sua escolha e confirmação.</p></div>'+
      '<div class="duplicate-list">'+rows.map((row,index)=>{
        const probability=Math.round(Number(row.probability)*100);
        const level=probability>=85?'high':probability>=65?'medium':'review';
        return '<article class="duplicate-card"><div class="duplicate-head"><span class="duplicate-score '+level+'">'+probability+'% de probabilidade</span><small>'+esc((row.signals||[]).join(' · ')||'Semelhança de cadastro')+'</small></div>'+
          '<div class="duplicate-pair"><div>'+productLabel(row.left)+'</div><div>'+productLabel(row.right)+'</div></div>'+
          '<button type="button" class="btn" data-review-duplicate="'+index+'">Comparar e decidir</button></article>';
      }).join('')+'</div><p class="duplicate-footnote">Cadastros abaixo do limite de revisão não são exibidos. Nenhuma mesclagem é automática.</p>';
    $('modalBody').querySelectorAll('[data-review-duplicate]').forEach(review=>{
      review.onclick=()=>{
        const row=rows[Number(review.dataset.reviewDuplicate)];
        const left=(D.stock||[]).find(product=>product.product_id===row.left.product_id)||row.left;
        const right=(D.stock||[]).find(product=>product.product_id===row.right.product_id)||row.right;
        window.InventoryRegistryMerge?.reviewPair('PRODUCT',left,right);
      };
    });
  }

  button.onclick=async()=>{
    if(button.disabled)return;
    button.disabled=true;
    modal('Analisar cadastros duplicados','<div class="empty">Comparando componentes e insumos…</div>',async()=>{});
    $('modalSave').hidden=true;
    try{renderCandidates(await analyze())}
    catch(error){
      const messages={
        OPENAI_NOT_CONFIGURED:'A chave da OpenAI ainda não foi cadastrada no servidor.',
        OPENAI_KEY_INVALID:'A chave da OpenAI precisa ser corrigida.',
        OPENAI_CREDITS_REQUIRED:'O projeto da OpenAI está sem créditos de API ou atingiu o limite de gastos. Verifique o faturamento do projeto na OpenAI.',
        OPENAI_ACCESS_DENIED:'O projeto da OpenAI não tem acesso à análise solicitada.',
        AI_REQUEST_INVALID:'A configuração da análise precisa ser atualizada.',
        AI_BUSY:'A OpenAI está ocupada. Tente novamente em alguns instantes.',
        AI_TIMEOUT:'A análise demorou além do esperado. Tente novamente.',
        FORBIDDEN:'Seu acesso não permite analisar ou mesclar cadastros.',
        UNAUTHORIZED:'Sua sessão expirou. Atualize o Portal.'
      };
      $('modalBody').innerHTML='<div class="empty"><b>Não foi possível concluir a análise.</b><p>'+esc(messages[error.message]||'O serviço de análise está temporariamente indisponível.')+'</p></div>';
    }finally{button.disabled=false}
  };

  const renderBase=render;
  render=function(){renderBase();button.hidden=!D?.permissions?.product};

  const style=document.createElement('style');
  style.textContent='.duplicate-summary{padding:12px;border:1px solid #cbdcf2;border-radius:10px;background:#f3f7fd}.duplicate-summary p,.duplicate-footnote{margin:5px 0 0;color:var(--muted)}.duplicate-list{display:grid;gap:12px;margin-top:12px}.duplicate-card{display:grid;gap:11px;padding:13px;border:1px solid var(--line);border-radius:12px;background:#fff}.duplicate-head{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}.duplicate-score{padding:5px 8px;border-radius:999px;font-size:11px;font-weight:800}.duplicate-score.high{background:#e5f5ec;color:#0b6c3c}.duplicate-score.medium{background:#fff2cf;color:#8a5a00}.duplicate-score.review{background:#eef2f7;color:#53657d}.duplicate-pair{display:grid;grid-template-columns:1fr 1fr;gap:10px}.duplicate-pair>div{padding:11px;border:1px solid #d9e3ef;border-radius:9px;background:#f9fbfe}.duplicate-pair span,.duplicate-pair small{display:block}.duplicate-pair span{margin-top:3px}.duplicate-pair small{margin-top:5px;color:var(--muted)}@media(max-width:700px){.duplicate-pair{grid-template-columns:1fr}}';
  document.head.appendChild(style);
})();
