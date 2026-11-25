import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,promises as fs} from 'node:fs';
import {resolve,extname} from 'node:path';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url),root=resolve(import.meta.dirname,'..');
test('aba semanal independente exporta todas as páginas no modelo Claro e trata falhas',{skip:!process.env.PLAYWRIGHT_PACKAGE||!process.env.EXCELJS_TEST_PACKAGE},async()=>{
 const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_PACKAGE).href),ExcelJS=require(process.env.EXCELJS_TEST_PACKAGE);
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const output=resolve(root,'.build/claro-weekly-tests');await fs.mkdir(output,{recursive:true});
 try{
  const context=await browser.newContext({timezoneId:'America/Sao_Paulo',viewport:{width:1600,height:1050}}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));await page.clock.install({time:new Date('2026-11-25T18:00:00Z')});
  const row=(id,date,extra={})=>({ID:id,Descrição:'Equipamento de teste','Onde está':'CLARO',Status:'03-REPARADO',REGIONAL:'Bahia','UF - REGIONAL':'Bahia - BA',CD:'Salvador','Data recebimento na Livion':date,'Centro':'0007193','Nota Fiscal Claro':'000123','Nº de Série':'00000012345678901234567890','BP/SGP/NS (Nº EQUIPAMENTO)':'0009','Data Entrega na Claro':'25/11/2026',_entregaFormula:true,...extra});
  const rows=Array.from({length:120},(_,i)=>row('ANTERIOR'+i,'20/11/2026'));rows.push(row('SEGUNDA','16/11/2026'),row('SABADO','21/11/2026'),row('ATUAL','23/11/2026',{'Onde está':'LIVION'}),row('HOJE','25/11/2026',{'Onde está':'LIVION',CD:'Recife'}),row('FUTURO','26/11/2026'),row('SEM-DATA',''));
  let failTemplate=false;
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.pathname.endsWith('/claro-data'))return route.fulfill({json:{ok:true,rows,updatedAt:'2026-11-25T18:00:00Z'}});
   if(url.hostname==='cdn.jsdelivr.net')return route.fulfill({contentType:'text/javascript',body:url.pathname.includes('exceljs')?readFileSync(process.env.EXCELJS_TEST_PACKAGE):''});
   if(url.hostname!=='claro.test')return route.abort();
   if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<script>window.__PORTAL_TOKEN__="teste"</script><iframe id="app" src="/cliente-claro.html" style="width:100%;height:100vh;border:0"></iframe>'});
   if(failTemplate&&url.pathname.endsWith('.xlsx'))return route.fulfill({status:503,body:''});
   try{return route.fulfill({body:readFileSync(resolve(root,'.'+url.pathname)),contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})[extname(url.pathname)]||'application/octet-stream'})}catch{return route.fulfill({status:404,body:''})}
  });
  await page.goto('https://claro.test/');const frame=page.frames().find(f=>f.url().includes('cliente-claro'));
  await frame.locator('#baseCount').filter({hasText:'126'}).waitFor();
  // A hidden global filter must not reduce the weekly report.
  await frame.locator('#fSearch').fill('ATUAL');await frame.locator('[data-tab="semanal"]').click();
  assert.equal(await frame.locator('body > .app > section.filters').isVisible(),false);
  await frame.locator('#weeklyPrevious').click();assert.equal(await frame.locator('#wDateFrom').inputValue(),'2026-11-16');assert.equal(await frame.locator('#wDateTo').inputValue(),'2026-11-20');assert.equal(await frame.locator('#weeklyCount').textContent(),'121 registros');assert.equal(await frame.locator('#weeklyTable tbody tr').count(),100);
  await frame.locator('#weeklyNextPage').click();assert.equal(await frame.locator('#weeklyTable tbody tr').count(),21);
  const waiting=page.waitForEvent('download');await frame.locator('#weeklyExport').click();const download=await waiting;assert.match(download.suggestedFilename(),/2026-11-16_a_2026-11-20\.xlsx$/);
  const filename=resolve(output,'semanal-anterior.xlsx');await download.saveAs(filename);const book=new ExcelJS.Workbook();await book.xlsx.load(await fs.readFile(filename));const sheet=book.worksheets[0];
  assert.equal(sheet.rowCount,122);assert.equal(sheet.columnCount,13);assert.equal(sheet.getCell('A1').value,'Centro');assert.equal(sheet.getCell('B2').value,'Livion Solutions');assert.equal(sheet.getCell('E122').value,'00000012345678901234567890');assert.ok(!sheet.getCell('K2').value);
  await frame.locator('#weeklyCurrent').click();assert.equal(await frame.locator('#weeklyCount').textContent(),'2 registros');assert.equal(await frame.locator('#wDateFrom').inputValue(),'2026-11-23');assert.equal(await frame.locator('#wDateTo').inputValue(),'2026-11-25');
  await frame.locator('#wLocation').selectOption('LIVION');await frame.locator('#wStatus').selectOption('03-REPARADO');await frame.locator('#wRegional').selectOption('Bahia');await frame.locator('#wUF').selectOption('Bahia - BA');await frame.locator('#wCD').selectOption('Recife');assert.equal(await frame.locator('#weeklyCount').textContent(),'1 registros');
  failTemplate=true;await frame.locator('#weeklyExport').click();await frame.locator('#weeklyMessage.error').waitFor();assert.equal(await frame.locator('#weeklyExport').isEnabled(),true);failTemplate=false;
  await frame.locator('#wDateFrom').fill('2026-11-26');await frame.locator('#wDateFrom').dispatchEvent('change');assert.equal(await frame.locator('#weeklyExport').isDisabled(),true);assert.match(await frame.locator('#weeklyMessage').textContent(),/data inicial/);
  await frame.locator('#weeklyClear').click();assert.equal(await frame.locator('#weeklyCount').textContent(),'126 registros');
  for(const id of ['wDateFrom','wDateTo','wLocation','wStatus','wRegional','wUF','wCD'])assert.equal(await frame.locator('#'+id).inputValue(),'');
  assert.equal(await frame.locator('#weeklyPeriod').textContent(),'Todos os períodos');assert.equal(await frame.locator('#weeklyCurrent').getAttribute('aria-pressed'),'false');assert.equal(await frame.locator('#weeklyPrevious').getAttribute('aria-pressed'),'false');
  await frame.locator('#weeklyCurrent').click();await page.screenshot({path:resolve(output,'weekly-desktop.png'),fullPage:true});
  await page.setViewportSize({width:430,height:900});await page.screenshot({path:resolve(output,'weekly-mobile.png'),fullPage:true});
  await frame.locator('[data-tab="base"]').click();assert.equal(await frame.locator('body > .app > section.filters').isVisible(),true);assert.equal(await frame.locator('#fSearch').inputValue(),'ATUAL');assert.deepEqual(errors,[]);
 }finally{await browser.close()}
});
