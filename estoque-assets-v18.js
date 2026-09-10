(function () {
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
  let qrStream = null;
  let qrFrame = 0;

  function stopQrCamera() {
    if (qrFrame) cancelAnimationFrame(qrFrame);
    qrFrame = 0;
    if (qrStream) qrStream.getTracks().forEach(track => track.stop());
    qrStream = null;
  }

  const closeModalBase = closeModal;
  closeModal = function () {
    stopQrCamera();
    closeModalBase();
  };

  function qrAccessKey(value) {
    const raw = String(value || '').trim();
    const direct = raw.match(/(?:^|\D)(\d{44})(?:\D|$)/);
    if (direct) return direct[1];
    try {
      const url = new URL(raw);
      for (const value of [...url.searchParams.values(), url.pathname]) {
        const match = String(value).match(/\d{44}/);
        if (match) return match[0];
      }
    } catch {}
    return '';
  }

  function decisionDialog({title, externalLabel, externalName, currentLabel, currentName, canRename}) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'name-decision-backdrop';
      overlay.innerHTML = `
        <section class="name-decision-dialog" role="dialog" aria-modal="true">
          <h3>${esc(title)}</h3>
          <div class="name-comparison">
            <div><small>${esc(externalLabel)}</small><b>${esc(externalName || 'Não informado')}</b></div>
            <div><small>${esc(currentLabel)}</small><b>${esc(currentName || 'Não informado')}</b></div>
          </div>
          <label class="name-decision-option selected"><input type="radio" name="nameDecision" value="KEEP" checked><span><b>Manter o nome atual</b><small>O nome da nota continuará guardado no histórico da compra.</small></span></label>
          <label class="name-decision-option ${canRename ? '' : 'disabled'}"><input type="radio" name="nameDecision" value="RENAME" ${canRename ? '' : 'disabled'}><span><b>Trocar para o nome da nota</b><small>${canRename ? 'O cadastro existente passará a usar o nome recebido.' : 'Seu perfil não permite alterar este cadastro.'}</small></span></label>
          <div class="name-decision-actions"><button type="button" class="btn" data-cancel>Cancelar</button><button type="button" class="btn primary" data-apply>Associar</button></div>
        </section>`;
      document.body.appendChild(overlay);
      const finish = value => { overlay.remove(); resolve(value); };
      overlay.querySelectorAll('input[name=nameDecision]').forEach(input => input.onchange = () => overlay.querySelectorAll('.name-decision-option').forEach(label => label.classList.toggle('selected', label.contains(input))));
      overlay.querySelector('[data-cancel]').onclick = () => finish(null);
      overlay.querySelector('[data-apply]').onclick = () => finish(overlay.querySelector('input[name=nameDecision]:checked').value);
      overlay.onclick = event => { if (event.target === overlay) finish(null); };
    });
  }

  async function associateProduct(detail, index) {
    const item = detail.items[index];
    const select = $('invProd' + index);
    const productId = select?.value || item.product_id;
    const product = (D.stock || []).find(row => row.product_id === productId);
    if (!product) return alert('Pesquise e selecione uma peça, componente ou insumo existente.');
    const action = normalize(product.description) === normalize(item.description) ? 'KEEP' : await decisionDialog({
      title: 'Como deseja manter o nome deste item?',
      externalLabel: 'Nome encontrado na nota', externalName: item.description,
      currentLabel: 'Nome atual no estoque', currentName: product.description,
      canRename: !!D.permissions.product
    });
    if (!action) return;
    item.product_id = productId;
    item.name_action = action;
    item.name_choice_product_id = productId;
    select.value = productId;
    if (select._comboInput) select._comboInput.value = select.options[select.selectedIndex]?.text || '';
    const row = select.closest('tr');
    row?.classList.remove('unmatched');
    let note = row?.querySelector('.invoice-name-choice');
    if (!note && row) {
      note = document.createElement('small');
      note.className = 'invoice-name-choice';
      row.querySelector('.invoice-item-actions')?.after(note);
    }
    if (note) note.textContent = action === 'RENAME' ? 'Ao confirmar: usar o nome da nota' : 'Ao confirmar: manter o nome atual';
    invoiceReadiness(detail);
  }

  async function associateSupplier(detail) {
    const supplierId = $('invSupplier')?.value;
    const supplier = (D.suppliers || []).find(row => row.supplier_id === supplierId);
    if (!supplier) return alert('Pesquise e selecione um fornecedor existente.');
    const invoiceName = detail.invoice.raw_data?.supplier_name || detail.invoice.supplier_name || '';
    const action = normalize(supplier.name) === normalize(invoiceName) ? 'KEEP' : await decisionDialog({
      title: 'Como deseja manter o nome do fornecedor?',
      externalLabel: 'Razão social encontrada na nota', externalName: invoiceName,
      currentLabel: 'Nome atual do fornecedor', currentName: supplier.name,
      canRename: !!D.permissions.supplier
    });
    if (!action) return;
    detail.invoice.supplier_id = supplierId;
    detail.invoice.supplier_name_action = action;
    detail.invoice.name_choice_supplier_id = supplierId;
    invoiceReadiness(detail);
    flash(action === 'RENAME' ? 'Fornecedor associado; o nome será atualizado na confirmação.' : 'Fornecedor associado mantendo o nome atual.');
  }

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

  async function updateApprovedNames(detail) {
    let changed = 0;
    for (const item of detail.items.filter(row => row.name_action === 'RENAME' && row.product_id)) {
      const product = (D.stock || []).find(row => row.product_id === item.product_id);
      if (product && normalize(product.description) !== normalize(item.description)) {
        await api('/product', {method: 'POST', body: JSON.stringify(productPayload(product, item.description))});
        changed++;
      }
    }
    if (detail.invoice.supplier_name_action === 'RENAME' && detail.invoice.supplier_id) {
      const supplier = (D.suppliers || []).find(row => row.supplier_id === detail.invoice.supplier_id);
      const name = detail.invoice.raw_data?.supplier_name || detail.invoice.supplier_name;
      if (supplier && name && normalize(supplier.name) !== normalize(name)) {
        await api('/supplier', {method: 'POST', body: JSON.stringify({...supplier, name})});
        changed++;
      }
    }
    return changed;
  }

  const showInvoiceReviewBase = showInvoiceReview;
  showInvoiceReview = function (detail) {
    showInvoiceReviewBase(detail);
    if (detail.invoice.status === 'CONFIRMED') return;
    detail.items.forEach(item => {
      item.name_action ||= 'KEEP';
      item.review_initial_product_id ??= item.product_id || '';
    });
    detail.invoice.review_initial_supplier_id ??= detail.invoice.supplier_id || '';
    document.querySelectorAll('[data-link-invoice-item]').forEach(button => {
      button.textContent = 'Associar e escolher nome';
      button.onclick = () => associateProduct(detail, Number(button.dataset.linkInvoiceItem));
    });
    if ($('linkInvoiceSupplier')) {
      $('linkInvoiceSupplier').textContent = 'Associar e escolher nome';
      $('linkInvoiceSupplier').onclick = () => associateSupplier(detail);
    }
    const confirmInvoice = saveFn;
    saveFn = async () => {
      const pendingItem = detail.items.find((item, index) => {
        const selected = confirmedProductValue(item, index);
        return selected && selected !== item.review_initial_product_id && selected !== item.name_choice_product_id;
      });
      if (pendingItem) throw new Error(`Confirme a associação e o nome do item ${pendingItem.line_number} antes de continuar.`);
      const selectedSupplier = $('invSupplier')?.value || '';
      if (selectedSupplier && selectedSupplier !== detail.invoice.review_initial_supplier_id && selectedSupplier !== detail.invoice.name_choice_supplier_id) {
        throw new Error('Confirme a associação e o nome do fornecedor antes de continuar.');
      }
      const willRename = detail.items.some(item => item.name_action === 'RENAME') || detail.invoice.supplier_name_action === 'RENAME';
      if (willRename && !confirm('A confirmação registrará as entradas e atualizará os nomes escolhidos. Deseja continuar?')) return;
      await confirmInvoice();
      const changed = await updateApprovedNames(detail);
      if (changed) {
        await reload();
        flash(`${changed} nome${changed === 1 ? '' : 's'} atualizado${changed === 1 ? '' : 's'} conforme a aprovação.`);
      }
    };
  };

  async function importQrXml(file, expectedKey) {
    const metadata = parseNFeXml(await file.text());
    if (expectedKey && metadata.access_key !== expectedKey) throw new Error('O XML selecionado pertence a outra nota fiscal.');
    if (invoiceCache.some(invoice => invoice.access_key === metadata.access_key)) throw new Error('Esta nota fiscal já foi importada.');
    const form = new FormData();
    form.append('file', file);
    form.append('metadata', JSON.stringify(metadata));
    stopQrCamera();
    showInvoiceReview(await api('/invoice-import', {method: 'POST', body: form}));
  }

  function qrEntry() {
    stopQrCamera();
    modal('Escanear QR Code da nota fiscal', `
      <div class="qr-entry">
        <div class="qr-camera-box"><video id="invoiceQrVideo" playsinline muted></video><div class="qr-guide">Aponte a câmera para o QR Code</div></div>
        <div class="qr-actions"><button type="button" class="btn primary" id="invoiceQrStart">Iniciar câmera</button><label class="btn qr-file-button">Ler foto do QR<input id="invoiceQrImage" type="file" accept="image/*" capture="environment"></label></div>
        <div class="field"><label>Chave de acesso ou conteúdo do QR</label><input id="invoiceQrValue" inputmode="numeric" placeholder="Também é possível digitar a chave de 44 números"></div>
        <div id="invoiceQrStatus" class="nfe-help">O QR identifica a nota. O estoque só será alterado depois da aprovação.</div>
        <a id="invoiceQrOpen" class="btn hidden" target="_blank" rel="noopener">Abrir consulta da nota</a>
        <div class="field"><label>XML autorizado da mesma nota</label><input id="invoiceQrXml" type="file" accept=".xml,application/xml,text/xml"><small>O XML fornece todos os itens, quantidades, fornecedor e valores.</small></div>
      </div>`, async () => {
        const key = qrAccessKey($('invoiceQrValue').value);
        const file = $('invoiceQrXml').files[0];
        if (!key) throw new Error('Leia o QR ou informe uma chave de acesso com 44 números.');
        if (!file) throw new Error('Selecione o XML autorizado para carregar todos os itens.');
        $('modalSave').disabled = true;
        await importQrXml(file, key);
      });
    $('modalSave').textContent = 'Ler itens e revisar';
    const status = $('invoiceQrStatus');
    let detector = null;
    try { if ('BarcodeDetector' in window) detector = new BarcodeDetector({formats: ['qr_code']}); } catch {}
    const acceptQr = raw => {
      const key = qrAccessKey(raw);
      $('invoiceQrValue').value = raw;
      if (!key) { status.innerHTML = '<span class="bad-text">O código foi lido, mas não contém uma chave de 44 números.</span>'; return false; }
      stopQrCamera();
      const duplicate = invoiceCache.find(invoice => invoice.access_key === key);
      status.innerHTML = duplicate ? `<span class="bad-text"><b>Nota já importada:</b> NF-e ${esc(duplicate.invoice_number || '')}.</span>` : `<b>QR identificado</b><br>Chave ${esc(key)}. Selecione o XML da mesma nota.`;
      $('modalSave').disabled = !!duplicate;
      try { const url = new URL(raw); if (/^https?:$/.test(url.protocol)) { $('invoiceQrOpen').href = url.href; $('invoiceQrOpen').classList.remove('hidden'); } } catch {}
      return !duplicate;
    };
    $('invoiceQrValue').oninput = () => acceptQr($('invoiceQrValue').value);
    $('invoiceQrStart').onclick = async () => {
      if (!detector) return alert('Este navegador não oferece leitura pela câmera. Use uma foto do QR ou digite a chave.');
      try {
        qrStream = await navigator.mediaDevices.getUserMedia({video: {facingMode: {ideal: 'environment'}}});
        const video = $('invoiceQrVideo');
        video.srcObject = qrStream;
        await video.play();
        video.classList.add('active');
        status.textContent = 'Câmera ativa. Mantenha o QR dentro da área indicada.';
        const scan = async () => {
          if (!qrStream || !$('invoiceQrVideo')) return;
          try { const codes = await detector.detect(video); if (codes[0]?.rawValue && acceptQr(codes[0].rawValue)) return; } catch {}
          qrFrame = requestAnimationFrame(scan);
        };
        scan();
      } catch { status.innerHTML = '<span class="bad-text">Não foi possível acessar a câmera. Verifique a permissão ou use uma foto.</span>'; }
    };
    $('invoiceQrImage').onchange = async () => {
      const file = $('invoiceQrImage').files[0];
      if (!file) return;
      if (!detector) return status.innerHTML = '<span class="bad-text">A leitura de imagem não está disponível neste navegador. Digite a chave.</span>';
      try {
        const bitmap = await createImageBitmap(file);
        const codes = await detector.detect(bitmap);
        bitmap.close?.();
        if (!codes[0]?.rawValue) throw new Error();
        acceptQr(codes[0].rawValue);
      } catch { status.innerHTML = '<span class="bad-text">Não encontrei um QR Code legível nessa imagem.</span>'; }
    };
    $('invoiceQrXml').onchange = async () => {
      const file = $('invoiceQrXml').files[0];
      if (!file) return;
      try {
        const metadata = parseNFeXml(await file.text());
        const key = qrAccessKey($('invoiceQrValue').value);
        if (key && key !== metadata.access_key) throw new Error('O XML pertence a outra nota fiscal.');
        if (!key) $('invoiceQrValue').value = metadata.access_key;
        status.innerHTML = `<b>NF-e ${esc(metadata.invoice_number)}</b> · ${esc(metadata.supplier_name)}<br>${metadata.items.length} itens · ${money(metadata.total_value)} · pronta para revisão.`;
        $('modalSave').disabled = false;
      } catch (error) { status.innerHTML = `<span class="bad-text">${esc(error.message)}</span>`; $('modalSave').disabled = true; }
    };
  }

  entryChoice = function () {
    modal('Como deseja dar entrada?', `
      <div class="entry-choice entry-choice-v18">
        <button id="chooseManual" class="entry-option"><b>✍ Entrada manual</b><span>Selecione um produto e informe a quantidade recebida.</span></button>
        <button id="chooseXml" class="entry-option"><b>▣ Importar XML da NF-e</b><span>Leia todos os itens da nota e faça as entradas em conjunto.</span></button>
        <button id="chooseQr" class="entry-option qr-entry-option"><b>⌗ Escanear QR da nota</b><span>Leia a chave pela câmera, valide o XML e revise todos os itens.</span></button>
      </div>`, () => {});
    $('modalSave').classList.add('hidden');
    $('chooseManual').onclick = manualEntry;
    $('chooseXml').onclick = xmlEntry;
    $('chooseQr').onclick = qrEntry;
  };
})();
