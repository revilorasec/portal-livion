import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve,extname} from 'node:path';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url),Engine=require('../desempenho-funcionarios/bonus-engine.js'),root=resolve(import.meta.dirname,'..');
test('recuperação mostra cópia e só grava após conferir e clicar em Gravar regras',{skip:!process.env.PLAYWRIGHT_PACKAGE},async()=>{
  const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_PACKAGE).href);
  const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try{
    const page=await browser.newPage(),old=Engine.defaults(),current=Engine.defaults(),puts=[],errors=[];old.bands[1].baseLow=1.11;current.pnLevels.ATUAL=2;
    await page.addInitScript(config=>localStorage.setItem('portalBonusConfigV4',JSON.stringify(config)),old);
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.hostname==='cdn.jsdelivr.net')return route.fulfill({contentType:'text/javascript',body:'window.Chart=class{destroy(){} resize(){}}'});
      if(url.pathname.endsWith('/bonus-settings')){
        if(route.request().method()==='PUT')puts.push(route.request().postDataJSON());
        return route.fulfill({contentType:'application/json',body:JSON.stringify({config:puts.at(-1)?.config||current,revision:puts.length+10,canManage:true})});
      }
      if(url.pathname.endsWith('/panel-data'))return route.fulfill({contentType:'application/json',body:JSON.stringify({rows:[{cliente:'Claro',id:'TESTE',tecnico:'TESTE',status:'REPARADO','Data Expedição':'2026-10-15'}]})});
      if(url.hostname!=='recovery.test')return route.abort();
      if(url.pathname==='/harness')return route.fulfill({contentType:'text/html',body:'<script>window.__PORTAL_GET_TOKEN__=async()=>"test-token"</script><iframe src="/desempenho-funcionarios/index.html" style="width:1300px;height:950px"></iframe>'});
      try{let content=readFileSync(resolve(root,'.'+url.pathname));if(url.pathname.endsWith('/index.html')&&!content.toString().includes('bonus-recovery.js'))content=content.toString().replace('</body>','<script src="bonus-recovery.js"></script></body>');return route.fulfill({body:content,contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[extname(url.pathname)]||'application/octet-stream'});}catch{return route.fulfill({status:404,body:''})}
    });
    await page.goto('https://recovery.test/harness');const app=page.frameLocator('iframe');
    await app.getByRole('button',{name:'Bônus por devolução',exact:true}).click();
    await app.locator('#bonusMediumPct').waitFor({state:'visible'});
    await app.getByRole('button',{name:'Recuperar cópia antiga',exact:true}).click();
    assert.match(await app.locator('#bonusRecoveryModal').innerText(),/1,11/);
    await app.getByRole('button',{name:'Carregar para conferir',exact:true}).click();
    assert.equal(await app.locator('#bonusRates [data-index="1"] [data-field="baseLow"]').getAttribute('value'),'1.11');assert.equal(puts.length,0);
    await app.getByRole('button',{name:'Gravar regras',exact:true}).click();
    await app.getByText('Regras gravadas para todos os administradores',{exact:true}).waitFor({state:'visible'});
    assert.equal(puts.length,1);assert.equal(puts[0].config.bands[1].baseLow,1.11);assert.deepEqual(puts[0].config.pnLevels,{ATUAL:2});assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});
