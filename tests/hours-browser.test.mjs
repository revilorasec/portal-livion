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
      result = { month, employees, settings: settings || { month: month + '-01', bonus_cents: 0, piece_cents: 0, weekday_hours: 0, saturday_hours: 0, revision: 0 }, plans, entries, overtime: overtime.filter(row => row.month === month), permissions: { edit: true, delete: true } };
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
      const index = overtime.findIndex(row => row.employee_id === input.employee_id && row.month === input.month);
      if (index < 0) overtime.push(result); else overtime[index] = result;
    } else if (path.endsWith('/impact')) {
      const employeeId = path.split('/')[1];
      result = { entries: entries.filter(row => row.employee_id === employeeId).length, overtime: overtime.filter(row => row.employee_id === employeeId).length };
    } else if (path === `employees/${id}` && request.method() === 'DELETE') {
      const counts = { entries: entries.filter(row => row.employee_id === id).length, overtime: overtime.filter(row => row.employee_id === id).length };
      assert.equal(input.expected_entries, counts.entries);
      assert.equal(input.expected_overtime, counts.overtime);
      employees.splice(employees.findIndex(row => row.id === id), 1);
      for (const rows of [entries, overtime]) for (let index = rows.length - 1; index >= 0; index--) if (rows[index].employee_id === id) rows.splice(index, 1);
      result = { deleted: id, removed: counts };
    } else { status = 404; result = { error: 'NOT_FOUND' }; }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(result) });
  });
    await page.goto(`http://127.0.0.1:${port}/__harness__`);
    const app = page.frameLocator('iframe');
    await app.locator('#app').waitFor({ state: 'visible' });
    assert.equal(await app.locator('#configView').isVisible(), false);
    await app.locator('#configBtn').click();
    assert.equal(await app.locator('#configView').isVisible(), true);
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
    const amount = gianExtra.locator('[data-overtime-amount]');
    await amount.fill('');
    for (const [digit, expected] of [['2', '0,02'], ['0', '0,20'], ['4', '2,04'], ['3', '20,43'], ['0', '204,30'], ['0', '2.043,00']]) {
      await amount.press(digit);
      assert.equal(await amount.inputValue(), expected);
    }
    // Edição no meio do valor, exclusão junto aos separadores e colagem formatada.
    await amount.fill('123456');
    await amount.evaluate(element => element.setSelectionRange(2, 3));
    await amount.press('9');
    assert.equal(await amount.inputValue(), '1.934,56');
    await amount.evaluate(element => element.setSelectionRange(2, 2));
    await amount.press('Backspace');
    assert.equal(await amount.inputValue(), '934,56');
    await amount.fill('123456');
    await amount.evaluate(element => element.setSelectionRange(5, 5));
    await amount.press('Delete');
    assert.equal(await amount.inputValue(), '123,46');
    await amount.fill('R$ 2.043,00');
    assert.equal(await amount.inputValue(), '2.043,00');
    await amount.fill('0');
    assert.equal(await amount.inputValue(), '0,00');
    await amount.press('Backspace');
    assert.equal(await amount.inputValue(), '');
    await amount.pressSequentially('204300');
    await anaExtra.locator('[data-overtime-amount]').fill('72550');
    await gianExtra.locator('button[type=submit]').click();
    await app.locator('#saveStatus').getByText('Salvo no Portal', { exact: true }).waitFor();
    assert.equal(overtime.find(row => row.employee_id === id).amount_cents, 204300);
    assert.equal(await anaExtra.locator('[data-overtime-amount]').inputValue(), '725,50');
    await anaExtra.locator('[data-overtime-amount]').fill('0');
    await anaExtra.locator('button[type=submit]').click();
    await app.locator('#saveStatus').getByText('Salvo no Portal', { exact: true }).waitFor();
    assert.equal(overtime.find(row => row.employee_id === otherId).amount_cents, 0);
    await anaExtra.locator('[data-overtime-amount]').fill('');
    await anaExtra.locator('button[type=submit]').click();
    await app.locator('#saveStatus').getByText('Salvo no Portal', { exact: true }).waitFor();
    assert.equal(overtime.find(row => row.employee_id === otherId).amount_cents, null);
    await page.reload();
    await app.locator('#app').waitFor({ state: 'visible' });
    await app.locator('#configBtn').click();
    assert.equal(await anaExtra.locator('[data-overtime-amount]').inputValue(), '');
    await anaExtra.locator('[data-overtime-amount]').fill('0');
    await anaExtra.locator('button[type=submit]').click();
    await app.locator('#saveStatus').getByText('Salvo no Portal', { exact: true }).waitFor();
    await app.locator('#bonus').fill('');
    await app.locator('#bonus').pressSequentially('50000');
    await app.locator('#pieceRate').fill('200');
    assert.equal(await app.locator('#bonus').inputValue(), '500,00');
    assert.equal(await app.locator('#pieceRate').inputValue(), '2,00');
    await app.locator('#weekdayHours').fill('4');
    await app.locator('#saturdayHours').fill('0');
    await app.locator('#settingsForm button[type=submit]').click();
    await app.locator('#saveStatus').getByText('Salvo no Portal', { exact: true }).waitFor();
    assert.equal(settings.bonus_cents, 50000);
    assert.equal(settings.piece_cents, 200);
    await app.locator('#tabTeam').click();
    await app.locator('#matrix [data-entry-id]').first().fill('2');
    await app.locator('#matrix [data-entry-id]').first().dispatchEvent('change');
    await app.locator('#tabPerson').click();
    assert.match(await app.locator('#personOfficial').innerText(), /2\.043,00/);
    await page.reload();
    await app.locator('#app').waitFor({ state: 'visible' });
    await app.locator('#tabConfig').click();
    assert.equal(await app.locator('#staffList').getByText('Gian Luca').count(), 1);
    assert.equal(await gianExtra.locator('[data-overtime-amount]').inputValue(), '2.043,00');
    assert.equal(await anaExtra.locator('[data-overtime-amount]').inputValue(), '0,00');
    assert.equal(await app.locator('#bonus').inputValue(), '500,00');
    assert.equal(await app.locator('#pieceRate').inputValue(), '2,00');
    assert.equal(await app.locator('#matrix [data-entry-id]').first().inputValue(), '2');
    assert.match(await app.locator('#teamTable').innerText(), /Pendências/);
    await app.locator('#tabCompare').click();
    assert.match(await app.locator('#comparisonTable').innerText(), /Diferença para o grupo/);
    await app.locator('#tabPerson').click();
    assert.match(await app.locator('#personOfficial').innerText(), /2\.043,00/);
    await app.locator('#editOfficial').click();
    assert.equal(await app.locator('#configView').isVisible(), true);
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
    await gianExtra.locator('[data-overtime-amount][value="2.043,00"]').waitFor();
    assert.equal(await gianExtra.locator('[data-overtime-amount]').inputValue(), '2.043,00');
    assert.equal(await anaExtra.locator('[data-overtime-amount]').inputValue(), '0,00');
    await app.locator(`[data-employee-delete="${id}"]`).click();
    await app.locator('#deleteImpact').getByText(/1 lançamento/).waitFor();
    await app.locator('#cancelDelete').click();
    assert.equal(employees.length, 2);
    await app.locator(`[data-employee-delete="${id}"]`).click();
    await app.locator('#confirmDelete').click();
    await gianExtra.waitFor({ state: 'detached' });
    assert.equal(entries.length, 0);
    assert.equal(overtime.length, 1);
    await page.locator('iframe').evaluate(frame => { frame.style.width = '375px'; });
    await app.locator('#tabTeam').click();
    const mobile = await app.locator('html').evaluate(html => ({ page: html.scrollWidth, viewport: html.clientWidth, matrix: document.querySelector('#matrix').scrollWidth, wrap: document.querySelector('#matrix').parentElement.clientWidth }));
    assert.ok(mobile.page <= mobile.viewport + 1, `Mobile page overflows: ${JSON.stringify(mobile)}`);
    assert.ok(mobile.matrix > mobile.wrap, `wide table should scroll inside its container: ${JSON.stringify(mobile)}`);
  } finally { if (browser) await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
