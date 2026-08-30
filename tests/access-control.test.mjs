import test from 'node:test';
import assert from 'node:assert/strict';
import { canAccessApp, contextFromRow } from '../lib/access-control.mjs';

test('usuário inativo não recebe contexto', () => {
  assert.equal(contextFromRow({ active: 0, profile: 'OPERACIONAL' }), null);
});

test('administrador recebe todos os apps cadastrados', () => {
  const context = contextFromRow({ active: 1, profile: 'ADMINISTRADOR', email: 'admin@example.com', name: 'Admin' });
  assert.deepEqual(context?.apps.sort(), ['fretes', 'rh']);
  assert.equal(context?.administrator, true);
});

test('RH continua bloqueado para perfil operacional', () => {
  const context = contextFromRow({ active: 1, profile: 'OPERACIONAL', email: 'op@example.com', apps_json: '["rh","fretes"]', actions_json: '[]', companies_json: '["LIVION"]' });
  assert.deepEqual(context?.apps, ['fretes']);
  assert.equal(canAccessApp(context, 'rh'), false);
});
