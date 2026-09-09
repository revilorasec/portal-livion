(function () {
  const home = $('home');

  home.innerHTML = `
    <div class="hero executive-hero">
      <div>
        <span class="executive-eyebrow">PAINEL EXECUTIVO</span>
        <h2>Visão geral do estoque</h2>
        <p>Indicadores para acompanhar disponibilidade, consumo e pontos de atenção.</p>
      </div>
      <div class="actions">
        <button id="quickEntry" class="btn good">+ Entrada</button>
        <button id="quickExit" class="btn bad">− Saída</button>
        <button id="quickProduct" class="btn primary">+ Produto</button>
      </div>
    </div>

    <div class="executive-meta">
      <span id="dashboardUpdated">Atualizando…</span>
      <span id="dashboardLastMovement">Última movimentação: —</span>
    </div>

    <div class="kpis executive-kpis">
      <article class="kpi executive-kpi value" id="valueKpi" data-kpi-action="reports" tabindex="0" role="button">
        <div class="kpi-top"><small>Valor estimado do estoque</small><span class="kpi-icon">R$</span></div>
        <div class="n" id="kValue">R$ 0</div>
        <small>posição valorizada pelo custo médio</small>
        <span class="kpi-link">Abrir relatório <b>›</b></span>
      </article>
      <article class="kpi executive-kpi success" data-kpi-action="with-stock" tabindex="0" role="button">
        <div class="kpi-top"><small>Produtos disponíveis</small><span class="kpi-icon">✓</span></div>
        <div class="n" id="kWith">0</div>
        <small id="kWithContext">0% dos produtos ativos</small>
        <span class="kpi-link">Ver disponíveis <b>›</b></span>
      </article>
      <article class="kpi executive-kpi danger" data-kpi-action="without-stock" tabindex="0" role="button">
        <div class="kpi-top"><small>Itens críticos</small><span class="kpi-icon">!</span></div>
        <div class="n" id="kZero">0</div>
        <small id="kZeroContext">sem saldo ou negativos</small>
        <span class="kpi-link">Revisar agora <b>›</b></span>
      </article>
      <article class="kpi executive-kpi warning" data-kpi-action="low-stock" tabindex="0" role="button">
        <div class="kpi-top"><small>Abaixo do mínimo</small><span class="kpi-icon">↘</span></div>
        <div class="n" id="kLow">0</div>
        <small>produtos com alerta de reposição</small>
        <span class="kpi-link">Ver alertas <b>›</b></span>
      </article>
      <article class="kpi executive-kpi entry" data-kpi-action="entries" tabindex="0" role="button">
        <div class="kpi-top"><small>Entradas no mês</small><span class="kpi-icon">↘</span></div>
        <div class="n" id="kIn">0</div>
        <small id="kInContext">quantidade recebida</small>
        <span class="kpi-link">Abrir entradas <b>›</b></span>
      </article>
      <article class="kpi executive-kpi exit" data-kpi-action="exits" tabindex="0" role="button">
        <div class="kpi-top"><small>Saídas no mês</small><span class="kpi-icon">↗</span></div>
        <div class="n" id="kOut">0</div>
        <small id="kOutContext">quantidade retirada</small>
        <span class="kpi-link">Abrir saídas <b>›</b></span>
      </article>
      <article class="kpi executive-kpi neutral" data-kpi-action="active" tabindex="0" role="button">
        <div class="kpi-top"><small>Produtos ativos</small><span class="kpi-icon">▦</span></div>
        <div class="n" id="kActive">0</div>
        <small>cadastros disponíveis para uso</small>
        <span class="kpi-link">Abrir produtos <b>›</b></span>
      </article>
      <article class="kpi executive-kpi favorite" data-kpi-action="favorites" tabindex="0" role="button">
        <div class="kpi-top"><small>Produtos favoritos</small><span class="kpi-icon">★</span></div>
        <div class="n" id="kUnits">0</div>
        <small>itens acompanhados de perto</small>
        <span class="kpi-link">Ver favoritos <b>›</b></span>
      </article>
    </div>

    <div class="executive-grid primary-grid">
      <section class="card dashboard-card trend-card">
        <div class="dashboard-card-head">
          <div><h3>Ritmo das movimentações</h3><div class="sub">Número de registros de entrada e saída por mês</div></div>
          <button class="card-action" type="button" data-dashboard-action="movements">Ver movimentações</button>
        </div>
        <div class="chart-legend"><span><i class="legend-entry"></i>Entradas</span><span><i class="legend-exit"></i>Saídas</span></div>
        <canvas id="trend" class="chart executive-trend" tabindex="0" aria-label="Gráfico de entradas e saídas mensais"></canvas>
        <div id="trendSummary" class="chart-summary"></div>
      </section>
      <section class="card dashboard-card health-card">
        <div class="dashboard-card-head">
          <div><h3>Saúde do estoque</h3><div class="sub">Distribuição dos produtos ativos por situação</div></div>
        </div>
        <div class="health-layout">
          <canvas id="stockHealthChart" class="health-chart" tabindex="0" aria-label="Gráfico da situação do estoque"></canvas>
          <div id="stockHealthLegend" class="health-legend"></div>
        </div>
      </section>
    </div>

    <div class="executive-grid action-grid">
      <section class="card dashboard-card" id="favoritesCard">
        <div class="dashboard-card-head">
          <div><h3><span class="title-star">★</span> Favoritos</h3><div class="sub">Acesso rápido aos componentes que você acompanha</div></div>
          <button class="card-action" type="button" data-dashboard-action="stock">Abrir estoque</button>
        </div>
        <div id="favoriteList" class="dashboard-list"></div>
      </section>
      <section class="card dashboard-card">
        <div class="dashboard-card-head">
          <div><h3>Itens que exigem atenção</h3><div class="sub">Prioridade por saldo mais crítico</div></div>
          <button class="card-action" type="button" data-dashboard-action="critical">Ver todos</button>
        </div>
        <div id="alerts" class="dashboard-list"></div>
      </section>
    </div>

    <div class="executive-grid detail-grid">
      <section class="card dashboard-card consumption-card">
        <div class="dashboard-card-head">
          <div><h3>Produtos mais consumidos</h3><div class="sub">Quantidade retirada nos últimos 30 dias</div></div>
        </div>
        <canvas id="consChart" class="chart executive-consumption" tabindex="0" aria-label="Gráfico dos produtos mais consumidos"></canvas>
      </section>
      <section class="card dashboard-card">
        <div class="dashboard-card-head">
          <div><h3>Movimentações recentes</h3><div class="sub">Clique para abrir os detalhes do registro</div></div>
          <button class="card-action" type="button" data-dashboard-action="movements">Ver todas</button>
        </div>
        <div id="recentMini" class="dashboard-list recent-list"></div>
      </section>
    </div>`;

  const normalizeDashboardText = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
  const localDay = date => {
    const d = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return d.toISOString().slice(0, 10);
  };
  const monthBounds = value => {
    const source = String(value || '').slice(0, 10);
    const [year, month] = source.split('-').map(Number);
    if (!year || !month) return {from: '', to: ''};
    return {from: `${year}-${String(month).padStart(2, '0')}-01`, to: localDay(new Date(year, month, 0))};
  };
  const currentMonthBounds = () => {
    const now = new Date();
    return {from: localDay(new Date(now.getFullYear(), now.getMonth(), 1)), to: localDay(now)};
  };
  const getProduct = id => (D?.stock || []).find(product => product.product_id === id);
  const statusPriority = {NEGATIVO: 0, ZERADO: 1, BAIXO: 2, OK: 3};
  const roundedRect = (context, x, y, width, height, radius = 0) => {
    if (typeof context.roundRect === 'function') {
      context.roundRect(x, y, width, height, radius);
      return;
    }
    const values = Array.isArray(radius) ? radius : [radius, radius, radius, radius];
    const [topLeft = 0, topRight = topLeft, bottomRight = topLeft, bottomLeft = topRight] = values;
    context.moveTo(x + topLeft, y);
    context.lineTo(x + width - topRight, y);
    context.quadraticCurveTo(x + width, y, x + width, y + topRight);
    context.lineTo(x + width, y + height - bottomRight);
    context.quadraticCurveTo(x + width, y + height, x + width - bottomRight, y + height);
    context.lineTo(x + bottomLeft, y + height);
    context.quadraticCurveTo(x, y + height, x, y + height - bottomLeft);
    context.lineTo(x, y + topLeft);
    context.quadraticCurveTo(x, y, x + topLeft, y);
  };

  function openDashboardView(view) {
    document.querySelector(`.nav button[data-v="${view}"]`)?.click();
  }

  function setStockView(mode = '') {
    openDashboardView('stock');
    $('stockSearch').value = '';
    $('stockFilter').value = mode;
    $('stockFilter')._comboInput && ($('stockFilter')._comboInput.value = $('stockFilter').selectedOptions[0]?.textContent || '');
    renderStock();
  }

  function setMovementView(type = '', bounds = {}) {
    openDashboardView('movements');
    $('movFilter').value = type;
    $('movFrom').value = bounds.from || '';
    $('movTo').value = bounds.to || '';
    ['movProduct', 'movParty', 'movResponsible'].forEach(id => {
      $(id).value = '';
      $(id)._comboInput && ($(id)._comboInput.value = '');
    });
    $('movSearch').value = '';
    $('movFilter')._comboInput && ($('movFilter')._comboInput.value = $('movFilter').selectedOptions[0]?.textContent || '');
    renderMov();
  }

  function runDashboardAction(action) {
    const month = currentMonthBounds();
    if (action === 'reports') openDashboardView('reports');
    if (action === 'with-stock') setStockView('COM_SALDO');
    if (action === 'without-stock' || action === 'critical') setStockView('SEM_SALDO');
    if (action === 'low-stock') setStockView('BAIXO');
    if (action === 'entries') setMovementView('ENTRADA', month);
    if (action === 'exits') setMovementView('SAIDA', month);
    if (action === 'active') setStockView('ATIVOS');
    if (action === 'stock') setStockView('');
    if (action === 'movements') setMovementView('', {});
    if (action === 'favorites') $('favoritesCard')?.scrollIntoView({behavior: 'smooth', block: 'center'});
  }

  function wireExecutiveNavigation() {
    document.querySelectorAll('[data-kpi-action]').forEach(card => {
      const activate = () => runDashboardAction(card.dataset.kpiAction);
      card.onclick = activate;
      card.onkeydown = event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          activate();
        }
      };
    });
    document.querySelectorAll('[data-dashboard-action]').forEach(button => {
      button.onclick = () => runDashboardAction(button.dataset.dashboardAction);
    });
  }

  function ensureStockFilters() {
    const select = $('stockFilter');
    const additions = [
      ['ATIVOS', 'Produtos ativos'],
      ['COM_SALDO', 'Com saldo disponível'],
      ['SEM_SALDO', 'Sem saldo ou negativos']
    ];
    additions.forEach(([value, label]) => {
      if ([...select.options].some(option => option.value === value)) return;
      select.add(new Option(label, value));
    });
  }

  function stockRows() {
    const query = normalizeDashboardText($('stockSearch').value);
    const filter = $('stockFilter').value;
    return (D?.stock || []).filter(product => {
      const balance = Number(product.balance || 0);
      const filterMatches = !filter ||
        (filter === 'ATIVOS' && product.status === 'ATIVO') ||
        (filter === 'COM_SALDO' && product.status === 'ATIVO' && balance > 0) ||
        (filter === 'SEM_SALDO' && product.status === 'ATIVO' && balance <= 0) ||
        product.stock_status === filter;
      const searchMatches = !query || [product.pn, product.description, product.category, product.default_location, product.unit]
        .some(value => normalizeDashboardText(value).includes(query));
      return filterMatches && searchMatches;
    });
  }

  renderStock = function () {
    const rows = stockRows();
    $('stockBody').innerHTML = rows.map(product => `
      <tr class="clickable-row" tabindex="0" data-row-product="${esc(product.product_id)}">
        <td>${product.photo_url ? `<img class="thumb" src="${esc(product.photo_url)}" alt="">` : '—'}</td>
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
      const activate = () => {
        const product = getProduct(row.dataset.rowProduct);
        if (product) openProduct(product);
      };
      row.onclick = activate;
      row.onkeydown = event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          activate();
        }
      };
    });
    applyTableSort($('stockBody').closest('table'));
  };

  function renderFavorites() {
    const favorites = (D?.stock || [])
      .filter(product => product.is_favorite)
      .sort((a, b) => (statusPriority[a.stock_status] ?? 9) - (statusPriority[b.stock_status] ?? 9) || String(a.pn).localeCompare(String(b.pn), 'pt-BR'));
    $('kUnits').textContent = fmt(favorites.length);
    $('favoriteList').innerHTML = favorites.length ? favorites.slice(0, 8).map(product => `
      <button class="dashboard-list-row favorite-row" type="button" data-favorite-product="${esc(product.product_id)}">
        <span class="favorite-media">${product.photo_url ? `<img src="${esc(product.photo_url)}" alt="">` : '<span>★</span>'}</span>
        <span class="dashboard-list-copy"><b>${esc(product.pn)}</b><small>${esc(product.description)}</small></span>
        <span class="favorite-balance"><b>${fmt(product.balance)} ${esc(product.unit || '')}</b>${statusBadge(product.stock_status)}</span>
      </button>`).join('') : `
      <div class="dashboard-empty">
        <span class="empty-star">☆</span>
        <b>Nenhum produto favorito</b>
        <small>Abra um componente, clique na estrela e ele aparecerá aqui.</small>
        <button type="button" class="btn" data-dashboard-action="stock">Abrir estoque</button>
      </div>`;
    $('favoriteList').querySelectorAll('[data-favorite-product]').forEach(row => {
      row.onclick = () => {
        const product = getProduct(row.dataset.favoriteProduct);
        if (product) openProduct(product);
      };
    });
  }

  renderAlerts = function () {
    const rows = (D?.stock || [])
      .filter(product => product.status === 'ATIVO' && ['BAIXO', 'ZERADO', 'NEGATIVO'].includes(product.stock_status))
      .sort((a, b) => (statusPriority[a.stock_status] ?? 9) - (statusPriority[b.stock_status] ?? 9) || Number(a.balance) - Number(b.balance))
      .slice(0, 7);
    $('alerts').innerHTML = rows.length ? rows.map(product => `
      <button class="dashboard-list-row alert-dashboard-row" type="button" data-alert-product="${esc(product.product_id)}">
        <span class="alert-indicator ${String(product.stock_status).toLowerCase()}"></span>
        <span class="dashboard-list-copy"><b>${esc(product.pn)}</b><small>${esc(product.description)}</small></span>
        <span class="alert-balance"><b>${fmt(product.balance)} ${esc(product.unit || '')}</b><small>${product.min_stock == null ? 'mínimo não definido' : `mín. ${fmt(product.min_stock)}`}</small></span>
      </button>`).join('') : '<div class="dashboard-empty compact"><b>Nenhum alerta de estoque</b><small>Todos os produtos estão dentro dos parâmetros configurados.</small></div>';
    $('alerts').querySelectorAll('[data-alert-product]').forEach(row => {
      row.onclick = () => {
        const product = getProduct(row.dataset.alertProduct);
        if (product) openProduct(product);
      };
    });
  };

  renderRecent = function () {
    const rows = (D?.recent || []).slice(0, 7);
    $('recentMini').innerHTML = rows.length ? rows.map(movement => `
      <button class="dashboard-list-row recent-dashboard-row" type="button" data-recent-movement="${esc(movement.movement_id)}">
        <span class="movement-mini-icon ${movement.movement_type === 'ENTRADA' ? 'entry' : 'exit'}">${movement.movement_type === 'ENTRADA' ? '↘' : '↗'}</span>
        <span class="dashboard-list-copy"><b>${esc(productName(movement.product_id))}</b><small>${esc(responsibleName(movement.user_email))} · ${dt(movement.occurred_at)}</small></span>
        <span class="recent-quantity"><b>${fmt(movement.quantity)}</b><small>${movement.movement_type === 'ENTRADA' ? 'Entrada' : 'Saída'}</small></span>
      </button>`).join('') : '<div class="dashboard-empty compact"><b>Sem movimentações</b><small>As novas entradas e saídas aparecerão aqui.</small></div>';
    $('recentMini').querySelectorAll('[data-recent-movement]').forEach(row => {
      row.onclick = () => {
        const movement = (D?.recent || []).find(item => item.movement_id === row.dataset.recentMovement);
        if (movement) openMovementDetail(movement);
      };
    });
  };

  function setupCanvas(canvas, minimumHeight) {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(canvas.clientWidth, 280);
    const height = Math.max(canvas.clientHeight, minimumHeight);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const context = canvas.getContext('2d');
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    return {context, width, height};
  }

  function shortMonth(value) {
    const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
    return date.toLocaleDateString('pt-BR', {month: 'short'}).replace('.', '');
  }

  function compactNumber(value) {
    return new Intl.NumberFormat('pt-BR', {notation: Number(value) >= 10000 ? 'compact' : 'standard', maximumFractionDigits: 1}).format(Number(value || 0));
  }

  function drawTrendChart() {
    const canvas = $('trend');
    const rows = [...(D?.monthly || [])].sort((a, b) => String(a.month).localeCompare(String(b.month))).slice(-6);
    const {context, width, height} = setupCanvas(canvas, 270);
    const left = 46, right = 16, top = 22, bottom = 42;
    const chartWidth = width - left - right, chartHeight = height - top - bottom;
    const values = rows.flatMap(row => [Number(row.entry_movements || 0), Number(row.exit_movements || 0)]);
    const maximum = Math.max(1, ...values);
    const roundedMax = Math.max(5, Math.ceil(maximum / 5) * 5);
    context.font = '11px Segoe UI';
    context.textBaseline = 'middle';
    context.strokeStyle = '#e7edf5';
    context.fillStyle = '#76869b';
    context.lineWidth = 1;
    for (let step = 0; step <= 4; step++) {
      const value = roundedMax * step / 4;
      const y = top + chartHeight - chartHeight * step / 4;
      context.beginPath();
      context.moveTo(left, y);
      context.lineTo(width - right, y);
      context.stroke();
      context.textAlign = 'right';
      context.fillText(compactNumber(value), left - 8, y);
    }
    const groupWidth = chartWidth / Math.max(rows.length, 1);
    const barWidth = Math.min(25, groupWidth * 0.28);
    const hits = [];
    rows.forEach((row, index) => {
      const center = left + groupWidth * index + groupWidth / 2;
      const bars = [
        {type: 'ENTRADA', value: Number(row.entry_movements || 0), x: center - barWidth - 3, color: '#1b5f9e'},
        {type: 'SAIDA', value: Number(row.exit_movements || 0), x: center + 3, color: '#e6af00'}
      ];
      bars.forEach(bar => {
        const barHeight = chartHeight * bar.value / roundedMax;
        const y = top + chartHeight - barHeight;
        context.fillStyle = bar.color;
        context.beginPath();
        roundedRect(context, bar.x, y, barWidth, Math.max(barHeight, bar.value ? 3 : 0), [5, 5, 0, 0]);
        context.fill();
        hits.push({x: bar.x, y, width: barWidth, height: Math.max(barHeight, 8), type: bar.type, month: row.month, value: bar.value});
      });
      context.fillStyle = '#65758a';
      context.textAlign = 'center';
      context.fillText(shortMonth(row.month), center, height - 17);
    });
    canvas._dashboardHits = hits;
    canvas.onclick = event => {
      const rect = canvas.getBoundingClientRect(), x = event.clientX - rect.left, y = event.clientY - rect.top;
      const hit = hits.find(item => x >= item.x - 4 && x <= item.x + item.width + 4 && y >= item.y - 8 && y <= item.y + item.height + 8);
      if (hit) setMovementView(hit.type, monthBounds(hit.month));
    };
    canvas.onmousemove = event => {
      const rect = canvas.getBoundingClientRect(), x = event.clientX - rect.left, y = event.clientY - rect.top;
      const hit = hits.find(item => x >= item.x - 4 && x <= item.x + item.width + 4 && y >= item.y - 8 && y <= item.y + item.height + 8);
      canvas.style.cursor = hit ? 'pointer' : 'default';
      canvas.title = hit ? `${hit.type === 'ENTRADA' ? 'Entradas' : 'Saídas'} em ${shortMonth(hit.month)}: ${fmt(hit.value)} registros` : 'Clique em uma barra para abrir as movimentações do mês';
    };
    const latest = rows[rows.length - 1] || {};
    $('trendSummary').innerHTML = `<span><b>${fmt(latest.entry_movements || 0)}</b> entradas no mês</span><span><b>${fmt(latest.exit_movements || 0)}</b> saídas no mês</span>`;
  }

  function activeStatusCounts() {
    const counts = {OK: 0, BAIXO: 0, ZERADO: 0, NEGATIVO: 0};
    (D?.stock || []).filter(product => product.status === 'ATIVO').forEach(product => counts[product.stock_status] = (counts[product.stock_status] || 0) + 1);
    return counts;
  }

  function drawHealthChart() {
    const canvas = $('stockHealthChart');
    const {context, width, height} = setupCanvas(canvas, 220);
    const counts = activeStatusCounts();
    const items = [
      {status: 'OK', label: 'Saldo adequado', value: counts.OK, color: '#16804b', filter: 'OK'},
      {status: 'BAIXO', label: 'Abaixo do mínimo', value: counts.BAIXO, color: '#d88a00', filter: 'BAIXO'},
      {status: 'ZERADO', label: 'Zerados', value: counts.ZERADO, color: '#d94b55', filter: 'ZERADO'},
      {status: 'NEGATIVO', label: 'Negativos', value: counts.NEGATIVO, color: '#8f1d2c', filter: 'NEGATIVO'}
    ];
    const total = items.reduce((sum, item) => sum + item.value, 0) || 1;
    const centerX = width / 2, centerY = height / 2, radius = Math.min(width, height) * 0.38, inner = radius * 0.62;
    let start = -Math.PI / 2;
    const arcs = [];
    items.forEach(item => {
      const end = start + Math.PI * 2 * item.value / total;
      if (item.value) {
        context.beginPath();
        context.arc(centerX, centerY, radius, start, end);
        context.arc(centerX, centerY, inner, end, start, true);
        context.closePath();
        context.fillStyle = item.color;
        context.fill();
      }
      arcs.push({...item, start, end});
      start = end;
    });
    const available = total ? (counts.OK + counts.BAIXO) / total * 100 : 0;
    context.fillStyle = '#14233b';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = '700 27px Segoe UI';
    context.fillText(`${available.toLocaleString('pt-BR', {maximumFractionDigits: 1})}%`, centerX, centerY - 8);
    context.font = '11px Segoe UI';
    context.fillStyle = '#728197';
    context.fillText('disponíveis', centerX, centerY + 17);
    const hitFromEvent = event => {
      const rect = canvas.getBoundingClientRect(), x = event.clientX - rect.left - centerX, y = event.clientY - rect.top - centerY;
      const distance = Math.hypot(x, y);
      if (distance < inner || distance > radius) return null;
      let angle = Math.atan2(y, x);
      if (angle < -Math.PI / 2) angle += Math.PI * 2;
      return arcs.find(item => item.value && angle >= item.start && angle <= item.end) || null;
    };
    canvas.onclick = event => {
      const item = hitFromEvent(event);
      if (item) setStockView(item.filter);
    };
    canvas.onmousemove = event => {
      const item = hitFromEvent(event);
      canvas.style.cursor = item ? 'pointer' : 'default';
      canvas.title = item ? `${item.label}: ${fmt(item.value)} produtos` : 'Clique em uma faixa para abrir os produtos';
    };
    $('stockHealthLegend').innerHTML = items.map(item => `<button type="button" data-health-filter="${item.filter}"><i style="background:${item.color}"></i><span>${item.label}</span><b>${fmt(item.value)}</b></button>`).join('');
    $('stockHealthLegend').querySelectorAll('[data-health-filter]').forEach(button => button.onclick = () => setStockView(button.dataset.healthFilter));
  }

  function drawConsumptionChart() {
    const canvas = $('consChart');
    const items = (D?.consumption || []).filter(item => Number(item.out_30d || 0) > 0).slice(0, 8);
    const {context, width, height} = setupCanvas(canvas, 310);
    const left = Math.min(190, Math.max(126, width * 0.33)), right = 54, top = 10, bottom = 10;
    const chartWidth = width - left - right, rowHeight = (height - top - bottom) / Math.max(items.length, 1);
    const maximum = Math.max(1, ...items.map(item => Number(item.out_30d || 0)));
    const hits = [];
    context.textBaseline = 'middle';
    items.forEach((item, index) => {
      const product = getProduct(item.product_id);
      const value = Number(item.out_30d || 0), y = top + index * rowHeight + rowHeight * 0.2, barHeight = rowHeight * 0.58;
      const barWidth = chartWidth * value / maximum;
      context.fillStyle = '#edf2f8';
      context.beginPath();
      roundedRect(context, left, y, chartWidth, barHeight, 6);
      context.fill();
      context.fillStyle = '#214f8f';
      context.beginPath();
      roundedRect(context, left, y, Math.max(barWidth, 3), barHeight, 6);
      context.fill();
      context.fillStyle = '#263b58';
      context.font = '600 11px Segoe UI';
      context.textAlign = 'right';
      const label = String(item.pn || item.description || item.product_id);
      context.fillText(label.length > 25 ? `${label.slice(0, 24)}…` : label, left - 9, y + barHeight / 2);
      context.textAlign = 'left';
      context.fillStyle = '#14233b';
      context.font = '700 11px Segoe UI';
      context.fillText(`${fmt(value)} ${product?.unit || ''}`.trim(), left + chartWidth + 8, y + barHeight / 2);
      hits.push({x: 0, y, width, height: barHeight, item, label, value});
    });
    if (!items.length) {
      context.fillStyle = '#728197';
      context.textAlign = 'center';
      context.font = '13px Segoe UI';
      context.fillText('Nenhum consumo registrado nos últimos 30 dias.', width / 2, height / 2);
    }
    canvas.onclick = event => {
      const rect = canvas.getBoundingClientRect(), y = event.clientY - rect.top;
      const hit = hits.find(item => y >= item.y && y <= item.y + item.height);
      if (hit) {
        const product = getProduct(hit.item.product_id);
        if (product) openProduct(product);
      }
    };
    canvas.onmousemove = event => {
      const rect = canvas.getBoundingClientRect(), y = event.clientY - rect.top;
      const hit = hits.find(item => y >= item.y && y <= item.y + item.height);
      canvas.style.cursor = hit ? 'pointer' : 'default';
      canvas.title = hit ? `${hit.label}: ${fmt(hit.value)} retirados nos últimos 30 dias` : 'Clique em uma barra para abrir o produto';
    };
  }

  drawCharts = function () {
    drawTrendChart();
    drawHealthChart();
    drawConsumptionChart();
  };

  function renderExecutiveDashboard() {
    if (!D) return;
    const dashboard = D.dashboard || {};
    const counts = activeStatusCounts();
    const active = Number(dashboard.active_products || 0);
    const available = Number(dashboard.products_with_stock || counts.OK || 0);
    $('kActive').textContent = fmt(active);
    $('kWith').textContent = fmt(available);
    $('kWithContext').textContent = `${active ? (available / active * 100).toLocaleString('pt-BR', {maximumFractionDigits: 1}) : 0}% dos produtos ativos`;
    $('kZero').textContent = fmt(Number(dashboard.out_of_stock || counts.ZERADO + counts.NEGATIVO));
    $('kZeroContext').textContent = `${fmt(counts.ZERADO)} zerados · ${fmt(counts.NEGATIVO)} negativos`;
    $('kLow').textContent = fmt(dashboard.low_stock);
    $('kIn').textContent = fmt(dashboard.entries_month);
    $('kOut').textContent = fmt(dashboard.exits_month);
    $('kValue').textContent = money(dashboard.estimated_value);
    const latestMonth = [...(D.monthly || [])].sort((a, b) => String(b.month).localeCompare(String(a.month)))[0] || {};
    $('kInContext').textContent = `${fmt(latestMonth.entry_movements || 0)} registros de entrada`;
    $('kOutContext').textContent = `${fmt(latestMonth.exit_movements || 0)} registros de saída`;
    $('valueKpi').classList.toggle('hidden', !D.permissions.viewValues);
    const latestMovement = (D.recent || [])[0];
    $('dashboardUpdated').textContent = `Painel atualizado às ${new Date().toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'})}`;
    $('dashboardLastMovement').textContent = `Última movimentação: ${latestMovement ? dt(latestMovement.occurred_at) : '—'}`;
    renderFavorites();
    renderAlerts();
    renderRecent();
    drawCharts();
    wireExecutiveNavigation();
  }

  const dashboardApiBase = api;
  api = async function (path, options = {}) {
    if (path === '/product' && options.method === 'POST' && $('pFavoriteValue') && typeof options.body === 'string') {
      const body = JSON.parse(options.body);
      body.is_favorite = $('pFavoriteValue').value === 'true';
      options = {...options, body: JSON.stringify(body)};
    }
    return dashboardApiBase(path, options);
  };

  const dashboardProductBase = openProduct;
  openProduct = function (product = {}) {
    dashboardProductBase(product);
    const form = $('modalBody')?.querySelector('.form');
    if (!form || $('pFavoriteValue')) return;
    let selected = !!product.is_favorite;
    const field = document.createElement('div');
    field.className = 'field full favorite-editor';
    field.innerHTML = `<input id="pFavoriteValue" type="hidden" value="${selected}"><button id="pFavoriteButton" class="favorite-toggle" type="button" aria-pressed="${selected}"></button><small>Os favoritos aparecem no painel inicial para consulta rápida.</small>`;
    form.prepend(field);
    const button = $('pFavoriteButton'), value = $('pFavoriteValue');
    const paint = () => {
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
      button.innerHTML = selected ? '<span>★</span><b>Produto favorito</b><small>Clique para remover dos favoritos</small>' : '<span>☆</span><b>Marcar como favorito</b><small>Clique na estrela para acompanhar no Início</small>';
      value.value = String(selected);
    };
    paint();
    button.disabled = !D.permissions.product;
    button.onclick = async () => {
      const previous = selected;
      selected = !selected;
      paint();
      if (!product.product_id) return;
      button.disabled = true;
      try {
        await api('/product-favorite', {method: 'POST', body: JSON.stringify({product_id: product.product_id, is_favorite: selected})});
        product.is_favorite = selected;
        const current = getProduct(product.product_id);
        if (current) current.is_favorite = selected;
        renderFavorites();
        wireExecutiveNavigation();
        flash(selected ? 'Produto adicionado aos favoritos.' : 'Produto removido dos favoritos.');
      } catch (error) {
        selected = previous;
        paint();
        alert(error.message);
      } finally {
        button.disabled = !D.permissions.product;
      }
    };
  };

  const dashboardRenderBase = render;
  render = function () {
    dashboardRenderBase();
    renderExecutiveDashboard();
  };

  ensureStockFilters();
  $('stockSearch').oninput = renderStock;
  $('stockFilter').onchange = renderStock;
  $('quickEntry').onclick = () => movement('ENTRADA');
  $('quickExit').onclick = () => movement('SAIDA');
  $('quickProduct').onclick = () => openProduct();
  wireExecutiveNavigation();
})();
