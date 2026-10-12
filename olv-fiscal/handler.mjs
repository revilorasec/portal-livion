import { AppError, APP_KEY, VERSION, COMPANIES, companyKey, allowed, requireAccess, applyMutation, blockEmission } from './domain.mjs';
import { GraphRepository, ROOT } from './graph-repository.mjs';
const PORTAL_API = 'https://kvfjjtkwxxbvzlicwnrz.supabase.co/functions/v1/portal-api/context';
const ORIGINS = new Set(['https://portal.livionsolutions.com.br', 'https://revilorasec.github.io']);
export function createHandler({ fetcher = fetch, repositoryFactory = token => new GraphRepository(token, fetcher),
  contextProvider = async token => {
    const response = await fetcher(PORTAL_API, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new AppError(response.status === 401 ? 401 : 403, 'PORTAL_ACCESS', 'Entre novamente no Portal ou verifique a permissão do OLV Fiscal.');
    return response.json();
  }, now = () => new Date().toISOString() } = {}) {
  return async function handler(req) {
    const origin = req.headers.get('origin');
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Origin',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'authorization,content-type' };
    if (ORIGINS.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
    const reply = (status, data) => new Response(JSON.stringify(data), { status, headers });
    try {
      if (origin && !ORIGINS.has(origin)) throw new AppError(403, 'ORIGIN_DENIED', 'Origem não autorizada.');
      if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
      const url = new URL(req.url), marker = '/olv-fiscal-hml-api';
      const index = url.pathname.indexOf(marker);
      const path = index >= 0 ? url.pathname.slice(index + marker.length) || '/' : url.pathname;
      if (req.method === 'GET' && path === '/health') return reply(200, { ok: true, version: VERSION,
        environment: 'homologacao', emissionEnabled: false, migrationEnabled: false, storage: 'onedrive' });
      const authorization = req.headers.get('authorization') || '';
      if (!authorization.startsWith('Bearer ') || authorization.length > 9000)
        throw new AppError(401, 'UNAUTHENTICATED', 'Abra este aplicativo pelo Portal Livion.');
      const token = authorization.slice(7), ctx = await contextProvider(token);
      if (!ctx.authenticated || !ctx.apps?.includes(APP_KEY)) throw new AppError(403, 'FORBIDDEN', 'Seu usuário não tem acesso ao OLV Fiscal.');
      if (path === '/context' && req.method === 'GET') {
        const companies = Object.entries(COMPANIES).filter(([key]) => allowed(ctx, key)).map(([key, name]) => ({ key, name }));
        return reply(200, { version: VERSION, environment: 'homologacao', user: ctx.user, companies,
          capabilities: { emission: false, migration: false, onedrive: true },
          permissions: Object.fromEntries(companies.map(c => [c.key, Object.fromEntries(['visualizar', 'editar_rascunhos', 'revisar', 'cadastros', 'exportar'].map(a => [a, allowed(ctx, c.key, a)]))])),
          storagePath: ROOT });
      }
      if (/^\/(emit|emission|transmitir|cancelar|cce|migrate|migration|certificates)(?:\/|$)/.test(path)) blockEmission();
      const company = companyKey(url.searchParams.get('company'));
      requireAccess(ctx, company, 'visualizar');
      const repo = repositoryFactory(token);
      if (path === '/state' && req.method === 'GET') {
        const saved = await repo.load(company);
        return reply(200, { data: saved.data, etag: saved.etag, webUrl: saved.webUrl });
      }
      if (path === '/mutate' && req.method === 'POST') {
        const raw = await req.text();
        if (new TextEncoder().encode(raw).length > 200000) throw new AppError(413, 'BODY_TOO_LARGE', 'Rascunho acima do limite de testes.');
        let command; try { command = JSON.parse(raw); } catch { throw new AppError(400, 'INVALID_JSON', 'Dados de gravação inválidos.'); }
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(command.requestId || ''))
          throw new AppError(400, 'INVALID_REQUEST', 'Identificador de gravação inválido.');
        const action = command.kind === 'save-catalog' ? 'cadastros' : command.kind === 'status' ? 'revisar' : 'editar_rascunhos';
        requireAccess(ctx, company, action);
        const fingerprintInput = { ...command }; delete fingerprintInput.revision; delete fingerprintInput.etag; delete fingerprintInput.requestId;
        const fingerprintBytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(fingerprintInput)));
        const fingerprint = Array.from(new Uint8Array(fingerprintBytes), b => b.toString(16).padStart(2, '0')).join('');
        const saved = await repo.load(company), actor = ctx.user.email;
        if (!actor) throw new AppError(403, 'FORBIDDEN', 'Identidade do usuário indisponível.');
        const previous = saved.data.audit.find(event => event.id === command.requestId);
        if (previous) {
          if (previous.actor !== actor || previous.fingerprint !== fingerprint) throw new AppError(409, 'REQUEST_CONFLICT', 'Identificador de operação já usado.');
          return reply(200, { data: saved.data, etag: saved.etag, replayed: true });
        }
        if (command.etag !== saved.etag) throw new AppError(409, 'REVISION_CONFLICT', 'Outra pessoa atualizou a base. Recarregue antes de salvar; seu formulário foi preservado.');
        const next = applyMutation(saved.data, command, actor, now(), command.requestId);
        next.audit[next.audit.length - 1].fingerprint = fingerprint;
        const persisted = await repo.save(company, next, saved, command.requestId);
        return reply(200, { data: persisted.data, etag: persisted.etag, webUrl: persisted.webUrl });
      }
      if (path === '/export' && req.method === 'GET') {
        requireAccess(ctx, company, 'exportar');
        const saved = await repo.load(company);
        return reply(200, { environment: 'homologacao', company, exportedAt: now(), data: saved.data });
      }
      throw new AppError(404, 'NOT_FOUND', 'Operação não encontrada.');
    } catch (error) {
      if (error instanceof AppError) return reply(error.status, { error: error.message, code: error.code });
      console.error('olv-fiscal-hml', error?.name || 'Error');
      return reply(503, { error: 'O serviço de testes não respondeu. Tente novamente; seu formulário foi preservado.', code: 'SERVICE_UNAVAILABLE' });
    }
  };
}
