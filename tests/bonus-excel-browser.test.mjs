import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,promises as fs} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve,extname} from 'node:path';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url),root=resolve(import.meta.dirname,'..');
const playwrightPath=process.env.PLAYWRIGHT_PACKAGE,excelPath=process.env.EXCELJS_TEST_PACKAGE;

test('download Excel usa filtros do bônus, período e aba atual; tela e arquivo conferem',{skip:!playwrightPath||!excelPath},async()=>{
  const {chromium}=await import(pathToFileURL(playwrightPath).href),ExcelJS=require(excelPath);
  const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const output=resolve(root,'.build/bonus-excel-tests');await fs.mkdir(output,{recursive:true});
  try{
    const page=await browser.newPage(),errors=[],dialogs=[];
    page.on('pageerror',error=>errors.push(error.message));page.on('dialog',async dialog=>{dialogs.push(dialog.message());await dialog.dismiss()});
    await page.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.hostname==='cdn.jsdelivr.net')return route.fulfill({contentType:'text/javascript',body:url.pathname.includes('exceljs')?readFileSync(excelPath):'window.Chart=class{destroy(){} resize(){}}'});
      if(process.env.PERFORMANCE_APP_ORIGIN&&url.origin===process.env.PERFORMANCE_APP_ORIGIN)return route.continue();
      if(url.hostname!=='excel.test')return route.abort();
      try{
        const staged=process.env.PERFORMANCE_APP_ROOT?resolve(process.env.PERFORMANCE_APP_ROOT,'.'+url.pathname):null;
        const filename=staged&&existsSync(staged)?staged:process.env.PERFORMANCE_APP_HTML&&url.pathname.endsWith('/desempenho-funcionarios/index.html')?resolve(process.env.PERFORMANCE_APP_HTML):resolve(root,'.'+url.pathname);
        return route.fulfill({body:readFileSync(filename),contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[extname(filename)]||'application/octet-stream'});
      }catch{return route.fulfill({status:404,body:''})}
    });
    await page.goto((process.env.PERFORMANCE_APP_ORIGIN||'https://excel.test')+'/desempenho-funcionarios/index.html');
    await page.evaluate(()=>{
      RAW=[['ANA',63,'Claro'],['BIA',66,'Nokia'],['CARLOS',61,'Nokia']].flatMap(([name,count,client])=>Array.from({length:count},(_,i)=>normalizeRow({id:name+i,cliente:client,tecnico:name,status:'REPARADO',partNumber:'00012345678901234567890',descricao:'=Descrição de teste',dataDevolucao:'2026-10-15','Data da Expedição':'15/10/2026',dias:12})));
      RAW.push(...Array.from({length:4},(_,i)=>normalizeRow({id:'IRR'+i,cliente:'Nokia',tecnico:'CARLOS',status:'IRREPARÁVEL',partNumber:'PN-IRR',dataDevolucao:'2026-11-14','Data da Expedição':'30/10/2026'})));
      RAW.push(normalizeRow({id:'SETEMBRO',cliente:'Nokia',tecnico:'BIA',status:'REPARADO',partNumber:'PN-SET',dataDevolucao:'2026-09-15','Data da Expedição':'15/09/2026'}));
      setupTeam();setupBonus();applyFilters();document.getElementById('bonusMonth').value='2026-10';document.getElementById('bonusClient').value='Nokia';setupBonus();
    });
    await page.locator('[data-tab="bonus"]').click();
    const downloadBook=async(button,file)=>{
      const wait=page.waitForEvent('download');await page.locator(button).click();const download=await wait;
      assert.match(download.suggestedFilename(),/\.xlsx$/);const path=resolve(output,file);await download.saveAs(path);
      const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(await fs.readFile(path));return workbook;
    };
    await page.locator('#bonusTable th').first().click();
    const monthly=await downloadBook('#exportBonusExcel','bonus-mes-teste.xlsx'),sheet=monthly.getWorksheet('Pagamentos');
    assert.equal(sheet.getCell('B8').value,'BIA');assert.equal(sheet.getCell('B9').value,'CARLOS');
    const usesColumnU=await page.evaluate(()=>typeof BonusEngine.bonusReturnRow==='function');
    assert.equal(sheet.getCell('C5').value.result,317.5);assert.equal(sheet.getCell('E9').value,usesColumnU?4:0);
    const names=Array.from({length:2},(_,i)=>sheet.getCell(i+8,2).value);assert.ok(!names.includes('ANA'));
    assert.equal(monthly.getWorksheet('Equipamentos').getCell('G8').value,'00012345678901234567890');
    assert.match(monthly.getWorksheet('Regras').getCell('B10').value,usesColumnU?/Coluna U/:/Coluna W/);
    // Changing the global marked team changes the exported monthly payment.
    await page.locator('#activeTechs input[value="CARLOS"]').uncheck();
    const one=await downloadBook('#exportBonusExcel','bonus-tecnico-teste.xlsx');assert.equal(one.getWorksheet('Pagamentos').getCell('C5').value.result,165);
    assert.equal(one.getWorksheet('Pagamentos').getCell('B9').value,'');
    // Trend has its own selected technicians and number of months.
    await page.locator('#bonusTrendTechs input[value="ANA"]').uncheck();
    await page.locator('#bonusTrendTechs input[value="CARLOS"]').uncheck();
    await page.locator('#bonusTrendMonths').fill('10');await page.locator('#bonusTrendMonths').press('Tab');
    const period=await downloadBook('#exportBonusPeriodExcel','bonus-periodo-teste.xlsx'),periodSheet=period.getWorksheet('Evolução mensal');
    assert.deepEqual(period.worksheets.map(sheet=>sheet.name),['Resumo por técnico','Evolução mensal','Equipamentos','Regras']);
    assert.equal(period.getWorksheet('Resumo por técnico').getCell('B8').value,10);
    assert.equal(period.getWorksheet('Resumo por técnico').getCell('F8').value,165);
    assert.equal(periodSheet.getCell('B8').value,'BIA');assert.equal(periodSheet.getCell('B9').value,'BIA');
    assert.equal(periodSheet.getCell('C5').value.result,165);assert.equal(periodSheet.getCell('A8').value.getUTCMonth(),0);assert.equal(periodSheet.getCell('A17').value.getUTCMonth(),9);
    assert.equal(periodSheet.rowCount,18);
    // General export contains the filtered displayed table, including name casing.
    await page.locator('[data-tab="overview"]').click();await page.locator('#fClient').selectOption('Nokia');
    const view=await downloadBook('#exportPerformanceExcel','desempenho-filtrado-teste.xlsx');
    assert.equal(view.worksheets[0].getCell('B8').value,'BIA');
    assert.deepEqual(dialogs,[]);assert.deepEqual(errors,[]);
    assert.equal(await page.locator('#exportPerformanceExcel').isEnabled(),true);
  }finally{await browser.close()}
});
