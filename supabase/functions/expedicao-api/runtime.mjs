import { ExpeditionError, need, sha256 } from './common.mjs';
import { generateWorkbook } from './excel.mjs';
import { inspectModel,editModel } from './models.mjs';
const TENANT = '911e1aee-070e-421b-ae71-439f01c2263e', CLIENT = '88cf5cba-9f67-467d-8a51-9638200bed52';
export function runtimeDependencies(env, JSZip, fetcher = fetch) {
  const base = env('SUPABASE_URL'), key = env('SUPABASE_SERVICE_ROLE_KEY');
  const rest = async (path, options = {}) => {
    const response = await fetcher(base + '/rest/v1/' + path, { ...options, headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', Prefer: 'return=representation', ...options.headers }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) { let e = {}; try { e = await response.json(); } catch {} if (/CONFLICT|PENDING/.test(e.message || '') || response.status === 409) throw new ExpeditionError(409, 'Outro usuário alterou o rascunho ou há uma gravação pendente. Atualize antes de continuar.', 'CONFLICT'); throw new ExpeditionError(503, 'O armazenamento da expedição não está disponível.'); }
    return response.status === 204 ? null : response.json();
  };
  const query = v => encodeURIComponent(v), first = async path => (await rest(path))[0] || null;
  const all = async path => { const rows = []; for (let offset = 0; offset < 100000; offset += 1000) { const page = await rest(path + '&limit=1000&offset=' + offset); rows.push(...page); if (page.length < 1000) return rows; } throw new ExpeditionError(503, 'Limite de leitura excedido.'); };
  const rpc = (fn, body) => rest('rpc/expedicao_' + fn, { method: 'POST', body: JSON.stringify(body) });
  async function bridge(client, payload) {
    const prefix = 'EXPEDICAO_' + client.toUpperCase(), url = env(prefix + '_URL'), secret = env(prefix + '_SECRET');
    need(url && secret, 'A conexão segura desta empresa ainda não foi configurada.', 503);
    const target = new URL(url); need(target.protocol === 'https:' && target.hostname === 'script.google.com' && /^\/macros\/s\/[\w-]+\/exec$/.test(target.pathname), 'Origem não permitida.', 503);
    const timestamp = Date.now(), nonce = crypto.randomUUID(), data = JSON.stringify(payload), input = `${timestamp}\n${nonce}\n${data}`;
    const hmacKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const signature = [...new Uint8Array(await crypto.subtle.sign('HMAC', hmacKey, new TextEncoder().encode(input)))].map(n => n.toString(16).padStart(2, '0')).join('');
    // Never retry writes after timeout, redirect failure or malformed response.
    const response = await fetcher(target, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ timestamp, nonce, data, signature }), signal: AbortSignal.timeout(55000) });
    need(response.ok, 'A origem não respondeu.', 502); const result = await response.json();
    need(result.ok === true && result.client === client && result.schemaVersion === 1, 'A origem recusou a operação ou retornou formato incompatível.', 502);
    return result;
  }
  return {
    identify: async token => {
      let c; try { c = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch { throw new ExpeditionError(401, 'Sessão inválida.'); }
      need(c.tid === TENANT && (c.azp || c.appid) === CLIENT && Number(c.exp) > Date.now() / 1000 && ['00000003-0000-0000-c000-000000000000', 'https://graph.microsoft.com'].includes(c.aud), 'Sessão inválida.', 401);
      // Graph validates the complete signed access token; decoded claims alone never authenticate.
      const r = await fetcher('https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName', { headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(12000) });
      need(r.ok, 'Sessão expirada. Entre novamente.', 401); const me = await r.json();
      need(me.id && me.id === c.oid, 'Identidade incompatível.', 401);
      return { id: me.id, email: String(me.mail || me.userPrincipalName || '').trim().toLowerCase() };
    },
    db: {
      user: async identity => { const fields = 'id,name,email,profile,user_type,active,apps,actions,microsoft_id'; const found = await first('portal_users?select=' + fields + '&microsoft_id=eq.' + query(identity.id)); return found || first('portal_users?select=' + fields + '&email=eq.' + query(identity.email)); },
      appEnabled: async app => (await first('portal_apps?select=active&key=eq.' + query(app)))?.active === true,
      models: async client => (await all('expedicao_models?select=id,client,metadata,sha256,storage_path,active&active=eq.true&deleted_at=is.null&client=eq.' + query(client) + '&order=id')).map(m => ({ ...m.metadata, id: m.id, client: m.client, sha256: m.sha256, storagePath: m.storage_path, active: m.active })),
      allModels: async client => (await all('expedicao_models?select=id,client,metadata,sha256,storage_path,active,revision,deleted_at,updated_at,updated_by&client=eq.'+query(client)+'&order=id')).map(m=>({...m.metadata,id:m.id,client:m.client,sha256:m.sha256,storagePath:m.storage_path,active:m.active,revision:m.revision,deletedAt:m.deleted_at,updatedAt:m.updated_at,updatedBy:m.updated_by})),
      manageModel: p=>rpc('manage_model',{p}),
      drafts: client => all('expedicao_drafts?select=*&client=eq.' + query(client) + '&order=group_key'),
      dispatches: client => all('expedicao_dispatches?select=*&client=eq.' + query(client) + '&order=group_key'),
      pending: client => all('expedicao_operations?select=id,client,group_key,state,created_at&state=in.(PREPARED,DISPATCHED,PENDING)&client=eq.' + query(client) + '&order=created_at'),
      saveDraft: p => rpc('save_draft', { p }), beginOperation: p => rpc('begin_operation', { p }),
      claimOperation: id => rpc('claim_operation', { p_id: id }),
      finishOperation: (id, state, result, actor) => rpc('finish_operation', { p_id: id, p_state: state, p_result: result, p_actor: actor }),
      operation: id => first('expedicao_operations?select=*&id=eq.' + query(id)),
      recordExport: p => rpc('record_export', { p }), export: id => first('expedicao_exports?select=*&id=eq.' + query(id)),
      completeDispatch: p => rpc('complete_dispatch', { p })
    },
    readSource: client => bridge(client, { action: 'read' }),
    writeEnabled: client => env('EXPEDICAO_' + client.toUpperCase() + '_WRITE_ENABLED') === 'true',
    writeSource: (client, payload) => bridge(client, { action: 'boxes', ...payload }),
    modelBytes: async model => { need(/^(nokia|claro)\/[a-f0-9]{64}\.xlsx$/.test(model.storagePath), 'Caminho do modelo inválido.', 503); const record=await first('expedicao_models?select=content_base64&id=eq.'+query(model.id)); if(record?.content_base64){const decoded=atob(record.content_base64);return Uint8Array.from(decoded,c=>c.charCodeAt(0));} const response = await fetcher(base + '/storage/v1/object/expedicao-modelos/' + model.storagePath, { headers: { apikey: key, Authorization: 'Bearer ' + key }, signal: AbortSignal.timeout(20000) }); need(response.ok, 'Modelo não disponível.', 503); return new Uint8Array(await response.arrayBuffer()); },
    generateWorkbook: (model, bytes, group, plan) => generateWorkbook(JSZip, model, bytes, group, plan),
    inspectModel:(client,bytes,name)=>inspectModel(JSZip,client,bytes,name),
    editModel:(model,bytes,fields)=>editModel(JSZip,model,bytes,fields),
    base64: bytes => { let value = ''; for (let i = 0; i < bytes.length; i += 8192) value += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(value); }
  };
}
