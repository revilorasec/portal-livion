/* Fotos identificadas e anexos privados do cadastro de produtos. */
(() => {
  const PHOTO_GUIDES = [
    ['Visão geral do item', 'Foto do componente ou insumo inteiro, sem cortar nenhuma parte, mostrando seu formato e aparência.'],
    ['Identificação — PN e inscrições', 'Foto aproximada e nítida das etiquetas ou marcações, permitindo ler PN, fabricante, modelo, valores e especificações.'],
    ['Verso do item', 'Foto completa do lado oposto à visão geral, mostrando o que ficou escondido na primeira imagem.'],
    ['Detalhes — conexões e acabamento', 'Foto aproximada de conectores, pinos, terminais, encaixes, furos ou textura do material.']
  ];
  let productMediaState = null;

  function formatBytes(bytes) {
    const value = Number(bytes || 0);
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / 1024 / 1024).toFixed(1)} MB`;
  }

  async function sendProductFile(productId, file) {
    const form = new FormData();
    form.append('file', file);
    return api(`/product-file?product_id=${encodeURIComponent(productId)}`, {method: 'POST', body: form});
  }

  function renderPendingFiles() {
    const list = $('productPendingFiles');
    if (!list || !productMediaState) return;
    list.innerHTML = productMediaState.pending.map((file, index) => `<span class="product-file-chip pending"><span><b>${esc(file.name)}</b><small>${formatBytes(file.size)} · aguardando salvar</small></span><button type="button" data-remove-pending="${index}" aria-label="Remover ${esc(file.name)}" title="Remover">×</button></span>`).join('');
    list.querySelectorAll('[data-remove-pending]').forEach(button => button.onclick = () => {
      productMediaState.pending.splice(Number(button.dataset.removePending), 1);
      renderPendingFiles();
    });
  }

  function renderStoredFiles(files) {
    const list = $('productStoredFiles');
    if (!list) return;
    if (productMediaState) productMediaState.storedCount = files.length;
    list.innerHTML = files.length ? files.map(file => `<span class="product-file-chip"><a href="${esc(file.url)}" target="_blank" rel="noopener"><b>${esc(file.original_name)}</b><small>${formatBytes(file.byte_size)}</small></a><button type="button" data-delete-product-file="${esc(file.file_id)}" aria-label="Excluir ${esc(file.original_name)}" title="Excluir arquivo">×</button></span>`).join('') : '<small class="muted">Nenhum arquivo anexado.</small>';
    list.querySelectorAll('[data-delete-product-file]').forEach(button => button.onclick = async () => {
      button.disabled = true;
      try {
        await api(`/product-file?file_id=${encodeURIComponent(button.dataset.deleteProductFile)}`, {method: 'DELETE'});
        button.closest('.product-file-chip')?.remove();
        if (!list.querySelector('.product-file-chip')) list.innerHTML = '<small class="muted">Nenhum arquivo anexado.</small>';
        flash('Arquivo excluído.');
      } catch (error) {
        button.disabled = false;
        alert(error.message);
      }
    });
  }

  function configurePhotoFields(product) {
    PHOTO_GUIDES.forEach(([title, description], index) => {
      const input = $('pp' + (index + 1));
      const field = input?.closest('.field');
      if (!input || !field) return;
      input.classList.add('product-photo-native-input');
      input.removeAttribute('capture');
      input.accept = 'image/jpeg,image/png,image/webp';
      const label = field.querySelector('label');
      if (label) label.innerHTML = `<b>${index + 1}. ${esc(title)}</b><small>${esc(description)}</small>`;
      const actions = document.createElement('div');
      actions.className = 'product-photo-actions';
      actions.innerHTML = `<button type="button" class="btn" data-photo-camera="${index + 1}">📷 Tirar foto</button><button type="button" class="btn" data-photo-gallery="${index + 1}">▧ Escolher da galeria</button><span id="productPhotoStatus${index + 1}">${product['photo_url' + (index ? '_' + (index + 1) : '')] ? 'Foto atual cadastrada' : 'Nenhuma foto selecionada'}</span>`;
      input.after(actions);
      actions.querySelector('[data-photo-camera]').onclick = () => { input.setAttribute('capture', 'environment'); input.click(); };
      actions.querySelector('[data-photo-gallery]').onclick = () => { input.removeAttribute('capture'); input.click(); };
      input.onchange = () => {
        input.removeAttribute('capture');
        const status = $('productPhotoStatus' + (index + 1));
        if (status) status.textContent = input.files?.[0]?.name || 'Nenhuma foto selecionada';
      };
    });

    const current = [...document.querySelectorAll('#modalBody .field.full')].find(field => field.querySelector('label')?.textContent.trim() === 'Fotos atuais');
    if (current) {
      current.classList.add('product-current-photos');
      current.innerHTML = `<label>Fotos atuais do produto</label><div class="product-current-photo-grid">${PHOTO_GUIDES.map(([title], index) => {
        const key = 'photo_url' + (index ? '_' + (index + 1) : ''), url = product[key];
        return `<div class="product-current-photo"><b>${index + 1}. ${esc(title)}</b>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener"><img src="${esc(url)}" alt="${esc(title)}"></a>` : '<span>Sem foto</span>'}</div>`;
      }).join('')}</div>`;
    }
  }

  function addProductFilesPanel(product) {
    const notes = $('pNotes')?.closest('.field');
    if (!notes) return;
    const panel = document.createElement('section');
    panel.className = 'field full product-files-panel';
    panel.innerHTML = `<label><b>Arquivos do produto</b><small>Adicione datasheets, manuais, certificados, planilhas ou outros documentos. Até 20 arquivos, com no máximo 20 MB cada.</small></label><input id="productFilesInput" type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip,application/pdf"><button id="productFilesChoose" type="button" class="btn">＋ Adicionar arquivos</button><div id="productPendingFiles" class="product-file-list"></div><div id="productStoredFiles" class="product-file-list"><small class="muted">${product.product_id ? 'Carregando arquivos…' : 'Os arquivos serão enviados ao salvar o produto.'}</small></div>`;
    notes.before(panel);
    const input = $('productFilesInput');
    $('productFilesChoose').onclick = () => input.click();
    input.onchange = () => {
      const existing = new Set(productMediaState.pending.map(file => `${file.name}:${file.size}`));
      for (const file of input.files || []) {
        if (file.size > 20 * 1024 * 1024) { alert(`O arquivo “${file.name}” ultrapassa 20 MB.`); continue; }
        if ((productMediaState.storedCount || 0) + productMediaState.pending.length >= 20) { alert('Este produto aceita até 20 arquivos.'); break; }
        if (!existing.has(`${file.name}:${file.size}`)) productMediaState.pending.push(file);
      }
      input.value = '';
      renderPendingFiles();
    };
    if (product.product_id) api(`/product-file?product_id=${encodeURIComponent(product.product_id)}`).then(result => renderStoredFiles(result.files || [])).catch(error => { $('productStoredFiles').innerHTML = `<small class="bad-text">${esc(error.message)}</small>`; });
  }

  const apiBase = api;
  api = async function (path, options = {}) {
    const result = await apiBase(path, options);
    if (path === '/product' && options.method === 'POST' && productMediaState?.pending?.length) {
      const productId = result.product_id, files = [...productMediaState.pending];
      productMediaState.pending = [];
      for (let index = 0; index < files.length; index++) {
        try { await sendProductFile(productId, files[index]); }
        catch (error) {
          productMediaState.pending.push(...files.slice(index));
          renderPendingFiles();
          throw new Error(`O produto foi salvo, mas o arquivo “${files[index].name}” não foi enviado: ${error.message}`);
        }
      }
    }
    return result;
  };

  const closeModalBase = closeModal;
  closeModal = function () { productMediaState = null; closeModalBase(); };

  const openProductBase = openProduct;
  openProduct = function (product = {}) {
    openProductBase(product);
    productMediaState = {productId: product.product_id || null, pending: [], storedCount: 0};
    configurePhotoFields(product);
    addProductFilesPanel(product);
  };
})();
