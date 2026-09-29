import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const root=new URL('../',import.meta.url);
const html=readFileSync(new URL('index.html',root),'utf8');

test('login oferece confiança explícita e mantém o modo compartilhado como padrão',()=>{
  assert.match(html,/id="trustDevice" type="checkbox"/);
  assert.match(html,/Confiar neste computador/);
  assert.match(html,/cacheLocation:trustedDevice\(\)\?'localStorage':'sessionStorage'/);
  assert.match(html,/localStorage\.getItem\(TRUSTED_DEVICE_KEY\)==='1'/);
});

test('login recorrente não força a escolha de conta',()=>{
  assert.match(html,/msalApp\.loginRedirect\(\{scopes:\['User\.Read'\]\}\)/);
  assert.doesNotMatch(html,/prompt:'select_account'/);
  assert.match(html,/acquireTokenSilent\(\{scopes:\['User\.Read'\],account\}\)/);
});

test('tokens continuam sob controle do MSAL e não são gravados manualmente',()=>{
  assert.doesNotMatch(html,/localStorage\.setItem\([^\n]*(?:token|accessToken)/i);
  assert.match(html,/window\.__PORTAL_TOKEN__=token/);
});

test('todos os aplicativos instaláveis iniciam pelo Portal autenticado',()=>{
  const manifests=readdirSync(root,{withFileTypes:true})
    .filter(entry=>entry.isFile()&&/^manifest-.+\.webmanifest$/.test(entry.name));
  assert.ok(manifests.length>=7);
  for(const entry of manifests){
    const manifest=JSON.parse(readFileSync(new URL(entry.name,root),'utf8'));
    assert.match(manifest.start_url,/^\.\/\?app=[a-z0-9-]+$/i,entry.name);
  }
});
