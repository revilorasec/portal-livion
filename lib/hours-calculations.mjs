export function monthDays(month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Mês inválido');
  const [year, number] = month.split('-').map(Number);
  const count = new Date(Date.UTC(year, number, 0)).getUTCDate();
  return Array.from({ length: count }, (_, index) => {
    const day = index + 1;
    const date = `${month}-${String(day).padStart(2, '0')}`;
    return { date, day, weekday: new Date(Date.UTC(year, number - 1, day)).getUTCDay() };
  });
}

export function plannedHours(day, config, overrides) {
  if (day.weekday === 0) return 0;
  const explicit = overrides.get(day.date);
  return Number(explicit === undefined
    ? day.weekday === 6 ? config.saturday_hours ?? 0 : config.weekday_hours ?? 0
    : explicit);
}

export const officialOptions = [
  { key: 'mon_sat', label: 'Segunda a sábado', field: 'mon_sat_cents' },
  { key: 'mon_fri', label: 'Segunda a sexta', field: 'mon_fri_cents' },
  { key: 'saturday', label: 'Sábados', field: 'saturday_cents' }
];
export function officialValue(overtime) {
  const option = officialOptions.find(item => item.key === overtime?.active_option);
  return option ? overtime?.[option.field] ?? null : overtime?.amount_cents ?? null;
}
export function optionIncludesDay(day, option) {
  return day.weekday !== 0 && (option === 'saturday' ? day.weekday === 6 : option === 'mon_fri' ? day.weekday !== 6 : true);
}
export function closing(employeeId, days, config, overrides, entries, overtime, cutOff = days.length) {
  let plannedHundredths = 0, actualHundredths = 0, pieces = 0, piecesWithoutHours = 0;
  const daily = [];
  for (const day of days.slice(0, cutOff)) {
    if (day.weekday === 0) continue;
    const scheduled = optionIncludesDay(day, overtime?.active_option) ? plannedHours(day, config, overrides) : 0;
    const item = entries.get(`${employeeId}|${day.date}`) ?? {};
    const hours = Number(item.actual_hours ?? 0);
    const count = Number(item.pieces ?? 0);
    plannedHundredths += Math.round(scheduled * 100);
    actualHundredths += Math.round(hours * 100);
    pieces += count;
    if (hours === 0 && count > 0) piecesWithoutHours += count;
    daily.push({ date: day.date, planned: scheduled, actual: hours, pieces: count });
  }
  const planned = plannedHundredths / 100, actual = actualHundredths / 100;
  const bonus = plannedHundredths > 0 ? Math.round(Number(config.bonus_cents ?? 0) * actualHundredths / plannedHundredths) : null;
  const production = pieces * Number(config.piece_cents ?? 0);
  const subtotal = bonus === null ? null : bonus + production;
  const amount = officialValue(overtime);
  const official = amount === null ? null : Number(amount);
  const option = officialOptions.find(item => item.key === overtime?.active_option);
  const known = production + (bonus ?? 0) + (official ?? 0);
  const pending = [];
  if (bonus === null) pending.push('Definir horas previstas');
  if (official === null) pending.push(option ? `Informar valor: ${option.label}` : officialOptions.some(item => overtime?.[item.field] !== null && overtime?.[item.field] !== undefined) ? 'Escolher opção ativa em Configurações' : 'Aguardando valor do contador');
  return {
    planned, actual, pieces, piecesWithoutHours, bonus, production, subtotal, official, officialLabel: option?.label || 'Valor anterior',
    known, total: pending.length ? null : known, pending,
    attendance: planned > 0 ? actual / planned * 100 : null,
    productivity: actual > 0 && piecesWithoutHours === 0 ? pieces / actual : null,
    daily
  };
}

export function teamClosing(results) {
  return {
    planned: results.reduce((sum, result) => sum + result.planned, 0),
    actual: results.reduce((sum, result) => sum + result.actual, 0),
    pieces: results.reduce((sum, result) => sum + result.pieces, 0),
    known: results.reduce((sum, result) => sum + result.known, 0),
    complete: results.length > 0 && results.every(result => result.total !== null),
    pending: results.filter(result => result.total === null).length
  };
}

export function comparison(results, minimumHours = 0) {
  const included = results.filter(result => result.actual >= minimumHours);
  const eligible = included.filter(result => result.actual > 0 && result.piecesWithoutHours === 0);
  const hours = eligible.reduce((sum, result) => sum + result.actual, 0);
  const pieces = eligible.reduce((sum, result) => sum + result.pieces, 0);
  return {
    rows: included,
    groupProductivity: hours > 0 ? pieces / hours : null,
    piecesWithoutHours: included.reduce((sum, result) => sum + result.piecesWithoutHours, 0)
  };
}
