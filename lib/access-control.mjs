import { APP_KEYS, PROFILES } from './portal-registry.mjs';
export { APP_KEYS, PROFILES } from './portal-registry.mjs';

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function parseStringList(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export function contextFromRow(row) {
  if (!row || !row.active || !PROFILES.includes(row.profile)) return null;
  const administrator = row.profile === 'ADMINISTRADOR';
  const configuredApps = administrator ? APP_KEYS : parseStringList(row.apps_json);
  const apps = configuredApps.filter((app) => APP_KEYS.includes(app) && (app !== 'rh' || administrator));
  const actions = administrator ? ['*'] : parseStringList(row.actions_json);
  const companies = administrator ? ['*'] : parseStringList(row.companies_json);
  return {
    authenticated: true,
    user: { name: row.name || row.email, email: normalizeEmail(row.email) },
    profile: row.profile,
    administrator,
    apps,
    actions,
    companies,
    permissions: apps.map((app) => `${app}.acessar`),
  };
}

export function canAccessApp(context, app) {
  return Boolean(context?.authenticated && APP_KEYS.includes(app) && context.apps?.includes(app));
}
