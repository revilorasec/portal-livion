import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTION_KEYS, APP_KEYS, APP_REGISTRY, COMPANY_KEYS, PROFILE_REGISTRY } from '../lib/portal-registry.mjs';

test('registro possui chaves de app únicas', () => {
  assert.equal(new Set(APP_KEYS).size, APP_KEYS.length);
  assert.equal(APP_REGISTRY.length, APP_KEYS.length);
});

test('ações expostas existem no registro', () => {
  const declared = APP_REGISTRY.flatMap((app) => app.actions.map((action) => action.key));
  assert.deepEqual([...ACTION_KEYS].sort(), [...declared].sort());
});

test('perfis só referenciam apps e empresas conhecidos', () => {
  for (const profile of PROFILE_REGISTRY) {
    assert.ok(profile.defaultApps.every((key) => APP_KEYS.includes(key)));
    assert.ok(profile.defaultCompanies.every((key) => COMPANY_KEYS.includes(key)));
  }
});
