// Local-only preview. The service, domain and workbook generator are real; every operational record is fictitious.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { harness } from '../tests/expedicao-fixtures.mjs';
import { generateWorkbook } from '../supabase/functions/expedicao-api/excel.mjs';
import { createService } from '../supabase/functions/expedicao-api/service.mjs';
import {inspectModel,editModel} from '../supabase/functions/expedicao-api/models.mjs';
const root=path.resolve(import.meta.dirname,'..'),dir=path.resolve(root,'../../EXPEDIÇÃO E ROMANEIOS/Modelos-Homologacao');
const {models}=JSON.parse(await fs.readFile(path.join(dir,'modelos.json'),'utf8'));
const req=createRequire(pathToFileURL('C:/Users/cesar/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/_loader.cjs')),JSZip=req('jszip');
const h=harness();
if(process.env.EXPEDICAO_PREVIEW_ROLE==='operator'){h.user.profile='OPERADOR';h.user.apps=['expedicao'];h.user.actions=['expedicao.nokia.acessar','expedicao.claro.acessar','expedicao.visualizar','expedicao.editar_rascunho','expedicao.gravar_caixas','expedicao.gerar_romaneio'];}
const centralTargets=new Map(['nokia','claro'].map(c=>[c,{client:c,folder:{path:'HOMOLOGAÇÃO/'+c},revision:1}]));
h.deps.cloud={status:async(c,admin)=>({central:true,connected:true,ready:true,...(admin?{owner:'admin@example.test',settings:centralTargets.get(c)}:{})}),pending:async()=>[],saveFolder:async(c,path,revision,actor)=>{const s={client:c,folder:{path},revision:revision+1,updated_by:actor};centralTargets.set(c,s);return s;},connect:async()=>{throw Error('A prévia local não conecta contas Microsoft reais.');}};
for(const client of ['nokia','claro']){
 const model=models.find(m=>m.client===client);h.models[client]=[{...model,centers:['TESTE']}];
 if(client==='claro'){const s=h.sources.claro;s.destinations=[{cnpj:model.cnpj,center:'TESTE',region:'NORDESTE',ufRegional:'TEST - '+model.uf,city:model.city,address:model.address}];s.rows.forEach(r=>Object.assign(r,{J:model.cnpj,K:'TESTE',M:'TEST - '+model.uf,N:model.city}));}
}
h.deps.modelBytes=async m=>new Uint8Array(await fs.readFile(path.join(dir,m.filename)));
h.deps.generateWorkbook=(m,b,g,p)=>generateWorkbook(JSZip,m,b,g,p);
h.deps.inspectModel=(c,b,n)=>inspectModel(JSZip,c,b,n);
h.deps.editModel=(m,b,f)=>editModel(JSZip,m,b,f);
h.deps.base64=bytes=>Buffer.from(bytes).toString('base64');
const service=createService(h.deps);
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://127.0.0.1');
 if(url.pathname.startsWith('/api/')){let body='';for await(const chunk of req)body+=chunk;const response=await service(new Request('https://preview.invalid/expedicao-api/'+url.pathname.slice(5)+url.search,{method:req.method,headers:{authorization:req.headers.authorization||'','content-type':'application/json'},body:req.method==='POST'?body:undefined}));res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;}
 if(url.pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html><head><title>Homologação · Expedição Livion</title></head><body style="margin:0;font:13px Segoe UI"><div style="padding:8px 16px;background:#fff2d8;color:#715000">HOMOLOGAÇÃO LOCAL · Dados fictícios · Sem conexão com os BDs reais</div><iframe src="/expedicao/index.html" style="width:100%;height:calc(100vh - 35px);border:0"></iframe><script>window.__PORTAL_GET_TOKEN__=async()=>"test-token";</script></body></html>');return;}
 if(url.pathname.startsWith('/assets/state-flags/')&&/^\/assets\/state-flags\/[A-Z]{2}\.svg$/.test(url.pathname)||['/claro-logo.svg','/assets/client-logos/nokia.svg'].includes(url.pathname)){res.setHeader('Content-Type','image/svg+xml');res.end(await fs.readFile(path.join(root,url.pathname.slice(1))));return;}
 const files={'/expedicao/box-status.mjs':['expedicao/box-status.mjs','text/javascript'],'/expedicao/output-settings.mjs':['expedicao/output-settings.mjs','text/javascript'],'/expedicao/onedrive.mjs':['expedicao/onedrive.mjs','text/javascript'],'/expedicao/presentation.mjs':['expedicao/presentation.mjs','text/javascript'],'/expedicao/index.html':['expedicao/index.html','text/html'],'/expedicao/models.mjs':['expedicao/models.mjs','text/javascript'],'/expedicao/app.mjs':['expedicao/app.mjs','text/javascript'],'/expedicao/style.css':['expedicao/style.css','text/css']};const file=files[url.pathname];if(!file){res.writeHead(404);res.end();return;}let content=await fs.readFile(path.join(root,file[0]),'utf8');if(file[0].endsWith('app.mjs'))content=content.replace("https://kvfjjtkwxxbvzlicwnrz.supabase.co/functions/v1/expedicao-api",'http://127.0.0.1:'+(server.address().port)+'/api');res.setHeader('Content-Type',file[1]+'; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(content);
 }catch{res.writeHead(500);res.end('Falha na homologação local.');}});
server.listen(Number(process.env.EXPEDICAO_PREVIEW_PORT||4178),'127.0.0.1',()=>console.log('Prévia local com dados fictícios: http://127.0.0.1:'+server.address().port));
