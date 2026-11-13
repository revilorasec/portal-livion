(function(){
  let requests=[],loading=null,loadedAt=0,loadError='';
  const canReview=()=>!!D?.permissions?.productDelete;
  const pending=()=>requests.filter(x=>x.status==='PENDENTE');
  const productName=row=>`${row.product_pn||''}${row.product_name&&row.product_name!==row.product_pn?' — '+row.product_name:''}`;
  const currentProduct=id=>(D.stock||[]).find(x=>x.product_id===id);

  async function loadRequests(force=false){
    if(loading)return loading;if(loadedAt&&Date.now()-loadedAt<30000&&!force)return requests;
    loading=api('/product-delete-requests').then(result=>{requests=result.requests||[];loadedAt=Date.now();loadError='';ensureQueueButton();renderQueue();return requests}).catch(error=>{loadError=error.message||'Não foi possível carregar as solicitações.';renderQueue();throw error}).finally(()=>loading=null);return loading;
  }
  function cleanupButtons(){document.querySelectorAll('.product-delete-request-button,.product-delete-admin-button').forEach(x=>x.remove())}
  function requestFor(productId){return pending().find(x=>x.product_id===productId)}

  function openSuggestion(product){
    modal('Solicitar exclusão do estoque',`<div class="delete-request-form"><div class="delete-request-product"><small>Item marcado para análise</small><b>${esc(product.pn)} — ${esc(product.description)}</b><span>Saldo atual: ${fmt(product.balance||0)} ${esc(product.unit||'')}</span></div><div class="field"><label>Por que este cadastro pode ser excluído ou mesclado?</label><textarea id="deleteRequestReason" placeholder="Ex.: cadastro duplicado, nome incorreto ou item que não é mais utilizado"></textarea></div><p class="delete-request-help">Nada será excluído agora. Uma pessoa autorizada analisará se o item deve ser mesclado, mantido ou retirado de uso.</p></div>`,async()=>{
      const reason=$('deleteRequestReason').value.trim();if(reason.length<3)throw new Error('Informe o motivo da solicitação.');
      await api('/product-delete-request',{method:'POST',body:JSON.stringify({action:'CREATE',product_id:product.product_id,reason})});closeModal();flash('Solicitação de exclusão enviada para análise.');await loadRequests(true)
    });$('modalSave').textContent='Enviar para análise';
  }
  function openReject(request){
    modal('Recusar solicitação',`<div class="delete-request-form"><div class="delete-request-product"><b>${esc(productName(request))}</b><span>Solicitado por ${esc(request.requested_by)}</span></div><div class="field"><label>Motivo da recusa</label><textarea id="deleteDecisionNotes" placeholder="Explique por que o item deve permanecer"></textarea></div></div>`,async()=>{const notes=$('deleteDecisionNotes').value.trim();if(notes.length<3)throw new Error('Informe o motivo da recusa.');await api('/product-delete-request',{method:'POST',body:JSON.stringify({action:'REJECT',request_id:request.request_id,decision_notes:notes})});closeModal();flash('Solicitação recusada.');await loadRequests(true);openQueue()});$('modalSave').textContent='Recusar solicitação';
  }
  function openInactivate(request,product){
    const record=request||{product_id:product.product_id,product_pn:product.pn,product_name:product.description,product_unit:product.unit,balance_at_request:product.balance,reason:'Exclusão direta pelo administrador'};
    modal('Excluir item do uso',`<div class="delete-request-form"><div class="delete-request-warning"><b>O cadastro ficará INATIVO.</b><span>Movimentações, notas, arquivos, saldo e auditoria serão preservados.</span></div><div class="delete-request-product"><b>${esc(productName(record))}</b><span>Saldo registrado: ${fmt(record.balance_at_request||0)} ${esc(record.product_unit||'')}</span>${request?`<span>Solicitado por ${esc(record.requested_by)}</span><span>Motivo: ${esc(record.reason)}</span>`:''}</div><div class="field"><label>Decisão do administrador</label><textarea id="deleteDecisionNotes">${esc(request?'Exclusão aprovada após análise.':'Exclusão direta pelo administrador.')}</textarea></div></div>`,async()=>{
      const notes=$('deleteDecisionNotes').value.trim();if(notes.length<3)throw new Error('Informe o motivo da decisão.');await api('/product-delete-request',{method:'POST',body:JSON.stringify({action:'INACTIVATE',request_id:request?.request_id||null,product_id:record.product_id,decision_notes:notes})});closeModal();flash('Item retirado de uso. O histórico foi preservado.');await reload();await loadRequests(true)
    });$('modalSave').textContent='Confirmar exclusão do uso';$('modalSave').classList.add('bad');
  }
  function openMergeRequest(request){
    const source=currentProduct(request.product_id);if(!source){alert('O cadastro solicitado não está mais disponível. Atualize a fila.');return}
    let selected=null,stage='choose';
    const candidates=()=> (D.stock||[]).filter(x=>x.product_id!==source.product_id&&x.status!=='INATIVO').sort((a,b)=>String(a.pn||'').localeCompare(String(b.pn||''),'pt-BR'));
    modal('Mesclar item marcado',`<div class="delete-request-form"><div class="delete-request-product"><small>Cadastro que será retirado</small><b>${esc(source.pn)} — ${esc(source.description)}</b><span>Saldo: ${fmt(source.balance||0)} ${esc(source.unit||'')}</span></div><div class="field"><label>Pesquisar cadastro correto que permanecerá</label><input id="mergeRequestSearch" type="search" placeholder="Digite PN ou descrição" autocomplete="off"></div><div id="mergeRequestCandidates" class="merge-request-candidates"></div><div id="mergeRequestPreview"></div></div>`,async()=>{
      if(stage==='choose'){
        if(!selected)throw new Error('Escolha o cadastro correto que deverá permanecer.');if(source.unit&&selected.unit&&String(source.unit).toUpperCase()!==String(selected.unit).toUpperCase())throw new Error('As unidades são diferentes. Corrija a unidade antes de mesclar.');
        const preview=await api('/registry-merge',{method:'POST',body:JSON.stringify({entity_type:'PRODUCT',source_id:source.product_id,target_id:selected.product_id,apply:false})}),finalBalance=Number(source.balance||0)+Number(selected.balance||0);
        $('mergeRequestPreview').innerHTML=`<div class="merge-request-preview"><b>Confira antes de concluir</b><p><strong>${esc(source.pn)}</strong> será incorporado a <strong>${esc(selected.pn)} — ${esc(selected.description)}</strong>.</p><p>Saldo final: <b>${fmt(source.balance||0)} + ${fmt(selected.balance||0)} = ${fmt(finalBalance)} ${esc(selected.unit||source.unit||'')}</b></p><p>${fmt(preview.counts?.movements||0)} movimentação(ões), ${fmt(preview.counts?.invoice_items||0)} item(ns) de nota e os demais vínculos serão preservados.</p></div>`;
        $('mergeRequestSearch').disabled=true;$('mergeRequestCandidates').classList.add('hidden');stage='confirm';$('modalSave').textContent='Confirmar mesclagem';return;
      }
      await api('/registry-merge',{method:'POST',body:JSON.stringify({entity_type:'PRODUCT',source_id:source.product_id,target_id:selected.product_id,apply:true})});closeModal();flash('Produto mesclado. A solicitação saiu da fila e o saldo ficou pendente de conferência.');await reload();await loadRequests(true)
    });
    const renderCandidates=()=>{const term=String($('mergeRequestSearch').value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(),rows=candidates().filter(x=>!term||`${x.pn} ${x.description}`.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(term)).slice(0,40);$('mergeRequestCandidates').innerHTML=rows.map(x=>`<button type="button" class="merge-request-option ${selected?.product_id===x.product_id?'selected':''}" data-merge-target="${esc(x.product_id)}"><b>${esc(x.pn)}</b><span>${esc(x.description)} · Saldo ${fmt(x.balance||0)} ${esc(x.unit||'')}</span></button>`).join('')||'<div class="empty">Nenhum cadastro encontrado.</div>'};
    $('mergeRequestSearch').oninput=renderCandidates;$('mergeRequestCandidates').onclick=event=>{const option=event.target.closest('[data-merge-target]');if(!option)return;selected=candidates().find(x=>x.product_id===option.dataset.mergeTarget);renderCandidates()};renderCandidates();$('modalSave').textContent='Revisar mesclagem';
  }
  function renderQueue(){
    const host=$('productDeleteRequestList');if(!host)return;
    if(loadError){host.innerHTML=`<div class="empty" role="alert">${esc(loadError)} Use Atualizar solicitações para tentar novamente.</div>`;return}
    const filter=$('deleteRequestStatus')?.value||'PENDENTE',visible=filter==='TODOS'?requests:requests.filter(row=>row.status===filter);
    host.innerHTML=visible.map(row=>`<article class="delete-request-card" data-delete-request="${esc(row.request_id)}"><div class="delete-request-card-head"><div><small>Produto marcado</small><b>${esc(productName(row))}</b></div><span class="badge warn">${esc(row.status)}</span></div><div class="delete-request-data"><span>Saldo ao solicitar: <b>${fmt(row.balance_at_request||0)} ${esc(row.product_unit||'')}</b></span><span>Solicitado por <b>${esc(row.requested_by)}</b></span><span>Em <b>${dt(row.requested_at)}</b></span></div><p><b>Motivo:</b> ${esc(row.reason)}</p>${row.status!=='PENDENTE'?`<p><b>Decisão:</b> ${esc(row.decision_notes||'')} · ${esc(row.reviewed_by||'')} · ${dt(row.reviewed_at)}</p>`:canReview()?`<div class="actions">${D.user?.administrator?'<button type="button" class="btn merge-delete-request">Mesclar</button>':''}<button type="button" class="btn reject-delete-request">Manter / recusar</button><button type="button" class="btn bad approve-delete-request">Excluir do uso</button></div>`:''}</article>`).join('')||'<div class="empty">Nenhuma solicitação neste filtro.</div>';
    host.querySelectorAll('[data-delete-request]').forEach(card=>{const request=visible.find(x=>x.request_id===card.dataset.deleteRequest),merge=card.querySelector('.merge-delete-request'),reject=card.querySelector('.reject-delete-request'),approve=card.querySelector('.approve-delete-request');if(merge)merge.onclick=()=>openMergeRequest(request);if(reject)reject.onclick=()=>openReject(request);if(approve)approve.onclick=()=>openInactivate(request,null)})
  }
  function openQueue(){
    document.querySelectorAll('.nav button').forEach(button=>button.classList.toggle('active',button.id==='productDeleteReviewButton'));
    document.querySelectorAll('.view').forEach(view=>view.classList.toggle('active',view.id==='deleteRequests'));
    renderQueue();loadRequests(true).catch(()=>{});
  }
  function openNewRequest(){
    const products=(D.stock||[]).filter(product=>product.status!=='INATIVO');
    modal('Solicitar exclusão',`<div class="field"><label for="deleteRequestSearch">Buscar por PN ou descrição</label><input id="deleteRequestSearch" type="search"></div><div class="field"><label for="deleteRequestProduct">Item do estoque</label><select id="deleteRequestProduct"></select></div>`,()=>{const product=products.find(row=>row.product_id===$('deleteRequestProduct').value);if(!product)throw new Error('Escolha um item do estoque.');openSuggestion(product)});
    const update=()=>{const term=$('deleteRequestSearch').value.toLocaleLowerCase('pt-BR');$('deleteRequestProduct').innerHTML='<option value="">Selecione…</option>'+products.filter(row=>`${row.pn} ${row.description}`.toLocaleLowerCase('pt-BR').includes(term)).map(row=>`<option value="${esc(row.product_id)}">${esc(row.pn)} — ${esc(row.description)}</option>`).join('')};$('deleteRequestSearch').oninput=update;update();$('modalSave').textContent='Continuar';
  }
  async function openPermissions(){
    const result=await api('/product-delete-permissions');
    modal('Quem pode excluir itens do estoque',`<p class="delete-request-help">Os selecionados poderão excluir itens e aprovar ou recusar solicitações. Administradores gerais já têm essa permissão.</p><div class="delete-permission-users">${result.users.map(user=>`<label class="delete-request-product"><span><input type="checkbox" data-delete-user="${esc(user.id)}" ${user.allowed?'checked':''} ${user.editable?'':'disabled'}> <b>${esc(user.name||user.email)}</b></span><small>${esc(user.email)} · ${esc(user.profile)}</small><span data-permission-result="${esc(user.id)}" role="status"></span></label>`).join('')}</div>`,async()=>{
      const changes=[...document.querySelectorAll('[data-delete-user]:not(:disabled)')].filter(input=>input.checked!==result.users.find(user=>user.id===input.dataset.deleteUser)?.allowed);
      for(const input of changes){await api('/product-delete-permissions',{method:'POST',body:JSON.stringify({user_id:input.dataset.deleteUser,allowed:input.checked})});result.users.find(user=>user.id===input.dataset.deleteUser).allowed=input.checked;document.querySelector(`[data-permission-result="${input.dataset.deleteUser}"]`).textContent='Permissão salva.'}
      closeModal();flash('Permissões de exclusão salvas.');
    });$('modalSave').textContent='Salvar permissões';
  }
  function ensureQueueButton(){
    if(!D?.user)return;const button=$('productDeleteReviewButton');if(!button)return;button.onclick=openQueue;
    $('deleteRequestStatus').onchange=renderQueue;$('newDeleteRequest').onclick=openNewRequest;$('deletePermissions').onclick=()=>openPermissions().catch(error=>alert(error.message));$('refreshDeleteRequests').onclick=()=>loadRequests(true).catch(()=>{});
    $('deletePermissions').classList.toggle('hidden',!D.user.administrator);$('deleteRequestsHelp').textContent=canReview()?'Analise os pedidos e decida se o item deve ser mantido ou retirado de uso.':'Solicite a exclusão de um item e acompanhe aqui as suas solicitações.';
    const count=pending().length;button.textContent=`Solicitações de exclusão${loadedAt?' ('+count+')':''}`;
  }
  function addProductAction(product){
    cleanupButtons();if(!product.product_id||product.status==='INATIVO')return;const existing=requestFor(product.product_id),button=document.createElement('button');button.type='button';button.className=canReview()?'btn bad product-delete-admin-button':'btn product-delete-request-button';
    if(canReview()){button.textContent='Excluir do estoque';button.onclick=()=>openInactivate(null,product)}else if(existing){button.textContent='Exclusão aguardando análise';button.disabled=true}else{button.textContent='Solicitar exclusão';button.onclick=()=>openSuggestion(product)}$('modalCancel').before(button);
    if(!canReview()){$('pStatus')?.querySelector('option[value="INATIVO"],option:last-child')?.setAttribute('disabled','')}
  }

  const modalBase=modal;modal=function(...args){cleanupButtons();$('modalBody')?.parentElement?.classList.remove('inventory-product-dialog');$('modalSave').classList.remove('bad');return modalBase(...args)};
  const closeBase=closeModal;closeModal=function(){cleanupButtons();return closeBase()};
  const productBase=openProduct;openProduct=function(product={}){cleanupButtons();productBase(product);const body=$('modalBody'),dialog=body?.parentElement;dialog?.classList.add('inventory-product-dialog');if(dialog)dialog.scrollTop=0;if(body)body.scrollTop=0;if(product.product_id)addProductAction(product)};
  const renderBase=render;render=function(){renderBase();ensureQueueButton();loadRequests().catch(()=>{})};
  if(D?.user){ensureQueueButton();loadRequests().catch(()=>{})}
  const style=document.createElement('style');style.textContent='#modal .inventory-product-dialog{display:flex;flex-direction:column;overflow:hidden;max-height:92vh;min-height:0}#modal .inventory-product-dialog>#modalTitle{flex:0 0 auto}#modal .inventory-product-dialog>#modalBody{flex:1 1 auto;min-height:0;overflow:auto;overscroll-behavior:contain}#modal .inventory-product-dialog>.modal-actions{flex:0 0 auto;flex-wrap:wrap;padding-top:12px;border-top:1px solid var(--line);background:#fff}.delete-request-form{display:grid;gap:14px}.delete-request-product,.delete-request-warning,.merge-request-preview{display:grid;gap:5px;padding:13px;border:1px solid #cbdcf2;border-radius:11px;background:#f3f7fd}.delete-request-product small,.delete-request-product b,.delete-request-product span{display:block}.delete-request-product span,.delete-request-help{color:var(--muted)}.delete-request-warning{border-color:#efb6b9;background:#fff5f5;color:#8f1d25}.delete-request-list{display:grid;gap:12px;margin-top:14px}.delete-request-card{display:grid;gap:10px;padding:14px;border:1px solid #d8e1ed;border-radius:12px}.delete-request-card-head,.delete-request-data{display:flex;gap:12px;justify-content:space-between;flex-wrap:wrap}.delete-request-card-head small,.delete-request-card-head b{display:block}.delete-request-data{justify-content:flex-start;color:var(--muted)}.delete-request-card p{margin:0}.merge-request-candidates{display:grid;gap:7px;max-height:330px;overflow:auto}.merge-request-option{display:grid;gap:3px;text-align:left;padding:10px;border:1px solid #d8e1ed;border-radius:9px;background:#fff;cursor:pointer}.merge-request-option span{color:var(--muted)}.merge-request-option.selected{border-color:#214f8f;background:#eef5ff}.merge-request-preview{border-color:#e6c55a;background:#fffaf0}.merge-request-preview p{margin:5px 0}.product-delete-request-button{border-color:#d59b24;color:#8b5a00}';document.head.appendChild(style);
})();
