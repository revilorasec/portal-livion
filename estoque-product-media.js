/* Fotos identificadas e anexos privados do cadastro de produtos. */
(() => {
  const PHOTO_GUIDES = [
    ['Visão geral do item', 'Foto do componente ou insumo inteiro, sem cortar nenhuma parte, mostrando seu formato e aparência.'],
    ['Identificação — PN e inscrições', 'Foto aproximada e nítida das etiquetas ou marcações, permitindo ler PN, fabricante, modelo, valores e especificações.'],
    ['Verso do item', 'Foto completa do lado oposto à visão geral, mostrando o que ficou escondido na primeira imagem.'],
    ['Detalhes — conexões e acabamento', 'Foto aproximada de conectores, pinos, terminais, encaixes, furos ou textura do material.']
  ];
  let productMediaState = null;
  let activeCamera = null;

  function stopCamera() {
    activeCamera?.getTracks?.().forEach(track => track.stop());
    activeCamera = null;
    document.querySelector('.product-camera-backdrop')?.remove();
  }

  function photoFile(input) {
    return input?._capturedFile || input?.files?.[0] || null;
  }

  async function compressPhoto(file) {
    if (!file || !String(file.type || '').startsWith('image/')) throw new Error('Selecione uma imagem válida.');
    let bitmap;
    try {
      bitmap = await createImageBitmap(file, {resizeWidth: 1600, resizeQuality: 'high'});
    } catch {
      return file;
    }
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d', {alpha: false}).drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .82));
    if (!blob) return file;
    const base = String(file.name || 'foto').replace(/\.[^.]+$/, '').slice(0, 90) || 'foto';
    return new File([blob], `${base}.jpg`, {type: 'image/jpeg', lastModified: Date.now()});
  }

  function showSelectedPhoto(input, file) {
    const number = String(input.id || '').replace(/\D/g, '');
    const status = $('productPhotoStatus' + number), preview = $('productPhotoPreview' + number);
    if (status) status.textContent = file ? `${file.name} · pronta para salvar` : 'Nenhuma foto selecionada';
    if (!preview) return;
    if (preview.dataset.objectUrl) URL.revokeObjectURL(preview.dataset.objectUrl);
    if (!file) { preview.removeAttribute('src'); preview.classList.add('hidden'); return; }
    const url = URL.createObjectURL(file);
    preview.dataset.objectUrl = url;
    preview.src = url;
    preview.classList.remove('hidden');
  }

  async function openCamera(input, title) {
    if (!navigator.mediaDevices?.getUserMedia) {
      input.setAttribute('capture', 'environment');
      input.click();
      return;
    }
    stopCamera();
    const backdrop = document.createElement('div');
    backdrop.className = 'product-camera-backdrop';
    backdrop.innerHTML = `<section class="product-camera"><header><div><b>${esc(title)}</b><small>Centralize o item e mantenha a câmera firme.</small></div><button type="button" data-camera-close aria-label="Fechar">×</button></header><video autoplay playsinline muted></video><div class="product-camera-actions"><button type="button" class="btn" data-camera-cancel>Cancelar</button><button type="button" class="btn primary" data-camera-shot>📷 Capturar foto</button></div></section>`;
    document.body.appendChild(backdrop);
    const close = () => stopCamera();
    backdrop.querySelector('[data-camera-close]').onclick = close;
    backdrop.querySelector('[data-camera-cancel]').onclick = close;
    backdrop.onclick = event => { if (event.target === backdrop) close(); };
    try {
      activeCamera = await navigator.mediaDevices.getUserMedia({audio: false, video: {facingMode: {ideal: 'environment'}, width: {ideal: 1280, max: 1920}, height: {ideal: 720, max: 1080}}});
      const video = backdrop.querySelector('video');
      video.srcObject = activeCamera;
      await video.play();
      backdrop.querySelector('[data-camera-shot]').onclick = async () => {
        const maxSide = 1600, scale = Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
        canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
        canvas.getContext('2d', {alpha: false}).drawImage(video, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .82));
        if (!blob) return alert('Não foi possível gerar a foto. Tente novamente.');
        input._capturedFile = new File([blob], `foto-${Date.now()}.jpg`, {type: 'image/jpeg', lastModified: Date.now()});
        input.value = '';
        showSelectedPhoto(input, input._capturedFile);
        close();
      };
    } catch {
      close();
      alert('Não foi possível abrir a câmera. Verifique a permissão do navegador ou use “Escolher da galeria”.');
    }
  }

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
      actions.innerHTML = `<button type="button" class="btn" data-photo-camera="${index + 1}">📷 Tirar foto</button><button type="button" class="btn" data-photo-gallery="${index + 1}">▧ Escolher da galeria</button><span id="productPhotoStatus${index + 1}">${product['photo_url' + (index ? '_' + (index + 1) : '')] ? 'Foto atual cadastrada' : 'Nenhuma foto selecionada'}</span><img id="productPhotoPreview${index + 1}" class="product-photo-preview hidden" alt="Prévia da foto ${index + 1}">`;
      input.after(actions);
      actions.querySelector('[data-photo-camera]').onclick = () => openCamera(input, `${index + 1}. ${title}`);
      actions.querySelector('[data-photo-gallery]').onclick = () => { input._capturedFile = null; input.removeAttribute('capture'); input.click(); };
      input.onchange = () => {
        input.removeAttribute('capture');
        input._capturedFile = null;
        showSelectedPhoto(input, input.files?.[0] || null);
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

  function normalizedProductText(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('pt-BR');
  }

  function configureExistingProductResolution(product) {
    if (product.product_id) return;
    const pnInput = $('pPN'), warning = $('duplicateWarning');
    if (!pnInput || !warning) return;
    const refresh = () => {
      const typedPn = normalizedProductText(pnInput.value);
      const existing = typedPn ? (D.stock || []).find(item => normalizedProductText(item.pn) === typedPn) : null;
      productMediaState.replaceProductId = existing?.product_id || null;
      if (!existing) { warning.classList.remove('existing-product-resolution'); return; }
      warning.style.display = 'block';
      warning.classList.add('existing-product-resolution');
      warning.innerHTML = `<b>Este PN já está cadastrado</b><span>${esc(existing.pn)} — ${esc(existing.description)}</span><strong>Ao salvar, o sistema atualizará esse cadastro e manterá o saldo, o histórico e as notas vinculadas.</strong><small>Para criar outro item separado, informe um PN diferente.</small>`;
    };
    pnInput.addEventListener('input', refresh);
    refresh();
  }

  const apiBase = api;
  api = async function (path, options = {}) {
    if (path === '/product' && options.method === 'POST' && typeof options.body === 'string') {
      const body = JSON.parse(options.body);
      if (!String(body.pn || '').trim()) throw new Error('Informe o PN do produto.');
      if (!String(body.description || '').trim()) throw new Error('Informe a descrição do produto.');
      if (!String(body.item_type || '').trim()) throw new Error('Selecione o tipo do produto.');
      if (productMediaState?.replaceProductId && !body.product_id) body.product_id = productMediaState.replaceProductId;
      options = {...options, body: JSON.stringify(body)};
    }
    let result;
    try {
      result = await apiBase(path, options);
    } catch (error) {
      if (path === '/product' && String(error?.message || error).includes('INVALID_PRODUCT')) throw new Error('Não foi possível salvar: confira PN, descrição e tipo do produto.');
      throw error;
    }
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

  uploadPhotos = async function (type, id, prefix, count) {
    for (let index = 1; index <= count; index++) {
      const input = $(prefix + index), selected = photoFile(input);
      if (!selected) continue;
      const file = await compressPhoto(selected);
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) throw new Error('Não foi possível preparar a foto. Use JPG, PNG ou WebP.');
      const form = new FormData();
      form.append('file', file);
      await api(`/media?entity_type=${type}&entity_id=${encodeURIComponent(id)}&position=${index}`, {method: 'POST', body: form});
    }
  };

  const closeModalBase = closeModal;
  closeModal = function () {
    stopCamera();
    document.querySelectorAll('.product-photo-preview[data-object-url]').forEach(image => URL.revokeObjectURL(image.dataset.objectUrl));
    productMediaState = null;
    closeModalBase();
  };

  const openProductBase = openProduct;
  openProduct = function (product = {}) {
    openProductBase(product);
    productMediaState = {productId: product.product_id || null, pending: [], storedCount: 0, replaceProductId: null};
    configurePhotoFields(product);
    addProductFilesPanel(product);
    configureExistingProductResolution(product);
  };
})();
