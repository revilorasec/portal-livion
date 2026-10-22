import { monthDays, plannedHours, closing, teamClosing, comparison, officialOptions, optionIncludesDay } from './lib/hours-calculations.mjs?v=2';
import { createSimulation } from './lib/hours-simulation-ui.mjs?v=1';

const BASE = 'https://kvfjjtkwxxbvzlicwnrz.supabase.co/functions/v1/hours-api';
const $ = id => document.getElementById(id);
const fmtMoney = cents => cents === null || cents === undefined ? 'Pendente' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
const fmtNum = (number, digits = 2) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: digits }).format(number);
const moneyInputFormat = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const moneyValue = cents => cents === null || cents === undefined ? '' : moneyInputFormat.format(cents / 100);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const state = { data: null, month: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).slice(0, 7), selected: '', tab: 'person', excluded: new Set(), editEmployee: null, deleteEmployee: null, deleteImpact: null, busy: false };
const gridDrafts = new Map();
let gridQueue = Promise.resolve(), pendingGrid = 0, gridFailed = false;
const staffDrafts = new Map(), staffPending = new Map(), settingsDrafts = new Map();
let staffQueue = Promise.resolve(), pendingStaff = 0;
const simulation = createSimulation({ getData: () => state.data, getMonth: () => state.month, moneyValue, fmtMoney, fmtNum, esc });
const errors = {
  UNAUTHENTICATED: 'Sua sessão terminou. Abra o aplicativo novamente pelo Portal Livion.',
  FORBIDDEN: 'Este aplicativo ainda não foi liberado para sua conta no Portal.',
  AUTH_UNAVAILABLE: 'A validação de acesso está indisponível. Tente atualizar em instantes.',
  CONFLICT: 'Alguém alterou este registro. Os dados atuais foram recarregados; confira antes de salvar novamente.',
  INVALID_HOURS: 'Informe horas entre 0 e 24, com no máximo duas casas decimais.',
  INVALID_VALUE: 'Verifique o valor informado.',
  INVALID_NAME: 'Informe o nome do funcionário.',
  SERVER_ERROR: 'Não foi possível salvar. Tente novamente.'
};

async function portalToken(force = false) {
  for (const host of [window.parent, window.opener]) {
    try { if (host && host !== window && typeof host.__PORTAL_GET_TOKEN__ === 'function') return await host.__PORTAL_GET_TOKEN__(force); } catch {}
  }
  if (!('BroadcastChannel' in window)) return '';
  return await new Promise(resolve => {
    const channel = new BroadcastChannel('livion-portal-session');
    const requestId = crypto.randomUUID();
    const timeout = setTimeout(() => { channel.close(); resolve(''); }, 2000);
    channel.onmessage = event => {
      if (event.data?.type !== 'PORTAL_TOKEN_RESPONSE' || event.data.requestId !== requestId) return;
      clearTimeout(timeout); channel.close(); resolve(event.data.token || '');
    };
    channel.postMessage({ type: 'PORTAL_TOKEN_REQUEST', requestId });
  });
}

async function api(path, options = {}, retry = true) {
  const token = await portalToken(!retry);
  if (!token) throw new Error('UNAUTHENTICATED');
  const response = await fetch(BASE + path, {
    ...options,
    cache: 'no-store',
    headers: { authorization: `Bearer ${token}`, ...(options.body ? { 'content-type': 'application/json' } : {}), ...options.headers }
  });
  if (response.status === 401 && retry) return api(path, options, false);
  let result = {};
  try { result = await response.json(); } catch {}
  if (!response.ok) throw new Error(result.error || `HTTP_${response.status}`);
  return result;
}

function status(message, error = false) {
  $('saveStatus').textContent = message;
  $('saveStatus').style.color = error ? '#ffd2d2' : '';
}
function showError(error) {
  const code = String(error?.message || error);
  $('error').textContent = errors[code] || code;
  $('error').hidden = false;
  status('Ação não concluída', true);
}
function clearError() { $('error').hidden = true; $('error').textContent = ''; }
function cents(value) {
  if (value === '') return null;
  if (!/^(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}$/.test(value)) throw new Error('INVALID_VALUE');
  const number = Number(value.replace(/\D/g, ''));
  if (!Number.isSafeInteger(number)) throw new Error('INVALID_VALUE');
  return number;
}
function formatMoneyInput(element, inputType = '') {
  const raw = element.value;
  const digits = raw.replace(/\D/g, '');
  const right = raw.slice(element.selectionStart ?? raw.length).replace(/\D/g, '').length;
  if (!digits || (inputType.startsWith('delete') && /^0+$/.test(digits))) {
    element.value = '';
    element.setCustomValidity('');
    return;
  }
  const amount = Number(digits);
  if (!Number.isSafeInteger(amount)) {
    element.setCustomValidity('Verifique o valor informado.');
    return;
  }
  element.setCustomValidity('');
  element.value = moneyValue(amount);
  let cursor = element.value.length, remaining = right;
  while (cursor > 0 && remaining > 0) {
    cursor--;
    if (/\d/.test(element.value[cursor])) remaining--;
  }
  element.setSelectionRange(cursor, cursor);
}
function decimal(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 24) throw new Error('INVALID_HOURS');
  return Math.round(number * 100) / 100;
}
function employeeRows() {
  const data = state.data;
  if (!data) return [];
  const historical = new Set([...data.entries.map(row => row.employee_id), ...data.overtime.map(row => row.employee_id)]);
  return data.employees.filter(row => !row.archived_at || historical.has(row.id));
}
function maps() {
  const data = state.data;
  const m = {
    days: monthDays(state.month),
    plans: new Map(data.plans.map(row => [row.day, row])),
    overrides: new Map(data.plans.map(row => [row.day, row.planned_hours])),
    entries: new Map(data.entries.map(row => [`${row.employee_id}|${row.day}`, row])),
    overtime: new Map(data.overtime.map(row => [row.employee_id, row]))
  };
  for (const draft of gridDrafts.values()) {
    if (draft.month !== state.month) continue;
    if (draft.path === '/plan') m.overrides.set(draft.day, draft.value);
    else {
      const key = `${draft.employee_id}|${draft.day}`;
      m.entries.set(key, { ...m.entries.get(key), [draft.field]: draft.value });
    }
  }
  return m;
}
function calculated(grid = null) {
  const m = maps();
  if (grid) {
    for (const element of grid.querySelectorAll('[data-plan-day], [data-entry-id]')) {
      if (!element.validity.valid) continue;
      if (element.matches('[data-plan-day]')) m.overrides.set(element.dataset.planDay, Number(element.value));
      else {
        const { entryId, day, field } = element.dataset;
        const key = `${entryId}|${day}`;
        m.entries.set(key, { ...m.entries.get(key), [field]: field === 'note' ? element.value : Number(element.value) });
      }
    }
  }
  const rows = employeeRows();
  return { ...m, rows, results: new Map(rows.map(row => [row.id, closing(row.id, m.days, state.data.settings, m.overrides, m.entries, m.overtime.get(row.id))])) };
}
function metric(label, value, type = '') { return `<div class="metric ${type}"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`; }
function input(value, attributes) { return `<input ${attributes} value="${esc(value)}">`; }
function editable(row) { return state.data.permissions.edit && !row?.archived_at; }
function weekday(day) { return ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][day.weekday]; }
function dayLabel(day) { return `${String(day.day).padStart(2, '0')}/${state.month.slice(5)} ${weekday(day)}`; }
function plannedInput(day, m, row = null) {
  if (day.weekday === 0) return '—';
  if (row && !optionIncludesDay(day, m.overtime.get(row.id)?.active_option)) return '—';
  const value = plannedHours(day, state.data.settings, m.overrides);
  const title = m.plans.has(day.date) ? 'Ajuste manual para esta data' : 'Padrão geral do mês';
  return input(value, `type="number" min="0" max="24" step="0.01" inputmode="decimal" data-plan-day="${day.date}" title="${title}" ${state.data.permissions.edit ? '' : 'disabled'}`);
}
function entryInput(row, day, item, field, type = 'number') {
  if (day.weekday === 0) return '—';
  const disabled = editable(row) ? '' : 'disabled';
  const value = item?.[field] ?? (field === 'note' ? '' : 0);
  const extra = field === 'actual_hours' ? 'min="0" max="24" step="0.01" inputmode="decimal"' : field === 'pieces' ? 'min="0" max="100000" step="1" inputmode="numeric"' : 'maxlength="500"';
  return input(value, `type="${type}" data-entry-id="${row.id}" data-day="${day.date}" data-field="${field}" ${extra} ${disabled}`);
}
function renderSettings() {
  const s = state.data.settings;
  $('month').value = state.month;
  $('bonus').value = moneyValue(s.bonus_cents || 0);
  $('pieceRate').value = moneyValue(s.piece_cents || 0);
  $('weekdayHours').value = s.weekday_hours;
  $('saturdayHours').value = s.saturday_hours;
  for (const [id, value] of Object.entries(settingsDrafts.get(state.month) || {})) $(id).value = value;
  $('settingsUpdated').textContent = s.revision ? `Revisão ${s.revision}` : 'Ainda não configurado';
  for (const element of $('settingsForm').querySelectorAll('input,button')) element.disabled = !state.data.permissions.edit;
  $('addEmployee').hidden = !state.data.permissions.edit;
}
function renderStaff() {
  const rows = state.data.employees;
  const selectable = employeeRows();
  const selectableIds = new Set(selectable.map(row => row.id));
  const overtime = new Map(state.data.overtime.map(item => [item.employee_id, item]));
  $('staffList').innerHTML = rows.length ? rows.map(row => {
    const item = overtime.get(row.id);
    const draftValue = field => staffDrafts.get(`${state.month}|${row.id}|${field}`)?.raw ?? (field.endsWith('_cents') ? moneyValue(item?.[field]) : item?.[field] || '');
    const disabled = editable(row) ? '' : 'disabled';
    return `<article class="staff-item ${row.archived_at ? 'archived' : ''}">
      <div class="staff-heading"><strong>${esc(row.name)}</strong>${row.archived_at ? '<small>Registro antigo arquivado</small>' : ''}<div class="staff-actions">${selectableIds.has(row.id) ? `<button class="outline" type="button" data-employee-open="${row.id}">Detalhes</button>` : ''}${editable(row) ? `<button class="outline" type="button" data-employee-edit="${row.id}">Editar</button>` : ''}${state.data.permissions.delete ? `<button class="danger" type="button" data-employee-delete="${row.id}">Excluir</button>` : ''}</div></div>
      <form class="staff-overtime" data-overtime-employee="${row.id}" aria-label="Horas extras de ${esc(row.name)}">
        <div class="official-fields">${officialOptions.map((option, index) => `<label>${option.label} (R$)<input data-overtime-field="${option.field}" ${index === 0 ? 'data-overtime-amount' : ''} data-money type="text" inputmode="numeric" autocomplete="off" placeholder="Pendente" value="${esc(draftValue(option.field))}" ${disabled}></label>`).join('')}</div>
        <label>Opção ativa<select data-overtime-field="active_option" ${disabled}><option value="">${item?.amount_cents !== null && item?.amount_cents !== undefined ? 'Valor anterior preservado' : 'Escolha a opção que vamos usar'}</option>${officialOptions.map(option => `<option value="${option.key}" ${draftValue('active_option') === option.key ? 'selected' : ''}>${option.label}</option>`).join('')}</select></label>
        ${item?.amount_cents !== null && item?.amount_cents !== undefined ? `<p class="muted">Valor anterior preservado: ${fmtMoney(item.amount_cents)}</p>` : ''}
        <label>Observação<input data-overtime-note data-overtime-field="note" maxlength="500" placeholder="Opcional" value="${esc(draftValue('note'))}" ${disabled}></label>
        <div class="staff-overtime-foot"><span data-staff-status role="status">${[...staffDrafts.values()].some(draft => draft.id === row.id && draft.month === state.month) ? 'Há valores não salvos' : item ? 'Valores salvos' : 'Aguardando valores'}</span>${editable(row) ? '<button class="primary" type="submit">Salvar valores</button>' : ''}</div>
      </form>
    </article>`;
  }).join('') : '<p class="empty">Nenhum funcionário cadastrado. Use “+ Adicionar funcionário” para começar.</p>';
  if (!selectableIds.has(state.selected)) state.selected = selectable.find(row => !row.archived_at)?.id || selectable[0]?.id || '';
  $('selectedEmployee').innerHTML = selectable.map(row => `<option value="${row.id}">${esc(row.name)}${row.archived_at ? ' (registro antigo)' : ''}</option>`).join('');
  $('selectedEmployee').value = state.selected;
}
function renderPayments(m, preview = false) {
  const all = [...m.results.values()];
  const sum = teamClosing(all);
  $('teamMetrics').innerHTML = metric('Funcionários no período', m.rows.length) + metric('Horas realizadas', `${fmtNum(sum.actual)} h`) + metric('Peças reparadas', sum.pieces, '') + metric(sum.complete ? 'Total acumulado da equipe' : 'Total acumulado · parcial', fmtMoney(sum.known), sum.complete ? 'total' : 'pending');
  $('paymentStatus').textContent = preview ? 'Prévia do lançamento · saia do campo para salvar' : 'Valores dos lançamentos salvos';
  $('paymentRows').innerHTML = m.rows.length ? m.rows.map(row => {
    const value = m.results.get(row.id);
    return `<tr data-payment-employee="${row.id}">
      <th scope="row">${esc(row.name)}${value.pending.length ? `<small class="pending-text">${esc(value.pending.join(' · '))}</small>` : ''}</th>
      <td>${fmtNum(value.actual)} h<small>${fmtNum(value.planned)} h previstas</small></td>
      <td>${fmtNum(value.pieces, 0)}</td>
      <td>${fmtMoney(value.official)}<small>${esc(value.officialLabel)}</small></td>
      <td>${fmtMoney(value.bonus)}</td>
      <td>${fmtMoney(value.production)}</td>
      <td class="payment-total"><strong data-payment-total>${fmtMoney(value.known)}</strong>${value.pending.length ? '<small class="pending-text">Parcial · há pendências</small>' : '<small>Acumulado até agora</small>'}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="7" class="empty">Cadastre os funcionários em Configurações para acompanhar os valores.</td></tr>';
  $('teamTotal').textContent = !m.rows.length ? 'Cadastre um funcionário para iniciar o fechamento.' : sum.complete ? `Total acumulado da equipe: ${fmtMoney(sum.known)}` : `Valor conhecido da equipe: ${fmtMoney(sum.known)} · ${sum.pending} fechamento(s) pendente(s). Não representa o valor final a pagar.`;
}
function renderPersonSummary(m) {
  const row = m.rows.find(item => item.id === state.selected);
  if (!row) { $('personMetrics').innerHTML = ''; $('personTable').innerHTML = ''; $('overtimeState').textContent = 'Selecione um funcionário'; $('personOfficial').textContent = 'Pendente'; $('personOfficialNote').textContent = ''; $('editOfficial').hidden = true; return; }
  const result = m.results.get(row.id);
  const official = m.overtime.get(row.id);
  $('personMetrics').innerHTML = metric('Hora extra informada', fmtMoney(result.official)) + metric('Bônus pelas horas trabalhadas', fmtMoney(result.bonus)) + metric(`Reparos · ${result.pieces} peça(s)`, fmtMoney(result.production)) + metric(result.total === null ? 'Total acumulado · parcial' : 'Total a pagar até agora', fmtMoney(result.known), result.total === null ? 'pending' : 'total');
  $('overtimeState').textContent = result.official === null ? result.pending.find(item => /valor|opção/.test(item)) || 'Aguardando contador' : `${result.officialLabel} · ativo`;
  $('personOfficial').textContent = fmtMoney(result.official);
  $('personOfficialNote').textContent = official?.note || '';
  $('editOfficial').hidden = !editable(row);
}
function renderPerson(m) {
  renderPersonSummary(m);
  const row = m.rows.find(item => item.id === state.selected);
  if (!row) return;
  $('personTable').innerHTML = `<thead><tr><th>Data</th><th>Horas previstas</th><th>Horas feitas</th><th>Peças</th><th>Observações</th></tr></thead><tbody>${m.days.map(day => {
    const item = m.entries.get(`${row.id}|${day.date}`);
    return `<tr class="${day.weekday === 0 ? 'sunday' : day.weekday === 6 ? 'saturday' : ''}"><td>${dayLabel(day)}</td><td>${plannedInput(day, m, row)}</td><td>${entryInput(row, day, item, 'actual_hours')}</td><td>${entryInput(row, day, item, 'pieces')}</td><td>${entryInput(row, day, item, 'note', 'text')}</td></tr>`;
  }).join('')}</tbody>`;
}

function barChart(id, rows, field, suffix = '', digits = 2) {
  const valid = rows.map(row => Number(row.value[field]) || 0);
  const highest = Math.max(1, ...valid);
  $(id).innerHTML = rows.length ? rows.map(row => {
    const value = row.value[field];
    const width = value === null ? 0 : Math.max(0, Math.min(100, Number(value) / highest * 100));
    return `<div class="bar-row"><div class="bar-name">${esc(row.name)}</div><div class="bar-track"><div class="bar-fill" style="width:${width}%"></div></div><div class="bar-value">${value === null ? '—' : fmtNum(value, digits) + suffix}</div></div>`;
  }).join('') : '<p class="empty">Sem dados para o filtro.</p>';
}
function trendChart(rows, days, m) {
  if (!rows.length) return '<p class="empty">Selecione ao menos um funcionário.</p>';
  const limit = days.length;
  const series = rows.map((row, index) => {
    let cumulative = 0;
    const values = days.map(day => { cumulative += Number(m.entries.get(`${row.id}|${day.date}`)?.pieces || 0); return cumulative; });
    return { name: row.name, color: ['#168cc1', '#f0aa21', '#4d7a35', '#a44477', '#5c57a0', '#dc6745'][index % 6], values };
  });
  const max = Math.max(1, ...series.flatMap(row => row.values));
  const x = index => 38 + index * 18;
  const y = value => 218 - value / max * 188;
  const width = Math.max(500, x(limit - 1) + 24);
  const lines = series.map(row => `<polyline fill="none" stroke="${row.color}" stroke-width="2.6" points="${row.values.map((value, index) => `${x(index)},${y(value)}`).join(' ')}"/>`).join('');
  const ticks = days.filter((_, index) => index === 0 || index === limit - 1 || index % 5 === 4).map(day => `<text x="${x(day.day - 1)}" y="244" text-anchor="middle">${day.day}</text>`).join('');
  return `<svg role="img" aria-label="Peças acumuladas por funcionário, do dia 1 ao ${limit}" viewBox="0 0 ${width} 260" preserveAspectRatio="xMinYMid meet"><line x1="38" y1="218" x2="${width - 8}" y2="218" stroke="#b6cadb"/><line x1="38" y1="30" x2="38" y2="218" stroke="#b6cadb"/><text x="12" y="35">${max}</text><text x="18" y="218">0</text>${ticks}${lines}</svg><div class="chart-key">${series.map(row => `<span><i style="background:${row.color}"></i>${esc(row.name)}</span>`).join('')}</div>`;
}
function renderCompare(m) {
  const maxDay = m.days.length;
  $('compareDay').max = maxDay;
  if (!$('compareDay').value || Number($('compareDay').value) > maxDay) $('compareDay').value = maxDay;
  const cutOff = Math.max(1, Math.min(maxDay, Number($('compareDay').value) || maxDay));
  const minimum = Math.max(0, Number($('compareMinimum').value) || 0);
  $('compareStaff').innerHTML = m.rows.map(row => `<label><input type="checkbox" data-compare-id="${row.id}" ${state.excluded.has(row.id) ? '' : 'checked'}><span>${esc(row.name)}</span></label>`).join('');
  const selected = m.rows.filter(row => !state.excluded.has(row.id));
  const values = selected.map(row => ({ ...row, value: closing(row.id, m.days, state.data.settings, m.overrides, m.entries, m.overtime.get(row.id), cutOff) }));
  const filtered = values.filter(row => row.value.actual >= minimum);
  const order = $('compareOrder').value;
  filtered.sort((a, b) => (b.value[order] ?? -Infinity) - (a.value[order] ?? -Infinity) || a.name.localeCompare(b.name, 'pt-BR'));
  const group = comparison(filtered.map(row => row.value));
  const anomaly = values.filter(row => row.value.piecesWithoutHours > 0);
  $('compareAlert').hidden = !anomaly.length;
  $('compareAlert').textContent = anomaly.length ? `Atenção: ${anomaly.map(row => row.name).join(', ')} registrou peças em dia sem horas. A produtividade desse funcionário fica sem cálculo até corrigir o lançamento.` : '';
  $('compareMetrics').innerHTML = metric('Funcionários no comparativo', filtered.length) + metric('Horas realizadas', `${fmtNum(filtered.reduce((sum, row) => sum + row.value.actual, 0))} h`) + metric('Peças reparadas', filtered.reduce((sum, row) => sum + row.value.pieces, 0)) + metric('Produtividade do grupo', group.groupProductivity === null ? '—' : `${fmtNum(group.groupProductivity)} peças/h`, 'total');
  barChart('productivityChart', filtered, 'productivity', ' p/h');
  barChart('piecesChart', filtered, 'pieces', '', 0);
  barChart('attendanceChart', filtered, 'attendance', '%', 1);
  $('trendChart').innerHTML = trendChart(filtered, m.days.slice(0, cutOff), m);
  $('comparisonTable').innerHTML = `<thead><tr><th>Funcionário</th><th>Horas previstas</th><th>Horas feitas</th><th>Cumprimento</th><th>Peças</th><th>Peças/h</th><th>Diferença para o grupo</th><th>Alerta</th></tr></thead><tbody>${filtered.map(row => `<tr><td>${esc(row.name)}</td><td>${fmtNum(row.value.planned)} h</td><td>${fmtNum(row.value.actual)} h</td><td>${row.value.attendance === null ? '—' : fmtNum(row.value.attendance, 1) + '%'}</td><td>${row.value.pieces}</td><td>${row.value.productivity === null ? '—' : fmtNum(row.value.productivity)}</td><td>${row.value.productivity === null || group.groupProductivity === null ? '—' : `${row.value.productivity >= group.groupProductivity ? '+' : ''}${fmtNum(row.value.productivity - group.groupProductivity)} p/h`}</td><td>${row.value.piecesWithoutHours ? 'Peças sem horas' : ''}</td></tr>`).join('')}</tbody>`;
}
function render() {
  if (!state.data) return;
  $('app').hidden = false;
  renderSettings(); renderStaff();
  const m = calculated();
  renderPayments(m, gridDrafts.size > 0); renderPerson(m); renderCompare(m);
  simulation.render();
  for (const tab of ['person', 'payments', 'simulate', 'compare', 'config']) {
    $(`${tab}View`).hidden = state.tab !== tab;
    $(`tab${tab[0].toUpperCase() + tab.slice(1)}`).classList.toggle('active', state.tab === tab);
    $(`tab${tab[0].toUpperCase() + tab.slice(1)}`).setAttribute('aria-pressed', String(state.tab === tab));
  }
  $('configBtn').setAttribute('aria-pressed', String(state.tab === 'config'));
}
async function load() {
  await waitForSaves();
  clearError(); status('Carregando dados…');
  state.data = null;
  $('app').hidden = true;
  try {
    state.data = await api(`/bootstrap?month=${encodeURIComponent(state.month)}`);
    render(); updateGridControls();
    status(gridDrafts.size ? 'Confira os lançamentos pendentes antes de salvar' : 'Dados atualizados');
    return true;
  } catch (error) { showError(error); return false; }
}
async function waitForSaves() {
  while (true) {
    const grid = gridQueue, staff = staffQueue;
    await Promise.all([grid, staff]);
    if (grid === gridQueue && staff === staffQueue) return;
  }
}
function captureStaffDraft(element) {
  const form = element.closest('[data-overtime-employee]');
  if (!form || !state.data) return;
  const id = form.dataset.overtimeEmployee, field = element.dataset.overtimeField;
  const key = `${state.month}|${id}|${field}`, raw = element.value;
  const saved = state.data.overtime.find(item => item.employee_id === id);
  const savedRaw = field.endsWith('_cents') ? moneyValue(saved?.[field]) : saved?.[field] || '';
  if (raw === savedRaw && !staffPending.has(key)) { staffDrafts.delete(key); updateGridControls(); return; }
  const draft = { key, id, field, raw, month: state.month };
  staffDrafts.set(key, draft);
  form.querySelector('[data-staff-status]').textContent = 'Não salvo · salvamento ao sair do campo';
  updateGridControls();
  return draft;
}
function queueStaffValue(draft) {
  if (staffPending.get(draft.key)?.raw === draft.raw) return staffQueue;
  staffPending.set(draft.key, draft);
  pendingStaff++;
  updateGridControls();
  staffQueue = staffQueue.then(async () => {
    const form = [...$('staffList').querySelectorAll('[data-overtime-employee]')].find(item => item.dataset.overtimeEmployee === draft.id);
    const label = form?.querySelector('[data-staff-status]');
    try {
      const current = state.data.overtime.find(item => item.employee_id === draft.id);
      const value = draft.field.endsWith('_cents') ? cents(draft.raw) : draft.field === 'active_option' ? draft.raw || null : draft.raw.trim();
      if (value === null && draft.field.endsWith('_cents') && current?.[draft.field] !== null && current?.[draft.field] !== undefined && !window.confirm('Limpar este valor oficial já salvo? Os outros valores serão preservados.')) {
        if (staffDrafts.get(draft.key) === draft) staffDrafts.delete(draft.key);
        const control = form?.querySelector(`[data-overtime-field="${draft.field}"]`);
        if (control) control.value = moneyValue(current[draft.field]);
        return;
      }
      if (label) label.textContent = 'Salvando…';
      const result = await api('/overtime', { method: 'PUT', body: JSON.stringify({ month: draft.month, employee_id: draft.id, revision: current?.revision || 0, [draft.field]: value }) });
      if (result[draft.field] !== value) throw new Error('O servidor não confirmou este valor. Ele continua no campo para nova tentativa.');
      const index = state.data.overtime.findIndex(item => item.employee_id === draft.id);
      if (index < 0) state.data.overtime.push(result); else state.data.overtime[index] = result;
      if (staffDrafts.get(draft.key) === draft) staffDrafts.delete(draft.key);
      const m = calculated(); renderPayments(m); renderPersonSummary(m); simulation.syncRates();
      clearError();
      if (label) label.textContent = [...staffDrafts.values()].some(item => item.id === draft.id && item.month === draft.month) ? 'Há valores não salvos' : 'Salvo no Portal';
    } catch (error) {
      if (label) label.textContent = 'Não salvo · confira e clique em Salvar valores';
      showError(error.message === 'CONFLICT' ? new Error('Este valor foi alterado em outra sessão. Seu rascunho foi preservado. Use Atualizar, confira e salve novamente.') : error);
    } finally {
      if (staffPending.get(draft.key) === draft) staffPending.delete(draft.key);
      pendingStaff--; updateGridControls();
      if (!pendingStaff && !staffDrafts.size) status('Salvo no Portal');
    }
  });
  return staffQueue;
}
async function save(path, method, payload) {
  await waitForSaves();
  if (staffDrafts.size) { showError(new Error('Confira e salve os valores pendentes dos funcionários antes desta ação.')); return; }
  if (gridDrafts.size) { showError(new Error('Confira e salve os lançamentos pendentes antes desta ação.')); return; }
  if (state.busy) { status('Aguarde o salvamento atual'); return; }
  state.busy = true; clearError(); status('Salvando…');
  const staffForm = path === '/overtime' ? [...$('staffList').querySelectorAll('[data-overtime-employee]')].find(item => item.dataset.overtimeEmployee === payload.employee_id) : null;
  for (const control of staffForm?.querySelectorAll('input,button') || []) control.disabled = true;
  $('month').disabled = true;
  try {
    await api(path, { method, body: JSON.stringify(payload) });
    if (path === '/settings') {
      const draft = settingsDrafts.get(state.month);
      if (draft && cents(draft.bonus) === payload.bonus_cents && cents(draft.pieceRate) === payload.piece_cents && decimal(draft.weekdayHours) === payload.weekday_hours && decimal(draft.saturdayHours) === payload.saturday_hours) settingsDrafts.delete(state.month);
    }
    if (await load()) status('Salvo no Portal');
  } catch (error) {
    if (error.message === 'CONFLICT') await load();
    showError(error);
  } finally {
    state.busy = false;
    updateGridControls();
    for (const control of staffForm?.querySelectorAll('input,button') || []) control.disabled = false;
  }
}
function openEmployee(row = null) {
  state.editEmployee = row;
  $('employeeDialogTitle').textContent = row ? 'Editar funcionário' : 'Novo funcionário';
  $('employeeName').value = row?.name || '';
  $('employeeDialog').showModal();
  $('employeeName').focus();
}

document.addEventListener('input', event => {
  if (event.target.matches('[data-money]')) formatMoneyInput(event.target, event.inputType || '');
  if (event.target.matches('[data-overtime-field]')) captureStaffDraft(event.target);
  if (event.target.closest('#settingsForm')) {
    settingsDrafts.set(state.month, Object.fromEntries(['bonus','pieceRate','weekdayHours','saturdayHours'].map(id => [id, $(id).value])));
    updateGridControls();
  }
});
document.addEventListener('beforeinput', event => {
  const element = event.target;
  if (!element.matches('[data-money]') || element.selectionStart !== element.selectionEnd) return;
  const cursor = element.selectionStart;
  const backward = event.inputType === 'deleteContentBackward';
  if (!backward && event.inputType !== 'deleteContentForward') return;
  let index = backward ? cursor - 1 : cursor;
  if (index < 0 || index >= element.value.length || /\d/.test(element.value[index])) return;
  while (index >= 0 && index < element.value.length && !/\d/.test(element.value[index])) index += backward ? -1 : 1;
  if (index < 0 || index >= element.value.length) return;
  event.preventDefault();
  element.setRangeText('', backward ? index : cursor, backward ? cursor : index + 1, 'end');
  formatMoneyInput(element, event.inputType);
});
$('reloadBtn').addEventListener('click', load);
$('configBtn').addEventListener('click', () => { state.tab = 'config'; render(); $('configView').scrollIntoView({ block: 'start' }); });
$('month').addEventListener('change', event => {
  if (pendingGrid || gridDrafts.size || pendingStaff || staffDrafts.size || settingsDrafts.has(state.month)) { event.target.value = state.month; return; }
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value)) { state.month = event.target.value; load(); }
});
$('settingsForm').addEventListener('submit', event => {
  event.preventDefault();
  try { save('/settings', 'PUT', { month: state.month, bonus_cents: cents($('bonus').value), piece_cents: cents($('pieceRate').value), weekday_hours: decimal($('weekdayHours').value), saturday_hours: decimal($('saturdayHours').value), revision: state.data.settings.revision }); } catch (error) { showError(error); }
});
$('addEmployee').addEventListener('click', () => openEmployee());
$('cancelEmployee').addEventListener('click', () => $('employeeDialog').close());
$('employeeForm').addEventListener('submit', event => {
  event.preventDefault();
  const row = state.editEmployee;
  const payload = { name: $('employeeName').value.trim(), ...(row ? { revision: row.revision } : {}) };
  $('employeeDialog').close();
  save(row ? `/employees/${row.id}` : '/employees', row ? 'PATCH' : 'POST', payload);
});
$('staffList').addEventListener('submit', event => {
  const form = event.target.closest('[data-overtime-employee]');
  if (!form) return;
  event.preventDefault();
  const id = form.dataset.overtimeEmployee;
  const row = state.data.employees.find(item => item.id === id);
  if (!row || !editable(row)) return;
  for (const draft of staffDrafts.values()) if (draft.id === id && draft.month === state.month) queueStaffValue(draft);
});
$('staffList').addEventListener('change', event => {
  if (!event.target.matches('[data-overtime-field]')) return;
  const draft = captureStaffDraft(event.target);
  if (draft) queueStaffValue(draft);
});
$('staffList').addEventListener('click', async event => {
  const open = event.target.closest('[data-employee-open]');
  if (open) { state.selected = open.dataset.employeeOpen; state.tab = 'person'; render(); $('personView').scrollIntoView({ block: 'start' }); return; }
  const edit = event.target.closest('[data-employee-edit]');
  if (edit) { openEmployee(state.data.employees.find(row => row.id === edit.dataset.employeeEdit)); return; }
  const remove = event.target.closest('[data-employee-delete]');
  if (!remove) return;
  const row = state.data.employees.find(item => item.id === remove.dataset.employeeDelete);
  try {
    const impact = await api(`/employees/${row.id}/impact`);
    state.deleteEmployee = row;
    state.deleteImpact = impact;
    $('deleteImpact').textContent = `${row.name}: ${impact.entries} lançamento(s) diário(s) e ${impact.overtime} valor(es) oficial(is) serão excluídos junto com o cadastro.`;
    $('deleteDialog').showModal();
  } catch (error) { showError(error); }
});
$('cancelDelete').addEventListener('click', () => $('deleteDialog').close());
$('confirmDelete').addEventListener('click', () => {
  if (state.busy) return;
  const row = state.deleteEmployee, impact = state.deleteImpact;
  $('deleteDialog').close();
  if (row && impact) save(`/employees/${row.id}`, 'DELETE', { revision: row.revision, expected_entries: impact.entries, expected_overtime: impact.overtime });
});
for (const tab of ['person', 'payments', 'simulate', 'compare', 'config']) $(`tab${tab[0].toUpperCase() + tab.slice(1)}`).addEventListener('click', () => { state.tab = tab; render(); });
$('selectedEmployee').addEventListener('change', event => { state.selected = event.target.value; renderPerson(calculated()); });
$('editOfficial').addEventListener('click', () => {
  state.tab = 'config'; render();
  const form = [...$('staffList').querySelectorAll('[data-overtime-employee]')].find(item => item.dataset.overtimeEmployee === state.selected);
  if (form) { form.scrollIntoView({ block: 'center' }); form.querySelector('[data-overtime-amount]').focus(); }
});
function updateGridControls() {
  $('month').disabled = state.busy || pendingGrid > 0 || gridDrafts.size > 0 || pendingStaff > 0 || staffDrafts.size > 0 || settingsDrafts.has(state.month);
  $('reloadBtn').disabled = state.busy || pendingGrid > 0 || pendingStaff > 0;
  $('retryGrid').hidden = !gridFailed;
  $('retryGrid').disabled = pendingGrid > 0;
  $('gridSaveStatus').textContent = gridFailed ? 'Há lançamentos não salvos. Seus dados continuam nos campos.' : pendingGrid ? 'Salvando em segundo plano. Você pode continuar preenchendo.' : 'Os lançamentos são salvos ao sair do campo.';
}
function queueGridEdit(task) {
  const key = `${task.path}|${task.month}|${task.employee_id || ''}|${task.day}|${task.field}`;
  gridDrafts.set(key, task);
  pendingGrid++;
  updateGridControls();
  gridQueue = gridQueue.then(async () => {
    if (gridFailed) return;
    clearError(); status('Salvando lançamento…');
    try {
      // A revisão e os demais campos são lidos quando chega a vez desta gravação.
      const row = task.path === '/plan'
        ? state.data.plans.find(item => item.day === task.day)
        : state.data.entries.find(item => item.employee_id === task.employee_id && item.day === task.day);
      const payload = { month: task.month, day: task.day, revision: row?.revision || 0,
        ...(task.path === '/entry' ? { employee_id: task.employee_id, actual_hours: Number(row?.actual_hours || 0), pieces: Number(row?.pieces || 0), note: row?.note || '' } : {}),
        [task.field]: task.value };
      const result = await api(task.path, { method: 'PUT', body: JSON.stringify(payload) });
      const rows = task.path === '/plan' ? state.data.plans : state.data.entries;
      const index = rows.findIndex(item => item.day === task.day && (task.path === '/plan' || item.employee_id === task.employee_id));
      const saved = { ...payload, ...result };
      if (index < 0) rows.push(saved); else rows[index] = saved;
      if (gridDrafts.get(key) === task) gridDrafts.delete(key);
      const m = calculated(state.tab === 'person' ? $('personTable') : null);
      renderPayments(m, gridDrafts.size > 0);
      renderPersonSummary(m);
    } catch (error) {
      gridFailed = true;
      showError(error.message === 'CONFLICT' ? new Error('Alguém alterou este registro. Seus dados digitados foram mantidos. Use Atualizar para conferir os dados atuais antes de salvar os pendentes.') : error);
    }
  }).finally(() => {
    pendingGrid--;
    updateGridControls();
    if (!pendingGrid && !gridFailed) status('Salvo no Portal');
  });
  return gridQueue;
}
function editGrid(event) {
  const element = event.target;
  try {
    if (!element.validity.valid) throw new Error('INVALID_VALUE');
    if (element.matches('[data-plan-day]')) return queueGridEdit({ path: '/plan', month: state.month, day: element.dataset.planDay, field: 'planned_hours', value: decimal(element.value) });
    if (!element.matches('[data-entry-id]')) return;
    const { entryId, day, field } = element.dataset;
    const value = field === 'actual_hours' ? decimal(element.value) : field === 'pieces' ? Number(element.value) : element.value;
    if (field === 'pieces' && (!Number.isInteger(value) || value < 0 || value > 100000)) throw new Error('INVALID_VALUE');
    return queueGridEdit({ path: '/entry', month: state.month, day, employee_id: entryId, field, value });
  } catch (error) { showError(error); }
}
$('personTable').addEventListener('change', editGrid);
$('personTable').addEventListener('input', event => {
  if (!event.target.matches('[data-plan-day], [data-entry-id]') || !event.target.validity.valid) return;
  const m = calculated($('personTable'));
  renderPayments(m, true);
  renderPersonSummary(m);
});
$('retryGrid').addEventListener('click', () => {
  if (pendingGrid) return;
  const drafts = [...gridDrafts.values()];
  gridFailed = false;
  for (const draft of drafts) queueGridEdit({ ...draft });
});
window.addEventListener('beforeunload', event => {
  if (pendingGrid || gridDrafts.size || pendingStaff || staffDrafts.size || settingsDrafts.size) { event.preventDefault(); event.returnValue = ''; }
});
for (const id of ['compareDay', 'compareMinimum', 'compareOrder']) $(id).addEventListener('change', () => renderCompare(calculated()));
$('compareStaff').addEventListener('change', event => {
  const id = event.target.dataset.compareId;
  if (!id) return;
  if (event.target.checked) state.excluded.delete(id); else state.excluded.add(id);
  renderCompare(calculated());
});
load();
