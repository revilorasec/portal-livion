/* Revisão simples de NF-e: entrada parcial, pendências e notas complementares. */
(() => {
  const normalized = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
  const numberValue = value => Number(String(value ?? '').replace(',', '.'));

  function productPayload(product, description) {
    return {
      product_id: product.product_id, pn: product.pn, description, item_type: product.item_type,
      category: product.category || null, internal_code: product.internal_code || null,
      barcode: product.barcode || null, unit: product.unit || 'UNIDADE',
      default_location: product.default_location || null, min_stock: product.min_stock,
      ideal_stock: product.ideal_stock, status: product.status || 'ATIVO',
      evidence_required: !!product.evidence_required, notes: product.notes || null,
      is_favorite: !!product.is_favorite, part_ids: product.part_ids || []
    };
  }

  function receivedQuantity(item, index) {
    const input = $('invReceived' + index);
    return input ? numberValue(input.value) : Number(item.received_quantity ?? item.quantity ?? 0);
  }

  function refreshReceiptRow(detail, index) {
    const item = detail.items[index], row = $('invReceived' + index)?.closest('tr');
    if (!row) return;
    const quantity = receivedQuantity(item, index), fiscal = Number(item.quantity || 0);
    row.classList.toggle('invoice-item-missing', quantity === 0);
    row.classList.toggle('invoice-item-partial', quantity > 0 && quantity < fiscal);
    const badge = row.querySelector('.invoice-delivery-badge');
    if (badge) {
      badge.className = 'invoice-delivery-badge ' + (quantity === 0 ? 'missing' : quantity < fiscal ? 'partial' : 'received');
      badge.textContent = quantity === 0 ? 'Não entregue' : quantity < fiscal ? 'Entrega parcial' : 'Recebido completo';
    }
  }

  invoiceReadiness = function (detail) {
    let received = 0, pending = 0, linked = 0, ready = true;
    detail.items.forEach((item, index) => {
      const quantity = receivedQuantity(item, index), fiscal = Number(item.quantity || 0);
      const productId = confirmedProductValue(item, index);
      if (!Number.isFinite(quantity) || quantity < 0 || quantity > fiscal) ready = false;
      if (quantity > 0) {
        received++;
        if (productId) linked++; else ready = false;
      }
      if (quantity < fiscal) pending++;
    });
    if ($('invoiceReadiness')) $('invoiceReadiness').innerHTML = `<b>${received} item(ns) com entrada</b> · <b>${linked} vinculado(s)</b> · <b>${pending} pendência(s)</b>${ready ? '' : '<br><small>Vincule somente os itens recebidos e confira as quantidades.</small>'}`;
    if ($('modalSave')) $('modalSave').disabled = !ready;
    return ready;
  };

  async function updateOptionalNames(detail) {
    let changed = 0;
    for (const [index, item] of detail.items.entries()) {
      if (!$('invRename' + index)?.checked) continue;
      const productId = confirmedProductValue(item, index), product = (D.stock || []).find(row => row.product_id === productId);
      if (product && normalized(product.description) !== normalized(item.description)) {
        await api('/product', {method: 'POST', body: JSON.stringify(productPayload(product, item.description))});
        changed++;
      }
    }
    if ($('invRenameSupplier')?.checked) {
      const supplierId = $('invSupplier')?.value, supplier = (D.suppliers || []).find(row => row.supplier_id === supplierId);
      const invoiceName = detail.invoice.raw_data?.supplier_name || detail.invoice.supplier_name || '';
      if (supplier && invoiceName && normalized(supplier.name) !== normalized(invoiceName)) {
        await api('/supplier', {method: 'POST', body: JSON.stringify({...supplier, name: invoiceName})});
        changed++;
      }
    }
    return changed;
  }

  function complementOptions(detail) {
    const currentDocument = String(detail.invoice.supplier_document || '').replace(/\D/g, '');
    const candidates = [...(detail.complement_candidates || [])].sort((a, b) => {
      const aSame = currentDocument && String(a.supplier_document || '').replace(/\D/g, '') === currentDocument;
      const bSame = currentDocument && String(b.supplier_document || '').replace(/\D/g, '') === currentDocument;
      return Number(bSame) - Number(aSame) || String(b.issued_at || '').localeCompare(String(a.issued_at || ''));
    });
    return '<option value="">Não, esta é uma nota independente</option>' + candidates.map(invoice => `<option value="${esc(invoice.invoice_id)}" ${invoice.invoice_id === detail.invoice.complements_invoice_id ? 'selected' : ''}>NF ${esc(invoice.invoice_number || 'sem número')} · ${esc(invoice.supplier_name || invoice.supplier_document || 'fornecedor')} · ${dt(invoice.issued_at)}</option>`).join('');
  }

  function decorateConfirmed(detail) {
    const root = document.querySelector('.invoice-review-root');
    if (!root) return;
    const partial = detail.items.filter(item => Number(item.received_quantity ?? item.quantity) < Number(item.quantity)).length;
    const panel = document.createElement('section');
    panel.className = 'invoice-receipt-summary';
    panel.innerHTML = `<b>${partial ? 'Entrada parcial registrada' : 'Entrada completa registrada'}</b><span>${partial ? `${partial} item(ns) ficaram pendentes ou foram recebidos parcialmente.` : 'Todas as quantidades fiscais foram recebidas.'}</span>${detail.complemented_invoice ? `<span>Complementa a NF ${esc(detail.complemented_invoice.invoice_number || 'sem número')}.</span>` : ''}`;
    root.querySelector('.invoice-meta')?.after(panel);
    detail.items.forEach((item, index) => {
      const row = document.querySelectorAll('.invoice-items tbody tr')[index], cell = row?.children[2];
      if (!cell) return;
      const received = Number(item.received_quantity ?? item.quantity), fiscal = Number(item.quantity);
      cell.insertAdjacentHTML('beforeend', `<div class="confirmed-receipt"><b>Recebido: ${fmt(received)} ${esc(item.unit || '')}</b><span class="invoice-delivery-badge ${received === 0 ? 'missing' : received < fiscal ? 'partial' : 'received'}">${received === 0 ? 'Não entregue' : received < fiscal ? 'Entrega parcial' : 'Recebido completo'}</span>${item.receipt_note ? `<small>${esc(item.receipt_note)}</small>` : ''}</div>`);
    });
  }

  const showInvoiceReviewBase = showInvoiceReview;
  showInvoiceReview = function (detail) {
    showInvoiceReviewBase(detail);
    if (detail.invoice.status === 'CONFIRMED') return decorateConfirmed(detail);
    const root = document.querySelector('.invoice-review-root');
    if (!root) return;

    const workflow = document.createElement('section');
    workflow.className = 'invoice-receipt-workflow';
    workflow.innerHTML = `<div><b>Conferência do recebimento</b><span>Os dados do XML já foram preenchidos. Altere somente o que chegou diferente.</span></div><label class="field"><span>Esta nota complementa uma entrega anterior?</span><select id="invComplement">${complementOptions(detail)}</select></label>`;
    root.querySelector('.invoice-meta')?.after(workflow);

    detail.items.forEach((item, index) => {
      const row = document.querySelectorAll('.invoice-items tbody tr')[index], quantityCell = row?.children[2], productCell = row?.children[3];
      if (!row || !quantityCell || !productCell) return;
      const initial = Number(item.received_quantity ?? item.quantity);
      quantityCell.insertAdjacentHTML('beforeend', `<div class="invoice-receipt-controls"><label>Quantidade recebida<input id="invReceived${index}" type="number" min="0" max="${esc(item.quantity)}" step="any" value="${esc(initial)}"></label><div class="invoice-receipt-shortcuts"><button type="button" class="btn small" data-all-received="${index}">Recebi tudo</button><button type="button" class="btn small" data-missing="${index}">Não veio</button></div><label>Observação do item<input id="invReceiptNote${index}" maxlength="1000" value="${esc(item.receipt_note || '')}" placeholder="Ex.: fornecedor não entregou; virá depois"></label><span class="invoice-delivery-badge received">Recebido completo</span></div>`);
      productCell.querySelector('.invoice-product-combo-hidden')?.classList.remove('invoice-product-combo-hidden');
      const linkButton = productCell.querySelector(`[data-link-invoice-item="${index}"]`);
      if (linkButton) {
        linkButton.textContent = 'Usar produto selecionado';
        linkButton.onclick = () => {
          const selected = $('invProd' + index)?.value || '';
          item.product_id = selected || null;
          row.classList.toggle('unmatched', !selected && receivedQuantity(item, index) > 0);
          invoiceReadiness(detail);
        };
      }
      productCell.insertAdjacentHTML('beforeend', `<label class="invoice-optional-rename ${D.permissions.product ? '' : 'hidden'}"><input id="invRename${index}" type="checkbox"> Alterar o nome no cadastro para “${esc(item.description)}”</label>`);
      const input = $('invReceived' + index);
      input.oninput = () => { refreshReceiptRow(detail, index); invoiceReadiness(detail); };
      row.querySelector(`[data-all-received="${index}"]`).onclick = () => { input.value = item.quantity; refreshReceiptRow(detail, index); invoiceReadiness(detail); };
      row.querySelector(`[data-missing="${index}"]`).onclick = () => { input.value = '0'; refreshReceiptRow(detail, index); invoiceReadiness(detail); $('invReceiptNote' + index).focus(); };
      refreshReceiptRow(detail, index);
    });

    if ($('linkInvoiceSupplier')) {
      $('linkInvoiceSupplier').textContent = 'Usar fornecedor selecionado';
      $('linkInvoiceSupplier').onclick = () => {
        detail.invoice.supplier_id = $('invSupplier')?.value || null;
        invoiceReadiness(detail);
        flash(detail.invoice.supplier_id ? 'Fornecedor selecionado.' : 'A nota ficará sem fornecedor vinculado.');
      };
      $('linkInvoiceSupplier').parentElement?.insertAdjacentHTML('beforeend', `<label class="invoice-optional-rename ${D.permissions.supplier ? '' : 'hidden'}"><input id="invRenameSupplier" type="checkbox"> Atualizar o nome do fornecedor para o nome do XML</label>`);
    }

    saveFn = async () => {
      if (!invoiceReadiness(detail)) throw new Error('Confira as quantidades e vincule os itens que realmente foram recebidos.');
      const items = detail.items.map((item, index) => {
        const received = receivedQuantity(item, index), note = String($('invReceiptNote' + index)?.value || '').trim();
        if (received < Number(item.quantity) && !note) throw new Error(`Informe uma observação para o item ${item.line_number}, que ficou pendente ou parcial.`);
        return {item_id: item.item_id, product_id: received > 0 ? confirmedProductValue(item, index) : null, received_quantity: received, receipt_note: note || null};
      });
      const movements = items.filter(item => item.received_quantity > 0).length, pending = items.filter((item, index) => item.received_quantity < Number(detail.items[index].quantity)).length;
      $('modalSave').disabled = true;
      const result = await api('/invoice-confirm', {method: 'POST', body: JSON.stringify({invoice_id: detail.invoice.invoice_id, supplier_id: $('invSupplier')?.value || null, complements_invoice_id: $('invComplement')?.value || null, items})});
      let changed = 0;
      try { changed = await updateOptionalNames(detail); } catch (error) { console.error('Falha ao atualizar nome opcional', error); }
      closeModal();
      flash(`${result.movements_created ?? movements} entrada(s) registrada(s)${pending ? `; ${pending} pendência(s) guardada(s)` : ''}${changed ? `; ${changed} nome(s) atualizado(s)` : ''}.`);
      await reload();
      await loadInvoices();
    };
    $('modalSave').textContent = 'Confirmar entrada';
    invoiceReadiness(detail);
  };
})();
