import { text, norm, need, uniqueIds, groupKey, finishGroups, yearOf, setCell, safeName } from '../common.mjs';
export const NOKIA = Object.freeze({ client: 'nokia', sheet: 'BD_Nokia', note: 'S', box: 'V', date: 'U', location: 'C', status: 'Y' });
export const destination = Object.freeze({ cnpj: '01108177004166', center: 'NOKIA-BH', city: 'Belo Horizonte', uf: 'MG', address: 'Rua Olympio Texeira Guimarães, 116, Estoril, Belo Horizonte - MG. CEP:30494-380.' });
export function normalizeSource(source) {
  need(source.client === 'nokia' && source.schemaVersion === 1 && source.sheet === NOKIA.sheet && Array.isArray(source.rows), 'Origem Nokia incompatível.', 502);
  const items = source.rows.filter(r => text(r.A)).map(r => ({ id: text(r.A), note: text(r.S), sourceNote: text(r.G), year: yearOf(r.H), location: text(r.C), expedition: norm(r.C).includes('EXPEDICAO'), status: text(r.Y), box: text(r.V), expeditionDate: text(r.U), pn: text(r.L), serial: text(r.K), barcode: text(r.J), warranty: text(r.I), days: text(r.E), value: text(r.P), destinationKey: 'NOKIA-BH' }));
  uniqueIds(items); const byNote = new Map();
  for (const i of items) if (i.note && !i.note.startsWith('#')) { if (!byNote.has(i.note)) byNote.set(i.note, []); byNote.get(i.note).push(i); }
  return { capturedAt: source.capturedAt, missingNote: items.filter(i => i.expedition && !i.note).length, groups: finishGroups([...byNote].map(([note, rows]) => ({ key: groupKey('nokia', note, ['NOKIA-BH']), client: 'nokia', note, destination, items: rows })), items) };
}
export function modelMatches(model, group) { return model.client === 'nokia' && model.destinationKey === group.items[0].destinationKey && (model.overrideDestination===true||model.cnpj === destination.cnpj && norm(model.city) === norm(destination.city) && norm(model.uf) === 'MG'); }
export function validateBoxes(group, draft) {
  for (const i of group.items) { const box = text(draft.assignments[i.id] ?? i.box); need(/^\d+$/.test(box) && Number(box) >= 1 && Number(box) <= 999, `Caixa inválida para ${i.id}; use 1 a 999.`); if (i.box) need(Number(box) === Number(i.box), `${i.id}: a caixa já gravada na Nokia não pode ser substituída.`); }
}
export function changes(group, draft, boxes, model) {
  const out = {}, p = '01 Pesagem v2', r = '02 Romaneio v2', put = (s, a, v, k) => setCell(out, s, a, v, k);
  const destination=group.destination;
  const weight = boxes.reduce((n, b) => n + b.weight, 0), value = group.items.reduce((n, i) => { let v = i.value.replace(/R\$|\s/g, ''); if (v.includes(',')) v = v.replace(/\./g, '').replace(',', '.'); return n + (Number(v) || 0); }, 0);
  for (const [a, v] of Object.entries({ B4: 'Nokia', D4: destination.cnpj, B5: group.note, D5: destination.uf, B6: '50.282.124/0001-85', D6: destination.city, B11: destination.address, B13: draft.invoiceAddress, B14: draft.observation, I22: `Devolução nota fiscal ${group.note} Livion > Nokia ${destination.city}-${destination.uf}`, I23: `Prezados, bom dia.\n\nSolicitamos o agendamento da devolução referente à NF ${group.note}.\n\nO romaneio segue em anexo.\n\nAtenciosamente,\nLivion Solutions` })) put(p, a, v || '');
  for (const [a, v] of Object.entries({ F4: value, F5: weight, B7: group.count, D7: boxes.length })) put(p, a, v, 'number');
  let cumulative = 0;
  boxes.forEach((b, k) => { const row = 33 + k; cumulative += b.weight; for (const [c, v, kind] of [['A', b.number, 'number'], ['B', b.weight, 'number'], ['C', b.dimension], ['G', b.observation], ['H', 'OK'], ['I', b.ids.length, 'number'], ['J', cumulative, 'number'], ['K', `${k + 1}/${boxes.length}`]]) put(p, c + row, v, kind); });
  group.invoices.forEach((nf, k) => { put(p, 'D' + (33 + k), `${nf.note}/003`); put(p, 'E' + (33 + k), nf.status); put(p, 'F' + (33 + k), nf.year); });
  for (const [a, v] of Object.entries({ D2: 'Nokia', F2: destination.city, I2: group.note, D3: 'RH COMÉRCIO', F3: destination.cnpj, D4: 'Rua Prefeito Antônio Procópio da Costa, 68 - Santa Rita do Sapucaí/MG', D5: '(11) 91100-7548', D6: destination.address })) put(r, a, v);
  const counts = status => group.items.filter(i => norm(i.status) === status).length;
  for (const [a, v] of Object.entries({ C10: counts('REPARADO'), E10: counts('SEM REPARO'), G10: group.count, I10: boxes.length, C11: counts('IRREPARAVEL'), E11: counts('NAO AUTORIZADO'), G11: weight, I11: value, C12: counts('SEM DEFEITO'), E12: group.count })) put(r, a, v, 'number');
  boxes.flatMap(b => b.ids.map(id => ({ i: group.items.find(i => i.id === id), box: b.number }))).forEach(({ i, box }, k) => [String(k + 1).padStart(3, '0'), box, i.barcode, i.pn, i.serial, i.days, i.warranty, i.sourceNote, i.status].forEach((v, c) => put(r, String.fromCharCode(65 + c) + (15 + k), v)));
  return out;
}
export function output(group, draft) { const d=group.destination,suffix=d.cnpj.slice(-6,-2)+'-'+d.cnpj.slice(-2),stem = `NFe_${safeName(group.note)} NOKIA ${safeName(d.uf)} ${safeName(norm(d.city))} (${suffix}) ${safeName(draft.responsible)}`; return { root: '@EXPEDIÇÃO RHCS', folder: '(EMITIR RASCUNHO) ' + stem, filename: '(' + stem + '.xlsx' }; }
