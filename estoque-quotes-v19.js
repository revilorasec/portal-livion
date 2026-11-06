(function(){
  const nav=document.querySelector('.nav button[data-v="quotes"]');
  if(!nav)return;
  let section=document.getElementById('quotes');
  if(!section){
    section=document.createElement('section');section.id='quotes';section.className='view';
    section.innerHTML='<iframe id="quotesFrame" class="quotes-frame" title="Compras e Cotações" loading="lazy"></iframe>';
    const cadastros=document.getElementById('cadastros');cadastros.parentNode.insertBefore(section,cadastros);
  }
  function openQuotes(productId=''){
    document.querySelectorAll('.nav button').forEach(x=>x.classList.toggle('active',x===nav));
    document.querySelectorAll('.view').forEach(x=>x.classList.remove('active'));section.classList.add('active');
    const frame=document.getElementById('quotesFrame'),url=new URL('compras-cotacoes.html',location.href);url.searchParams.set('embedded','1');url.searchParams.set('v','7');if(productId)url.searchParams.set('product_id',productId);
    if(!frame.src||productId)frame.src=url.href;
  }
  nav.onclick=()=>openQuotes();
  const original=window.openProduct;
  if(typeof original==='function')window.openProduct=function(product={}){
    original(product);
    if(!product.product_id)return;
    const actions=document.querySelector('#modal .modal-actions');if(!actions||document.getElementById('quoteProductBtn'))return;
    const button=document.createElement('button');button.type='button';button.id='quoteProductBtn';button.className='btn quote-product-btn';button.textContent='Cotar';
    button.onclick=()=>{window.closeModal?.();openQuotes(product.product_id)};actions.insertBefore(button,actions.firstChild);
  };
  window.__ESTOQUE_OPEN_QUOTES__=openQuotes;
  const procurementUrl='https://kvfjjtkwxxbvzlicwnrz.supabase.co/functions/v1/procurement-api';
  async function procurementApi(path,opt={}){const access=await renewToken(false);const headers={authorization:'Bearer '+access,...(opt.headers||{})};if(!(opt.body instanceof FormData))headers['content-type']='application/json';const response=await fetch(procurementUrl+path,{...opt,headers,cache:'no-store'}),body=await response.json().catch(()=>({}));if(!response.ok)throw Error(body.error||'Não foi possível salvar os contatos.');return body}
  function addQuoteContact(seed={}){const host=document.getElementById('supplierQuoteContacts');if(!host)return;const row=document.createElement('div');row.className='supplier-contact-row';row.dataset.supplierContact='1';row.innerHTML=`<input data-contact-name placeholder="Nome" value="${esc(seed.name||'')}"><input data-contact-email type="email" placeholder="E-mail para cotação" value="${esc(seed.email||'')}"><input data-contact-phone placeholder="Telefone / WhatsApp" value="${esc(seed.phone||'')}"><label><input data-contact-primary type="radio" name="supplierPrimaryContact" ${seed.is_primary?'checked':''}> Principal</label><button type="button" class="btn bad" data-remove-contact>×</button>`;row.querySelector('[data-remove-contact]').onclick=()=>row.remove();host.appendChild(row)}
  const originalPerson=window.person;
  if(typeof originalPerson==='function')window.person=function(kind,p={}){
    originalPerson(kind,p);if(kind!=='supplier')return;
    const form=document.querySelector('#modalBody .form');if(!form)return;const panel=document.createElement('div');panel.className='field full supplier-contact-panel';panel.innerHTML='<label><b>Contatos que recebem pedidos de cotação</b><small>Cadastre quantos contatos precisar, com nome, e-mail e telefone.</small></label><div id="supplierQuoteContacts"></div><button type="button" class="btn" id="addSupplierQuoteContact">+ Adicionar contato</button>';form.appendChild(panel);document.getElementById('addSupplierQuoteContact').onclick=()=>addQuoteContact({});addQuoteContact({name:p.name||'',email:p.email||'',phone:p.phone||'',is_primary:true});
    if(p.supplier_id)procurementApi('/supplier-contacts?supplier_id='+encodeURIComponent(p.supplier_id)).then(result=>{const host=document.getElementById('supplierQuoteContacts');if(!host)return;host.innerHTML='';(result.contacts?.length?result.contacts:[{name:p.name||'',email:p.email||'',phone:p.phone||'',is_primary:true}]).forEach(addQuoteContact)}).catch(()=>{});
    saveFn=async()=>{const body={supplier_id:p.supplier_id||null,name:$('xName').value.trim(),document:$('xDoc').value.trim(),phone:$('xPhone').value.trim(),email:$('xEmail').value.trim(),address:$('xExtra').value.trim(),status:$('xStatus').value};if(!body.name)throw Error('Informe o nome do fornecedor.');const saved=await api('/supplier',{method:'POST',body:JSON.stringify(body)});await uploadPhotos('SUPPLIER',saved.id,'sl',1);const contacts=[...document.querySelectorAll('[data-supplier-contact]')].map(row=>({name:row.querySelector('[data-contact-name]').value.trim(),email:row.querySelector('[data-contact-email]').value.trim(),phone:row.querySelector('[data-contact-phone]').value.trim(),is_primary:row.querySelector('[data-contact-primary]').checked})).filter(x=>x.email);await procurementApi('/supplier-contacts',{method:'POST',body:JSON.stringify({supplier_id:saved.id,contacts})});closeModal();flash('Fornecedor e contatos de cotação salvos.');await reload()}
  };
})();
