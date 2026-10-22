import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';

const playwrightPath = process.env.PLAYWRIGHT_PACKAGE;
const root = resolve(import.meta.dirname, '..');

test('navega, salva e reencontra os lançamentos após recarregar', { skip: !playwrightPath }, async () => {
  const { chromium } = await import(pathToFileURL(playwrightPath).href);
  const server = createServer((req, res) => {
    if (req.url === '/__harness__') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<script>window.__PORTAL_GET_TOKEN__=async()=>"mock-microsoft-graph-token"</script><iframe src="/horas-producao.html" style="width:1200px;height:900px"></iframe>');
      return;
    }
    const filename = req.url.split('?')[0];
    if (!/^\/[a-zA-Z0-9/._-]+$/.test(filename) || filename.includes('..')) { res.writeHead(404); res.end(); return; }
    try {
      const bytes = readFileSync(resolve(root, '.' + filename));
      res.writeHead(200, { 'content-type': ({ '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' })[extname(filename)] || 'application/octet-stream' });
      res.end(bytes);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  let browser;
  const employees = [], entries = [], plans = [], overtime = [];
  let settings = null;
  const id = '11111111-1111-4111-8111-111111111111';
  const otherId = '22222222-2222-4222-8222-222222222222';
  try {
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
  const page = await browser.newPage();
  await page.route('**/functions/v1/hours-api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname.split('/hours-api/')[1];
    const input = request.postDataJSON?.() || {};
    let result, status = 200;
    if (path.startsWith('bootstrap')) {
      const month = new URL(request.url()).searchParams.get('month');
      result = { month, employees, settings: settings || { month: month + '-01', bonus_cents: 0, piece_cents: 0, weekday_hours: 0, saturday_hours: 0, revision: 0 }, plans, entries, overtime: overtime.filter(row => row.month === month), permissions: { edit: true, archive: true } };
    } else if (path === 'employees' && request.method() === 'POST') {
      result = { id: employees.length ? otherId : id, name: input.name, archived_at: null, revision: 1 };
      employees.push(result); status = 201;
    } else if (path === 'settings') {
      settings = { ...input, month: input.month + '-01', revision: (settings?.revision || 0) + 1 };
      result = settings;
    } else if (path === 'entry') {
      result = { ...input, revision: 1 };
      entries.push(result);
    } else if (path === 'overtime') {
      result = { ...input, revision: 1 };
      overtime.push(result);
    } else if (path.endsWith('/impact')) {
      const employeeId = path.split('/')[1];
      result = { entries: entries.filter(row => row.employee_id === employeeId).length, overtime: overtime.filter(row => row.employee_id === employeeId).length };
    } else if (path === `employees/${id}` && request.method() === 'DELETE') {
      employees[0].archived_at = new Date().toISOString(); result = employees[0];
    } else { status = 404; result = { error: 'NOT_FOUND' }; }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(result) });
  });
    await page.goto(`http://127.0.0.1:${port}/__harness__`);
    const app = page.frameLocator('iframe');
    await app.locator('#app').waitFor({ state: 'visible' });
    await app.locator('#addEmployee').click();
    await app.locator('#employeeName').fill('Gian Luca');
    await app.locator('#employeeForm button[type=submit]').click();
    await app.locator(`[data-overtime-employee="${id}"]`).waitFor();
    await app.locator('#addEmployee').click();
    await app.locator('#employeeName').fill('Ana Silva');
    await app.locator('#employeeForm button[type=submit]').click();
    const gianExtra = app.locator(`[data-overtime-employee="${id}"]`);
    const anaExtra = app.locator(`[data-overtime-employee="${otherId}"]`);
    await anaExtra.waitFor();
    await gianExtra.locator('[data-overtime-amount]').fill('150.25');
    await gianExtra.locator('button[type=submit]').click();
    await anaExtra.locator('[data-overtime-amount]').fill('0');
    await anaExtra.locator('button[type=submit]').click();
    await app.locator('#bonus').fill('500');
    await app.locator('#pieceRate').fill('2');
    await app.locator('#weekdayHours').fill('4');
    await app.locator('#saturdayHours').fill('0');
    await app.locator('#settingsForm button[type=submit]').click();
    await app.locator('#matrix [data-entry-id]').first().fill('2');
    await app.locator('#matrix [data-entry-id]').first().dispatchEvent('change');
    await app.locator('#tabPerson').click();
    assert.equal(await app.locator('#overtimeAmount').inputValue(), '150.25');
    await page.reload();
    await app.locator('#app').waitFor({ state: 'visible' });
    assert.equal(await app.locator('#staffList').getByText('Gian Luca').count(), 1);
    assert.equal(await gianExtra.locator('[data-overtime-amount]').inputValue(), '150.25');
    assert.equal(await anaExtra.locator('[data-overtime-amount]').inputValue(), '0.00');
    assert.equal(await app.locator('#matrix [data-entry-id]').first().inputValue(), '2');
    assert.match(await app.locator('#teamTable').innerText(), /Pendências/);
    await app.locator('#tabCompare').click();
    assert.match(await app.locator('#comparisonTable').innerText(), /Diferença para o grupo/);
    await app.locator('#tabPerson').click();
    assert.equal(await app.locator('#overtimeAmount').inputValue(), '150.25');
    const currentMonth = await app.locator('#month').inputValue();
    const [year, month] = currentMonth.split('-').map(Number);
    const nextMonth = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 7);
    await app.locator('#month').fill(nextMonth);
    await app.locator('#month').dispatchEvent('change');
    await gianExtra.locator('[data-overtime-amount][value=""]').waitFor();
    assert.equal(await gianExtra.locator('[data-overtime-amount]').inputValue(), '');
    assert.equal(await anaExtra.locator('[data-overtime-amount]').inputValue(), '');
    await app.locator('#month').fill(currentMonth);
    await app.locator('#month').dispatchEvent('change');
    await gianExtra.locator('[data-overtime-amount][value="150.25"]').waitFor();
    assert.equal(await gianExtra.locator('[data-overtime-amount]').inputValue(), '150.25');
    assert.equal(await anaExtra.locator('[data-overtime-amount]').inputValue(), '0.00');
    await app.locator(`[data-employee-archive="${id}"]`).click();
    await app.locator('#archiveImpact').getByText(/1 lançamento/).waitFor();
    await app.locator('#confirmArchive').click();
    await app.locator('#staffList').getByText('Arquivado').waitFor();
    assert.equal(entries.length, 1);
    await page.locator('iframe').evaluate(frame => { frame.style.width = '375px'; });
    await app.locator('#tabTeam').click();
    const mobile = await app.locator('html').evaluate(html => ({ page: html.scrollWidth, viewport: html.clientWidth, matrix: document.querySelector('#matrix').scrollWidth, wrap: document.querySelector('#matrix').parentElement.clientWidth }));
    assert.ok(mobile.page <= mobile.viewport + 1, `Mobile page overflows: ${JSON.stringify(mobile)}`);
    assert.ok(mobile.matrix > mobile.wrap, `wide table should scroll inside its container: ${JSON.stringify(mobile)}`);
  } finally { if (browser) await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
