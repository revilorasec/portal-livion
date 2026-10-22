import { monthDays, plannedHours, officialOptions } from './hours-calculations.mjs?v=2';
import { simulateOptions } from './hours-simulation.mjs?v=1';

export function createSimulation({ getData, getMonth, moneyValue, fmtMoney, fmtNum, esc }) {
  const $ = id => document.getElementById(id);
  let selected = '', model = null;
  const savedRates = () => getData()?.overtime.find(row => row.employee_id === selected) || {};
  function updateResults() {
    if (!model) { $('simulationResults').innerHTML = ''; return; }
    const entries = new Map([...model.days].map(([day, row]) => [`${selected}|${day}`, { actual_hours: row.present ? row.hours : 0, pieces: row.present ? row.pieces : 0 }]));
    const data = getData();
    const rows = simulateOptions(selected, monthDays(getMonth()), data.settings, new Map(data.plans.map(row => [row.day, row.planned_hours])), entries, model.rates);
    $('simulationResults').innerHTML = rows.map(row => `<tr data-simulation-option="${row.key}"><th scope="row">${row.label}</th><td>${fmtNum(row.actual)} h<small>${fmtNum(row.planned)} h previstas</small></td><td>${fmtNum(row.pieces, 0)}</td><td>${fmtMoney(row.official)}</td><td>${fmtMoney(row.bonus)}</td><td>${fmtMoney(row.production)}</td><td class="payment-total"><strong>${fmtMoney(row.known)}</strong>${row.pending.length ? `<small class="pending-text">Parcial · ${esc(row.pending.join(' · '))}</small>` : '<small>Total simulado</small>'}</td></tr>`).join('');
  }
  function render() {
    const data = getData();
    if (!data) return;
    if (!data.employees.some(row => row.id === selected)) selected = data.employees.find(row => !row.archived_at)?.id || '';
    $('simulationEmployee').innerHTML = data.employees.map(row => `<option value="${row.id}">${esc(row.name)}</option>`).join('');
    $('simulationEmployee').value = selected;
    if (!selected) {
      model = null; $('simulationDays').innerHTML = ''; $('simulationRates').innerHTML = ''; updateResults(); return;
    }
    const days = monthDays(getMonth()), rates = savedRates();
    if (model?.key !== `${getMonth()}|${selected}`) {
      const overrides = new Map(data.plans.map(row => [row.day, row.planned_hours]));
      model = { key: `${getMonth()}|${selected}`, days: new Map(days.map(day => [day.date, { present: false, hours: plannedHours(day, data.settings, overrides), pieces: 0 }])), rates: {}, changedRates: new Set(), customHours: new Set() };
    }
    const currentPlans = new Map(data.plans.map(row => [row.day, row.planned_hours]));
    for (const day of days) if (!model.customHours.has(day.date)) model.days.get(day.date).hours = plannedHours(day, data.settings, currentPlans);
    for (const option of officialOptions) if (!model.changedRates.has(option.field)) model.rates[option.field] = rates[option.field] ?? null;
    $('simulationRates').innerHTML = officialOptions.map(option => `<label>${option.label} (R$)<input data-simulation-rate="${option.field}" data-money type="text" inputmode="numeric" value="${esc(moneyValue(model.rates[option.field]))}" placeholder="Não informado nas configurações"></label>`).join('');
    $('simulationDays').innerHTML = '<thead><tr><th>Data</th><th>Presença</th><th>Horas</th><th>Reparos</th></tr></thead><tbody>' + days.map(day => {
      const row = model.days.get(day.date), disabled = day.weekday === 0 ? 'disabled' : '';
      return `<tr class="${day.weekday === 0 ? 'sunday' : day.weekday === 6 ? 'saturday' : ''}"><td>${String(day.day).padStart(2,'0')}/${getMonth().slice(5)} ${['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][day.weekday]}</td><td><input aria-label="Presença em ${day.date}" data-simulation-day="${day.date}" data-simulation-field="present" type="checkbox" ${row.present ? 'checked' : ''} ${disabled}></td><td><input aria-label="Horas em ${day.date}" data-simulation-day="${day.date}" data-simulation-field="hours" type="number" min="0" max="24" step="0.01" inputmode="decimal" value="${row.hours}" ${disabled}></td><td><input aria-label="Reparos em ${day.date}" data-simulation-day="${day.date}" data-simulation-field="pieces" type="number" min="0" max="100000" step="1" inputmode="numeric" value="${row.pieces}" ${disabled}></td></tr>`;
    }).join('') + '</tbody>';
    updateResults();
  }
  function syncRates() {
    if (!model) return;
    const rates = savedRates();
    for (const option of officialOptions) {
      if (model.changedRates.has(option.field)) continue;
      model.rates[option.field] = rates[option.field] ?? null;
      const control = document.querySelector(`[data-simulation-rate="${option.field}"]`);
      if (control && document.activeElement !== control) control.value = moneyValue(model.rates[option.field]);
    }
    updateResults();
  }
  $('simulationEmployee').addEventListener('change', event => { selected = event.target.value; render(); });
  $('simulationDays').addEventListener('input', event => {
    const element = event.target;
    if (!model || !element.dataset.simulationDay || !element.validity.valid) return;
    const row = model.days.get(element.dataset.simulationDay);
    row[element.dataset.simulationField] = element.type === 'checkbox' ? element.checked : Number(element.value);
    if (element.dataset.simulationField === 'hours') model.customHours.add(element.dataset.simulationDay);
    updateResults();
  });
  // Aguarda a formatação compartilhada antes de ler a entrada monetária.
  document.addEventListener('input', event => {
    const field = event.target.dataset.simulationRate;
    if (!field || !model || !event.target.validity.valid) return;
    queueMicrotask(() => {
      const digits = event.target.value.replace(/\D/g, '');
      model.rates[field] = digits ? Number(digits) : null;
      model.changedRates.add(field);
      updateResults();
    });
  });
  $('simulationRatesReset').addEventListener('click', () => { if (model) { model.changedRates.clear(); render(); } });
  $('simulationFullMonth').addEventListener('click', () => {
    if (!model) return;
    for (const day of monthDays(getMonth())) model.days.get(day.date).present = day.weekday !== 0;
    render();
  });
  $('simulationClear').addEventListener('click', () => { if (model) { for (const row of model.days.values()) row.present = false; render(); } });
  return { render, syncRates };
}
