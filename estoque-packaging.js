(function(){
  const PACKAGING_API='https://kvfjjtkwxxbvzlicwnrz.supabase.co/functions/v1/inventory-packaging-api';
  let packaging=new Map();

  async function packagingApi(path,opt={}){
    const send=async current=>fetch(PACKAGING_API+path,{...opt,headers:{authorization:'Bearer '+current,'content-type':'application/json',...(opt.headers||{})},cache:'no-store'});
    token=await renewToken(false)||token;let response=await send(token);
    if(response.status===401){token=await renewToken(true)||token;response=await send(token)}
    const body=await response.json().catch(()=>({}));
    if(!response.ok){const messages={INSUFFICIENT_STOCK:'O saldo não possui essa quantidade de subpartes completas.',DISPATCH_NOT_CONFIGURED:'Configure primeiro a quantidade por rolo, frasco ou embalagem.',BALANCE_REQUIRED:'Informe uma quantidade positiva em quilos ou litros.',INVALID_DISPATCH_COUNT:'Informe uma quantidade inteira de rolos, frascos ou embalagens.',DISPATCH_FACTOR_CONFLICT:'Este produto já usa outro peso ou volume por subparte. Revise a configuração ou cadastre o tamanho diferente como outro produto.'};throw new Error(messages[body.error]||body.error||'Não foi possível concluir a operação.')}
    return body;
  }

  async function loadPackaging(){const result=await packagingApi('/bootstrap');packaging=new Map((result.configurations||[]).map(row=>[row.product_id,row]));return packaging}
  const configFor=id=>packaging.get(id)||null;
  const quantityLabel=(movement,product)=>movement.dispatch_quantity!=null&&movement.dispatch_unit?`${fmt(movement.dispatch_quantity)} ${movement.dispatch_unit} (${fmt(movement.quantity)} ${product?.unit||''})`:`${fmt(movement.quantity)} ${product?.unit||''}`;
  const normalizeBaseUnit=value=>{const unit=String(value||'').trim().toUpperCase();return unit==='KG'||unit==='KILO'||unit==='QUILOS'?'QUILOGRAMA':unit==='L'||unit==='LT'||unit==='LITROS'?'LITRO':unit};
  const isFractionableUnit=value=>['QUILOGRAMA','LITRO'].includes(normalizeBaseUnit(value));
  const singular=value=>String(value||'unidade').trim().toLowerCase().replace(/s$/i,'');
  const detailMeasure=(factor,unit)=>normalizeBaseUnit(unit)==='QUILOGRAMA'?`${fmt(factor)} kg (${fmt(factor*1000)} g)`:normalizeBaseUnit(unit)==='LITRO'?`${fmt(factor)} L (${fmt(factor*1000)} ml)`:`${fmt(factor)} ${unit||''}`;
  function configurationSummary(baseQuantity,baseUnit,count,dispatchUnit){const factor=Number(baseQuantity)/Number(count);if(!Number.isFinite(factor)||factor<=0||!Number.isInteger(Number(count)))return'';return `<b>${fmt(count)} ${esc(String(dispatchUnit||'SUBPARTES').toUpperCase())} = ${fmt(baseQuantity)} ${esc(normalizeBaseUnit(baseUnit))}</b><span>Cada ${esc(singular(dispatchUnit))}: ${esc(detailMeasure(factor,baseUnit))}</span>`}
  function fractionFields(prefix,baseQuantity,baseUnit,defaultDispatch='ROLINHO'){
    const visible=isFractionableUnit(baseUnit),unit=normalizeBaseUnit(baseUnit);
    return `<section id="${prefix}FractionPanel" class="fraction-entry ${visible?'':'hidden'}"><label class="fraction-check"><input id="${prefix}FractionEnabled" type="checkbox"> Esta quantidade está dividida em partes iguais</label><div id="${prefix}FractionFields" class="packaging-fields hidden"><label>Tipo de subparte<select id="${prefix}DispatchUnit"><option>ROLINHO</option><option>ROLO</option><option>FRASCO</option><option>GALÃO</option><option>BOBINA</option><option>PACOTE</option><option>BALDE</option><option>OUTRO</option></select></label><label>Quantidade de subpartes<input id="${prefix}DispatchCount" type="number" min="1" step="1" placeholder="Ex.: 20"></label></div><div id="${prefix}FractionSummary" class="packaging-calculation hidden"></div><small>A unidade de estoque continuará sendo ${esc(unit||'kg ou litro')}; as saídas poderão ser feitas pela subparte.</small></section>`;
  }
  function wireFractionFields(prefix,getBaseQuantity,getBaseUnit){
    const enabled=$(prefix+'FractionEnabled'),fields=$(prefix+'FractionFields'),summary=$(prefix+'FractionSummary');if(!enabled)return;
    const refresh=()=>{fields.classList.toggle('hidden',!enabled.checked);const text=configurationSummary(getBaseQuantity(),getBaseUnit(),Number($(prefix+'DispatchCount').value),$(prefix+'DispatchUnit').value);summary.innerHTML=text;summary.classList.toggle('hidden',!enabled.checked||!text)};
    enabled.onchange=refresh;$(prefix+'DispatchCount').oninput=refresh;$(prefix+'DispatchUnit').onchange=refresh;refresh();return refresh;
  }
  function fractionPayload(prefix,productId,baseQuantity,baseUnit){
    if(!$(prefix+'FractionEnabled')?.checked)return null;const count=Number($(prefix+'DispatchCount').value),dispatchUnit=$(prefix+'DispatchUnit').value;
    if(!Number.isInteger(count)||count<=0)throw new Error('Informe quantas subpartes iguais foram recebidas.');
    return{product_id:productId,base_unit:normalizeBaseUnit(baseUnit),base_quantity:Number(baseQuantity),dispatch_unit:dispatchUnit,dispatch_count:count};
  }

  const productOptionsBase=movementProductOptions;
  movementProductOptions=function(){return'<option value="">Digite o PN ou a descrição…</option>'+(D.stock||[]).filter(p=>p.status!=='INATIVO').map(p=>{const config=configFor(p.product_id),stock=config?`${fmt(config.available_dispatch_quantity)} ${config.dispatch_unit} = ${fmt(p.balance)} ${p.unit||''}`:`${fmt(p.balance)} ${p.unit||''}`;return `<option value="${esc(p.product_id)}">${esc(p.pn)} — ${esc(p.description)} · Saldo: ${esc(stock)}</option>`}).join('')};

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
    return base+`<small>Estoque disponível: <b>${fmt(config.available_dispatch_quantity)} ${esc(config.dispatch_unit)}</b></small><small>Equivalente a: <b>${fmt(product.balance)} ${esc(product.unit||'')}</b></small><small>Cada ${esc(singular(config.dispatch_unit))}: <b>${esc(detailMeasure(config.base_quantity_per_dispatch_unit,product.unit))}</b></small></div>`;
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

  manualEntry=function(){
    const idempotencyKey=crypto.randomUUID(),unitOptions=['UNIDADE','QUILOGRAMA','LITRO','METRO','PEÇA','CAIXA','PACOTE'];
    modal('Registrar entrada manual',`<div class="form">${movementDateFields('ENTRADA')}<div class="field full"><label>Produto</label><select id="fProduct">${movementProductOptions()}</select></div><div id="fProductPreview" class="field full"><small class="muted">Digite para pesquisar e selecione um item.</small></div><div class="field"><label>Quantidade recebida</label><input id="fQty" type="number" min="0" step="any"></div><div class="field"><label>Unidade da entrada</label><select id="entryBaseUnit">${unitOptions.map(unit=>`<option>${unit}</option>`).join('')}</select></div><div id="entryFractionHost" class="field full"></div><div class="field"><label>Fornecedor</label><select id="fParty">${opts((D.suppliers||[]).filter(x=>personStatus(x)==='ATIVO'),'supplier_id','name','Digite para pesquisar o fornecedor…')}</select></div><div class="field"><label>Valor total da entrada (R$)</label><input id="fTotal" type="number" step="0.01" min="0"></div><div class="field"><label>NF / referência</label><input id="fDoc"></div><div class="field full"><label>Anexar ou fotografar DANFE / nota fiscal</label><input id="manualDanfe" type="file" accept=".pdf,application/pdf,image/jpeg,image/png,image/webp" capture="environment"></div><div class="field full"><label>Observações</label><textarea id="fNotes"></textarea></div></div>`,async()=>{
      const product=(D.stock||[]).find(x=>x.product_id===$('fProduct').value),quantity=Number($('fQty').value),baseUnit=normalizeBaseUnit($('entryBaseUnit').value);
      if(!product||!Number.isFinite(quantity)||quantity<=0)throw new Error('Selecione o produto e informe uma quantidade válida.');
      const fraction=fractionPayload('entry',product.product_id,quantity,baseUnit);if(fraction)await packagingApi('/configure',{method:'POST',body:JSON.stringify(fraction)});
      const total=$('fTotal').value===''?null:Number($('fTotal').value);if(total!=null&&(!Number.isFinite(total)||total<0))throw new Error('Informe um valor total válido.');
      const result=await api('/movement',{method:'POST',body:JSON.stringify({movement_type:'ENTRADA',product_id:product.product_id,quantity,supplier_id:$('fParty').value||null,total_value:total,unit_value:total!=null?total/quantity:null,document_number:$('fDoc').value.trim()||null,notes:$('fNotes').value.trim()||null,occurred_at:selectedOccurredAt(),idempotency_key:idempotencyKey})});
      if($('manualDanfe').files[0])await uploadDocument($('manualDanfe').files[0],'DANFE',result.id);closeModal();flash(fraction?`Entrada registrada: ${fmt(fraction.dispatch_count)} ${fraction.dispatch_unit} = ${fmt(quantity)} ${baseUnit}.`:'Entrada registrada.');await reload();if(typeof loadInvoices==='function')await loadInvoices();
    });
    wireMovementDateFields();$('entryFractionHost').innerHTML=fractionFields('entry',0,'UNIDADE');
    let fractionRefresh=wireFractionFields('entry',()=>Number($('fQty').value),()=>$('entryBaseUnit').value);
    const update=()=>{const product=(D.stock||[]).find(x=>x.product_id===$('fProduct').value),config=configFor(product?.product_id);$('fProductPreview').innerHTML=dispatchPreview(product);if(product){const unit=normalizeBaseUnit(product.unit);if([...$('entryBaseUnit').options].some(x=>x.value===unit))$('entryBaseUnit').value=unit;}$('entryFractionPanel').classList.toggle('hidden',!isFractionableUnit($('entryBaseUnit').value));if(config){$('entryFractionEnabled').checked=true;$('entryDispatchUnit').value=config.dispatch_unit;const qty=Number($('fQty').value),count=qty/config.base_quantity_per_dispatch_unit;if(Number.isInteger(count)&&count>0)$('entryDispatchCount').value=count}fractionRefresh()};
    $('fProduct').onchange=update;$('entryBaseUnit').onchange=update;$('fQty').addEventListener('input',()=>{const product=(D.stock||[]).find(x=>x.product_id===$('fProduct').value),config=configFor(product?.product_id),count=Number($('fQty').value)/Number(config?.base_quantity_per_dispatch_unit);if(config&&Number.isInteger(count)&&count>0)$('entryDispatchCount').value=count;fractionRefresh()});
    makeSearchableDropdown('fProduct',update);makeSearchableDropdown('fParty');$('modalSave').textContent='Registrar entrada';
  };

  const invoiceReviewPackagingBase=showInvoiceReview;
  showInvoiceReview=function(detail){
    invoiceReviewPackagingBase(detail);if(detail.invoice?.status==='CONFIRMED')return;const originalSave=saveFn;
    detail.items.forEach((item,index)=>{const row=document.querySelectorAll('.invoice-items tbody tr')[index],cell=row?.children[3],received=$('invReceived'+index),selected=()=>{const id=$('invProd'+index)?.value||item.product_id;return(D.stock||[]).find(x=>x.product_id===id)},baseUnit=()=>isFractionableUnit(item.unit)?normalizeBaseUnit(item.unit):normalizeBaseUnit(selected()?.unit);if(!cell)return;
      const host=document.createElement('div');host.className='invoice-fraction-host';host.innerHTML=fractionFields('invPack'+index,Number(received?.value??item.quantity),baseUnit());cell.appendChild(host);const refresh=wireFractionFields('invPack'+index,()=>Number(received?.value??item.quantity),baseUnit),config=configFor(selected()?.product_id);if(config){$('invPack'+index+'FractionEnabled').checked=true;$('invPack'+index+'DispatchUnit').value=config.dispatch_unit;const count=Number(received?.value??item.quantity)/config.base_quantity_per_dispatch_unit;if(Number.isInteger(count)&&count>0)$('invPack'+index+'DispatchCount').value=count}const visibility=()=>{$('invPack'+index+'FractionPanel').classList.toggle('hidden',!isFractionableUnit(baseUnit()));refresh()};received?.addEventListener('input',visibility);$('invProd'+index)?.addEventListener('change',visibility);visibility();
    });
    saveFn=async()=>{for(let index=0;index<detail.items.length;index++){const item=detail.items[index],received=Number($('invReceived'+index)?.value??item.quantity),productId=received>0?confirmedProductValue(item,index):null,product=(D.stock||[]).find(x=>x.product_id===productId),baseUnit=isFractionableUnit(item.unit)?normalizeBaseUnit(item.unit):normalizeBaseUnit(product?.unit),payload=productId?fractionPayload('invPack'+index,productId,received,baseUnit):null;if(payload)await packagingApi('/configure',{method:'POST',body:JSON.stringify(payload)})}return originalSave()};
  };

  const movementBase=movement;movement=function(type){if(type==='SAIDA')manualExit();else movementBase(type)};

  function appendPackagingEditor(product){
    if(!product.product_id||!D.permissions?.product)return;
    const form=$('modalBody').querySelector('.form');if(!form||$('packagingEditor'))return;
    const config=configFor(product.product_id),count=config?.available_dispatch_quantity||'',balance=Number(product.balance||0);
    const section=document.createElement('div');section.id='packagingEditor';section.className='field full packaging-editor';
    section.innerHTML=`<div><b>Saída por subparte</b><small>Use quando o estoque é controlado em quilos ou litros, mas a retirada acontece por rolinho, frasco, galão ou outra parte igual.</small></div><div class="packaging-current"><b>Quantidade total: ${fmt(balance)} ${esc(product.unit||'')}</b>${config?`<span>Quantidade física: ${fmt(config.available_dispatch_quantity)} ${esc(config.dispatch_unit)}</span><span>Cada ${esc(singular(config.dispatch_unit))}: ${esc(detailMeasure(config.base_quantity_per_dispatch_unit,product.unit))}</span>`:''}</div><div class="packaging-fields"><label>Tipo de subparte<input id="dispatchUnit" value="${esc(config?.dispatch_unit||'ROLINHO')}" placeholder="Ex.: ROLINHO"></label><label>Quantidade física atual<input id="dispatchCount" type="number" min="1" step="1" value="${esc(count)}" placeholder="Ex.: 20"></label></div><div id="dispatchCalculation" class="packaging-calculation"></div><div class="actions"><button type="button" class="btn primary" id="saveDispatchConfig">Salvar forma de baixa</button>${config?'<button type="button" class="btn" id="removeDispatchConfig">Remover configuração</button>':''}</div>`;
    form.appendChild(section);
    const update=()=>{const units=Number($('dispatchCount').value),name=$('dispatchUnit').value.trim()||'subparte',factor=balance/units;$('dispatchCalculation').innerHTML=Number.isInteger(units)&&units>0&&balance>0?`<b>${fmt(units)} ${esc(name.toUpperCase())} = ${fmt(balance)} ${esc(product.unit||'')}</b><span>Cada ${esc(singular(name))}: ${esc(detailMeasure(factor,product.unit))}</span>`:'Informe quantas subpartes físicas correspondem ao saldo atual.'};
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
  const style=document.createElement('style');style.textContent='.packaging-stock,.packaging-current{display:grid;gap:4px;margin-top:8px;padding:10px;border:1px solid #cbdcf2;border-radius:10px;background:#f3f7fd}.packaging-stock small,.packaging-editor small,.fraction-entry small{display:block;color:var(--muted)}.packaging-editor,.fraction-entry{padding:14px;border:1px solid #cbdcf2;border-radius:12px;background:#f8fbff}.fraction-entry{display:grid;gap:10px;margin-top:10px}.fraction-entry.hidden{display:none}.fraction-check{display:flex;align-items:center;gap:8px;font-weight:700}.packaging-fields{display:grid;grid-template-columns:1fr 1fr;gap:10px}.packaging-fields.hidden{display:none}.packaging-fields label{display:grid;gap:5px}.packaging-calculation{display:grid;gap:3px;padding:10px;border-radius:9px;background:#fff8dc;color:#725900;font-weight:700}.packaging-calculation.hidden{display:none}.invoice-fraction-host{margin-top:10px}.invoice-fraction-host .fraction-entry{padding:10px}.invoice-fraction-host .packaging-fields{grid-template-columns:1fr}@media(max-width:620px){.packaging-fields{grid-template-columns:1fr}}';document.head.appendChild(style);
  loadPackaging().then(()=>{decorateProductSelects(document);renderMov()}).catch(()=>{});
})();
