(function(){
  const countLabels={movements:'movimentações históricas',balance:'saldo atual',invoices:'notas fiscais',invoice_items:'itens de notas fiscais',lots:'lotes de estoque',supplier_links:'vínculos com fornecedores',product_links:'produtos vinculados',price_records:'registros de preços',files:'arquivos',compatible_parts:'peças compatíveis',purchase_links:'vínculos no app de compras'};
  const entityLabel=type=>type==='PRODUCT'?'produto':'fornecedor';
  const entityName=(type,row)=>type==='PRODUCT'?`${row.pn} — ${row.description}`:row.name;
  const entityId=(type,row)=>type==='PRODUCT'?row.product_id:row.supplier_id;

  function cleanupActionButtons(){document.querySelectorAll('.registry-merge-button,.person-delete').forEach(x=>x.remove())}
  function candidates(type,targetId){const rows=type==='PRODUCT'?(D.stock||[]):(D.suppliers||[]);return rows.filter(x=>entityId(type,x)!==targetId).sort((a,b)=>entityName(type,a).localeCompare(entityName(type,b),'pt-BR'))}
  function countRows(counts={}){return Object.entries(counts).filter(([,value])=>Number(value)!==0).map(([key,value])=>`<li><b>${esc(value)}</b> ${esc(countLabels[key]||key)}</li>`).join('')||'<li>Nenhum vínculo adicional; somente o cadastro duplicado será ocultado.</li>'}

  function openMerge(type,target){
    cleanupActionButtons();
    const targetId=entityId(type,target),rows=candidates(type,targetId),label=entityLabel(type),targetName=entityName(type,target);
    modal(`Mesclar ${label} duplicado`,`<div class="merge-registry"><div class="merge-keep"><small>Cadastro correto que permanecerá</small><b>${esc(targetName)}</b></div><div class="field"><label>Escolha o cadastro incorreto</label><select id="mergeSource"><option value="">Selecione…</option>${rows.map(x=>`<option value="${esc(entityId(type,x))}">${esc(entityName(type,x))}${String(x.status||'ATIVO').toUpperCase()==='INATIVO'?' · INATIVO':''}</option>`).join('')}</select></div><p class="merge-help">Os saldos, notas, produtos vinculados, compras, arquivos e histórico passarão a aparecer no cadastro correto. O nome incorreto deixará de aparecer nas listas, mas a auditoria será preservada.</p><div id="mergePreview"></div></div>`,async()=>{
      const sourceId=$('mergeSource').value;if(!sourceId)throw new Error(`Escolha o ${label} incorreto.`);
      const preview=await api('/registry-merge',{method:'POST',body:JSON.stringify({entity_type:type,source_id:sourceId,target_id:targetId,apply:false})});
      $('mergePreview').innerHTML=`<div class="merge-preview"><b>Confira antes de concluir</b><p><strong>${esc(preview.source_name)}</strong> será incorporado a <strong>${esc(preview.target_name)}</strong>.</p><ul>${countRows(preview.counts)}</ul><p>O cadastro incorreto ficará oculto e não poderá mais ser escolhido em novas operações.</p></div>`;
      $('mergeSource').disabled=true;$('modalSave').textContent='Confirmar mesclagem';
      saveFn=async()=>{await api('/registry-merge',{method:'POST',body:JSON.stringify({entity_type:type,source_id:sourceId,target_id:targetId,apply:true})});closeModal();flash(`${label[0].toUpperCase()+label.slice(1)} mesclado com sucesso.`);await reload()}
    });
    $('modalSave').textContent='Revisar mesclagem';
    if(typeof upgradeSearchableSelects==='function')upgradeSearchableSelects($('modalBody'));
  }

  function reviewPair(type,left,right){
    cleanupActionButtons();
    const leftId=entityId(type,left),rightId=entityId(type,right),label=entityLabel(type);
    let stage='choose',sourceId='',targetId='',preview=null;
    const choiceHtml='<div class="merge-registry"><p class="merge-help">A IA encontrou uma possível duplicidade. Escolha o cadastro correto que deverá permanecer. Nenhuma alteração será feita sem a sua confirmação.</p>'+
      '<label class="merge-option"><input type="radio" name="mergeKeep" value="'+esc(leftId)+'"><span><b>'+esc(entityName(type,left))+'</b><small>Saldo: '+esc(left.balance??'—')+' · '+esc(left.unit||'')+'</small></span></label>'+
      '<label class="merge-option"><input type="radio" name="mergeKeep" value="'+esc(rightId)+'"><span><b>'+esc(entityName(type,right))+'</b><small>Saldo: '+esc(right.balance??'—')+' · '+esc(right.unit||'')+'</small></span></label><div id="mergePreview"></div></div>';
    modal('Revisar possível '+label+' duplicado',choiceHtml,async()=>{
      if(stage==='choose'){
        targetId=document.querySelector('input[name="mergeKeep"]:checked')?.value||'';
        if(!targetId)throw new Error('Escolha o cadastro correto que deverá permanecer.');
        sourceId=targetId===leftId?rightId:leftId;
        preview=await api('/registry-merge',{method:'POST',body:JSON.stringify({entity_type:type,source_id:sourceId,target_id:targetId,apply:false})});
        $('mergePreview').innerHTML='<div class="merge-preview"><b>Confira antes de concluir</b><p><strong>'+esc(preview.source_name)+'</strong> será incorporado a <strong>'+esc(preview.target_name)+'</strong>.</p><ul>'+countRows(preview.counts)+'</ul><p>O cadastro incorreto ficará oculto. O histórico e a auditoria serão preservados.</p></div>';
        document.querySelectorAll('input[name="mergeKeep"]').forEach(input=>input.disabled=true);
        stage='confirm';$('modalSave').textContent='Confirmar mesclagem';return;
      }
      await api('/registry-merge',{method:'POST',body:JSON.stringify({entity_type:type,source_id:sourceId,target_id:targetId,apply:true})});
      closeModal();flash(label[0].toUpperCase()+label.slice(1)+' mesclado com sucesso.');await reload();
    });
    $('modalSave').textContent='Revisar mesclagem';
  }
  function addButton(type,row){
    const id=entityId(type,row);if(!id)return;
    document.querySelectorAll('.registry-merge-button').forEach(x=>x.remove());
    const allowed=type==='PRODUCT'?D.permissions?.product:D.permissions?.supplier;if(!allowed)return;
    const button=document.createElement('button');button.type='button';button.className='btn registry-merge-button';button.textContent='Mesclar cadastro duplicado';button.onclick=()=>openMerge(type,row);$('modalCancel').before(button);
  }

  const productBase=openProduct;openProduct=function(row={}){cleanupActionButtons();productBase(row);if(row.product_id)addButton('PRODUCT',row)};
  const personBase=person;person=function(kind,row={}){cleanupActionButtons();personBase(kind,row);if(kind==='supplier'&&row.supplier_id)addButton('SUPPLIER',row)};

  window.InventoryRegistryMerge={reviewPair};

  const style=document.createElement('style');style.textContent='.registry-merge-button{border-color:#8aa4c6;color:#173f73}.merge-registry{display:grid;gap:14px}.merge-keep,.merge-preview{padding:13px;border:1px solid #cbdcf2;border-radius:11px;background:#f3f7fd}.merge-keep small,.merge-keep b{display:block}.merge-keep small{color:var(--muted);margin-bottom:4px}.merge-help{margin:0;color:var(--muted)}.merge-option{display:flex;gap:10px;align-items:flex-start;padding:12px;border:1px solid #cbdcf2;border-radius:10px;background:#fff;cursor:pointer}.merge-option input{margin-top:4px}.merge-option span,.merge-option b,.merge-option small{display:block}.merge-option small{color:var(--muted);margin-top:3px}.merge-preview{border-color:#e6c55a;background:#fffaf0}.merge-preview p{margin:7px 0}.merge-preview ul{margin:8px 0;padding-left:20px}';document.head.appendChild(style);
})();

