(() => {
  const DELETE_API='https://kvfjjtkwxxbvzlicwnrz.supabase.co/functions/v1/expense-attachment-delete-api';

  function enhancePhotoInputs(){
    ['ePhoto1','ePhoto2'].forEach((id,idx)=>{
      const input=document.getElementById(id);
      if(!input)return;
      input.removeAttribute('capture');
      input.setAttribute('accept','image/*');
      const field=input.closest('.field');
      if(field && !field.querySelector('.photo-source-hint')){
        const hint=document.createElement('small');
        hint.className='photo-source-hint';
        hint.style.color='var(--muted)';
        hint.textContent='Você pode tirar uma foto ou escolher uma imagem da galeria.';
        input.insertAdjacentElement('afterend',hint);
      }
    });
  }

  function photoAttachmentsFor(expense){
    const current=(typeof expenses!=='undefined' && Array.isArray(expenses))
      ? expenses.find(e=>String(e.expense_id)===String(expense?.expense_id))
      : null;
    const list=current?.attachments||expense?.attachments||[];
    return list.filter(a=>{
      const t=String(a?.attachment_type||'').toUpperCase();
      return t==='FOTO'||t.startsWith('FOTO_');
    });
  }

  async function deleteExpensePhoto(expense,attachment){
    if(!confirm('Excluir esta foto da despesa?'))return;
    const btn=document.querySelector(`[data-delete-expense-photo="${CSS.escape(String(attachment.attachment_id))}"]`);
    if(btn){btn.disabled=true;btn.textContent='Excluindo…'}
    try{
      await call(DELETE_API,'/delete',{method:'POST',body:JSON.stringify({attachment_id:attachment.attachment_id})});
      if(typeof expenses!=='undefined' && Array.isArray(expenses)){
        const e=expenses.find(x=>String(x.expense_id)===String(expense.expense_id));
        if(e)e.attachments=(e.attachments||[]).filter(a=>String(a.attachment_id)!==String(attachment.attachment_id));
      }
      if(Array.isArray(expense.attachments))expense.attachments=expense.attachments.filter(a=>String(a.attachment_id)!==String(attachment.attachment_id));
      renderExistingPhotos(expense);
      if(typeof flash==='function')flash('Foto excluída.');
    }catch(err){
      alert('Não foi possível excluir a foto: '+(err?.message||err));
      if(btn){btn.disabled=false;btn.textContent='Excluir foto'}
    }
  }

  function renderExistingPhotos(expense){
    const form=document.getElementById('expenseForm');
    if(!form)return;
    let box=document.getElementById('existingExpensePhotos');
    if(!box){
      box=document.createElement('div');
      box.id='existingExpensePhotos';
      box.className='field full';
      const notes=document.getElementById('eNotes')?.closest('.field');
      if(notes)notes.insertAdjacentElement('beforebegin',box); else form.appendChild(box);
    }
    const photos=photoAttachmentsFor(expense);
    if(!photos.length){
      box.innerHTML='<label>Fotos já anexadas</label><div class="payment-note">Nenhuma foto anexada anteriormente.</div>';
      return;
    }
    box.innerHTML='<label>Fotos já anexadas</label><div class="existing-photo-list"></div>';
    const list=box.querySelector('.existing-photo-list');
    photos.forEach((a,i)=>{
      const row=document.createElement('div');
      row.style.cssText='display:grid;grid-template-columns:72px minmax(0,1fr) auto;gap:10px;align-items:center;padding:9px 0;border-bottom:1px solid var(--line)';
      const thumb=a.url?`<a href="${esc(a.url)}" target="_blank" rel="noopener"><img src="${esc(a.url)}" alt="Foto ${i+1}" style="width:72px;height:58px;object-fit:cover;border-radius:8px;border:1px solid var(--line)"></a>`:'<div style="width:72px;height:58px;border-radius:8px;background:#f1f5f9;display:grid;place-items:center;color:var(--muted)">Foto</div>';
      row.innerHTML=`${thumb}<div><b>${esc(a.original_name||('Foto '+(i+1)))}</b><small style="display:block;color:var(--muted)">Anexada anteriormente</small></div><button type="button" class="btn bad" data-delete-expense-photo="${esc(a.attachment_id)}">Excluir foto</button>`;
      row.querySelector('button').onclick=()=>deleteExpensePhoto(expense,a);
      list.appendChild(row);
    });
  }

  enhancePhotoInputs();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',enhancePhotoInputs,{once:true});

  try{
    const originalEditExpense=editExpense;
    editExpense=function(x){
      const result=originalEditExpense(x);
      enhancePhotoInputs();
      setTimeout(()=>renderExistingPhotos(x),0);
      return result;
    };
  }catch(e){console.warn('Não foi possível estender a edição de fotos',e)}

  try{
    const originalClearForm=clearForm;
    clearForm=function(){
      document.getElementById('existingExpensePhotos')?.remove();
      const result=originalClearForm();
      enhancePhotoInputs();
      return result;
    };
  }catch(e){console.warn('Não foi possível estender a limpeza do formulário',e)}
})();
