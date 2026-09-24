import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { APP_REGISTRY } from '../lib/portal-registry.mjs';

const html=readFileSync(new URL('../vtal.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../vtal.js',import.meta.url),'utf8');
const api=readFileSync(new URL('../supabase/functions/vtal-api/index.ts',import.meta.url),'utf8');
const migration=readFileSync(new URL('../supabase/migrations/20260924120000_vtal_checklist.sql',import.meta.url),'utf8');
const seed=JSON.parse(readFileSync(new URL('../supabase/functions/vtal-api/seed.json',import.meta.url),'utf8'));
const manifest=JSON.parse(readFileSync(new URL('../manifest-vtal.webmanifest',import.meta.url),'utf8'));

test('catálogo expõe a V.Tal com permissões específicas',()=>{const app=APP_REGISTRY.find(x=>x.key==='vtal');assert.ok(app);assert.deepEqual(app.actions.map(x=>x.key),['vtal.visualizar','vtal.editar','vtal.exportar']);assert.match(migration,/insert into public\.portal_apps/)});
test('base preserva os 268 requisitos nas 12 categorias',()=>{assert.equal(seed.groups.length,12);assert.equal(seed.items.length,268);assert.equal(new Set(seed.items.map(x=>x.id)).size,268);for(const item of seed.items)assert.ok(seed.groups.some(g=>g.id===item.group))});
test('persistência exige autenticação, permissão e revisão otimista',()=>{assert.match(api,/claims\.tid!==TENANT/);assert.match(api,/vtal\.visualizar/);assert.match(api,/vtal\.editar/);assert.match(api,/\.eq\('revision',revision\)/);assert.match(api,/CONFLICT/);assert.match(migration,/enable row level security/);assert.match(migration,/revoke all .* anon, authenticated/)});
test('interface permite filtrar, editar e exportar pelo Portal',()=>{assert.match(html,/Checklist V\.Tal/);assert.match(html,/Exportar CSV/);assert.match(js,/openThroughPortal/);assert.match(js,/statusFilter/);assert.match(js,/\/item/);assert.equal(manifest.start_url,'./?app=vtal')});
