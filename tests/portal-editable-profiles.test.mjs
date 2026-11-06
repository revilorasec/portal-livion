import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const frontend = fs.readFileSync(new URL('../portal-admin-v3.js', import.meta.url), 'utf8');
const backend = fs.readFileSync(new URL('../supabase/functions/portal-api/index.ts', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../supabase/migrations/20261106200000_editable_portal_profiles.sql', import.meta.url), 'utf8');

test('administração oferece edição persistente dos perfis', () => {
  assert.match(frontend, /renderProfilesV3/);
  assert.match(frontend, /Editar permissões/);
  assert.match(frontend, /api\('\/profiles\/config'/);
  assert.match(backend, /path==='\/profiles\/config'/);
  assert.match(backend, /PROFILE_CONFIG_UPDATE/);
});

test('perfil Funcionário é protegido no frontend, contexto e gravação do backend', () => {
  assert.match(frontend, /Funcionário acessa somente o RH/);
  assert.match(frontend, /cb\.dataset\.app==='rh'/);
  assert.match(backend, /const requested=employee\?\['rh'\]/);
  assert.match(backend, /employee\?\[\]:\(Array\.isArray\(row\.actions\)/);
  assert.match(backend, /body\.profile==='FUNCIONARIO'.*selectedApps=appKeys\.includes\('rh'\)\?\['rh'\]:\[\];selectedActions=\[\]/s);
  assert.match(backend, /perfil Funcionário só pode ser vinculado a uma empresa interna/i);
});

test('migração protege a configuração e preserva os cinco perfis conhecidos', () => {
  assert.match(migration, /create table if not exists public\.portal_profiles/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on table public\.portal_profiles from anon, authenticated/);
  for (const profile of ['ADMINISTRADOR', 'SOCIO', 'OPERACIONAL', 'VISUALIZADOR', 'FUNCIONARIO']) {
    assert.ok(migration.includes(`'${profile}'`));
  }
});
