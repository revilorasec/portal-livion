import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const combined = readFileSync(path.join(root, 'desempenho-funcionarios', 'index.html'), 'utf8');
const nokia = readFileSync(path.join(root, 'painel-executivo-nokia', 'index.html'), 'utf8');
const bonusUpgrade = readFileSync(path.join(root, 'desempenho-funcionarios', 'bonus-upgrade-v1.js'), 'utf8');
const bonusEngine = readFileSync(path.join(root, 'desempenho-funcionarios', 'bonus-engine.js'), 'utf8');
const desempenhoService = readFileSync(path.join(root, 'supabase', 'functions', 'desempenho-api', 'service.mjs'), 'utf8');

test('publica os dois HTMLs sem incorporar dados internos', () => {
  assert.match(combined, /const SNAPSHOT=\[\]/);
  assert.match(nokia, /const SNAPSHOT=\[\]/);
  assert.doesNotMatch(combined, /AKfy/);
  assert.doesNotMatch(nokia, /AKfy/);
  assert.match(combined, /Desempenho técnico consolidado/);
  assert.match(nokia, /Desempenho Técnico Nokia/);
});

test('consulta o serviço autenticado ao abrir e a cada 30 segundos', () => {
  assert.match(combined, /desempenho-api\/panel-data/);
  assert.match(nokia, /desempenho-api\/panel-data/);
  assert.match(combined, /fetchPanelPayload\('combined'\)/);
  assert.match(nokia, /fetchPanelPayload\('nokia'\)/);
  assert.match(combined, /setInterval\(refreshData,30000\)/);
  assert.match(nokia, /setInterval\(refreshData,30000\)/);
  assert.match(combined, /if\(\$\('refreshBtn'\)\.disabled\)return/);
  assert.match(nokia, /if\(\$\('refreshBtn'\)\.disabled\)return/);
});

test('os dois painéis oferecem apresentação seletiva com proteção financeira', () => {
  for (const html of [combined, nokia]) {
    assert.match(html, /id="presentationBtn"/);
    assert.match(html, /id="presentationNames"/);
    assert.match(html, /id="presentationHideAll"/);
    assert.match(html, /function presentationName\(name\)/);
  }
  assert.match(combined, /os valores da aba Bônus por devolução continuarão visíveis/);
  assert.match(combined, /presentationMode&&!document\.querySelector\('#tab-bonus\.active'\)\?'Valor oculto'/);
  assert.match(nokia, /Todos os valores em reais serão ocultados/);
  assert.match(nokia, /presentationMode\?'Valor oculto'/);
  assert.match(nokia, /safe\[key\]='Oculto'/);
});

test('o Portal trata os dois painéis como aplicativos internos separados', () => {
  const portal = readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(portal, /'painel-executivo-nokia'/);
  assert.match(portal, /\['reparos-claro','desempenho-funcionarios','painel-executivo-nokia'\]/);
});

test('o bônus usa devolução real, exclui fórmulas e permite editar todas as regras', () => {
  assert.match(combined, /Claro coluna AN e Nokia coluna W/);
  assert.match(combined, /Qualquer célula com fórmula nessa coluna fica fora/);
  assert.doesNotMatch(combined, /A medição não participa deste filtro/);
  assert.match(combined, /id="bonusStartPct"/);
  assert.match(combined, /id="bonusHighPct"/);
  assert.match(combined, /id="bonusAddBand"/);
  assert.match(combined, /data-field="min"/);
  assert.match(combined, /data-field="max"/);
  assert.match(combined, /portalBonusConfigV2/);
  assert.match(combined, /r\.devolvido&&!r\.dataFormula&&returnMonth\(r\.dataDevolucao\)===month/);
  assert.match(combined, /Complexidade por Part Number/);
  assert.match(combined, /x\.levels\[pnLevel\(r,c\)\]\+\+/);
});

test('o painel consolidado filtra somente devoluções reais pelo mês de devolução', () => {
  assert.match(combined, /id="fReturnMonth"/);
  assert.match(combined, /Todos os meses de devolução/);
  assert.doesNotMatch(combined, /id="fMeasurement"/);
  assert.doesNotMatch(combined, /Todas as medições/);
  assert.match(combined, /function isReturned\(r\)\{return r\.devolvido&&!r\.dataFormula&&Boolean\(returnMonth\(r\.dataDevolucao\)\)\}/);
  assert.match(combined, /returnMonth\(r\.dataDevolucao\)===v\.returnMonth/);
  assert.match(combined, /F=RAW\.filter\(r=>match\(r,v\)\)/);
});

test('o modo apresentação mantém os valores do bônus visíveis', () => {
  assert.match(combined, /presentationMode&&!document\.querySelector\('#tab-bonus\.active'\)\?'Valor oculto'/);
  assert.match(combined, /next=parent\.closest\('#tab-bonus'\)\?value:value\.replace/);
});

test('zero desativa percentuais e complexidade sem zerar o bônus', () => {
  assert.match(combined, /function bonusTier\(c,repairability\).*c\.startPct>0.*c\.highPct>0.*return'standard'/);
  assert.match(combined, /function bonusMultiplier\(c,level\).*return value>0\?value:1/);
  assert.match(combined, /band\[tier\]\*bonusMultiplier\(c,pnLevel\(r,c\)\)/);
  assert.match(combined, /deixe-os em 0: o app usará o valor padrão da faixa e multiplicador 1,00/);
});

test('comparativo mensal permite escolher técnicos, período e métrica', () => {
  assert.match(combined, /id="bonusTrendTechs"/);
  assert.match(combined, /id="bonusTrendMonths"[^>]+value="10"/);
  assert.match(combined, /id="bonusTrendMetric"/);
  assert.match(combined, /value="repairability">Reparabilidade/);
  assert.match(combined, /value="bonus">Valor recebido/);
  assert.match(combined, /value="repaired">Peças reparadas/);
  assert.match(combined, /function bonusMonthSequence\(end,count\)/);
  assert.match(combined, /function calculateBonusMonth\(month/);
  assert.match(combined, /chart\('bonusTrendChart'/);
  assert.match(combined, /Médias do período/);
  assert.match(combined, /Média mensal recebida/);
  assert.match(combined, /Média mensal reparadas/);
  assert.match(combined, /Média da reparabilidade/);
  assert.match(combined, /id="bonusTrendTable"/);
});

test('upgrade financeiro centraliza cálculo, auditoria, filtros e múltiplas métricas', () => {
  assert.match(combined, /bonus-engine\.js/);
  assert.match(combined, /bonus-upgrade-v1\.js/);
  assert.match(bonusEngine, /function calculateMonth\(/);
  assert.match(bonusEngine, /Part Number sem classificação/);
  assert.match(bonusUpgrade, /Complexidade por PN/);
  assert.match(bonusUpgrade, /data-bonus-detail/);
  assert.match(bonusUpgrade, /Auditoria do bônus/);
  assert.match(bonusUpgrade, /selectedTechs:activeTechs/);
  assert.match(bonusUpgrade, /bonusTrendMetrics/);
  assert.match(bonusUpgrade, /bonusTrendMetric-/);
  assert.match(bonusUpgrade, /Incluir inativos no histórico/);
  assert.match(bonusUpgrade, /Faixa 0 — Sem pagamento de bônus/);
});

test('configuração compartilhada usa endpoint administrativo e revisão otimista', () => {
  assert.match(desempenhoService, /\/bonus-settings/);
  assert.match(desempenhoService, /Somente administradores alteram as regras do bônus/);
  assert.match(desempenhoService, /saveBonusSettings/);
  assert.match(bonusUpgrade, /settingsRevision/);
  assert.match(bonusUpgrade, /portalBonusConfigV3/);
});
