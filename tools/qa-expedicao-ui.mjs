import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const req=createRequire(pathToFileURL('C:/Users/cesar/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/_loader.cjs'));
const {chromium}=req('playwright'),out=path.resolve(import.meta.dirname,'../../../EXPEDIÇÃO E ROMANEIOS/Validacao');
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}),page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
await page.addInitScript(()=>{
 const roots=new Map();window.__TEST_FILES__=roots;
 window.showDirectoryPicker=async options=>{
  const client=options.id.endsWith('nokia')?'nokia':'claro',name=client==='nokia'?'@EXPEDIÇÃO RHCS':'@EXPEDIÇÃO LIVION';
  if(roots.has(name))return roots.get(name);
  const makeDir=name=>{const files=new Map(),dirs=new Map();return{name,queryPermission:async()=> 'granted',requestPermission:async()=> 'granted',getDirectoryHandle:async(name)=>{if(!dirs.has(name))dirs.set(name,makeDir(name));return dirs.get(name);},getFileHandle:async(name,options={})=>{if(!files.has(name)){if(!options.create)throw new DOMException('Missing','NotFoundError');let value=new Uint8Array();files.set(name,{name,createWritable:async()=>({write:async b=>{value=new Uint8Array(b);},close:async()=>{}}),getFile:async()=>new Blob([value])});}return files.get(name);}};};
  const root=makeDir(name);roots.set(name,root);return root;
 };
});
try{
 await page.goto(process.env.EXPEDICAO_PREVIEW_URL||'http://127.0.0.1:4178/');const f=page.frameLocator('iframe');await f.locator('#notes .note').waitFor();
 await f.locator('#notes .note').first().click();await f.locator('#detail').waitFor();
 await f.locator('#suggestBoxes').click();assert.equal(await f.locator('#boxes tr').count(),2);
 await f.locator('[data-box="1"][data-field="weight"]').fill('1,5');await f.locator('[data-box="1"][data-field="dimension"]').fill('35 x 35 x 24 cm');await f.locator('[data-box="2"][data-field="weight"]').fill('2,5');await f.locator('[data-box="2"][data-field="dimension"]').fill('47 x 38 x 24 cm');
 await f.locator('#saveDraft').click();await f.locator('#draftState').filter({hasText:'revisão 1'}).waitFor();
 await page.frames()[1].evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(out,'expedicao-desktop.png'),fullPage:true});
 await f.locator('[data-item="N_TEST_2"]').fill('1');assert.match(await f.locator('#boxCheck').innerText(),/misturados/);
 await f.locator('#writeBoxes').click();await f.locator('#notice').filter({hasText:'status diferentes'}).waitFor();
 await f.locator('[data-item="N_TEST_2"]').fill('2');await f.locator('#writeBoxes').click();await f.locator('#notice').filter({hasText:'Caixas confirmadas'}).waitFor();
 await f.locator('#pickFolder').click();await f.locator('#generate').click();await f.locator('#notice').filter({hasText:'marcada como Expedido'}).waitFor({timeout:30000});assert.equal(await f.locator('#noteCount').innerText(),'0');
 await f.locator('#filter').selectOption('EXPEDIDO');await f.locator('#notes .note').first().click();assert.equal(await f.locator('#dispatchState').innerText(),'Expedido');assert.equal(await f.locator('#responsible').isDisabled(),true);
 await page.screenshot({path:path.join(out,'expedicao-expedido.png'),fullPage:true});
 await f.locator('[data-client="claro"]').click();await f.locator('#filter').selectOption('EM_EXPEDICAO');await f.locator('#notes .note').first().click();await f.locator('#suggestBoxes').click();
 for(const width of [320,360,390,430]){await page.setViewportSize({width,height:1000});await page.waitForTimeout(100);const overflow=await page.frames()[1].evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false,'horizontal overflow at '+width);}
 await page.screenshot({path:path.join(out,'expedicao-mobile.png'),fullPage:true});assert.deepEqual(errors,[]);
 await fs.writeFile(path.join(out,'interface-resultados.json'),JSON.stringify({passed:true,desktop:1440,mobileWidths:[320,360,390,430],scenarios:['separate status boxes','draft save','mixed status rejected','BD write/readback (fictitious)','Excel generation with actual template','local file readback in isolated virtual filesystem','Expedido removed from active list','history read-only','Claro tab'],browserErrors:errors},null,2));console.log('Interface: fluxo Nokia/Claro, caixas por status, Expedido/histórico e 4 larguras móveis aprovados.');
}finally{await browser.close();}
