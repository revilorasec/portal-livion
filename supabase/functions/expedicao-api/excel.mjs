import { createWorkbookEngine } from './workbook.mjs';
import { need, norm, setCell } from './common.mjs';
export function labelTargets(book) {
  const cells = book.cells['03 Etiquetas']; need(cells, 'Aba 03 Etiquetas não encontrada.');
  const targets = [];
  for (const [address, c] of Object.entries(cells)) {
    if (!c.formula.includes('VOLUME ')) continue;
    const [, col, row] = address.match(/^([A-Z]+)(\d+)$/) || [];
    const sourceRow = Number(c.formula.match(/'01 Pesagem v2'!\$A\$(\d+)/)?.[1]);
    need(col && sourceRow >= 33, 'Fórmula de volume das etiquetas não reconhecida.');
    const label = col + (Number(row) + 5), right = String.fromCharCode(col.charCodeAt(0) + 1) + (Number(row) + 5);
    need(col.length === 1 && norm(cells[label]?.value) === 'STATUS' && cells[right] && !cells[right].formula, 'A célula à direita de STATUS precisa de revisão no modelo.');
    targets.push({ label, target: right, index: sourceRow - 33 });
  }
  need(targets.length && new Set(targets.map(t => t.index)).size === targets.length, 'Etiquetas ausentes ou duplicadas.');
  return targets.sort((a, b) => a.index - b.index);
}
export async function generateWorkbook(JSZip, model, bytes, group, plan) {
  const { Book } = createWorkbookEngine(JSZip), book = await Book.open(bytes, model.name), cells = structuredClone(plan.cells), p = '01 Pesagem v2', r = '02 Romaneio v2';
  if (group.client === 'claro') { const info = book.inspect(); need(info.cnpj === model.cnpj && norm(info.city) === norm(model.city) && info.uf === model.uf && info.capacity === model.capacity, 'Metadados do modelo Claro divergentes.'); }
  const targets = labelTargets(book); need(plan.boxes.length <= targets.length, 'A quantidade de caixas excede as etiquetas disponíveis.');
  const pEnd = group.client === 'claro' ? 74 : 598;
  for (const [sheet, columns, start, end] of [[p, group.client === 'claro' ? 'ABCDEFG' : 'ABCDEFGHIJK', 33, pEnd], [r, 'ABCDEFGHI', 15, 14 + model.capacity]]) {
    for (let row = start; row <= end; row++) for (const col of columns) { const addr = col + row, c = book.cells[sheet]?.[addr]; if (c && !c.formula && !Object.hasOwn(cells[sheet] || {}, addr)) setCell(cells, sheet, addr, ''); }
  }
  // Preserve the template's existing computed totals instead of replacing them with constants.
  const computed = new Set([p+'!F4',p+'!F5',p+'!B7',p+'!D7',...['D2','F2','I2','D3','F3','D4','D5','D6','C10','E10','G10','I10','C11','E11','G11','I11','C12','E12'].map(a=>r+'!'+a)]);
  for (const [sheet, changes] of Object.entries(cells)) for (const addr of Object.keys(changes)) if (book.cells[sheet]?.[addr]?.formula) {
    need(computed.has(sheet+'!'+addr) || sheet === p && /^[HIJK](\d+)$/.test(addr), 'O preenchimento atingiu uma fórmula fora das áreas calculadas: '+sheet+'!'+addr+'.'); delete changes[addr];
  }
  for (const t of targets) setCell(cells, '03 Etiquetas', t.target, plan.boxes[t.index]?.status || '');
  const result = await book.writeCopy(cells);
  const reread = await Book.open(result.bytes, model.name);
  for (const t of targets) need(reread.value('03 Etiquetas', t.target) === (plan.boxes[t.index]?.status || ''), 'A conferência do status nas etiquetas falhou.');
  return { bytes: result.bytes, sha256: result.validation.sha256, labelCells: targets.map(t=>t.target), validation: result.validation };
}
