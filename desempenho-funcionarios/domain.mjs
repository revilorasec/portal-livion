export const VERSION = '2026-09-12.1';
export const CLIENTS = [
  { key: 'claro', name: 'Claro', color: '#df463c', column: 'AG', exclusions: ['21-CARBONIZAÇÃO', '23-OXIDAÇÃO', '24-REPAROS DE TERCEIROS', '22-DANO MECÂNICO'] },
  { key: 'nokia', name: 'Nokia', color: '#1760d5', column: 'AA', exclusions: ['CARBONIZAÇÃO', 'CARBONIZADO', 'DANO MECANICO', 'FORTE OXIDAÇÃO', 'OXIDAÇÃO FORTE', 'PCI CARBONIZADA', 'DEFEITO MECANICO', 'FLAT CABLE DO DISPLAY ROMPIDO', 'FLAT CABLE DANIFICADO', 'VANDALISMO', 'Retirada de componentes'] }
];
export const STATUSES = ['REPARADO', 'IRREPARÁVEL', 'EM REPARO', 'SEM DEFEITO', 'SEM REPARO'];
export const norm = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
export const statusOf = value => {
  const valueNorm = norm(value).replace(/^\d+\s*-\s*/, '');
  return STATUSES.find(s => norm(s) === valueNorm) || 'NÃO INFORMADO';
};
export function numberOf(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  let s = String(value).replace(/R\$|\s/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
export function warrantyOf(value) {
  const s = norm(value);
  if (!s || s === 'NAO INFORMADO') return null;
  if (s.includes('FORA') || s === 'NAO' || s === 'N') return false;
  if (s === 'SIM' || s === 'S' || s.includes('GARANTIA') || s.includes('DENTRO')) return true;
  return null;
}
const aliases = new Map([['LUIZ FERNAN DO (TUKA)', 'LUIS FERNANDO'], ['LUIZ FERNANDO', 'LUIS FERNANDO'], ['WELLLINGTON DE SOUSA', 'WELLINGTON DE SOUSA']]);
export function techOf(value) {
  const name = norm(value);
  return aliases.get(name) || name || 'SEM TÉCNICO';
}
export function measurementOf(value) {
  const raw = String(value ?? '').trim();
  if (/^\d{4}-\d{2}$/.test(raw)) return raw;
  const date = raw.match(/^(?:\d{1,2}\/)?(\d{1,2})\/(\d{4})$/);
  if (date && +date[1] <= 12 && +date[1] > 0) return `${date[2]}-${date[1].padStart(2,'0')}`;
  const months = ['JANEIRO','FEVEREIRO','MARCO','ABRIL','MAIO','JUNHO','JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'];
  const text = norm(raw), year = text.match(/\b(20\d{2})\b/), month = months.findIndex(m => text.startsWith(m));
  return year && month >= 0 ? `${year[1]}-${String(month + 1).padStart(2,'0')}` : raw || 'SEM MEDIÇÃO';
}
export function normalizeRow(raw, clientKey) {
  const client = CLIENTS.find(c => c.key === clientKey);
  if (!client) throw new Error('Cliente sem regras cadastradas.');
  const isClaro = clientKey === 'claro';
  const repairDescription = String(raw.repairDescription ?? raw[isClaro ? 'Detalhe do Status' : 'Descrição do Reparo'] ?? '').trim();
  const status = statusOf(raw.status ?? raw[isClaro ? 'Status' : 'Status do Atendimento']);
  const exclusion = status === 'IRREPARÁVEL' ? client.exclusions.find(reason => norm(repairDescription).includes(norm(reason))) || null : null;
  return {
    id: String(raw.id ?? raw.ID ?? '').trim(), client: clientKey,
    technician: techOf(raw.technician ?? raw[isClaro ? 'Funcionário que reparou' : 'Técnico Responsavel']),
    tester: techOf(raw.tester ?? raw[isClaro ? 'Quem Testou' : 'Testado Por']),
    measurement: measurementOf(raw.measurement ?? raw['Medição']),
    partNumber: norm(raw.partNumber ?? raw[isClaro ? 'Part. Number' : 'Part Number']) || 'NÃO INFORMADO',
    status, repairDescription, exclusion,
    days: numberOf(raw.days ?? raw[isClaro ? 'Dias na Livion' : 'Dias em Reparo']),
    value: numberOf(raw.value ?? raw[isClaro ? 'Valor Reparo' : 'Valor do Reparo']),
    warranty: typeof raw.warranty === 'boolean' ? raw.warranty : warrantyOf(raw.warranty ?? raw[isClaro ? 'Garantia' : 'GARANTIA'])
  };
}
export function normalizeBatch(raw, clientKey) {
  if (!Array.isArray(raw)) throw new Error('Formato da base inválido.');
  const seen = new Set();
  return raw.map(r => {
    const row = normalizeRow(r, clientKey);
    if (!row.id || seen.has(row.id)) throw new Error('Base com ID ausente ou duplicado.');
    seen.add(row.id);
    return row;
  });
}
export function statistics(rows) {
  const counts = Object.fromEntries(STATUSES.map(s => [s, 0]));
  for (const r of rows) counts[r.status] = (counts[r.status] || 0) + 1;
  const repaired = counts.REPARADO, irreparable = counts['IRREPARÁVEL'];
  const excluded = rows.filter(r => r.status === 'IRREPARÁVEL' && r.exclusion).length;
  const denominator = repaired + irreparable, realDenominator = denominator - excluded;
  const completed = rows.filter(r => r.status !== 'EM REPARO' && STATUSES.includes(r.status));
  const measured = completed.filter(r => r.days !== null && Number.isFinite(r.days));
  const billable = rows.filter(r => r.status === 'REPARADO' && r.warranty === false && r.value !== null);
  return {
    total: rows.length, counts, repaired, irreparable, excluded, denominator, realDenominator,
    general: denominator ? repaired / denominator : null,
    real: realDenominator ? repaired / realDenominator : null,
    completed: completed.length,
    avgDays: measured.length ? measured.reduce((s,r) => s+r.days,0) / measured.length : null,
    daysMissing: completed.length - measured.length,
    producedValue: billable.reduce((s,r) => s+r.value,0),
    warrantyMissing: rows.filter(r => r.status === 'REPARADO' && r.warranty === null).length,
    repairValueMissing: rows.filter(r => r.status === 'REPARADO' && r.warranty === false && r.value === null).length,
    valueMissing: rows.filter(r => r.status === 'REPARADO' && (r.warranty === null || (r.warranty === false && r.value === null))).length
  };
}
export function groupStats(rows, field = 'technician') {
  const groups = new Map();
  for (const row of rows) { const key=row[field]; if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row); }
  return [...groups].map(([name, records]) => ({name, ...statistics(records)})).sort((a,b) => (b.real ?? -1)-(a.real ?? -1) || b.repaired-a.repaired || a.name.localeCompare(b.name,'pt-BR'));
}
function letters(index) { let out=''; do {out=String.fromCharCode(65+index%26)+out;index=Math.floor(index/26)-1;} while(index>=0); return out; }
// A presentation gets a new, minimal view model. No hidden names, free text or amounts.
export function presentationRows(rows, selected, allNames) {
  const peers = [...new Set(allNames)].filter(n => n!==selected).sort((a,b)=>a.localeCompare(b,'pt-BR'));
  const labels = new Map(peers.map((n,i)=>[n, `Técnico ${letters(i)}`]));
  return rows.map((r,i)=>({id:`item-${i+1}`,client:r.client,technician:r.technician===selected?selected:labels.get(r.technician),measurement:r.measurement,partNumber:r.partNumber,status:r.status,exclusion:r.exclusion,days:r.days,value:null,warranty:null}));
}
export const percent = n => n === null || !Number.isFinite(n) ? '—' : (n*100).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:2})+'%';
export const money = n => n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
export function comparisonCSV(team,presentation=false) {
  const headers=['Técnico','Peças','Reparadas','Irreparáveis','Excluídas','Geral','Real','Tempo médio'];
  if(!presentation)headers.push('Valor produzido');
  const records=team.map(t=>{const row=[t.name,t.total,t.repaired,t.irreparable,t.excluded,percent(t.general),percent(t.real),t.avgDays===null?'—':t.avgDays.toLocaleString('pt-BR',{maximumFractionDigits:1})+' d'];if(!presentation)row.push(money(t.producedValue));return row;});
  const cell=value=>{let s=String(value??'');if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
  return '\ufeff'+[headers,...records].map(row=>row.map(cell).join(';')).join('\r\n');
}


