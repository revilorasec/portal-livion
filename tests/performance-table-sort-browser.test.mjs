import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {pathToFileURL} from 'node:url';

const playwrightPath=process.env.PLAYWRIGHT_PACKAGE;
const root=resolve(import.meta.dirname,'..');
test('todas as abas ordenam por clique/teclado e preservam ordem após renderizar', {skip:!playwrightPath},async()=>{
  const {chromium}=await import(pathToFileURL(playwrightPath).href);
  const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try{
    const page=await browser.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.hostname==='cdn.jsdelivr.net')return route.fulfill({contentType:'text/javascript',body:'window.Chart=class{destroy(){} resize(){}}'});
      if(url.hostname!=='sorting.test')return route.abort();
      try{
        const path=process.env.PERFORMANCE_APP_HTML&&url.pathname.endsWith('/desempenho-funcionarios/index.html')
          ?resolve(process.env.PERFORMANCE_APP_HTML):resolve(root,'.'+url.pathname);
        return route.fulfill({body:readFileSync(path),contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[extname(path)]||'application/octet-stream'});
      }catch{return route.fulfill({status:404,body:''})}
    });
    await page.goto('https://sorting.test/desempenho-funcionarios/index.html');
    await page.evaluate(()=>{
      RAW=[['MÁRCIO',84,'PN10'],['BIA',82,'PN2'],['ANA',139,'PN1']].flatMap(([name,count,pn])=>Array.from({length:count},(_,i)=>normalizeRow({cliente:'Nokia',id:name+i,tecnico:name,status:'REPARADO',partNumber:pn,dataDevolucao:'2026-10-15','Data da Expedição':'15/10/2026',dias:12})));
      setupTeam();setupBonus();applyFilters();
    });
    const values=selector=>page.locator(selector).allTextContents();
    await page.locator('[data-tab="bonus"]').click();
    const tech=page.locator('#bonusTable th').nth(0);
    await tech.click();
    assert.deepEqual(await values('#bonusTable tbody td:first-child'),['ANA','BIA','MÁRCIO']);
    await tech.click();
    assert.deepEqual(await values('#bonusTable tbody td:first-child'),['MÁRCIO','BIA','ANA']);
    await page.evaluate(()=>renderBonus());
    await page.waitForFunction(()=>document.querySelector('#bonusTable th').getAttribute('aria-sort')==='descending');
    assert.deepEqual(await values('#bonusTable tbody td:first-child'),['MÁRCIO','BIA','ANA']);
    await page.locator('#bonusTable th').nth(3).focus();
    await page.keyboard.press('Enter');
    assert.deepEqual(await values('#bonusTable tbody td:nth-child(4)'),['82','84','139']);
    await page.keyboard.press('Space');
    assert.deepEqual(await values('#bonusTable tbody td:nth-child(4)'),['139','84','82']);
    // The monthly table in the user's screenshot and the averages table.
    await page.locator('#bonusTrendMonths').fill('1');
    await page.locator('#bonusTrendMonths').press('Tab');
    await page.locator('#bonusTrendTable th').nth(2).click();
    assert.deepEqual(await values('#bonusTrendTable tbody td:nth-child(3)'),['82','84','139']);
    await page.locator('#bonusTrendTable th').nth(5).click();
    const monthlyAmounts=await values('#bonusTrendTable tbody td:nth-child(6)');
    assert.deepEqual(monthlyAmounts.map(value=>Number(value.replace(/[^\d,]/g,'').replace(',','.'))),[246,252,556]);
    await page.locator('#bonusTrendTable th').nth(5).click();
    assert.deepEqual(await values('#bonusTrendTable tbody td:nth-child(6)'),[...monthlyAmounts].reverse());
    await page.locator('#bonusTrendAverages th').nth(1).click();
    assert.deepEqual(await values('#bonusTrendAverages tbody td:first-child'),['BIA','MÁRCIO','ANA']);
    await page.locator('#bonusTrendAverages th').nth(1).click();
    assert.deepEqual(await values('#bonusTrendAverages tbody td:first-child'),['ANA','MÁRCIO','BIA']);
    await page.locator('#bonusTrendAverages th').nth(0).click();
    assert.deepEqual(await values('#bonusTrendAverages tbody td:first-child'),['ANA','BIA','MÁRCIO']);
    // Modal tables are added dynamically and buttons still open their detail.
    await page.locator('#bonusTable [data-bonus-detail]').first().click();
    const modalHead=page.locator('#bonusDetailContent table').first().locator('th').nth(1);
    await modalHead.click();
    assert.equal(await modalHead.getAttribute('aria-sort'),'ascending');
    await page.locator('#bonusDetailModal [data-close]').click();
    await page.locator('[data-tab="overview"]').click();
    await page.locator('#rankTable th').nth(1).click();
    assert.deepEqual(await values('#rankTable tbody td:nth-child(2)'),['ANA','BIA','MÁRCIO']);
    await page.locator('[data-tab="partnumber"]').click();
    await page.locator('#pnTable th').first().click();
    assert.deepEqual(await values('#pnTable tbody td:first-child'),['PN1','PN2','PN10']);
    await page.locator('[data-tab="report"]').click();
    const reportHead=page.locator('#techReport table th').first();
    assert.ok(await reportHead.count(),'O relatório individual deve ter tabela ordenável');
    await reportHead.click();
    assert.equal(await reportHead.getAttribute('aria-sort'),'ascending');
    await page.locator('[data-tab="complexity"]').click();
    await page.locator('#complexityPnTable th').first().click();
    assert.deepEqual(await values('#complexityPnTable tbody td:first-child'),['PN1','PN2','PN10']);
    await page.locator('#bonusTechAdminTable th').first().click();
    assert.deepEqual(await values('#bonusTechAdminTable tbody td:first-child'),['ANA','BIA','MÁRCIO']);
    assert.deepEqual(errors,[]);
    // Changes made by sorting must settle rather than trigger an observer loop.
    await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,50)));
  }finally{await browser.close()}
});
