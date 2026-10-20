// Extract only model copies and the ZIP-preserving workbook engine, never BD snapshots or access keys.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const root = path.resolve(import.meta.dirname, '..');
const privateDir = path.resolve(root, '../../EXPEDIÇÃO E ROMANEIOS/Modelos-Homologacao');
const claroPath = 'C:/Codex/Nokia_Romaneios/Expedicao_Claro_HTML_v3_5/EXPEDICAO_CLARO_v3_5.html';
const nokiaPath = 'C:/OneDrive - Livion Solutions/@RHCS/@EXPEDIÇÃO RHCS/(@00) EXPEDICAO_NOKIA_TEMPO_REAL_COMPLETO/EXPEDICAO_NOKIA_CORRIGIDO_v2.html';
const claro = await fs.readFile(claroPath, 'utf8'), nokia = await fs.readFile(nokiaPath, 'utf8');
const bundleText = claro.match(/const CLARO_BUNDLE=(\{[^\r\n]+\});/)[1], bundle = JSON.parse(bundleText);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
await fs.mkdir(privateDir, { recursive: true });
const deps = process.env.EXPEDICAO_NODE_MODULES || 'C:/Users/cesar/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const require = createRequire(pathToFileURL(path.join(deps, '_loader.cjs'))), JSZip = require('jszip');
const sourceStart = claro.indexOf('const text=', claro.indexOf('const EXPECTED='));
// The reference core is pure JS; take its helpers and Book class, stopping before destination/BD code.
const fallbackStart = claro.indexOf('const text =', claro.indexOf('const EXPECTED='));
const start = sourceStart >= 0 ? sourceStart : fallbackStart;
if (start < 0) throw Error('Início do motor de planilha não reconhecido.');
let core = claro.slice(start, claro.indexOf('function verifyDestination(', start));
if (!core.includes('class Book')) throw Error('Motor de planilha não reconhecido.');
core = core.replace('verified_formulas:this.inspect().formula_counts', 'verified_formulas:Object.fromEntries(Object.entries(this.formulas()).map(([s,f])=>[s,Object.keys(f).length]))');
const engine = `// ZIP/XML engine derived from the validated Claro v3.5 reference. No source data or credentials.\nexport function createWorkbookEngine(JSZip) {\nconst root={JSZip,crypto:globalThis.crypto};\nconst ABAS=['01 Pesagem v2','02 Romaneio v2','03 Etiquetas','04 Configurações'];\n${core}\nreturn {Book,hash,norm,attrs,nodes,decode};\n}\n`;
await fs.writeFile(path.join(root, 'supabase/functions/expedicao-api/workbook.mjs'), engine);
const { createWorkbookEngine } = await import(pathToFileURL(path.join(root, 'supabase/functions/expedicao-api/workbook.mjs')));
const { labelTargets } = await import(pathToFileURL(path.join(root, 'supabase/functions/expedicao-api/excel.mjs')));
const { Book } = createWorkbookEngine(JSZip), manifests = [], rejected = [];
for (const m of bundle.models) {
  const bytes = Buffer.from(m.data_b64, 'base64');
  const filename = 'claro-' + hash(bytes) + '.xlsx'; await fs.writeFile(path.join(privateDir, filename), bytes);
  try { const book = await Book.open(bytes, m.name), info = book.inspect(); manifests.push({ id: 'claro-' + info.sha256.slice(0, 20), client: 'claro', name: m.name, sha256: info.sha256, filename, cnpj: info.cnpj, city: info.city, uf: info.uf, address: info.address, capacity: info.capacity, boxCapacity: info.box_capacity, inheritedErrors: info.inherited_error_cells }); }
  catch (e) { rejected.push({ name: m.name, reason: e.message }); }
}
const bytes = Buffer.from(nokia.match(/const TEMPLATE_B64\s*=\s*"([^"]+)"/)[1], 'base64'), filename = 'nokia-' + hash(bytes) + '.xlsx';
await fs.writeFile(path.join(privateDir, filename), bytes);
const book = await Book.open(bytes, 'Modelo Nokia validado no HTML v2');
const {inspectModel}=await import(pathToFileURL(path.join(root,'supabase/functions/expedicao-api/models.mjs')));
manifests.push({...await inspectModel(JSZip,'nokia',bytes,'Modelo Nokia validado no HTML v2'),filename});
await fs.writeFile(path.join(privateDir, 'modelos.json'), JSON.stringify({ models: manifests, rejected }, null, 2));
console.log(JSON.stringify({ extracted: manifests.length, rejected: rejected.length, privateDir, originalHtmlHashes: { nokia: hash(nokia), claro: hash(claro) }, engineBytes: engine.length }));
