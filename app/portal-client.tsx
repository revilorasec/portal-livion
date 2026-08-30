'use client';
/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-img-element */
import { useEffect, useRef, useState } from 'react';
import { microsoftAuth } from '@/lib/auth-config';
import { APP_REGISTRY } from '@/lib/portal-registry.mjs';

declare global {
  interface Window {
    msal?: any;
    PortalLivionAccessProvider?: { getAccessContext: () => Promise<AccessContext | null> };
  }
}

type AccessContext = {
  authenticated: true;
  user: { name: string; email: string };
  profile: string;
  administrator: boolean;
  apps: string[];
  actions: string[];
  companies: string[];
  permissions: string[];
};

type SavedUser = {
  id: number;
  email: string;
  name: string;
  profile: string;
  active: number;
  apps_json: string;
  actions_json: string;
  companies_json: string;
  updated_at?: string;
};

type CatalogApp = {
  key: string;
  icon: string;
  eyebrow: string;
  title: string;
  description: string;
  href: string;
  companies: string[];
  actions: { key: string; label: string }[];
};

type CatalogProfile = {
  key: string;
  label: string;
  description: string;
  defaultApps: string[];
  defaultCompanies: string[];
  defaultActions: string[];
};

type Catalog = {
  apps: CatalogApp[];
  companies: { key: string; label: string }[];
  profiles: CatalogProfile[];
  actions: string[];
};

type AuditRow = {
  id: number;
  actor_email: string;
  action: string;
  target: string;
  detail_json: string;
  created_at: string;
};

type UserForm = {
  name: string;
  email: string;
  profile: string;
  active: boolean;
  apps: string[];
  companies: string[];
  actions: string[];
};

const API_BASE = process.env.NEXT_PUBLIC_PORTAL_API_BASE || '';
const api = (path: string) => `${API_BASE}${path}`;
const apps = APP_REGISTRY;
const emptyForm: UserForm = {
  name: '',
  email: '',
  profile: 'OPERACIONAL',
  active: true,
  apps: [],
  companies: [],
  actions: [],
};

function loadMsal() {
  if (window.msal) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/msal-browser.min.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('MSAL_LOAD'));
    document.head.appendChild(script);
  });
}

async function readContext(accessToken: string) {
  const response = await fetch(api('/api/access-context'), {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  const body = await response.json().catch(() => ({})) as AccessContext & { error?: string };
  if (!response.ok) throw new Error(response.status === 403 ? 'FORBIDDEN' : body.error || 'VALIDATION');
  return body;
}

function parseArray(value?: string) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function formatAuditAction(action: string) {
  return ({ USER_UPSERT: 'Usuário salvo', USER_DELETE: 'Usuário excluído' } as Record<string, string>)[action] || action;
}

export default function PortalClient() {
  const msalRef = useRef<any>(null);
  const [context, setContext] = useState<AccessContext | null>(null);
  const [token, setToken] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'signed-out' | 'denied' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    const sync = () => setSelected(new URLSearchParams(location.search).get('app'));
    sync();
    addEventListener('popstate', sync);

    (async () => {
      try {
        await loadMsal();
        const instance = new window.msal.PublicClientApplication({
          auth: {
            clientId: microsoftAuth.clientId,
            authority: `https://login.microsoftonline.com/${microsoftAuth.tenantId}`,
            redirectUri: `${location.origin}/`,
            postLogoutRedirectUri: `${location.origin}/`,
          },
          cache: { cacheLocation: 'sessionStorage' },
        });
        msalRef.current = instance;
        await instance.initialize?.();
        const redirected = await instance.handleRedirectPromise();
        const account = redirected?.account || instance.getAllAccounts()[0];
        if (!account) {
          if (active) setStatus('signed-out');
          return;
        }
        instance.setActiveAccount(account);
        const result = await instance.acquireTokenSilent({ scopes: microsoftAuth.scopes, account });
        const access = await readContext(result.accessToken);
        if (!active) return;
        setToken(result.accessToken);
        setContext(access);
        window.PortalLivionAccessProvider = { getAccessContext: async () => access };
        setStatus('ready');
      } catch (error) {
        if (!active) return;
        const text = error instanceof Error ? error.message : '';
        setStatus(text === 'FORBIDDEN' ? 'denied' : 'error');
        setMessage(text === 'FORBIDDEN'
          ? 'Seu usuário ainda não foi liberado no Portal Livion.'
          : 'Não foi possível validar sua sessão. Tente entrar novamente.');
      }
    })();

    return () => {
      active = false;
      removeEventListener('popstate', sync);
    };
  }, []);

  const signIn = async () => {
    setMessage('');
    await msalRef.current?.loginRedirect({ scopes: microsoftAuth.scopes, prompt: 'select_account' });
  };

  const signOut = async () => {
    window.PortalLivionAccessProvider = undefined;
    setContext(null);
    setToken('');
    await msalRef.current?.logoutRedirect({ account: msalRef.current.getActiveAccount() });
  };

  const open = async (key: string) => {
    if (!context?.apps.includes(key)) {
      setMessage('Você não possui permissão para este aplicativo.');
      return;
    }
    try {
      const fresh = await readContext(token);
      if (!fresh.apps.includes(key)) throw new Error('FORBIDDEN');
      setContext(fresh);
      history.pushState({}, '', `?app=${key}`);
      setSelected(key);
    } catch {
      setMessage('Seu acesso mudou ou expirou. Entre novamente.');
      setStatus('denied');
    }
  };

  const close = () => {
    history.pushState({}, '', location.pathname);
    setSelected(null);
    setMessage('');
  };

  if (status !== 'ready' || !context) {
    return <main className="auth-shell"><section className="auth-card">
      <img src="/livion-logo.png" alt="Livion Solutions" />
      <p className="kicker">Portal corporativo</p>
      <h1>{status === 'loading' ? 'Validando acesso...' : status === 'signed-out' ? 'Entre no Portal Livion' : 'Acesso não liberado'}</h1>
      {status !== 'loading' && <p>{message || 'Use sua conta Microsoft corporativa para continuar.'}</p>}
      {status !== 'loading' && <button className="primary-action" onClick={signIn}>Entrar com Microsoft</button>}
    </section></main>;
  }

  const requested = apps.find((item) => item.key === selected);
  if (requested) {
    return <main className="workspace-shell">
      <header className="workspace-bar">
        <button onClick={close} aria-label="Voltar ao Portal">←</button>
        <img src="/livion-mark.png" alt="" />
        <div><b>{requested.title}</b><small>Portal Livion</small></div>
        <button className="workspace-close" onClick={close} aria-label="Fechar aplicativo">×</button>
      </header>
      <iframe className="app-frame" src={requested.href} title={requested.title} allow="clipboard-read; clipboard-write; camera; fullscreen" />
    </main>;
  }

  if (selected === 'config') {
    return context.administrator
      ? <AccessSetup token={token} actorEmail={context.user.email} onClose={close} />
      : <main className="auth-shell"><section className="auth-card"><h1>Acesso negado</h1><button onClick={close}>Voltar</button></section></main>;
  }

  return <main className="portal-shell">
    <header className="topbar">
      <div className="brand"><img src="/livion-logo.png" alt="Livion Solutions" /><span>Portal corporativo</span></div>
      <div className="topbar-actions">
        {context.administrator && <button className="settings-button" onClick={() => { history.pushState({}, '', '?app=config'); setSelected('config'); }}>Configurações</button>}
        <span className="user-name">{context.user.name}</span>
        <button className="logout-button" onClick={signOut}>Sair</button>
      </div>
    </header>
    <section className="hero"><div className="hero-brand"><img src="/livion-mark.png" alt="" /></div><div><p className="kicker">Portal Livion</p><h1>Aplicativos da Livion.</h1><p className="lead">Uma única janela, com acesso conforme suas permissões.</p></div></section>
    <section className="apps-section">
      <div className="section-heading"><div><p className="kicker">Aplicativos</p><h2>Onde você quer entrar?</h2></div></div>
      {message && <p className="access-message">{message}</p>}
      <div className="app-grid">{apps.filter((item) => context.apps.includes(item.key)).map((item) =>
        <button className={`app-card app-${item.key}`} onClick={() => open(item.key)} key={item.key}>
          <div className="card-topline"><div className="app-icon">{item.icon}</div><span className="status"><i /> Ativo</span></div>
          <div className="card-copy"><p>{item.eyebrow}</p><h3>{item.title}</h3><span>{item.description}</span></div>
          <div className="card-footer"><span>Abrir aplicativo</span><b>→</b></div>
        </button>)}</div>
      {!context.apps.length && <p className="empty-state">Nenhum aplicativo foi liberado para seu usuário.</p>}
    </section>
    <footer><span>© 2026 Livion Solutions</span><span>Portal Livion - Ambiente interno</span></footer>
  </main>;
}

function AccessSetup({ token, actorEmail, onClose }: { token: string; actorEmail: string; onClose: () => void }) {
  const [tab, setTab] = useState<'users' | 'profiles' | 'companies' | 'audit'>('users');
  const [users, setUsers] = useState<SavedUser[]>([]);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [auditRows, setAuditRows] = useState<AuditRow[]>([]);
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const headers = { Authorization: `Bearer ${token}` };

  async function refreshUsers() {
    const response = await fetch(api('/api/admin/users'), { headers, cache: 'no-store' });
    if (response.ok) {
      const body = await response.json() as { users?: SavedUser[] };
      setUsers(body.users || []);
    }
  }

  async function refreshAudit() {
    const response = await fetch(api('/api/admin/audit?limit=200'), { headers, cache: 'no-store' });
    if (response.ok) {
      const body = await response.json() as { audit?: AuditRow[] };
      setAuditRows(body.audit || []);
    }
  }

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch(api('/api/admin/catalog'), { headers, cache: 'no-store' }),
      fetch(api('/api/admin/users'), { headers, cache: 'no-store' }),
    ]).then(async ([catalogResponse, usersResponse]) => {
      const catalogBody = catalogResponse.ok ? await catalogResponse.json() as Catalog : null;
      const usersBody = usersResponse.ok ? await usersResponse.json() as { users?: SavedUser[] } : null;
      if (!active) return;
      if (catalogBody) {
        setCatalog(catalogBody);
        const operational = catalogBody.profiles.find((p) => p.key === 'OPERACIONAL');
        if (operational) setForm((current) => ({ ...current, apps: [...operational.defaultApps], companies: [...operational.defaultCompanies], actions: [...operational.defaultActions] }));
      }
      if (usersBody) setUsers(usersBody.users || []);
    }).catch(() => setNotice('Não foi possível carregar a administração.'));
    return () => { active = false; };
  }, [token]);

  useEffect(() => { if (tab === 'audit') refreshAudit().catch(() => undefined); }, [tab]);

  function applyProfile(profileKey: string) {
    const profile = catalog?.profiles.find((item) => item.key === profileKey);
    setForm((current) => ({
      ...current,
      profile: profileKey,
      apps: profile ? [...profile.defaultApps] : [],
      companies: profile ? [...profile.defaultCompanies] : [],
      actions: profile ? [...profile.defaultActions] : [],
    }));
  }

  function toggle(field: 'apps' | 'companies' | 'actions', value: string, checked: boolean) {
    setForm((current) => ({
      ...current,
      [field]: checked ? Array.from(new Set([...current[field], value])) : current[field].filter((item) => item !== value),
    }));
  }

  function startEdit(user: SavedUser) {
    setEditingEmail(user.email);
    setForm({
      name: user.name,
      email: user.email,
      profile: user.profile,
      active: Boolean(user.active),
      apps: parseArray(user.apps_json),
      companies: parseArray(user.companies_json),
      actions: parseArray(user.actions_json),
    });
    setNotice('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function clearForm() {
    const operational = catalog?.profiles.find((p) => p.key === 'OPERACIONAL');
    setEditingEmail(null);
    setForm({
      ...emptyForm,
      apps: operational ? [...operational.defaultApps] : [],
      companies: operational ? [...operational.defaultCompanies] : [],
      actions: operational ? [...operational.defaultActions] : [],
    });
    setNotice('');
  }

  async function save() {
    if (!form.name.trim() || !form.email.trim()) { setNotice('Informe nome e e-mail Microsoft.'); return; }
    setBusy(true);
    try {
      const response = await fetch(api('/api/admin/users'), {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      setNotice(response.ok ? (editingEmail ? 'Usuário atualizado.' : 'Usuário cadastrado.') : result.error || 'Não foi possível salvar.');
      if (response.ok) { await refreshUsers(); clearForm(); }
    } finally { setBusy(false); }
  }

  async function changeActive(user: SavedUser) {
    const body = {
      name: user.name, email: user.email, profile: user.profile, active: !Boolean(user.active),
      apps: parseArray(user.apps_json), companies: parseArray(user.companies_json), actions: parseArray(user.actions_json),
    };
    setBusy(true);
    try {
      const response = await fetch(api('/api/admin/users'), { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      setNotice(response.ok ? (body.active ? 'Usuário ativado.' : 'Usuário desativado.') : 'Não foi possível atualizar.');
      if (response.ok) await refreshUsers();
    } finally { setBusy(false); }
  }

  async function removeUser(user: SavedUser) {
    if (!confirm(`Excluir ${user.name} (${user.email})? O histórico de auditoria será preservado.`)) return;
    setBusy(true);
    try {
      const response = await fetch(api(`/api/admin/users?email=${encodeURIComponent(user.email)}`), { method: 'DELETE', headers });
      setNotice(response.ok ? 'Usuário excluído.' : 'Não foi possível excluir.');
      if (response.ok) { await refreshUsers(); await refreshAudit(); }
    } finally { setBusy(false); }
  }

  const selectedApps = catalog?.apps.filter((appItem) => form.apps.includes(appItem.key)) || [];

  return <main className="settings-page">
    <div className="settings-heading"><div><p className="kicker">Administração</p><h1>Usuários e permissões</h1><p>O usuário entra com a própria conta Microsoft. O Portal não cria nem armazena senhas.</p></div><button onClick={onClose}>Voltar</button></div>
    <div className="settings-grid">
      <aside>
        <button className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}>Usuários</button>
        <button className={tab === 'profiles' ? 'active' : ''} onClick={() => setTab('profiles')}>Perfis</button>
        <button className={tab === 'companies' ? 'active' : ''} onClick={() => setTab('companies')}>Empresas</button>
        <button className={tab === 'audit' ? 'active' : ''} onClick={() => setTab('audit')}>Auditoria</button>
      </aside>
      <div className="settings-stack">
        {tab === 'users' && <>
          <section className="settings-card">
            <div className="card-title-row"><h2>{editingEmail ? 'Editar usuário' : 'Cadastrar usuário'}</h2>{editingEmail && <button onClick={clearForm}>Cancelar edição</button>}</div>
            <div className="form-grid">
              <label>Nome<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
              <label>E-mail Microsoft<input type="email" value={form.email} disabled={Boolean(editingEmail)} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
              <label>Perfil<select value={form.profile} onChange={(e) => applyProfile(e.target.value)}>{catalog?.profiles.map((profile) => <option key={profile.key} value={profile.key}>{profile.label}</option>)}</select></label>
              <label className="check"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Usuário ativo</label>
            </div>
            <h3>Aplicativos permitidos</h3>
            <div className="permission-list">{catalog?.apps.map((appItem) => <label className="permission-choice" key={appItem.key}><input type="checkbox" checked={form.apps.includes(appItem.key)} disabled={appItem.key === 'rh' && form.profile !== 'ADMINISTRADOR'} onChange={(e) => toggle('apps', appItem.key, e.target.checked)} /><span><b>{appItem.title}</b><small>{appItem.description}</small></span></label>)}</div>
            <h3>Empresas permitidas</h3>
            <div className="choice-grid">{catalog?.companies.map((company) => <label className="check" key={company.key}><input type="checkbox" checked={form.companies.includes(company.key) || form.profile === 'ADMINISTRADOR'} disabled={form.profile === 'ADMINISTRADOR'} onChange={(e) => toggle('companies', company.key, e.target.checked)} /> {company.label}</label>)}</div>
            <h3>Ações sensíveis</h3>
            {form.profile === 'ADMINISTRADOR' ? <p>Administrador possui todas as ações automaticamente.</p> : <div className="action-groups">{selectedApps.map((appItem) => <div className="action-group" key={appItem.key}><b>{appItem.title}</b>{appItem.actions.map((action) => <label className="check" key={action.key}><input type="checkbox" checked={form.actions.includes(action.key)} onChange={(e) => toggle('actions', action.key, e.target.checked)} /> {action.label}</label>)}</div>)}</div>}
            {notice && <p className="access-message">{notice}</p>}
            <button className="primary-action" disabled={busy} onClick={save}>{busy ? 'Salvando...' : editingEmail ? 'Salvar alterações' : 'Cadastrar usuário'}</button>
          </section>
          <section className="settings-card"><h2>Usuários cadastrados</h2><div className="users-table-wrap"><table className="admin-table"><thead><tr><th>Usuário</th><th>Perfil</th><th>Status</th><th>Apps</th><th>Empresas</th><th>Ações</th></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td><b>{user.name}</b><small>{user.email}</small></td><td>{user.profile}</td><td>{user.active ? 'Ativo' : 'Inativo'}</td><td>{parseArray(user.apps_json).join(', ') || '—'}</td><td>{parseArray(user.companies_json).join(', ') || '—'}</td><td><div className="row-actions"><button onClick={() => startEdit(user)}>Editar</button><button disabled={busy || user.email === actorEmail} onClick={() => changeActive(user)}>{user.active ? 'Desativar' : 'Ativar'}</button><button disabled={busy || user.email === actorEmail} onClick={() => removeUser(user)}>Excluir</button></div></td></tr>)}</tbody></table></div></section>
        </>}
        {tab === 'profiles' && <section className="settings-card"><h2>Perfis</h2><p>Perfis aplicam uma configuração inicial. As permissões podem ser ajustadas por usuário.</p><div className="profile-grid">{catalog?.profiles.map((profile) => <article className="profile-card" key={profile.key}><h3>{profile.label}</h3><p>{profile.description}</p><small><b>Apps:</b> {profile.defaultApps.join(', ') || 'nenhum'}</small><small><b>Empresas:</b> {profile.defaultCompanies.join(', ') || 'nenhuma'}</small></article>)}</div></section>}
        {tab === 'companies' && <section className="settings-card"><h2>Empresas</h2><p>Fonte única para as opções de empresas permitidas.</p><div className="company-list">{catalog?.companies.map((company) => <article key={company.key}><b>{company.label}</b><small>{company.key}</small></article>)}</div></section>}
        {tab === 'audit' && <section className="settings-card"><div className="card-title-row"><h2>Auditoria</h2><button onClick={() => refreshAudit()}>Atualizar</button></div><div className="users-table-wrap"><table className="admin-table"><thead><tr><th>Data</th><th>Administrador</th><th>Ação</th><th>Alvo</th></tr></thead><tbody>{auditRows.map((row) => <tr key={row.id}><td>{new Date(row.created_at).toLocaleString('pt-BR')}</td><td>{row.actor_email}</td><td>{formatAuditAction(row.action)}</td><td>{row.target}</td></tr>)}</tbody></table></div></section>}
      </div>
    </div>
  </main>;
}
