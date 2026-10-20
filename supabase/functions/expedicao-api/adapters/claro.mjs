import { text, norm, digits, need, uniqueIds, groupKey, finishGroups, yearOf, setCell, safeName } from '../common.mjs';
export const CLARO = Object.freeze({ client: 'claro', sheet: 'CLARO_BD', note: 'AL', box: 'AK', location: 'D', status: 'AF' });
const aliases = {
  '40432544002948|1126': { cities: ['CARRAO', 'VILA GOMES CARDIM'], cep: '03320001', number: '1652' },
  '40432544003243|1127': { cities: ['PERDIZES', 'BARRA FUNDA'], cep: '01140080', number: '338' },
  '40432544002867|1124': { cities: ['AMERICANOPOLIS', 'SAO PAULO'], cep: '04382130', number: '59' },
  '40432544015500|8192': { cities: ['JAB. GUARARAPES', 'JABOATAO DOS GUARARAPES'], cep: '54355057', number: '807' },
  // CD name and delivery city differ in the verified CD_Regional address.
  '40432544028823|4194': { cities: ['SAO JOSE DOS PINHAIS', 'CURITIBA'], cep: '82120060', number: '709' },
  '40432544059621|62EA': { cities: ['GIOANIA', 'GOIANIA'], cep: '74013020', number: '339' }
};
const cep = v => text(v).match(/(?<!\d)(\d{2})[.\s]?(\d{3})[-.\s]?(\d{3})(?!\d)/)?.slice(1).join('') || '';
export function normalizeSource(source) {
  need(source.client === 'claro' && source.schemaVersion === 1 && source.sheet === CLARO.sheet && Array.isArray(source.rows) && Array.isArray(source.destinations), 'Origem Claro incompatível.', 502);
  const items = source.rows.filter(r => text(r.A)).map(r => ({ id: text(r.A), note: text(r.AL), sourceNote: text(r.H), year: yearOf(r.I), location: text(r.D), expedition: norm(r.D) === 'EXPEDICAO', status: text(r.AF), box: text(r.AK), pn: text(r.Q), serial: text(r.R), iw: text(r.T), sap: text(r.U), sgp: text(r.AA), cnpj: digits(r.J), center: norm(r.K), ufRegional: text(r.M), cd: text(r.N), destinationKey: JSON.stringify([digits(r.J), norm(r.K)]) }));
  uniqueIds(items); const grouped = new Map();
  for (const i of items) if (i.note && !i.note.startsWith('#') && (i.expedition || ['CLARO', '>CLARO'].includes(norm(i.location)))) { const key = groupKey('claro', i.note, [i.cnpj, i.center]); if (!grouped.has(key)) grouped.set(key, []); grouped.get(key).push(i); }
  const groups = [...grouped].map(([key, rows]) => {
    const candidates = source.destinations.filter(d => digits(d.cnpj) === rows[0].cnpj && norm(d.center) === rows[0].center);
    const d = candidates.length === 1 ? candidates[0] : null, errors = [];
    if (!d) errors.push('CNPJ e Centro não identificam um único destino em CD_Regional.');
    if (d) for (const i of rows) { if (i.cd && norm(i.cd) !== norm(d.city)) errors.push(`${i.id}: CD diverge do cadastro.`); if (i.ufRegional && norm(i.ufRegional) !== norm(d.ufRegional)) errors.push(`${i.id}: UF/Regional diverge do cadastro.`); }
    return { key, client: 'claro', note: rows[0].note, destination: d ? { ...d, cnpj: digits(d.cnpj), center: norm(d.center), uf: norm(d.ufRegional).split(' - ').pop() } : { cnpj: rows[0].cnpj, center: rows[0].center, city: rows[0].cd }, items: rows, errors: [...new Set(errors)] };
  });
  return { capturedAt: source.capturedAt, missingNote: items.filter(i => i.expedition && (!i.note || i.note.startsWith('#'))).length, groups: finishGroups(groups, items) };
}
export function modelMatches(m, g) {
  const d = g.destination, alias = aliases[d.cnpj + '|' + d.center];
  if(m.overrideDestination===true)return m.client==='claro'&&m.cnpj===d.cnpj&&m.centers?.map(norm).includes(d.center);
  const building = v => norm(v).split('CEP')[0].match(/(?<!\w)(\d+)(?!\w)/)?.[1] || '', a = building(d.address), b = building(m.address);
  return m.client === 'claro' && m.cnpj === d.cnpj && m.centers?.map(norm).includes(d.center) && norm(m.uf) === d.uf && (alias?.cities || [norm(d.city)]).includes(norm(m.city)) && Boolean(cep(d.address)) && cep(d.address) === cep(m.address) && (!a || !b || a === b) && (!alias || cep(d.address) === alias.cep && new RegExp('(?<!\\d)' + alias.number + '(?!\\d)').test(m.address));
}
export function validateBoxes(group, draft) {
  const boxes = [...new Set(group.items.map(i => text(draft.assignments[i.id] ?? i.box)))].sort((a, b) => Number(a) - Number(b));
  need(boxes.every((b, k) => String(k + 1) === b), 'Na Claro, numere as caixas consecutivamente de 1 até N.');
}
export function changes(group, draft, boxes) {
  const out = {}, p = '01 Pesagem v2', r = '02 Romaneio v2', put = (s, a, v, k) => setCell(out, s, a, v, k);
  for(const [a,v]of Object.entries({D4:group.destination.cnpj,D5:group.destination.uf,D6:group.destination.city,B11:group.destination.address}))put(p,a,v);
  put(p, 'B5', group.note); put(p, 'F4', draft.invoiceValue ?? '', draft.invoiceValue === '' ? 'text' : 'number'); put(p, 'B13', draft.invoiceAddress); put(p, 'B14', draft.observation);
  boxes.forEach((b, k) => { const row = 33 + k; put(p, 'A' + row, b.number, 'number'); put(p, 'B' + row, b.weight, 'number'); put(p, 'C' + row, b.dimension); put(p, 'G' + row, b.observation); });
  group.invoices.forEach((nf, k) => { put(p, 'D' + (33 + k), nf.note); put(p, 'E' + (33 + k), nf.status); put(p, 'F' + (33 + k), nf.year); });
  boxes.flatMap(b => b.ids.map(id => ({ i: group.items.find(i => i.id === id), box: b.number }))).forEach(({ i, box }, k) => [String(k + 1).padStart(3, '0'), box, i.sap, i.pn, i.serial, i.iw, i.sgp, i.sourceNote, i.status].forEach((v, c) => put(r, String.fromCharCode(65 + c) + (15 + k), v, c === 1 ? 'number' : 'text')));
  return out;
}
export function output(group) {
  const d = group.destination, regions = { NORDESTE: 'NE', NORTE: 'N', 'CENTRO OESTE': 'CO', BAHIA: 'BA', 'MINAS GERAIS': 'MG', PARANA: 'PR', 'RIO GRANDE DO SUL': 'RS', 'RIO DE JANEIRO': 'RJ', 'SANTA CATARINA': 'SC', 'SAO PAULO - CAPITAL': 'SPC', 'SAO PAULO - INTERIOR': 'SPI' };
  const statuses = [...new Set(group.items.map(i => norm(i.status)))], labels = { '03-REPARADO': 'REPARADO', '02-IRREPARAVEL': 'IRREPARAVEL', '06-SEM DEFEITO': 'SEM DEFEITO' }, status = statuses.length === 1 ? labels[statuses[0]] || statuses[0] : 'MISTO';
  const suffix = d.cnpj.slice(-6, -2) + '-' + d.cnpj.slice(-2), stem = `NFe_${safeName(group.note)} CLARO ${safeName(regions[norm(d.region)] || d.region)} ${d.uf} ${safeName(norm(d.city))} (${suffix}) ${safeName(status)}`;
  return { root: '@EXPEDIÇÃO LIVION', folder: '(EMITIR RASCUNHO) ' + stem, filename: stem + '.xlsx' };
}
