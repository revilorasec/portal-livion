(function () {
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();

  function ensureStockSupplierFilter() {
    const toolbar = $('stock')?.querySelector('.toolbar');
    if (!toolbar) return null;
    let select = $('stockSupplier');
    if (!select) {
      select = document.createElement('select');
      select.id = 'stockSupplier';
      select.className = 'select';
      toolbar.appendChild(select);
      select.onchange = renderStock;
    }
    const current = select.value;
    select.innerHTML = '<option value="">Todos os fornecedores</option>' + (D?.suppliers || [])
      .filter(supplier => personStatus(supplier) === 'ATIVO')
      .sort((a, b) => tableTextCollator.compare(a.name || '', b.name || ''))
      .map(supplier => `<option value="${esc(supplier.supplier_id)}">${esc(supplier.name)}</option>`).join('');
    if ([...select.options].some(option => option.value === current)) select.value = current;
    makeSearchableDropdown('stockSupplier', renderStock);
    select._comboRefresh?.();
    return select;
  }

  renderStock = function () {
    if (!D) return;
    const supplierSelect = ensureStockSupplierFilter();
    const query = normalize($('stockSearch').value);
    const status = $('stockFilter').value;
    const supplierId = supplierSelect?.value || '';
    const rows = (D.stock || []).filter(product => {
      const supplierOk = !supplierId || (product.supplier_ids || []).includes(supplierId);
      const searchOk = !query || [product.pn, product.description, product.category, product.default_location, product.unit, ...(product.supplier_names || [])]
        .some(value => normalize(value).includes(query));
      return (!status || product.stock_status === status) && supplierOk && searchOk;
    });
    $('stockBody').innerHTML = rows.map(product => `
      <tr class="clickable-row" tabindex="0" data-row-product="${esc(product.product_id)}">
        <td>${product.photo_url ? `<img class="thumb" src="${esc(product.photo_url)}" alt="Foto de ${esc(product.pn)}">` : '—'}</td>
        <td><b>${esc(product.pn)}</b>${product.is_favorite ? '<span class="stock-favorite" title="Favorito">★</span>' : ''}</td>
        <td>${esc(product.description)}</td>
        <td>${esc(product.category || '—')}</td>
        <td>${esc(product.default_location || '—')}</td>
        <td class="num"><b>${fmt(product.balance)}</b></td>
        <td>${esc(product.unit || '—')}</td>
        <td class="num">${product.min_stock == null ? '—' : fmt(product.min_stock)}</td>
        <td>${statusBadge(product.stock_status)}</td>
      </tr>`).join('') || '<tr><td colspan="9" class="empty">Nenhum produto encontrado.</td></tr>';
    $('stockBody').querySelectorAll('[data-row-product]').forEach(row => {
      const open = () => openProduct((D.stock || []).find(product => product.product_id === row.dataset.rowProduct));
      row.onclick = open;
      row.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } };
    });
    applyTableSort($('stockBody').closest('table'));
  };

  function replaceLocationWithSearchableSelect(product) {
    const old = $('pLoc');
    if (!old) return;
    const select = document.createElement('select');
    select.id = 'pLoc';
    select.innerHTML = '<option value="">Pesquise uma localização…</option>' + catalogValues('LOCATION', product.default_location || '')
      .sort((a, b) => tableTextCollator.compare(a, b))
      .map(value => `<option value="${esc(value)}" ${value === (product.default_location || '') ? 'selected' : ''}>${esc(value)}</option>`).join('');
    old.replaceWith(select);
    makeSearchableDropdown('pLoc');
  }

  function compatibilityField(product) {
    const field = document.createElement('div');
    field.className = 'field full product-parts-field';
    const selected = new Set(product.part_ids || []);
    field.innerHTML = `
      <label>Peças em que este componente pode ser usado</label>
      <input id="productPartSearch" type="search" placeholder="Digite PN, descrição, fabricante ou cliente…">
      <div id="productPartOptions" class="product-part-options"></div>
      <small>Marque uma ou mais peças compatíveis. Novas peças são cadastradas em Cadastros.</small>`;
    const form = $('modalBody')?.querySelector('.form');
    const locationField = $('pLoc')?.closest('.field');
    if (locationField) locationField.after(field); else form?.appendChild(field);
    const draw = () => {
      const query = normalize($('productPartSearch').value);
      const parts = (D.parts || []).filter(part => part.status !== 'INATIVO' && (!query || [part.pn, part.description, part.manufacturer, part.client_name].some(value => normalize(value).includes(query))));
      $('productPartOptions').innerHTML = parts.map(part => `
        <label class="product-part-option">
          <input type="checkbox" data-product-part="${esc(part.part_id)}" ${selected.has(part.part_id) ? 'checked' : ''}>
          ${part.photo_url ? `<img src="${esc(part.photo_url)}" alt="">` : '<span class="part-photo-placeholder">▦</span>'}
          <span><b>${esc(part.pn)}</b><small>${esc(part.description)}${part.manufacturer ? ' · ' + esc(part.manufacturer) : ''}</small></span>
        </label>`).join('') || '<div class="empty compact-empty">Nenhuma peça encontrada.</div>';
      $('productPartOptions').querySelectorAll('[data-product-part]').forEach(input => input.onchange = () => input.checked ? selected.add(input.dataset.productPart) : selected.delete(input.dataset.productPart));
    };
    $('productPartSearch').oninput = draw;
    field._selectedPartIds = selected;
    draw();
  }

  const apiV17Base = api;
  api = async function (path, options = {}) {
    if (path === '/product' && options.method === 'POST' && typeof options.body === 'string') {
      const body = JSON.parse(options.body);
      const field = $('modalBody')?.querySelector('.product-parts-field');
      if (field?._selectedPartIds) body.part_ids = [...field._selectedPartIds];
      options = {...options, body: JSON.stringify(body)};
    }
    try {
      return await apiV17Base(path, options);
    } catch (error) {
      const message = String(error?.message || error);
      if (message.includes('inventory_parts_pn_unique') || (path === '/part' && message.includes('duplicate key'))) {
        throw new Error('Já existe uma peça cadastrada com este PN.');
      }
      throw error;
    }
  };

  const openProductV17Base = openProduct;
  openProduct = function (product = {}) {
    openProductV17Base(product);
    replaceLocationWithSearchableSelect(product);
    compatibilityField(product);
    upgradeSearchableSelects($('modalBody'));
  };

  function openPart(part = {}) {
    const clients = [...new Set((D.parts || []).map(item => item.client_name).filter(Boolean))].sort(tableTextCollator.compare);
    modal(part.part_id ? 'Editar peça' : 'Cadastrar peça', `
      <div class="form part-form">
        <div class="field"><label>PN</label><input id="partPN" value="${esc(part.pn || '')}" required></div>
        <div class="field"><label>Descrição</label><input id="partDescription" value="${esc(part.description || '')}" required></div>
        <div class="field"><label>Fabricante</label><input id="partManufacturer" value="${esc(part.manufacturer || '')}"></div>
        <div class="field"><label>Cliente que envia para reparo</label><input id="partClient" list="partClientList" value="${esc(part.client_name || '')}" placeholder="Digite para pesquisar ou cadastrar"></div>
        <datalist id="partClientList">${clients.map(client => `<option value="${esc(client)}"></option>`).join('')}</datalist>
        <div class="field"><label>Status</label><select id="partStatus"><option value="ATIVO" ${part.status !== 'INATIVO' ? 'selected' : ''}>ATIVO</option><option value="INATIVO" ${part.status === 'INATIVO' ? 'selected' : ''}>INATIVO</option></select></div>
        <div class="field part-duplicate-warning hidden" id="partDuplicateWarning"></div>
        ${photoFields('partPhoto', 2)}
        <div class="field full"><label>Fotos atuais</label>${gallery(part)}</div>
        <div class="field full"><label>Observações</label><textarea id="partNotes">${esc(part.notes || '')}</textarea></div>
      </div>`, async () => {
        const body = {part_id: part.part_id || null, pn: $('partPN').value.trim(), description: $('partDescription').value.trim(), manufacturer: $('partManufacturer').value.trim(), client_name: $('partClient').value.trim(), status: $('partStatus').value, notes: $('partNotes').value.trim()};
        if (!body.pn || !body.description) throw new Error('Informe o PN e a descrição da peça.');
        const result = await api('/part', {method: 'POST', body: JSON.stringify(body)});
        await uploadPhotos('PART', result.part_id, 'partPhoto', 2);
        closeModal();
        flash('Peça salva.');
        await reload();
      });
    const checkDuplicate = () => {
      const pn = normalize($('partPN').value), description = normalize($('partDescription').value);
      const duplicate = (D.parts || []).find(item => item.part_id !== part.part_id && ((pn && normalize(item.pn) === pn) || (description && normalize(item.description) === description)));
      const warning = $('partDuplicateWarning');
      warning.classList.toggle('hidden', !duplicate);
      warning.innerHTML = duplicate ? `<b>Possível duplicidade</b><br>${esc(duplicate.pn)} — ${esc(duplicate.description)}` : '';
    };
    $('partPN').oninput = checkDuplicate;
    $('partDescription').oninput = checkDuplicate;
    upgradeSearchableSelects($('modalBody'));
  }

  function wireCatalogCard(card, type) {
    card.querySelector('[data-add-location]').onclick = async () => {
      const value = card.querySelector('[data-new-location]').value.trim();
      if (!value) return;
      await api('/catalog-option', {method: 'POST', body: JSON.stringify({option_type: type, value})});
      await reload();
    };
    card.querySelectorAll('[data-remove-location]').forEach(button => button.onclick = async () => {
      const option = (D.catalog || []).find(item => item.option_type === type && item.value === button.dataset.removeLocation);
      if (!option) return;
      await api('/catalog-option', {method: 'POST', body: JSON.stringify({...option, active: false})});
      await reload();
    });
  }

  function appendLocationCard(grid) {
    const card = document.createElement('div');
    card.id = 'locationsCard';
    card.className = 'card registry-card locations-card';
    const values = catalogValues('LOCATION', '').sort((a, b) => tableTextCollator.compare(a, b));
    card.innerHTML = `
      <div class="registry-head"><div><h3>Localizações</h3><div class="sub">Locais físicos do estoque</div></div></div>
      <div class="catalog-add"><input data-new-location placeholder="Nova localização"><button class="btn" data-add-location>Adicionar</button></div>
      <div class="registry-list location-list">${values.map(value => `<div class="location-row"><b>${esc(value)}</b><button class="icon-button" title="Desativar localização" data-remove-location="${esc(value)}">×</button></div>`).join('') || '<div class="empty compact-empty">Nenhuma localização cadastrada.</div>'}</div>`;
    grid.appendChild(card);
    wireCatalogCard(card, 'LOCATION');
  }

  function appendPartsCard(grid) {
    const card = document.createElement('div');
    card.id = 'partsCard';
    card.className = 'card registry-card parts-card';
    card.innerHTML = `
      <div class="registry-head"><div><h3>Peças para reparo</h3><div class="sub" id="partsCount"></div></div><button id="newPart" class="btn">+ Peça</button></div>
      <div class="registry-tools"><input id="partsSearch" class="search" placeholder="Pesquisar PN, peça, fabricante ou cliente…"><select id="partsStatus" class="select"><option value="">Todos</option><option value="ATIVO">Ativos</option><option value="INATIVO">Inativos</option></select></div>
      <div id="partsList" class="registry-list"></div>`;
    grid.appendChild(card);
    const draw = () => {
      const query = normalize($('partsSearch').value), status = $('partsStatus').value;
      const rows = (D.parts || []).filter(part => (!status || part.status === status) && (!query || [part.pn, part.description, part.manufacturer, part.client_name].some(value => normalize(value).includes(query))));
      $('partsCount').textContent = `${rows.length} de ${(D.parts || []).length} cadastradas`;
      $('partsList').innerHTML = rows.map(part => `
        <div class="registry-row part-row clickable-row" tabindex="0" data-part-id="${esc(part.part_id)}">
          <span class="person-status ${part.status === 'INATIVO' ? 'inactive' : 'active'}">${esc(part.status || 'ATIVO')}</span>
          ${part.photo_url ? `<img class="registry-photo" src="${esc(part.photo_url)}" alt="">` : '<span class="registry-photo placeholder"></span>'}
          <span class="registry-data"><b>${esc(part.pn)} — ${esc(part.description)}</b><small>${esc([part.manufacturer, part.client_name].filter(Boolean).join(' · ') || 'Sem fabricante ou cliente')}</small></span>
        </div>`).join('') || '<div class="empty compact-empty">Nenhuma peça encontrada.</div>';
      $('partsList').querySelectorAll('[data-part-id]').forEach(row => {
        const open = () => openPart((D.parts || []).find(part => part.part_id === row.dataset.partId));
        row.onclick = open;
        row.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } };
      });
    };
    $('newPart').disabled = !D.permissions.part;
    $('newPart').onclick = () => openPart();
    $('partsSearch').oninput = draw;
    $('partsStatus').onchange = draw;
    makeSearchableDropdown('partsStatus', draw);
    draw();
  }

  const renderListsV17Base = renderLists;
  renderLists = function () {
    renderListsV17Base();
    const grid = $('cadastros')?.querySelector('.grid');
    if (!grid) return;
    appendLocationCard(grid);
    appendPartsCard(grid);
    if ($('exportRegistries')) $('exportRegistries').onclick = exportRegistriesV17;
  };

  function exportRegistriesV17() {
    const workbook = XLSX.utils.book_new();
    const add = (name, rows) => XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), name);
    add('Fornecedores', (D.suppliers || []).map(item => ({Status: personStatus(item), Nome: item.name, Documento: item.document || '', Telefone: item.phone || '', Email: item.email || '', Endereço: item.address || ''})));
    add('Solicitantes', (D.requesters || []).map(item => ({Status: personStatus(item), Nome: item.name, Documento: item.document || '', Telefone: item.phone || '', Email: item.email || '', Departamento: item.department || ''})));
    add('Listas de produtos', (D.catalog || []).map(item => ({Lista: item.option_type, Opção: item.value, Status: item.active === false ? 'INATIVO' : 'ATIVO'})));
    add('Peças', (D.parts || []).map(item => ({Status: item.status, PN: item.pn, Descrição: item.description, Fabricante: item.manufacturer || '', Cliente: item.client_name || '', Observações: item.notes || ''})));
    XLSX.writeFile(workbook, 'Cadastros_Estoque_Livion.xlsx');
  }

  const renderV17Base = render;
  render = function () {
    renderV17Base();
    ensureStockSupplierFilter();
    renderStock();
  };

  ensureStockSupplierFilter();
  $('stockSearch').placeholder = 'Buscar PN, descrição, categoria, local ou fornecedor…';
})();
