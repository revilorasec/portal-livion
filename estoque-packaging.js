(function(){
  const PACKAGING_API='https://kvfjjtkwxxbvzlicwnrz.supabase.co/functions/v1/inventory-packaging-api';
  let packaging=new Map();

  async function packagingApi(path,opt={}){
    const send=async current=>fetch(PACKAGING_API+path,{...opt,headers:{authorization:'Bearer '+current,'content-type':'application/json',...(opt.headers||{})},cache:'no-store'});
    token=await renewToken(false)||token;let response=await send(token);
    if(response.status===401){token=await renewToken(true)||token;response=await send(token)}
    const body=await response.json().catch(()=>({}));
    if(!response.ok){const messages={INSUFFICIENT_STOCK:'O saldo não possui essa quantidade de embalagens completas.',DISPATCH_NOT_CONFIGURED:'Configure primeiro a quantidade por rolo ou embalagem.',BALANCE_REQUIRED:'O produto precisa ter saldo positivo para calcular a divisão.',INVALID_DISPATCH_COUNT:'Informe uma quantidade inteira de rolos ou embalagens.'};throw new Error(messages[body.error]||body.error||'Não foi possível concluir a operação.')}
    return body;
  }

  async function loadPackaging(){const result=await packagingApi('/bootstrap');packaging=new Map((result.configurations||[]).map(row=>[row.product_id,row]));return packaging}
  const configFor=id=>packaging.get(id)||null;
  const quantityLabel=(movement,product)=>movement.dispatch_quantity!=null&&movement.dispatch_unit?`${fmt(movement.dispatch_quantity)} ${movement.dispatch_unit} (${fmt(movement.quantity)} ${product?.unit||''})`:`${fmt(movement.quantity)} ${product?.unit||''}`;

  const productOptionsBase=movementProductOptions;
  movementProductOptions=function(){return'<option value="">Digite o PN ou a descrição…</option>'+(D.stock||[]).filter(p=>p.status!=='INATIVO').map(p=>`<option value="${esc(p.product_id)}">${esc(p.pn)} — ${esc(p.description)} · Saldo: ${fmt(p.balance)} ${esc(p.unit||'')}</option>`).join('')};

  function decorateProductSelects(root=document){
    if(!D?.stock)return;
    const byId=new Map(D.stock.map(p=>[p.product_id,p]));
    root.querySelectorAll('select').forEach(select=>{
      let matches=0;
      [...select.options].forEach(option=>{const product=byId.get(option.value);if(!product)return;matches++;if(!/\bSaldo:/i.test(option.text))option.text+=` · Saldo: ${fmt(product.balance)} ${product.unit||''}`});
      if(matches&&select._comboRefresh)select._comboRefresh();
    });
  }

  const modalBase=modal;
  modal=function(title,html,fn){const result=modalBase(title,html,fn);decorateProductSelects($('modalBody'));queueMicrotask(()=>decorateProductSelects($('modalBody')));return result};

  function dispatchPreview(product){
    const config=configFor(product?.product_id);
    if(!product)return'<small class="muted">Digite para pesquisar e selecione um item.</small>';
    const photosHtml=gallery(product),base=`<label>Produto selecionado</label>${photosHtml}<small class="muted"><b>${esc(product.pn)}</b> — ${esc(product.description)}</small><div class="packaging-stock"><b>Estoque atual: ${fmt(product.balance)} ${esc(product.unit||'')}</b>`;
    if(!config)return base+'<small>Baixa na unidade padrão do cadastro.</small></div>';
    return base+`<small>Disponível para saída: <b>${fmt(config.available_dispatch_quantity)} ${esc(config.dispatch_unit)}</b></small><small>Cada ${esc(config.dispatch_unit.toLowerCase())} baixa ${fmt(config.base_quantity_per_dispatch_unit)} ${esc(product.unit||'')}.</small></div>`;
  }

  manualExit=function(){
    const exitIdempotencyKey=crypto.randomUUID();
    modal('Registrar saída',`<div class="form">${movementDateFields('SAIDA')}<div class="field full"><label>Produto</label><select id="fProduct">${movementProductOptions()}</select></div><div id="fProductPreview" class="field full"><small class="muted">Digite para pesquisar e selecione um item.</small></div><div class="field"><label id="fQtyLabel">Quantidade</label><input id="fQty" type="number" min="0" step="any"></div><div class="field"><label>Solicitante</label><select id="fParty">${opts((D.requesters||[]).filter(x=>personStatus(x)==='ATIVO'),'requester_id','name','Digite para pesquisar o solicitante…')}</select></div><div id="fRequesterPreview" class="field full"><small class="muted">Selecione o solicitante para visualizar sua foto.</small></div><div class="field"><label>Finalidade</label><select id="fPurpose"><option value="CONSUMO_INTERNO">Consumo interno</option><option value="PROJETO">Projeto</option><option value="MANUTENCAO">Manutenção</option><option value="LABORATORIO_TESTE">Laboratório / teste</option><option value="PERDA_AVARIA">Perda / avaria</option></select></div><div class="field"><label>Referência (opcional)</label><input id="fDoc"></div><div class="field full"><label>Foto do solicitante segurando o item retirado</label><input id="mp1" type="file" accept="image/jpeg,image/png,image/webp" capture="environment"></div><div class="field full"><label>Observações</label><textarea id="fNotes"></textarea></div></div>`,async()=>{
      const product=(D.stock||[]).find(x=>x.product_id===$('fProduct').value),qty=Number($('fQty').value),config=configFor(product?.product_id);
      if(!product||!Number.isFinite(qty)||qty<=0)throw new Error('Selecione o produto e informe uma quantidade válida.');
      if(!$('fParty').value)throw new Error('Selecione o solicitante.');
      if(config&&!Number.isInteger(qty))throw new Error(`Informe uma quantidade inteira de ${config.dispatch_unit.toLowerCase()}.`);
      if(product.evidence_required&&!$('mp1').files[0])throw new Error('Este produto exige uma foto da retirada.');
      const common={product_id:product.product_id,requester_id:$('fParty').value,purpose:$('fPurpose').value,document_number:$('fDoc').value.trim()||null,notes:$('fNotes').value.trim()||null,occurred_at:selectedOccurredAt(),idempotency_key:exitIdempotencyKey};
      const result=config?await packagingApi('/exit',{method:'POST',body:JSON.stringify({...common,dispatch_quantity:qty})}):await api('/movement',{method:'POST',body:JSON.stringify({...common,movement_type:'SAIDA',quantity:qty})});
      if($('mp1').files[0])await uploadPhotos('MOVEMENT',result.id,'mp',1);
      closeModal();flash(config?`Saída de ${fmt(qty)} ${config.dispatch_unit} registrada.`:'Saída registrada.');await reload();
    });
    wireMovementDateFields();
    const product=$('fProduct'),preview=$('fProductPreview'),qty=$('fQty');
    product.onchange=()=>{const selected=(D.stock||[]).find(x=>x.product_id===product.value),config=configFor(product.value);preview.innerHTML=dispatchPreview(selected);$('fQtyLabel').textContent=config?`Quantidade de ${config.dispatch_unit.toLowerCase()}`:'Quantidade';qty.step=config?'1':'any';qty.placeholder=config?`Máximo: ${config.available_dispatch_quantity}`:''};
    makeSearchableDropdown('fProduct',()=>product.onchange());
    const party=$('fParty');party.onchange=()=>{const requester=(D.requesters||[]).find(x=>x.requester_id===party.value);$('fRequesterPreview').innerHTML=requester?`<label>Solicitante selecionado</label>${gallery({photo_url:requester.photo_url})}<small class="muted"><b>${esc(requester.name)}</b>${requester.department?' · '+esc(requester.department):''}</small>`:'<small class="muted">Selecione o solicitante para visualizar sua foto.</small>'};
    makeSearchableDropdown('fParty',()=>party.onchange());makeSearchableDropdown('fPurpose');
  };

  const movementBase=movement;movement=function(type){if(type==='SAIDA')manualExit();else movementBase(type)};

  function appendPackagingEditor(product){
    if(!product.product_id||!D.permissions?.product)return;
    const form=$('modalBody').querySelector('.form');if(!form||$('packagingEditor'))return;
    const config=configFor(product.product_id),count=config?.available_dispatch_quantity||'',balance=Number(product.balance||0);
    const section=document.createElement('div');section.id='packagingEditor';section.className='field full packaging-editor';
    section.innerHTML=`<div><b>Saída por rolo ou embalagem</b><small>Use quando a nota entra em ${esc(product.unit||'unidade base')}, mas a retirada acontece por rolo, caixa ou pacote.</small></div><div class="packaging-current"><b>Saldo atual: ${fmt(balance)} ${esc(product.unit||'')}</b>${config?`<span>Configuração atual: 1 ${esc(config.dispatch_unit)} = ${fmt(config.base_quantity_per_dispatch_unit)} ${esc(product.unit||'')}</span>`:''}</div><div class="packaging-fields"><label>Unidade de retirada<input id="dispatchUnit" value="${esc(config?.dispatch_unit||'ROLO')}" placeholder="Ex.: ROLO"></label><label>Quantas unidades formam o saldo atual<input id="dispatchCount" type="number" min="1" step="1" value="${esc(count)}" placeholder="Ex.: 20"></label></div><div id="dispatchCalculation" class="packaging-calculation"></div><div class="actions"><button type="button" class="btn primary" id="saveDispatchConfig">Salvar forma de baixa</button>${config?'<button type="button" class="btn" id="removeDispatchConfig">Remover configuração</button>':''}</div>`;
    form.appendChild(section);
    const update=()=>{const units=Number($('dispatchCount').value),name=$('dispatchUnit').value.trim()||'unidade';$('dispatchCalculation').textContent=Number.isInteger(units)&&units>0&&balance>0?`${fmt(balance)} ${product.unit||''} ÷ ${fmt(units)} ${name.toLowerCase()} = ${fmt(balance/units)} ${product.unit||''} por ${name.toLowerCase()}.`:'Informe quantas unidades físicas correspondem ao saldo atual.'};
    $('dispatchCount').oninput=update;$('dispatchUnit').oninput=update;update();
    $('saveDispatchConfig').onclick=async()=>{const button=$('saveDispatchConfig');button.disabled=true;try{const result=await packagingApi('/configure',{method:'POST',body:JSON.stringify({product_id:product.product_id,base_unit:$('pUnit')?.value||product.unit,dispatch_unit:$('dispatchUnit').value,dispatch_count:Number($('dispatchCount').value)})});packaging.set(product.product_id,result);flash(`Configurado: 1 ${result.dispatch_unit} = ${fmt(result.base_quantity_per_dispatch_unit)} ${result.base_unit}.`);closeModal();await reload();const current=(D.stock||[]).find(x=>x.product_id===product.product_id);if(current)openProduct(current)}catch(error){alert(error.message);button.disabled=false}};
    if($('removeDispatchConfig'))$('removeDispatchConfig').onclick=async()=>{await packagingApi('/configure',{method:'POST',body:JSON.stringify({product_id:product.product_id,disable:true})});packaging.delete(product.product_id);flash('Forma de baixa removida.');closeModal();await reload()};
  }

  const openProductBase=openProduct;openProduct=function(product={}){openProductBase(product);appendPackagingEditor(product)};

  const reloadBase=reload;reload=async function(){await reloadBase();await loadPackaging();decorateProductSelects(document)};

  const detailBase=openMovementDetail;
  openMovementDetail=function(movement){detailBase(movement);const product=(D.stock||[]).find(x=>x.product_id===movement.product_id);if(movement.dispatch_quantity!=null){const quantityBlocks=[...$('modalBody').querySelectorAll('.movement-detail-grid>div')].find(node=>node.querySelector('small')?.textContent==='Quantidade');if(quantityBlocks)quantityBlocks.querySelector('b').textContent=quantityLabel(movement,product)}};

  const renderMovBase=renderMov;
  renderMov=function(){renderMovBase();$('movBody')?.querySelectorAll('[data-movement-id]').forEach(row=>{const movement=(D.recent||[]).find(item=>item.movement_id===row.dataset.movementId);if(!movement?.dispatch_unit)return;const product=(D.stock||[]).find(item=>item.product_id===movement.product_id),cell=row.children[4];if(cell)cell.innerHTML=`<b>${esc(quantityLabel(movement,product))}</b>`})};

  window.InventoryPackaging={reload:loadPackaging,configFor,quantityLabel};
  const style=document.createElement('style');style.textContent='.packaging-stock,.packaging-current{display:grid;gap:4px;margin-top:8px;padding:10px;border:1px solid #cbdcf2;border-radius:10px;background:#f3f7fd}.packaging-stock small,.packaging-editor small{display:block;color:var(--muted)}.packaging-editor{padding:14px;border:1px solid #cbdcf2;border-radius:12px;background:#f8fbff}.packaging-fields{display:grid;grid-template-columns:1fr 1fr;gap:10px}.packaging-fields label{display:grid;gap:5px}.packaging-calculation{padding:10px;border-radius:9px;background:#fff8dc;color:#725900;font-weight:700}@media(max-width:620px){.packaging-fields{grid-template-columns:1fr}}';document.head.appendChild(style);
  loadPackaging().then(()=>{decorateProductSelects(document);renderMov()}).catch(()=>{});
})();
