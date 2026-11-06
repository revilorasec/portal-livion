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
    const frame=document.getElementById('quotesFrame'),url=new URL('compras-cotacoes.html',location.href);url.searchParams.set('embedded','1');url.searchParams.set('v','4');if(productId)url.searchParams.set('product_id',productId);
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
})();
