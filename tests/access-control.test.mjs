import test from 'node:test';
import assert from 'node:assert/strict';
import { APP_KEYS, canAccessApp, contextFromRow } from '../lib/access-control.mjs';

test('usuário inativo não recebe contexto', () => {
  assert.equal(contextFromRow({ active: 0, profile: 'OPERACIONAL' }), null);
});

test('administrador recebe todos os apps cadastrados', () => {
  const context = contextFromRow({ active: 1, profile: 'ADMINISTRADOR', email: 'admin@example.com', name: 'Admin' });
  assert.deepEqual(context?.apps.sort(), [...APP_KEYS].sort());
  assert.equal(context?.administrator, true);
});

test('RH continua bloqueado para perfil operacional', () => {
  const context = contextFromRow({ active: 1, profile: 'OPERACIONAL', email: 'op@example.com', apps_json: '["rh","fretes"]', actions_json: '[]', companies_json: '["LIVION"]' });
  assert.deepEqual(context?.apps, ['fretes']);
  assert.equal(canAccessApp(context, 'rh'), false);
});

test('perfil Funcionário recebe somente o RH e nenhuma ação administrativa', () => {
  const context = contextFromRow({ active: 1, profile: 'FUNCIONARIO', email: 'funcionario@example.com', apps_json: '["fretes","rh"]', actions_json: '["rh.editar_funcionarios"]', companies_json: '["LIVION"]' });
  assert.deepEqual(context?.apps, ['rh']);
  assert.deepEqual(context?.actions, []);
  assert.equal(canAccessApp(context, 'fretes'), false);
});
