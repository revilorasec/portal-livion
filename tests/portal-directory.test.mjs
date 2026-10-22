import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const portal = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const start = portal.indexOf('const APP_GROUPS=');
const end = portal.indexOf("$('appSearch').oninput=renderCards;");
assert.ok(start > 0 && end > start);
const directorySource = portal.slice(start, end);

const catalog = [
  { key: 'fretes', title: 'Transportadora', description: 'Entregas' },
  { key: 'vtal', title: 'Checklist de Requisitos', description: 'RFP' },
  { key: 'desempenho-funcionarios', title: 'Desempenho Técnico', description: 'Técnicos' },
  { key: 'painel-executivo-nokia', title: 'Desempenho Técnico Nokia' },
  { key: 'rh', title: 'Recursos Humanos' },
  { key: 'horas-producao', title: 'Horas, Produção e Pagamentos', description: 'Equipe e pagamentos' },
];

function directory(allowed = ['fretes', 'vtal', 'desempenho-funcionarios', 'painel-executivo-nokia']) {
  const elements = Object.fromEntries(['appSearch', 'appGroups', 'appCount', 'appCards'].map(key => [key, {
    value: '', innerHTML: '', textContent: '', querySelectorAll: () => [],
  }]));
  const scope = {
    APP_INSTALLERS: runInNewContext(readFileSync(new URL('../app-installers.js',import.meta.url),'utf8')+';APP_INSTALLERS'),
    ctx: { apps: allowed },
    $: key => elements[key],
    allowedRegistry: () => scope.directory.listedApps(catalog),
    appIcon: () => '<svg></svg>',
    appVersion: () => 'v1',
    esc: value => String(value ?? ''),
  };
  scope.directory = runInNewContext(`${directorySource}\n({renderCards,listedApps,appGroup,appSearchText})`, scope);
  return { ...scope.directory, elements };
}

test('mostra só os apps permitidos e oculta o painel Nokia aposentado', () => {
  const d = directory();
  assert.deepEqual(Array.from(d.listedApps(catalog), app => app.key), ['fretes', 'vtal', 'desempenho-funcionarios']);
  d.renderCards();
  assert.match(d.elements.appCards.innerHTML, /Transportadora/);
  assert.doesNotMatch(d.elements.appCards.innerHTML, /Checklist de Requisitos|Desempenho Técnico Nokia/);
  assert.equal(d.elements.appCount.textContent, '1 aplicativo neste grupo');
});

test('pesquisa por cliente em todos os grupos sem ampliar permissões', () => {
  const d = directory();
  d.elements.appSearch.value = 'nokia';
  d.renderCards();
  assert.match(d.elements.appCards.innerHTML, /Desempenho Técnico/);
  assert.doesNotMatch(d.elements.appCards.innerHTML, /Desempenho Técnico Nokia/);
  const limited = directory(['fretes']);
  limited.elements.appSearch.value = 'nokia';
  limited.renderCards();
  assert.doesNotMatch(limited.elements.appCards.innerHTML, /Desempenho Técnico/);
});

test('app de horas aparece em Pessoas somente para usuário autorizado', () => {
  const limited = directory(['fretes']);
  limited.elements.appSearch.value = 'pagamentos';
  limited.renderCards();
  assert.doesNotMatch(limited.elements.appCards.innerHTML, /Horas, Produção e Pagamentos/);
  const authorized = directory(['horas-producao']);
  authorized.elements.appSearch.value = 'pagamentos';
  authorized.renderCards();
  assert.match(authorized.elements.appCards.innerHTML, /Horas, Produção e Pagamentos/);
});

test('carrega só o portal na instalação e mantém o painel técnico leve', () => {
  const shell = runInNewContext(`${worker.slice(0, worker.indexOf("self.addEventListener('install'"))}\nSHELL`);
  assert.ok(shell.length <= 12);
  assert.ok(shell.includes('./index.html'));
  assert.ok(!shell.some(path => path.includes('estoque-assets')));
  const performance = new URL('../desempenho-funcionarios/index.html', import.meta.url);
  assert.ok(statSync(performance).size < 100_000);
  assert.doesNotMatch(readFileSync(performance, 'utf8'), /data:image\/png;base64/);
});
