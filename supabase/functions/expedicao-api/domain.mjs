import * as nokia from './adapters/nokia.mjs';
import * as claro from './adapters/claro.mjs';
import { need, text, norm, sha256, number } from './common.mjs';
import { describeBoxStatus } from './box-status.mjs';
export const ADAPTERS = Object.freeze({ nokia, claro });
export const APP = 'expedicao';
export function permissions(user, client) {
  need(ADAPTERS[client], 'Empresa inválida.');
  const admin = user?.profile === 'ADMINISTRADOR', actions = user?.actions || [], viewOnly = user?.profile === 'VISUALIZADOR';
  const access = Boolean(user?.active && user.user_type === 'INTERNO' && (admin || (user.apps || []).includes(APP)) && (admin || actions.includes(`expedicao.${client}.acessar`)));
  const can = action => access && (action === 'visualizar' ? admin || actions.includes('expedicao.visualizar') : !viewOnly && (admin || actions.includes('expedicao.' + action)));
  return { access, view: can('visualizar'), edit: can('editar_rascunho'), write: can('gravar_caixas'), generate: can('gerar_romaneio') };
}
export function authorize(user, client, action) { need(permissions(user, client)[action], 'Seu usuário não tem permissão para esta operação.', 403, 'FORBIDDEN'); }
export async function sourceGroups(client, source, models = []) {
  const adapter = ADAPTERS[client]; need(adapter, 'Empresa inválida.');
  const result = adapter.normalizeSource(source);
  for (const g of result.groups) {
    const candidates = models.filter(m => m.active !== false && adapter.modelMatches(m, g));
    g.errors = [...(g.errors || [])];
    if (candidates.length !== 1) g.errors.push(candidates.length ? 'Mais de um modelo corresponde ao destino.' : 'Modelo do destino ainda não conferido.');
    g.model = candidates.length === 1 ? { id: candidates[0].id, name: candidates[0].name, sha256: candidates[0].sha256, capacity: candidates[0].capacity, boxCapacity: candidates[0].boxCapacity,dimensionOptions:candidates[0].dimensionOptions||[],defaults:candidates[0].defaults||{} } : null;
    if(candidates.length===1&&candidates[0].overrideDestination===true){const m=candidates[0];g.destination={...g.destination,cnpj:m.cnpj,city:m.city,uf:m.uf,address:m.address,customAddress:true};}
    g.fingerprint = await sha256(JSON.stringify({ key: g.key, destination: g.destination, model: g.model, items: g.items.map(({ days, year, ...i }) => i).sort((a, b) => a.id.localeCompare(b.id)) }));
    // Later delivery/location updates and model revisions must not put an already shipped note back in the queue.
    g.dispatchFingerprint = await sha256(JSON.stringify({ key:g.key,items:g.items.map(({days,year,location,expedition,expeditionDate,...i})=>i).sort((a,b)=>a.id.localeCompare(b.id)) }));
  }
  return result;
}
export function validateDraft(group, input, complete = false) {
  need(input && typeof input === 'object' && !Array.isArray(input), 'Rascunho inválido.');
  const bounded = (v, max) => { need(typeof v === 'string' && v.length <= max && !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(v), 'Texto inválido no rascunho.'); return v.trim(); };
  const draft = { responsible: bounded(input.responsible ?? '', 160), observation: bounded(input.observation ?? '', 4000), invoiceAddress: bounded(input.invoiceAddress ?? '', 2000), invoiceValue: text(input.invoiceValue), assignments: Object.create(null), boxes: Object.create(null) };
  draft.destinationCity=bounded(input.destinationCity??group.destination.city??'',160);
  draft.destinationUf=norm(bounded(input.destinationUf??group.destination.uf??'',2));
  draft.destinationAddress=bounded(input.destinationAddress??group.destination.address??'',2000);
  const ids = new Set(group.items.map(i => i.id));
  need(input.assignments && typeof input.assignments === 'object' && !Array.isArray(input.assignments) && Object.keys(input.assignments).every(id => ids.has(id)), 'O rascunho contém peças de outra nota.');
  for (const i of group.items) { const b = text(input.assignments[i.id] ?? i.box); need(!b || /^[1-9]\d{0,5}$/.test(b), `Caixa inválida: ${i.id}.`); draft.assignments[i.id] = b; }
  need(input.boxes && typeof input.boxes === 'object' && !Array.isArray(input.boxes) && Object.keys(input.boxes).length <= 500, 'Pesagem inválida.');
  for (const [key, b] of Object.entries(input.boxes)) { need(/^[1-9]\d{0,5}$/.test(key) && b && typeof b === 'object', 'Caixa inválida na pesagem.'); draft.boxes[key] = { weight: bounded(text(b.weight), 30), dimension: bounded(b.dimension ?? '', 160), observation: bounded(b.observation ?? '', 2000) }; }
  if (!complete) return draft;
  if(group.model?.dimensionOptions?.length)for(const b of Object.values(draft.boxes))need(group.model.dimensionOptions.includes(b.dimension),'Selecione uma dimensão da lista do modelo Excel para cada caixa.');
  need(draft.destinationCity&&/^[A-Z]{2}$/.test(draft.destinationUf)&&draft.destinationAddress,'Confira cidade, UF e endereço de destino do romaneio.');
  need(group.errors.length === 0, group.errors.join(' ')); need(draft.responsible, 'Selecione quem fez a expedição.');
  need(group.items.every(i => i.status), 'Há peças sem status preenchido.');
  need(group.items.every(i => draft.assignments[i.id]), 'Defina a caixa de todas as peças.');
  ADAPTERS[group.client].validateBoxes(group, draft);
  if (group.client === 'claro') { need(group.items.every(i => i.sap && i.sourceNote), 'Há peças sem SAP ou nota Claro.'); if (draft.invoiceValue) draft.invoiceValue = number(draft.invoiceValue, 'Valor da NF', false); }
  return draft;
}
export function boxStatuses(group, draft) {
  const byBox = new Map();
  for (const i of group.items) {
    const box = text(draft.assignments[i.id] ?? i.box); if (!box) continue;
    need(i.status, `${i.id}: status não preenchido.`);
    if (!byBox.has(box)) byBox.set(box, { values: [], ids: [] });
    const status = byBox.get(box);
    status.values.push(i.status);
    status.ids.push(i.id);
  }
  for(const [box,status] of byBox){
    const summary=describeBoxStatus(group.client,status.values);
    need(summary.valid,`Caixa ${box}: há peças sem status preenchido.`);
    status.value=summary.label;
  }
  return byBox;
}
export function prepareExport(group, input) {
  const draft = validateDraft(group, input, true), byBox = new Map();
  const statuses = boxStatuses(group, draft);
  for (const i of group.items) { const b = draft.assignments[i.id]; if (!byBox.has(b)) byBox.set(b, []); byBox.get(b).push(i.id); }
  need(group.count <= group.model.capacity, 'A quantidade de peças excede a capacidade do modelo.');
  need(byBox.size <= group.model.boxCapacity, 'A quantidade de caixas excede a capacidade do modelo.');
  need(group.invoices.length <= 42, 'O quadro fiscal comporta até 42 notas de origem.');
  const boxes = [...byBox].sort(([a], [b]) => Number(a) - Number(b)).map(([n, ids]) => { const b = draft.boxes[n] || {}; need(b.dimension, `Informe a dimensão da caixa ${n}.`); return { number: n, ids, status: statuses.get(n).value, weight: number(b.weight, `Peso da caixa ${n}`), dimension: b.dimension, observation: b.observation || '' }; });
  const adapter = ADAPTERS[group.client];
  const outputGroup={...group,destination:{...group.destination,city:draft.destinationCity,uf:draft.destinationUf,address:draft.destinationAddress}};
  return { draft, boxes, cells: adapter.changes(outputGroup, draft, boxes, group.model), output: adapter.output(outputGroup, draft) };
}
export function boxUpdates(group, input) {
  need(group.active, 'A nota já está finalizada.', 409); const draft = validateDraft(group, input);
  boxStatuses(group, draft);
  const changes = [];
  for (const i of group.items) { const box = draft.assignments[i.id]; if (!box || box === i.box) continue; need(i.expedition, `${i.id}: peça fora da expedição.`, 409); need(i.status, `${i.id}: status não preenchido.`); if (group.client === 'nokia') need(!i.box && Number(box) <= 999, `${i.id}: a caixa Nokia só pode ser preenchida quando vazia.`, 409); changes.push({ id: i.id, oldBox: i.box, box, expected: i }); }
  need(changes.length > 0 && changes.length <= 500, 'Nenhuma alteração válida ou limite de 500 peças excedido.');
  return changes;
}
