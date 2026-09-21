/* TypeSafe suggests a product; the existing review flow owns association and writes. */
(() => {
  const AI_API = 'https://kvfjjtkwxxbvzlicwnrz.supabase.co/functions/v1/inventory-product-ai';

  async function suggestApi(item, signal) {
    const send = async currentToken => fetch(AI_API, { method: 'POST', headers: { authorization: 'Bearer ' + currentToken, 'content-type': 'application/json' }, body: JSON.stringify({ item }), signal, cache: 'no-store' });
    token = await renewToken(false) || token;
    let response = await send(token);
    if (response.status === 401) { token = await renewToken(true) || token; response = await send(token); }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'AI_UNAVAILABLE');
    return body;
  }

  function itemState(item) {
    return { description: item.description || '', supplier_sku: item.supplier_sku || '', barcode: item.barcode || '', ncm: item.ncm || '', unit: item.unit || '' };
  }

  function decorate(detail) {
    if (detail.invoice.status === 'CONFIRMED' || !D.permissions.entry) return;
    detail.items.forEach((item, index) => {
      const select = $('invProd' + index), row = select?.closest('tr'), actions = row?.querySelector('.invoice-item-actions');
      if (!select || !actions || actions.querySelector('[data-ai-product]')) return;
      const button = document.createElement('button'), apply = document.createElement('button'), status = document.createElement('small');
      button.type = apply.type = 'button'; button.className = apply.className = 'btn small'; button.dataset.aiProduct = String(index); button.textContent = 'Sugerir produto';
      apply.textContent = 'Usar sugestão'; apply.hidden = true; status.className = 'inventory-ai-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
      actions.append(button, apply); actions.after(status);
      let pending = null, revision = 0, busy = false;
      const clear = () => { revision++; pending = null; apply.hidden = true; status.textContent = ''; };
      select.addEventListener('change', clear);
      button.onclick = async () => {
        if (busy) return;
        clear(); const current = revision, state = itemState(item);
        busy = true; button.disabled = true; status.textContent = 'Consultando sugestão…';
        const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 35000);
        try {
          const result = await suggestApi(state, controller.signal);
          if (current !== revision) return;
          const suggestion = result.suggestion;
          if (!suggestion || ![...select.options].some(option => option.value === String(suggestion.product_id))) { status.textContent = 'Nenhum produto cadastrado correspondeu com segurança. Pesquise manualmente ou cadastre um novo.'; return; }
          pending = String(suggestion.product_id);
          status.textContent = `Sugestão: ${suggestion.pn || 'sem PN'} — ${suggestion.description}. Confira antes de associar.`;
          apply.hidden = false;
        } catch (error) {
          if (current !== revision) return;
          const messages = { TYPESAFE_NOT_CONFIGURED: 'A sugestão por IA ainda não foi ativada.', FORBIDDEN: 'Seu acesso não permite solicitar esta sugestão.', UNAUTHORIZED: 'Sua sessão expirou. Atualize o Portal.', AI_BUSY: 'O serviço está ocupado. Tente novamente em alguns instantes.' };
          status.textContent = messages[error.message] || 'A sugestão está indisponível. Faça a associação manualmente.';
        } finally { clearTimeout(timer); busy = false; button.disabled = false; }
      };
      apply.onclick = () => {
        if (!pending || ![...select.options].some(option => option.value === pending)) return clear();
        const selected = pending; clear(); select.value = selected;
        if (select._comboInput) select._comboInput.value = select.options[select.selectedIndex]?.text || '';
        row.querySelector(`[data-link-invoice-item="${index}"]`)?.click();
      };
    });
  }

  const showInvoiceReviewBase = showInvoiceReview;
  showInvoiceReview = function (detail) { showInvoiceReviewBase(detail); decorate(detail); };
})();
