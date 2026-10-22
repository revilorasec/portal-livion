import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const root=new URL('../',import.meta.url),read=p=>readFileSync(new URL(p,root),'utf8');
const registrySource=read('app-installers.js'),registry=runInNewContext(registrySource+';APP_INSTALLERS');
const installer=read('install-app.html'),portal=read('index.html');
const inline=s=>[...s.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
function page(key,{userAgent='Windows Chrome',platform='Win32',touch=0,standalone=false}={}){
 const elements=new Map(),events={},writes=[];
 const element=id=>{if(!elements.has(id))elements.set(id,{textContent:'',innerHTML:'',classList:{add(){}},disabled:false,hidden:false});return elements.get(id);};
 const navigator={userAgent,platform,maxTouchPoints:touch};
 const scope={URLSearchParams,location:{search:'?app='+key},document:{write:s=>writes.push(s),getElementById:element},navigator,matchMedia:()=>({matches:standalone}),window:{navigator,addEventListener:(k,f)=>events[k]=f}};
 runInNewContext(registrySource+'\n'+inline(installer).join('\n'),scope);
 return{elements,element,events,writes,scope};
}

test('each Portal app has a distinct identity, launch route and valid icons',()=>{
 const groups=runInNewContext(portal.match(/const APP_GROUP_BY_KEY=(\{[^\n]+\});/)[0]+';APP_GROUP_BY_KEY');
 assert.deepEqual(Object.keys(registry).sort(),Object.keys(groups).sort());
 const identities=new Set();
 for(const [key,info] of Object.entries(registry)){
  const manifest=JSON.parse(read(info.manifest.split('?')[0]));
  assert.equal(manifest.start_url,'./?app='+key);
  assert.equal(manifest.scope,'./');
  assert.equal(manifest.display,'standalone');
  assert.ok(!identities.has(manifest.id));identities.add(manifest.id);
  for(const size of [192,512]){
   const icon=manifest.icons.find(i=>i.sizes===size+'x'+size);assert.ok(icon,key);
   const png=readFileSync(new URL(icon.src.split('?')[0],root));
   assert.equal(png.readUInt32BE(16),size);assert.equal(png.readUInt32BE(20),size);
  }
  const p=page(key);assert.equal(p.element('appName').textContent,info.name);
  assert.equal(p.element('openBtn').href,'./?app='+key);
  assert.ok(p.writes.some(s=>s.includes(info.manifest)));
 }
});

test('invalid or missing app never installs a different module',()=>{
 for(const key of ['','missing','__proto__','toString']){
  const p=page(key);assert.equal(p.element('installBtn').hidden,true);
  assert.equal(p.element('openBtn').hidden,true);assert.equal(p.writes.length,0);
 }
});

test('browser prompt waits for a user click and supports success and cancellation',async()=>{
 const p=page('expedicao');let prompts=0,prevented=0;
 p.events.beforeinstallprompt({preventDefault(){prevented++},async prompt(){prompts++},userChoice:Promise.resolve({outcome:'accepted'})});
 assert.equal(prompts,0);await p.element('installBtn').onclick();assert.equal(prompts,1);assert.equal(prevented,1);
 assert.equal(p.element('installBtn').disabled,true);p.events.appinstalled();assert.equal(p.element('installBtn').textContent,'Instalado');
 const cancelled=page('expedicao');cancelled.events.beforeinstallprompt({preventDefault(){},async prompt(){},userChoice:Promise.resolve({outcome:'dismissed'})});
 await cancelled.element('installBtn').onclick();assert.equal(cancelled.element('installBtn').disabled,false);
});

test('iPhone and desktop-mode iPad get home screen instructions; Windows gets browser fallback',async()=>{
 for(const options of [{userAgent:'iPhone'},{userAgent:'Macintosh',platform:'MacIntel',touch:5}]){
  const p=page('expedicao',options);await p.element('installBtn').onclick();
  assert.match(p.element('status').innerHTML,/Compartilhar/);assert.match(p.element('status').innerHTML,/Adicionar à Tela de Início/);assert.match(p.element('status').innerHTML,/Expedição Livion/);
 }
 const p=page('estoque');await p.element('installBtn').onclick();assert.match(p.element('status').innerHTML,/Instalar Estoque Livion/);
});

test('another installed module does not falsely disable installation and expired prompts recover',async()=>{
 const p=page('expedicao',{standalone:true});assert.equal(p.element('installBtn').disabled,false);
 assert.doesNotMatch(p.element('status').textContent,/já está instalado/);
 p.events.beforeinstallprompt({preventDefault(){},async prompt(){throw Error('expired')},userChoice:Promise.resolve({})});
 await p.element('installBtn').onclick();assert.match(p.element('status').innerHTML,/menu do navegador/);
});

test('launching an installed app keeps its manifest and Apple name instead of adopting the Portal identity',()=>{
 for(const [key,info] of Object.entries(registry)){
  const writes=[],scope={URLSearchParams,location:{search:'?app='+key},document:{write:s=>writes.push(s)}};
  runInNewContext(registrySource+'\n'+inline(portal)[0],scope);
  assert.ok(writes.join('').includes(info.manifest));
  assert.ok(writes.join('').includes('apple-mobile-web-app-title" content="'+info.short+'"'));
 }
});
