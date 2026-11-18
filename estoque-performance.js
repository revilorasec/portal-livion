(function () {
  const numbers = new Intl.NumberFormat('pt-BR');
  const currency = new Intl.NumberFormat('pt-BR', {style: 'currency', currency: 'BRL'});
  const dates = new Intl.DateTimeFormat('pt-BR', {year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'});
  const indexes = new WeakMap(), normalizedText = new Map();
  const normalize = value => {
    const text = String(value || '');
    if (normalizedText.has(text)) return normalizedText.get(text);
    const result = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
    if (normalizedText.size >= 20000) normalizedText.clear();
    normalizedText.set(text, result);
    return result;
  };
  function lookup(rows, key, value, fold = false) {
    if (!rows) return undefined;
    let record = indexes.get(rows);
    if (!record || record.length !== rows.length) {
      record = {length: rows.length, fields: new Map()};
      indexes.set(rows, record);
    }
    const field = key + (fold ? ':fold' : '');
    if (!record.fields.has(field)) {
      const map = new Map();
      for (const row of rows) {
        const id = fold ? String(row[key] || '').toLocaleLowerCase('pt-BR') : row[key];
        if (!map.has(id)) map.set(id, row);
      }
      record.fields.set(field, map);
    }
    return record.fields.get(field).get(fold ? String(value || '').toLocaleLowerCase('pt-BR') : value);
  }
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function makeSearchableDropdown(select, onChange) {
    if (!select) return;
    if (select.dataset.smartComboReady) { select._comboRefresh?.(); return; }
    const id = select.id, oldInput = select._comboInput;
    if (oldInput && !oldInput.closest('.smart-combo')) oldInput.remove();
    document.getElementById(id + 'SearchList')?.remove();
    select.dataset.comboReady = select.dataset.smartComboReady = '1';
    select.classList.add('combo-native');
    const wrap = document.createElement('div'), input = document.createElement('input'), toggle = document.createElement('button'), menu = document.createElement('div');
    wrap.className = 'smart-combo';
    input.type = 'search'; input.className = 'smart-combo-input'; input.autocomplete = 'off';
    input.placeholder = select.options[0]?.text || 'Digite para pesquisar…';
    input.setAttribute('aria-label', input.placeholder); input.setAttribute('role', 'combobox'); input.setAttribute('aria-expanded', 'false');
    toggle.type = 'button'; toggle.className = 'smart-combo-toggle'; toggle.textContent = '⌄'; toggle.title = 'Mostrar opções';
    menu.className = 'smart-combo-menu hidden'; menu.setAttribute('role', 'listbox');
    select.before(wrap); wrap.append(input, toggle, menu, select);
    let active = -1, visible = [], cached = null, suppressFocus = false, blurTimer;
    const observer = new MutationObserver(() => { cached = null; });
    observer.observe(select, {childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['disabled', 'label', 'value']});
    const options = () => {
      // Consume same-turn option changes as well as asynchronously delivered mutations.
      if (observer.takeRecords().length) cached = null;
      if (!cached) cached = Array.from(select.options, option => ({value: option.value, label: option.text.trim(), disabled: option.disabled}))
        .filter(option => !option.disabled).map(option => ({...option, search: normalize(option.label)}));
      return cached;
    };
    const close = () => { menu.classList.add('hidden'); input.setAttribute('aria-expanded', 'false'); active = -1; };
    const sync = () => { const option = options().find(option => option.value === select.value); input.value = option?.value ? option.label : ''; };
    const choose = option => {
      select.value = option.value; input.value = option.value ? option.label : '';
      close(); select.dispatchEvent(new Event('change', {bubbles: true}));
      clearTimeout(blurTimer); suppressFocus = true; input.focus({preventScroll: true}); suppressFocus = false;
    };
    const draw = () => {
      const query = normalize(input.value).trim(), all = options(), matches = [];
      if (!query) { const placeholder = all.find(option => !option.value); if (placeholder) matches.push(placeholder); }
      let count = 0;
      for (const option of all) {
        if (option.value && (!query || option.search.includes(query))) { matches.push(option); if (++count >= 60) break; }
      }
      visible = matches;
      menu.innerHTML = visible.map((option, i) => `<button type="button" role="option" data-smart-index="${i}" class="${option.value ? '' : 'clear-option'}">${escape(option.label)}</button>`).join('') || '<span class="smart-combo-empty">Nenhum resultado</span>';
      menu.classList.remove('hidden'); input.setAttribute('aria-expanded', 'true'); active = -1;
    };
    menu.onclick = event => { const button = event.target.closest('[data-smart-index]'); if (button && menu.contains(button)) choose(visible[Number(button.dataset.smartIndex)]); };
    input.onfocus = () => { clearTimeout(blurTimer); if (!suppressFocus) draw(); };
    input.oninput = () => { select.value = ''; draw(); };
    input.onkeydown = event => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault(); if (menu.classList.contains('hidden')) draw();
        if (!visible.length) return;
        active = Math.max(0, Math.min(visible.length - 1, active + (event.key === 'ArrowDown' ? 1 : -1)));
        const buttons = menu.querySelectorAll('button');
        buttons.forEach((button, i) => button.classList.toggle('active', i === active));
        buttons[active]?.scrollIntoView({block: 'nearest'});
      } else if (event.key === 'Enter' && visible[active]) { event.preventDefault(); choose(visible[active]); }
      else if (event.key === 'Escape') close();
    };
    toggle.onclick = event => {
      event.stopPropagation();
      if (!menu.classList.contains('hidden')) close();
      else if (document.activeElement === input) draw();
      else input.focus({preventScroll: true});
    };
    input.onblur = () => { blurTimer = setTimeout(close, 160); };
    select.addEventListener('change', sync);
    if (typeof onChange === 'function') select.addEventListener('change', onChange);
    select._comboInput = input;
    select._comboRefresh = () => { cached = null; sync(); if (!menu.classList.contains('hidden')) draw(); };
    sync();
  }
  function install() {
    const view = document.getElementById('movements'), body = document.getElementById('movBody');
    if (!view || !body || typeof renderMov !== 'function') return;
    const renderMovBase = renderMov;
    let dirty = true;
    renderMov = function () {
      if (!view.classList.contains('active')) { dirty = true; return; }
      dirty = false; return renderMovBase();
    };
    const visibilityChanged = () => {
      if (view.classList.contains('active')) { if (dirty) renderMov(); }
      else { body.replaceChildren(); dirty = true; }
    };
    // Observe only the view's visibility, not thousands of table cells.
    new MutationObserver(visibilityChanged).observe(view, {attributes: true, attributeFilter: ['class']});
    visibilityChanged();
    for (const [id, run] of [['stockSearch', () => renderStock()], ['movSearch', () => renderMov()], ['invoiceSearch', () => renderInvoices()]]) {
      const input = document.getElementById(id); if (!input) continue;
      let timer, pending = false;
      const flush = () => { if (!pending) return; clearTimeout(timer); pending = false; run(); };
      input.oninput = () => { clearTimeout(timer); pending = true; timer = setTimeout(flush, 100); };
      input.addEventListener('change', flush);
      input.addEventListener('keydown', event => { if (event.key === 'Enter') flush(); });
    }
  }
  window.InventoryPerformance = {
    formatNumber: value => numbers.format(Number(value || 0)),
    formatMoney: value => currency.format(Number(value || 0)),
    formatDate: value => { if (!value) return '—'; const date = new Date(value); return Number.isNaN(date.getTime()) ? 'Invalid Date' : dates.format(date); },
    normalize, lookup, makeSearchableDropdown
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, {once: true}); else install();
})();
