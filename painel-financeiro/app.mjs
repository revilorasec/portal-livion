const API = 'https://kvfjjtkwxxbvzlicwnrz.supabase.co/functions/v1/finance-api';
const $ = id => document.getElementById(id);
let token = '', generation = 0, pendingToken = null;
const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('livion-portal-session') : null;
channel?.addEventListener('message', e => {
  if (pendingToken && e.data?.type === 'PORTAL_TOKEN_RESPONSE' && e.data.requestId === pendingToken.id) {
    pendingToken.resolve(e.data.token); pendingToken = null;
  }
});
async function portalToken() {
  if (parent !== window) {
    try { if (parent.location.origin === location.origin && typeof parent.__PORTAL_GET_TOKEN__ === 'function') return await parent.__PORTAL_GET_TOKEN__(false); } catch {}
  }
  if (!channel) throw new Error('SESSION_REQUIRED');
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID(); pendingToken = { id, resolve };
    channel.postMessage({ type: 'PORTAL_TOKEN_REQUEST', requestId: id });
    setTimeout(() => { if (pendingToken?.id === id) { pendingToken = null; reject(new Error('SESSION_REQUIRED')); } }, 6000);
  });
}
async function call(path, options = {}) {
  const response = await fetch(API + path, { ...options, cache: 'no-store', credentials: 'omit',
    headers: { ...options.headers, Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(45000) });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(response.status === 401 || response.status === 403 ? 'ACCESS_DENIED' : body.error || 'SERVICE_UNAVAILABLE');
  }
  return response;
}
function clear() { $('dashboard').hidden = true; $('dashboard').removeAttribute('srcdoc'); $('importer').hidden = true; $('version').textContent = ''; token = ''; }
function message(error) {
  return ({ SESSION_REQUIRED: 'Abra este app pelo Portal Livion com sua conta corporativa.',
    ACCESS_DENIED: 'Seu usuário não tem permissão para esta ação no Painel Financeiro. Confira a liberação do aplicativo e a permissão de visualizar no Portal.',
    NO_SNAPSHOT: 'Nenhuma versão financeira está disponível. Um administrador precisa importar o HTML validado.',
    HASH_MISMATCH: 'O arquivo não passou pela verificação de integridade.',
    OLDER_SNAPSHOT: 'Há uma coleta mais recente publicada. Esta versão anterior foi recusada.',
    INVALID_SNAPSHOT: 'Selecione o HTML portátil validado deste painel.' })[error.message] || 'O serviço privado não respondeu. Tente atualizar novamente.';
}
async function load() {
  const current = ++generation; clear(); $('status').hidden = false; $('status').textContent = 'Validando acesso privado…';
  try {
    token = await portalToken();
    const permission = await (await call('/access')).json();
    if (current !== generation) return;
    $('importer').hidden = !permission.canImport;
    const response = await call('/snapshot'), html = await response.text();
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(html))), x => x.toString(16).padStart(2, '0')).join('');
    if (hash !== response.headers.get('x-snapshot-sha256')) throw new Error('HASH_MISMATCH');
    if (current !== generation) return;
    $('dashboard').srcdoc = html; $('dashboard').hidden = false; $('status').hidden = true;
    $('version').textContent = 'Coleta ' + response.headers.get('x-snapshot-date').split('-').reverse().join('/');
  } catch (error) {
    if (current !== generation) return;
    if (error.message !== 'NO_SNAPSHOT') clear();
    $('status').textContent = message(error); $('status').hidden = false;
  }
}
$('refresh').onclick = load;
$('file').onchange = () => { $('upload').disabled = !$('file').files.length; };
$('date').value = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
$('upload').onclick = async () => {
  const file = $('file').files[0]; if (!file || !$('date').value) return;
  $('upload').disabled = true; $('importStatus').textContent = 'Verificando e importando versão privada…';
  try {
    if (file.size > 12 * 1024 * 1024) throw new Error('INVALID_SNAPSHOT');
    const bytes = await file.arrayBuffer(), sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), x => x.toString(16).padStart(2, '0')).join('');
    token = await portalToken();
    await call('/snapshots', { method: 'POST', headers: { 'Content-Type': 'text/html; charset=utf-8',
      'X-Snapshot-Date': $('date').value, 'X-Snapshot-Sha256': sha256 }, body: bytes });
    $('importStatus').textContent = 'Versão importada. Integridade SHA-256 confirmada.'; await load();
  } catch (error) { $('importStatus').textContent = message(error); }
  finally { $('upload').disabled = false; }
};
// Clear sensitive rendered data promptly on navigation and failed revalidation.
addEventListener('pagehide', () => { ++generation; clear(); });
setInterval(async () => { if (!token) return; try { token = await portalToken(); await call('/access'); } catch (error) { ++generation; clear(); $('status').hidden = false; $('status').textContent = message(error); } }, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && !token) load(); });
load();
