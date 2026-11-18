import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const root=resolve(process.env.INVENTORY_TEST_ROOT||resolve(import.meta.dirname,'..'));
const runtimeRequire=createRequire(resolve(process.env.CODEX_MCP_NODE_PATH||root,'package.json'));
let playwrightPath=process.env.PLAYWRIGHT_PACKAGE;
if(!playwrightPath)try{playwrightPath=runtimeRequire.resolve('playwright')}catch{}

test('buscas e datas funcionam com catálogo grande sem reconstruir dados a cada tecla',{skip:!playwrightPath},async()=>{
  const imported=await import(pathToFileURL(playwrightPath).href),{chromium}=imported.default||imported;
  const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try{
    const page=await browser.newPage(),errors=[],writes=[];
    page.on('pageerror',error=>errors.push(error.message));
    const stock=Array.from({length:1000},(_,i)=>({product_id:'P'+i,pn:'PN-'+String(i).padStart(4,'0'),description:'Componente de teste '+i,unit:'UNIDADE',balance:20,min_stock:2,status:'ATIVO',stock_status:'OK',item_type:'Componente'}));
    const requesters=Array.from({length:100},(_,i)=>({requester_id:'R'+i,name:'Pessoa '+i,status:'ATIVO'}));
    const recent=Array.from({length:5000},(_,i)=>({movement_id:'M'+i,product_id:'P'+i%1000,requester_id:'R'+i%100,movement_type:'SAIDA',quantity:1,user_email:'pessoa@example.invalid',occurred_at:'2026-11-18T12:00:00Z',recorded_at:'2026-11-18T12:00:01Z',source:'PORTAL',purpose:'CONSUMO_INTERNO'}));
    const fixture={stock,recent,requesters,suppliers:[],parts:[],catalog:[],monthly:[],consumption:[],dashboard:{},registry_merges:[],portal_users:[],permissions:{product:true,entry:true,exit:true,viewValues:true,export:true},user:{name:'Teste',email:'test@example.invalid',profile:'ADMINISTRADOR',administrator:true}};
    await page.addInitScript(()=>{
      sessionStorage.setItem('portal_inventory_token','test-only');
      window.BroadcastChannel=class{postMessage(data){queueMicrotask(()=>this.onmessage?.({data:{type:'PORTAL_TOKEN_RESPONSE',requestId:data.requestId,token:'test-only'}}))}close(){}};
    });
    await page.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.hostname==='kvfjjtkwxxbvzlicwnrz.supabase.co'){
        if(route.request().method()==='POST')writes.push(url.pathname);
        const body=url.pathname.includes('inventory-packaging-api')?{configurations:[]}:url.pathname.endsWith('/bootstrap')?fixture:{requests:[],files:[]};
        return route.fulfill({json:body});
      }
      if(url.hostname==='cdn.jsdelivr.net')return route.fulfill({contentType:'text/javascript',body:''});
      if(url.hostname!=='inventory.test')return route.abort();
      const path=resolve(root,'.'+url.pathname);
      if(!path.startsWith(root))return route.abort();
      try{return route.fulfill({body:readFileSync(path),contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[extname(path)]||'application/octet-stream'})}
      catch{return route.fulfill({status:404,body:''})}
    });
    await page.goto('https://inventory.test/estoque.html');
    await page.waitForFunction(()=>!!document.querySelector('#stockBody tr[data-row-product]'));
    await page.locator('.nav button[data-v="movements"]').click();
    await page.waitForFunction(()=>document.querySelectorAll('#movBody tr[data-movement-id]').length===5000);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const measurements=await page.evaluate(()=>{
      const measure=action=>{const start=performance.now();action();return Math.round((performance.now()-start)*10)/10};
      return {nodes:document.querySelectorAll('*').length,stockMs:measure(()=>renderStock()),movementsMs:measure(()=>renderMov()),exitOpenMs:measure(()=>manualExit()),formNodes:document.querySelectorAll('*').length,dateFocusMs:measure(()=>{document.getElementById('fOccurredDate').focus();document.getElementById('fOccurredDate').getBoundingClientRect()}),comboSearchMs:measure(()=>{const input=document.querySelector('#fProduct')._comboInput;input.value='PN-0999';input.dispatchEvent(new Event('input',{bubbles:true}))})};
    });
    if(process.env.INVENTORY_PERF_REPORT)writeFileSync(process.env.INVENTORY_PERF_REPORT,JSON.stringify(measurements,null,2));
    console.log('Inventory measurements:',JSON.stringify(measurements));
    if(await page.evaluate(()=>!!document.querySelector('#fPurpose option[value=""]'))){
      assert.deepEqual(await page.evaluate(()=>['fProduct','fParty','fPurpose'].map(id=>document.getElementById(id).value)),['','','']);
      assert.ok(measurements.formNodes<10000,'background tables must not remain in the live form DOM');
    }
    await page.locator('#fOccurredDate').fill('2026-10-14');
    assert.equal(await page.locator('#fOccurredDate').inputValue(),'2026-10-14');
    await page.locator('#fProduct').locator('..').locator('.smart-combo-input').fill('PN-0999');
    await page.locator('#fProduct').locator('..').locator('.smart-combo-input').press('ArrowDown');
    await page.locator('#fProduct').locator('..').locator('.smart-combo-input').press('Enter');
    assert.equal(await page.locator('#fProduct').inputValue(),'P999');
    if(await page.locator('#fPurpose option[value=""]').count()){
      await page.locator('#fQty').fill('1');await page.locator('#fParty').selectOption('R0');
      const validation=await page.evaluate(async()=>{try{await saveFn();return 'unexpected save'}catch(error){return error.message}});
      assert.equal(validation,'Selecione a finalidade da saída.');assert.equal(writes.length,0);
      await page.locator('#fPurpose').locator('..').locator('.smart-combo-input').fill('Projeto');
      await page.locator('#fPurpose').locator('..').locator('.smart-combo-menu [data-smart-index]').filter({hasText:'Projeto'}).click();
      assert.equal(await page.locator('#fPurpose').inputValue(),'PROJETO');
    }
    const cacheCheck=await page.evaluate(()=>{
      if(!window.InventoryPerformance)return null;
      const select=document.getElementById('fProduct'),input=select._comboInput;
      const extra=new Option('Produto recém-adicionado','NEW');select.add(extra);select._comboRefresh();input.value='recem-adicionado';input.dispatchEvent(new Event('input',{bubbles:true}));
      const appeared=!!select.closest('.smart-combo').querySelector('.smart-combo-menu button[data-smart-index]');
      extra.disabled=true;select._comboRefresh();input.value='recem-adicionado';input.dispatchEvent(new Event('input',{bubbles:true}));
      const disabledDisappeared=!select.closest('.smart-combo').querySelector('.smart-combo-menu button[data-smart-index]');
      return {appeared,disabledDisappeared};
    });
    if(cacheCheck)assert.deepEqual(cacheCheck,{appeared:true,disabledDisappeared:true});
    await page.getByRole('button',{name:'Cancelar',exact:true}).click();
    await page.locator('.nav button[data-v="stock"]').click();
    await page.locator('#stockSearch').fill('PN-0999');
    await page.waitForFunction(()=>document.querySelectorAll('#stockBody tr[data-row-product]').length===1);
    assert.match(await page.locator('#stockBody').innerText(),/Componente de teste 999/);
    await page.locator('#stockSearch').fill('');
    await page.waitForFunction(()=>document.querySelectorAll('#stockBody tr[data-row-product]').length===1000);
    const pnHeader=page.locator('#stockBody').locator('..').locator('thead th').nth(1);
    await pnHeader.click();await pnHeader.click();
    assert.match(await page.locator('#stockBody tr').first().innerText(),/PN-0999/);
    await page.locator('.nav button[data-v="movements"]').click();
    await page.waitForFunction(()=>document.querySelectorAll('#movBody tr[data-movement-id]').length===5000);
    measurements.visibleMovementsMs=await page.evaluate(()=>{const start=performance.now();renderMov();return Math.round((performance.now()-start)*10)/10});
    await page.locator('#movSearch').fill('Componente de teste 999');
    await page.waitForFunction(()=>document.querySelectorAll('#movBody tr[data-movement-id]').length===5);
    await page.locator('.nav button[data-v="stock"]').click();
    if(await page.evaluate(()=>!!window.InventoryPerformance))await page.waitForFunction(()=>document.getElementById('movBody').childElementCount===0);
    await page.locator('.nav button[data-v="movements"]').click();
    await page.waitForFunction(()=>document.querySelectorAll('#movBody tr[data-movement-id]').length===5);
    if(process.env.INVENTORY_PERF_REPORT)writeFileSync(process.env.INVENTORY_PERF_REPORT,JSON.stringify(measurements,null,2));
    console.log('Inventory performance fixture:',JSON.stringify(measurements));
    assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});
