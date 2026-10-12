import { AppError, companyKey, validateDatabase } from './domain.mjs';
export const DRIVE_ID = 'b!VXQ56DCbpUqLpZcv20CLTu54zOQjrzhLps9TgGfWTtg3fKs9Eh_FSZl0TAmERhaR';
export const ROOT = '00-PORTAL LIVION/OLV FISCAL/Homologacao';
const MAX_BYTES = 3 * 1024 * 1024;
export class GraphRepository {
  constructor(token, fetcher = fetch) { this.token = token; this.fetcher = fetcher; }
  path(relative) {
    return `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/root:/${(ROOT + '/' + relative).split('/').map(encodeURIComponent).join('/')}`;
  }
  async request(url, options = {}) {
    return this.fetcher(url, { ...options, headers: { Authorization: `Bearer ${this.token}`, ...options.headers }, signal: AbortSignal.timeout(20000) });
  }
  async check(response) {
    if (response.ok) return response;
    if (response.status === 412 || response.status === 409) throw new AppError(409, 'REVISION_CONFLICT', 'A base mudou no OneDrive. Recarregue antes de salvar; seu formulário foi preservado.');
    if (response.status === 401) throw new AppError(401, 'GRAPH_AUTH', 'Reconecte sua conta Microsoft ao OneDrive.');
    if (response.status === 403) throw new AppError(403, 'GRAPH_ACCESS', 'Sua conta não tem acesso à pasta do OLV Fiscal no OneDrive.');
    if (response.status === 404) throw new AppError(404, 'GRAPH_NOT_FOUND', 'A base de homologação do OLV Fiscal ainda não foi encontrada no OneDrive.');
    throw new AppError(503, 'GRAPH_UNAVAILABLE', 'O OneDrive não respondeu. Tente novamente; o conteúdo do formulário continua disponível.');
  }
  async load(company) {
    companyKey(company);
    const path = this.path(`Dados/${company}.json`);
    // Read content between metadata checks to avoid returning a body with a different eTag.
    for (let attempt = 0; attempt < 2; attempt++) {
      const meta = await (await this.check(await this.request(path + '?$select=id,eTag,size,webUrl'))).json();
      if (!meta.eTag || meta.size > MAX_BYTES) throw new AppError(409, 'INVALID_DATABASE', 'Base sem versão válida ou acima do limite de homologação.');
      const response = await this.check(await this.request(path + ':/content'));
      const raw = await response.text();
      if (new TextEncoder().encode(raw).length > MAX_BYTES) throw new AppError(413, 'DATABASE_TOO_LARGE', 'Base acima do limite de homologação.');
      const after = await (await this.check(await this.request(path + '?$select=eTag'))).json();
      if (after.eTag !== meta.eTag) continue;
      let data; try { data = JSON.parse(raw); } catch { throw new AppError(409, 'INVALID_DATABASE', 'O arquivo do banco não contém JSON válido.'); }
      return { data: validateDatabase(data, company), etag: meta.eTag, raw, webUrl: meta.webUrl };
    }
    throw new AppError(409, 'REVISION_CONFLICT', 'A base está sendo atualizada. Tente carregar novamente.');
  }
  async save(company, next, snapshot, requestId) {
    validateDatabase(next, company);
    if (!snapshot.etag) throw new AppError(409, 'REVISION_CONFLICT', 'Versão do arquivo ausente. Recarregue a base.');
    const raw = JSON.stringify(next, null, 2);
    if (new TextEncoder().encode(raw).length > MAX_BYTES) throw new AppError(413, 'DATABASE_TOO_LARGE', 'Base acima do limite de homologação.');
    const backupName = `${company}_r${snapshot.data.revision}_${requestId}.json`;
    const backup = await this.request(this.path(`Backups/${backupName}`) + ':/content', {
      method: 'PUT', headers: { 'Content-Type': 'application/json', 'If-None-Match': '*' }, body: snapshot.raw
    });
    if (![409, 412].includes(backup.status)) await this.check(backup);
    await this.check(await this.request(this.path(`Dados/${company}.json`) + ':/content', {
      method: 'PUT', headers: { 'Content-Type': 'application/json', 'If-Match': snapshot.etag }, body: raw
    }));
    // Read back the persisted state. Never report a successful save just from HTTP 200.
    const persisted = await this.load(company);
    if (!persisted.data.audit.some(event => event.id === requestId))
      throw new AppError(409, 'SAVE_NOT_CONFIRMED', 'Não foi possível confirmar a gravação. Recarregue a base antes de tentar novamente.');
    return persisted;
  }
}
