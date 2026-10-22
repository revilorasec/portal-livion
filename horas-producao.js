import { monthDays, plannedHours, closing, teamClosing, comparison } from './lib/hours-calculations.mjs';

const BASE = 'https://kvfjjtkwxxbvzlicwnrz.supabase.co/functions/v1/hours-api';
const $ = id => document.getElementById(id);
const fmtMoney = cents => cents === null || cents === undefined ? 'Pendente' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
const fmtNum = (number, digits = 2) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: digits }).format(number);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const state = { data: null, month: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).slice(0, 7), selected: '', tab: 'team', excluded: new Set(), editEmployee: null, archiveEmployee: null, busy: false };
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
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error('INVALID_VALUE');
  return Math.round(number * 100);
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
  return {
    days: monthDays(state.month),
    plans: new Map(data.plans.map(row => [row.day, row])),
    overrides: new Map(data.plans.map(row => [row.day, row.planned_hours])),
    entries: new Map(data.entries.map(row => [`${row.employee_id}|${row.day}`, row])),
    overtime: new Map(data.overtime.map(row => [row.employee_id, row]))
  };
}
function calculated() {
  const m = maps();
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
  $('bonus').value = Number(s.bonus_cents || 0) / 100;
  $('pieceRate').value = Number(s.piece_cents || 0) / 100;
  $('weekdayHours').value = s.weekday_hours;
  $('saturdayHours').value = s.saturday_hours;
  $('settingsUpdated').textContent = s.revision ? `Revisão ${s.revision}` : 'Ainda não configurado';
  for (const element of $('settingsForm').querySelectorAll('input,button')) element.disabled = !state.data.permissions.edit;
  $('addEmployee').hidden = !state.data.permissions.edit;
}
function renderStaff() {
  const rows = employeeRows();
  const overtime = new Map(state.data.overtime.map(item => [item.employee_id, item]));
  $('staffList').innerHTML = rows.length ? rows.map(row => {
    const item = overtime.get(row.id);
    const informed = item?.amount_cents !== null && item?.amount_cents !== undefined;
    const value = informed ? (item.amount_cents / 100).toFixed(2) : '';
    const disabled = editable(row) ? '' : 'disabled';
    return `<article class="staff-item ${row.archived_at ? 'archived' : ''}">
      <div class="staff-heading"><strong>${esc(row.name)}</strong>${row.archived_at ? '<small>Arquivado</small>' : ''}<div class="staff-actions"><button class="outline" type="button" data-employee-open="${row.id}">Detalhes</button>${editable(row) ? `<button class="outline" type="button" data-employee-edit="${row.id}">Editar</button>` : ''}${state.data.permissions.archive && !row.archived_at ? `<button class="danger" type="button" data-employee-archive="${row.id}">Arquivar</button>` : ''}</div></div>
      <form class="staff-overtime" data-overtime-employee="${row.id}" aria-label="Horas extras de ${esc(row.name)}">
        <label>Valor total da hora extra no mês (R$)<input data-overtime-amount type="number" min="0" step="0.01" inputmode="decimal" placeholder="Aguardando contador" value="${value}" ${disabled}></label>
        <label>Observação<input data-overtime-note maxlength="500" placeholder="Opcional" value="${esc(item?.note || '')}" ${disabled}></label>
        <div class="staff-overtime-foot"><span class="${informed ? 'confirmed-text' : 'pending-text'}">${informed ? `${fmtMoney(item.amount_cents)} registrado` : 'Pendente'}</span>${editable(row) ? '<button class="primary" type="submit">Salvar valor</button>' : ''}</div>
      </form>
    </article>`;
  }).join('') : '<p class="empty">Nenhum funcionário cadastrado. Use “+ Funcionário” para começar.</p>';
  if (!rows.some(row => row.id === state.selected)) state.selected = rows.find(row => !row.archived_at)?.id || rows[0]?.id || '';
  $('selectedEmployee').innerHTML = rows.map(row => `<option value="${row.id}">${esc(row.name)}${row.archived_at ? ' (arquivado)' : ''}</option>`).join('');
  $('selectedEmployee').value = state.selected;
}
function renderTeam(m) {
  const all = [...m.results.values()];
  const sum = teamClosing(all);
  $('teamMetrics').innerHTML = metric('Funcionários no período', m.rows.length) + metric('Horas realizadas', `${fmtNum(sum.actual)} h`) + metric('Peças reparadas', sum.pieces, '') + metric(sum.complete ? 'Total da equipe' : 'Valor conhecido · parcial', fmtMoney(sum.known), sum.complete ? 'total' : 'pending');
  $('teamState').textContent = !m.rows.length ? 'Aguardando cadastro da equipe' : sum.pending ? `${sum.pending} fechamento(s) pendente(s)` : 'Fechamentos completos';
  const header = `<thead><tr><th rowspan="2">Data</th><th rowspan="2">Horas previstas</th>${m.rows.map(row => `<th class="employee-head" colspan="2">${esc(row.name)}${row.archived_at ? ' · arquivado' : ''}</th>`).join('')}</tr><tr>${m.rows.map(() => '<th>Horas feitas</th><th>Peças</th>').join('')}</tr></thead>`;
  const body = m.days.map(day => `<tr class="${day.weekday === 0 ? 'sunday' : day.weekday === 6 ? 'saturday' : ''}"><td>${dayLabel(day)}</td><td>${plannedInput(day, m)}</td>${m.rows.map(row => {
    const item = m.entries.get(`${row.id}|${day.date}`);
    return `<td>${entryInput(row, day, item, 'actual_hours')}</td><td>${entryInput(row, day, item, 'pieces')}</td>`;
  }).join('')}</tr>`).join('');
  $('matrix').innerHTML = header + `<tbody>${body}</tbody>`;
  $('teamTable').innerHTML = `<thead><tr><th>Funcionário</th><th>Previstas</th><th>Feitas</th><th>% horas</th><th>Peças</th><th>Bônus</th><th>Produção</th><th>Subtotal</th><th>Extras oficiais</th><th>Total</th><th>Pendências</th></tr></thead><tbody>${m.rows.map(row => {
    const value = m.results.get(row.id);
    return `<tr><td>${esc(row.name)}</td><td>${fmtNum(value.planned)} h</td><td>${fmtNum(value.actual)} h</td><td>${value.attendance === null ? '—' : fmtNum(value.attendance, 1) + '%'}</td><td>${value.pieces}</td><td>${fmtMoney(value.bonus)}</td><td>${fmtMoney(value.production)}</td><td>${fmtMoney(value.subtotal)}</td><td>${fmtMoney(value.official)}</td><td class="${value.total === null ? 'pending-text' : ''}">${value.total === null ? 'Parcial ' + fmtMoney(value.known) : fmtMoney(value.total)}</td><td class="${value.pending.length ? 'pending-text' : ''}">${esc(value.pending.join('; ') || '—')}</td></tr>`;
  }).join('')}</tbody>`;
  $('teamTotal').textContent = !m.rows.length ? 'Cadastre um funcionário para iniciar o fechamento.' : sum.complete ? `Total fechado da equipe: ${fmtMoney(sum.known)}` : `Valor conhecido da equipe: ${fmtMoney(sum.known)} · ${sum.pending} fechamento(s) pendente(s). Não representa o valor final a pagar.`;
}
function renderPerson(m) {
  const row = m.rows.find(item => item.id === state.selected);
  if (!row) { $('personMetrics').innerHTML = ''; $('personTable').innerHTML = ''; $('overtimeForm').hidden = true; $('overtimeState').textContent = 'Selecione um funcionário'; return; }
  const result = m.results.get(row.id);
  const official = m.overtime.get(row.id);
  $('overtimeForm').hidden = false;
  $('personMetrics').innerHTML = metric('Bônus de horas', fmtMoney(result.bonus)) + metric('Produção', fmtMoney(result.production)) + metric('Subtotal', fmtMoney(result.subtotal)) + metric(result.total === null ? 'Parcial conhecido' : 'Total a pagar', fmtMoney(result.total ?? result.known), result.total === null ? 'pending' : 'total');
  $('overtimeState').textContent = result.official === null ? 'Aguardando contador' : 'Valor oficial registrado';
  $('overtimeAmount').value = result.official === null ? '' : (result.official / 100).toFixed(2);
  $('overtimeNote').value = official?.note || '';
  for (const element of $('overtimeForm').querySelectorAll('input,button')) element.disabled = !editable(row);
  $('personTable').innerHTML = `<thead><tr><th>Data</th><th>Horas previstas</th><th>Horas feitas</th><th>Peças</th><th>Observações</th></tr></thead><tbody>${m.days.map(day => {
    const item = m.entries.get(`${row.id}|${day.date}`);
    return `<tr class="${day.weekday === 0 ? 'sunday' : day.weekday === 6 ? 'saturday' : ''}"><td>${dayLabel(day)}</td><td>${plannedInput(day, m)}</td><td>${entryInput(row, day, item, 'actual_hours')}</td><td>${entryInput(row, day, item, 'pieces')}</td><td>${entryInput(row, day, item, 'note', 'text')}</td></tr>`;
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
  renderTeam(m); renderPerson(m); renderCompare(m);
  for (const tab of ['team', 'person', 'compare']) {
    $(`${tab}View`).hidden = state.tab !== tab;
    $(`tab${tab[0].toUpperCase() + tab.slice(1)}`).classList.toggle('active', state.tab === tab);
    $(`tab${tab[0].toUpperCase() + tab.slice(1)}`).setAttribute('aria-pressed', String(state.tab === tab));
  }
}
async function load() {
  clearError(); status('Carregando dados…');
  state.data = null;
  $('app').hidden = true;
  try {
    state.data = await api(`/bootstrap?month=${encodeURIComponent(state.month)}`);
    render(); status('Dados atualizados');
    return true;
  } catch (error) { showError(error); return false; }
}
function unsavedStaffValues(exceptId) {
  const existing = new Map(state.data.overtime.map(item => [item.employee_id, item]));
  return [...$('staffList').querySelectorAll('[data-overtime-employee]')].flatMap(form => {
    const id = form.dataset.overtimeEmployee;
    if (id === exceptId) return [];
    const amount = form.querySelector('[data-overtime-amount]').value;
    const note = form.querySelector('[data-overtime-note]').value;
    const saved = existing.get(id);
    const savedAmount = saved?.amount_cents === null || saved?.amount_cents === undefined ? '' : (saved.amount_cents / 100).toFixed(2);
    return amount !== savedAmount || note !== (saved?.note || '') ? [{ id, amount, note }] : [];
  });
}
function restoreStaffValues(drafts) {
  for (const draft of drafts) {
    const form = [...$('staffList').querySelectorAll('[data-overtime-employee]')].find(item => item.dataset.overtimeEmployee === draft.id);
    if (!form) continue;
    form.querySelector('[data-overtime-amount]').value = draft.amount;
    form.querySelector('[data-overtime-note]').value = draft.note;
  }
}
async function save(path, method, payload) {
  if (state.busy) { status('Aguarde o salvamento atual'); return; }
  state.busy = true; clearError(); status('Salvando…');
  const staffForm = path === '/overtime' ? [...$('staffList').querySelectorAll('[data-overtime-employee]')].find(item => item.dataset.overtimeEmployee === payload.employee_id) : null;
  for (const control of staffForm?.querySelectorAll('input,button') || []) control.disabled = true;
  $('month').disabled = true;
  try {
    await api(path, { method, body: JSON.stringify(payload) });
    const drafts = unsavedStaffValues(path === '/overtime' ? payload.employee_id : '');
    if (await load()) { restoreStaffValues(drafts); status('Salvo no Portal'); }
  } catch (error) {
    if (error.message === 'CONFLICT') await load();
    showError(error);
  } finally {
    state.busy = false;
    $('month').disabled = false;
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

$('reloadBtn').addEventListener('click', load);
$('month').addEventListener('change', event => { if (/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value)) { state.month = event.target.value; load(); } });
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
  const current = state.data.overtime.find(item => item.employee_id === id);
  try { save('/overtime', 'PUT', { month: state.month, employee_id: id, amount_cents: cents(form.querySelector('[data-overtime-amount]').value), note: form.querySelector('[data-overtime-note]').value, revision: current?.revision || 0 }); } catch (error) { showError(error); }
});
$('staffList').addEventListener('click', async event => {
  const open = event.target.closest('[data-employee-open]');
  if (open) { state.selected = open.dataset.employeeOpen; state.tab = 'person'; render(); $('personView').scrollIntoView({ block: 'start' }); return; }
  const edit = event.target.closest('[data-employee-edit]');
  if (edit) { openEmployee(state.data.employees.find(row => row.id === edit.dataset.employeeEdit)); return; }
  const archive = event.target.closest('[data-employee-archive]');
  if (!archive) return;
  const row = state.data.employees.find(item => item.id === archive.dataset.employeeArchive);
  try {
    const impact = await api(`/employees/${row.id}/impact`);
    state.archiveEmployee = row;
    $('archiveImpact').textContent = `${row.name}: ${impact.entries} lançamento(s) diário(s) e ${impact.overtime} registro(s) de valor oficial serão mantidos.`;
    $('archiveDialog').showModal();
  } catch (error) { showError(error); }
});
$('cancelArchive').addEventListener('click', () => $('archiveDialog').close());
$('confirmArchive').addEventListener('click', () => {
  const row = state.archiveEmployee;
  $('archiveDialog').close();
  if (row) save(`/employees/${row.id}`, 'DELETE', { revision: row.revision });
});
for (const tab of ['team', 'person', 'compare']) $(`tab${tab[0].toUpperCase() + tab.slice(1)}`).addEventListener('click', () => { state.tab = tab; render(); });
$('selectedEmployee').addEventListener('change', event => { state.selected = event.target.value; renderPerson(calculated()); });
$('overtimeForm').addEventListener('submit', event => {
  event.preventDefault();
  if (!state.selected) return;
  const row = state.data.overtime.find(item => item.employee_id === state.selected);
  try { save('/overtime', 'PUT', { month: state.month, employee_id: state.selected, amount_cents: cents($('overtimeAmount').value), note: $('overtimeNote').value, revision: row?.revision || 0 }); } catch (error) { showError(error); }
});
async function editGrid(event) {
  const element = event.target;
  if (element.matches('[data-plan-day]')) {
    const row = state.data.plans.find(item => item.day === element.dataset.planDay);
    try { await save('/plan', 'PUT', { month: state.month, day: element.dataset.planDay, planned_hours: decimal(element.value), revision: row?.revision || 0 }); } catch (error) { showError(error); }
  }
  if (element.matches('[data-entry-id]')) {
    const { entryId, day, field } = element.dataset;
    const row = state.data.entries.find(item => item.employee_id === entryId && item.day === day);
    const actual_hours = field === 'actual_hours' ? decimal(element.value) : Number(row?.actual_hours || 0);
    const pieces = field === 'pieces' ? Number(element.value) : Number(row?.pieces || 0);
    const note = field === 'note' ? element.value : row?.note || '';
    if (!Number.isInteger(pieces) || pieces < 0) { showError(new Error('INVALID_VALUE')); return; }
    await save('/entry', 'PUT', { month: state.month, day, employee_id: entryId, actual_hours, pieces, note, revision: row?.revision || 0 });
  }
}
for (const id of ['matrix', 'personTable']) $(id).addEventListener('change', event => editGrid(event).catch(showError));
for (const id of ['compareDay', 'compareMinimum', 'compareOrder']) $(id).addEventListener('change', () => renderCompare(calculated()));
$('compareStaff').addEventListener('change', event => {
  const id = event.target.dataset.compareId;
  if (!id) return;
  if (event.target.checked) state.excluded.delete(id); else state.excluded.add(id);
  renderCompare(calculated());
});
load();
