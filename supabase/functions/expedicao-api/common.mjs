export class ExpeditionError extends Error {
  constructor(status, message, code = 'INVALID') { super(message); this.status = status; this.code = code; }
}
export const text = v => String(v ?? '').trim();
export const norm = v => text(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ');
export const digits = v => text(v).replace(/\D/g, '');
export function need(condition, message, status = 400, code) { if (!condition) throw new ExpeditionError(status, message, code); }
export async function sha256(value) {
  const data = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))].map(n => n.toString(16).padStart(2, '0')).join('');
}
export function number(v, label, positive = true) {
  let s = text(v); if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  need(/^\d+(?:\.\d+)?$/.test(s) && Number.isFinite(Number(s)) && (!positive || Number(s) > 0), `${label}: informe um número ${positive ? 'maior que zero' : 'válido'}.`);
  return Number(s);
}
export const groupKey = (client, note, destination) => JSON.stringify([client, text(note), ...destination.map(text)]);
export function uniqueIds(items) {
  const seen = new Set();
  for (const item of items) { need(item.id && !seen.has(item.id), 'ID vazio ou duplicado no BD. Confira a origem.', 409); seen.add(item.id); }
}
export function invoiceHistory(selected, all) {
  const ids = new Set(selected.map(i => i.id));
  return [...new Set(selected.map(i => i.sourceNote).filter(Boolean))].map(note => {
    const rows = all.filter(i => i.sourceNote === note && i.destinationKey === selected[0].destinationKey && norm(i.location) !== 'CANCELADA');
    const current = rows.filter(i => ids.has(i.id)).length, prior = rows.filter(i => i.note && !ids.has(i.id)).length, remaining = rows.length - current - prior;
    const years = [...new Set(rows.map(i => i.year).filter(Boolean))];
    return { note, year: years.length === 1 ? years[0] : '', total: rows.length, current, prior, remaining, status: remaining ? 'PARCIAL' : prior ? 'PARCIAL E FINAL' : 'TOTAL' };
  }).sort((a, b) => a.note.localeCompare(b.note, 'pt-BR', { numeric: true }));
}
export function yearOf(value) {
  const s = text(value), match = s.match(/\b(20\d{2})\b/); if (match) return match[1];
  return /^\d+(\.\d+)?$/.test(s) && Number(s) > 20000 && Number(s) < 80000 ? String(new Date(Date.UTC(1899, 11, 30) + Number(s) * 86400000).getUTCFullYear()) : '';
}
export const safeName = v => text(v).replace(/[\\/:*?"<>|\x00-\x1f]/g, '-').replace(/[. ]+$/g, '').slice(0, 110);
export function finishGroups(groups, items) {
  return groups.map(g => ({ ...g, count: g.items.length, active: g.items.some(i => i.expedition), invoices: invoiceHistory(g.items, items) }));
}
export const setCell = (map, sheet, address, value, kind = 'text') => { (map[sheet] ??= {})[address] = { value, kind }; };
