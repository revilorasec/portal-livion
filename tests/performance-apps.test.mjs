import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const combined = readFileSync(path.join(root, 'desempenho-funcionarios', 'index.html'), 'utf8');
const nokia = readFileSync(path.join(root, 'painel-executivo-nokia', 'index.html'), 'utf8');

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
  assert.match(combined, /A medição não participa deste filtro/);
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

test('o modo apresentação mantém os valores do bônus visíveis', () => {
  assert.match(combined, /presentationMode&&!document\.querySelector\('#tab-bonus\.active'\)\?'Valor oculto'/);
  assert.match(combined, /next=parent\.closest\('#tab-bonus'\)\?value:value\.replace/);
});
