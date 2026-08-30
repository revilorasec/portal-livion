import { env } from 'cloudflare:workers';
import { bootstrapAdminEmail } from './auth-config';

type D1Row = {
  id: number; email: string; microsoft_id: string | null; name: string; profile: string;
  active: number; apps_json: string; actions_json: string; companies_json: string;
};

let initialized: Promise<void> | null = null;

function database(): D1Database {
  const db = (env as unknown as { DB?: D1Database }).DB;
  if (!db) throw new Error('Portal access database is unavailable');
  return db;
}

export function ensureDatabase() {
  if (!initialized) {
    const db = database();
    const now = new Date().toISOString();
    initialized = db.batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS portal_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, microsoft_id TEXT UNIQUE,
        name TEXT NOT NULL, profile TEXT NOT NULL CHECK (profile IN ('ADMINISTRADOR','SOCIO','OPERACIONAL')),
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)), apps_json TEXT NOT NULL DEFAULT '[]',
        actions_json TEXT NOT NULL DEFAULT '[]', companies_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`),
      db.prepare(`CREATE TABLE IF NOT EXISTS access_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT, actor_email TEXT NOT NULL, action TEXT NOT NULL,
        target TEXT NOT NULL, detail_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL)`),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_portal_users_email ON portal_users(email)'),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_access_audit_created ON access_audit(created_at)'),
      db.prepare(`INSERT INTO portal_users
        (email,name,profile,active,apps_json,actions_json,companies_json,created_at,updated_at)
        VALUES (?1,'Administrador inicial','ADMINISTRADOR',1,'["rh","fretes"]','["*"]','["*"]',?2,?2)
        ON CONFLICT(email) DO NOTHING`).bind(bootstrapAdminEmail, now),
    ]).then(() => undefined).catch((error) => {
      initialized = null;
      throw error;
    });
  }
  return initialized;
}

export async function findUser(email: string) {
  await ensureDatabase();
  return database().prepare('SELECT * FROM portal_users WHERE email = ?1').bind(email).first<D1Row>();
}

export async function bindMicrosoftId(id: number, microsoftId: string) {
  await database().prepare(
    'UPDATE portal_users SET microsoft_id=?1, updated_at=?2 WHERE id=?3 AND microsoft_id IS NULL'
  ).bind(microsoftId, new Date().toISOString(), id).run();
}

export async function listUsers() {
  await ensureDatabase();
  const result = await database().prepare(
    'SELECT id,email,name,profile,active,apps_json,actions_json,companies_json,updated_at FROM portal_users ORDER BY name,email'
  ).all();
  return result.results;
}

export async function saveUser(input: {
  email: string; name: string; profile: string; active: boolean;
  apps: string[]; actions: string[]; companies: string[];
}) {
  await ensureDatabase();
  const now = new Date().toISOString();
  await database().prepare(`INSERT INTO portal_users
    (email,name,profile,active,apps_json,actions_json,companies_json,created_at,updated_at)
    VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?8)
    ON CONFLICT(email) DO UPDATE SET name=excluded.name,profile=excluded.profile,active=excluded.active,
      apps_json=excluded.apps_json,actions_json=excluded.actions_json,
      companies_json=excluded.companies_json,updated_at=excluded.updated_at`)
    .bind(input.email,input.name,input.profile,input.active ? 1 : 0,JSON.stringify(input.apps),
      JSON.stringify(input.actions),JSON.stringify(input.companies),now).run();
}

export async function deleteUser(email: string) {
  await ensureDatabase();
  await database().prepare('DELETE FROM portal_users WHERE email = ?1').bind(email).run();
}

export async function listAudit(limit = 200) {
  await ensureDatabase();
  const safeLimit = Math.max(1, Math.min(500, Math.trunc(limit || 200)));
  const result = await database().prepare(
    `SELECT id,actor_email,action,target,detail_json,created_at
     FROM access_audit ORDER BY id DESC LIMIT ?1`
  ).bind(safeLimit).all();
  return result.results;
}

export async function audit(actorEmail: string, action: string, target: string, detail: object = {}) {
  await ensureDatabase();
  await database().prepare(`INSERT INTO access_audit
    (actor_email,action,target,detail_json,created_at) VALUES (?1,?2,?3,?4,?5)`)
    .bind(actorEmail,action,target,JSON.stringify(detail),new Date().toISOString()).run();
}
