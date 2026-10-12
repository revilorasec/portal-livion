export const APP_KEY = 'olv-fiscal';
export const VERSION = '0.1.0-hml';
export const COMPANIES = { LIVION: 'Livion Solutions', RHCS: 'RH Comércio' };
export const STATUSES = ['RASCUNHO', 'EM_REVISAO', 'PRONTO_PARA_TESTE', 'ARQUIVADO'];
export class AppError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const fail = (message) => { throw new AppError(400, 'VALIDATION', message); };
export const text = (value, max = 200) => String(value ?? '').trim().slice(0, max);
export function companyKey(value) {
  const key = text(value, 20).toUpperCase();
  if (!Object.hasOwn(COMPANIES, key)) fail('Selecione Livion ou RH Comércio.');
  return key;
}
export function allowed(ctx, company, action = 'visualizar') {
  if (!ctx?.authenticated || !ctx.apps?.includes(APP_KEY)) return false;
  if (ctx.administrator) return true;
  if (ctx.userType !== 'INTERNO') return false;
  return (ctx.companies?.includes(company) || ctx.companies?.includes('*')) &&
    (ctx.actions?.includes(`olv-fiscal.${action}`) || ctx.actions?.includes('*'));
}
export function requireAccess(ctx, company, action) {
  companyKey(company);
  if (!allowed(ctx, company, action)) throw new AppError(403, 'FORBIDDEN', 'Seu acesso ao OLV Fiscal ou à empresa não permite esta ação.');
}
export function scaled(value, decimals = 4) {
  const normalized = String(value ?? '0').trim().replace(',', '.');
  if (!/^\d{1,9}(?:\.\d{1,4})?$/.test(normalized)) fail('Use valores positivos com até quatro casas decimais, sem separador de milhares.');
  const [whole, fraction = ''] = normalized.split('.');
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0'));
}
export function normalizeItems(input) {
  if (!Array.isArray(input) || input.length > 100) fail('O rascunho aceita até 100 itens.');
  return input.map((item, index) => {
    const quantity = scaled(item.quantity), price = scaled(item.unitPrice);
    if (quantity <= 0n) fail(`A quantidade do item ${index + 1} deve ser maior que zero.`);
    const total = (quantity * price + 500000n) / 1000000n;
    if (total > 999999999999n) fail('Valor do item acima do limite de testes.');
    return { code: text(item.code, 60), description: text(item.description, 180), ncm: text(item.ncm, 8),
      cfop: text(item.cfop, 4), unit: text(item.unit || 'UN', 6), quantity: String(quantity),
      unitPrice: String(price), totalCents: Number(total) };
  });
}
export function draftPayload(input) {
  if (!input || !['VENDA', 'DEVOLUCAO'].includes(input.type)) fail('Escolha venda ou devolução.');
  const items = normalizeItems(input.items || []);
  const refs = Array.isArray(input.references) ? input.references : text(input.references, 2000).split(/[\s,;]+/);
  const references = [...new Set(refs.map(v => text(v, 100)).filter(Boolean))];
  if (references.length > 20 || references.some(key => !/^\d{44}$/.test(key))) fail('Cada chave de nota referenciada deve ter 44 dígitos.');
  const recipient = input.recipient || {};
  return { type: input.type, operation: text(input.operation, 160), cfop: text(input.cfop, 4),
    recipient: { name: text(recipient.name, 160), document: text(recipient.document, 24), ie: text(recipient.ie, 24),
      city: text(recipient.city, 120), uf: text(recipient.uf, 2).toUpperCase(), address: text(recipient.address, 200) },
    items, references, notes: text(input.notes, 4000), freightCents: Number((scaled(input.freight || 0, 4) + 50n) / 100n),
    discountCents: Number((scaled(input.discount || 0, 4) + 50n) / 100n),
    taxReview: 'PENDENTE', fiscalNumber: null, fiscalSeries: null, authorization: null };
}
export function totals(draft) {
  const productsCents = (draft.items || []).reduce((sum, item) => sum + item.totalCents, 0);
  const totalCents = productsCents + (draft.freightCents || 0) - (draft.discountCents || 0);
  if (totalCents < 0) fail('O desconto não pode superar o valor dos produtos e do frete.');
  return { productsCents, freightCents: draft.freightCents || 0, discountCents: draft.discountCents || 0, totalCents };
}
export function reviewIssues(draft) {
  const issues = [];
  if (!draft.recipient?.name) issues.push('Preencha o destinatário.');
  if (!draft.operation) issues.push('Preencha a natureza da operação.');
  if (!/^\d{4}$/.test(draft.cfop || '')) issues.push('Informe o CFOP para conferência.');
  if (!(draft.items || []).length) issues.push('Inclua pelo menos um item.');
  if ((draft.items || []).some(i => !i.description)) issues.push('Preencha a descrição de todos os itens.');
  if (draft.type === 'DEVOLUCAO' && !draft.references?.length) issues.push('Informe a chave da NF-e original da devolução.');
  return issues;
}
export function emptyDatabase(company) {
  return { schemaVersion: 1, environment: 'homologacao', company: companyKey(company), revision: 0,
    updatedAt: null, drafts: [], audit: [], catalogs: { customers: [], products: [], carriers: [] },
    settings: { emissionEnabled: false, migrationCompleted: false, fileStorage: 'onedrive' } };
}
export function validateDatabase(db, company) {
  if (!db || db.schemaVersion !== 1 || db.environment !== 'homologacao' || db.company !== company ||
      !Number.isSafeInteger(db.revision) || db.revision < 0 || !Array.isArray(db.drafts) || !Array.isArray(db.audit) ||
      !db.catalogs || ['customers', 'products', 'carriers'].some(k => !Array.isArray(db.catalogs[k])) ||
      db.settings?.emissionEnabled !== false || db.settings?.migrationCompleted !== false)
    throw new AppError(409, 'INVALID_DATABASE', 'A base não corresponde à homologação isolada do OLV Fiscal.');
  return db;
}
export function applyMutation(database, command, actor, now, id) {
  const db = structuredClone(validateDatabase(database, database.company));
  if (!Number.isSafeInteger(command.revision) || command.revision !== db.revision)
    throw new AppError(409, 'REVISION_CONFLICT', 'Outra pessoa atualizou a base. Recarregue antes de salvar; seu formulário foi preservado.');
  let entityId = command.id;
  if (command.kind === 'save-draft') {
    const payload = draftPayload(command.draft); totals(payload);
    const previous = command.id ? db.drafts.find(d => d.id === command.id) : null;
    if (command.id && !previous) throw new AppError(404, 'NOT_FOUND', 'Rascunho não encontrado.');
    if (previous?.status === 'ARQUIVADO') fail('Reabra o rascunho arquivado antes de editar.');
    entityId = previous?.id || id;
    const next = { ...payload, id: entityId, company: db.company, label: previous?.label || `HML-${id.slice(0, 8).toUpperCase()}`,
      status: 'RASCUNHO', createdAt: previous?.createdAt || now, createdBy: previous?.createdBy || actor,
      updatedAt: now, updatedBy: actor, version: (previous?.version || 0) + 1 };
    if (previous) db.drafts[db.drafts.indexOf(previous)] = next; else db.drafts.push(next);
  } else if (command.kind === 'status') {
    const draft = db.drafts.find(d => d.id === command.id);
    if (!draft) throw new AppError(404, 'NOT_FOUND', 'Rascunho não encontrado.');
    if (!STATUSES.includes(command.status)) fail('Situação de rascunho inválida.');
    if (command.status === 'PRONTO_PARA_TESTE') {
      const issues = reviewIssues(draft); if (issues.length) fail(issues.join(' '));
    }
    draft.status = command.status; draft.updatedAt = now; draft.updatedBy = actor; draft.version++;
  } else if (command.kind === 'duplicate') {
    const draft = db.drafts.find(d => d.id === command.id);
    if (!draft) throw new AppError(404, 'NOT_FOUND', 'Rascunho não encontrado.');
    entityId = id;
    db.drafts.push({ ...structuredClone(draft), id, label: `HML-${id.slice(0, 8).toUpperCase()}`, status: 'RASCUNHO',
      createdAt: now, updatedAt: now, createdBy: actor, updatedBy: actor, version: 1, authorization: null });
  } else if (command.kind === 'save-catalog') {
    if (!Object.hasOwn(db.catalogs, command.catalog)) fail('Cadastro desconhecido.');
    const item = command.item || {}, rows = db.catalogs[command.catalog];
    if (!text(item.name, 180)) fail('Informe o nome ou descrição do cadastro.');
    const previous = command.id ? rows.find(r => r.id === command.id) : null;
    if (command.id && !previous) throw new AppError(404, 'NOT_FOUND', 'Cadastro não encontrado.');
    entityId = previous?.id || id;
    const next = { id: entityId, name: text(item.name, 180), document: text(item.document, 24),
      code: text(item.code, 60), ncm: text(item.ncm, 8), unit: text(item.unit || 'UN', 6),
      uf: text(item.uf, 2).toUpperCase(), city: text(item.city, 120), active: item.active !== false,
      updatedAt: now, updatedBy: actor };
    if (previous) rows[rows.indexOf(previous)] = next; else rows.push(next);
  } else throw new AppError(400, 'UNKNOWN_COMMAND', 'Operação desconhecida.');
  db.revision++; db.updatedAt = now;
  db.audit.push({ id, at: now, actor, action: command.kind, entityId, status: command.status || null });
  return db;
}
export function blockEmission() {
  throw new AppError(423, 'EMISSION_DISABLED', 'Emissão, assinatura, cancelamento fiscal e migração estão bloqueados nesta homologação.');
}
