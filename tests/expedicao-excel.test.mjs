import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createWorkbookEngine } from '../supabase/functions/expedicao-api/workbook.mjs';
import { generateWorkbook,labelTargets } from '../supabase/functions/expedicao-api/excel.mjs';
import { sourceGroups,prepareExport } from '../supabase/functions/expedicao-api/domain.mjs';
import { source,draftFor,harness } from './expedicao-fixtures.mjs';
import {inspectModel,editModel} from '../supabase/functions/expedicao-api/models.mjs';
const dir=path.resolve(import.meta.dirname,'../../../EXPEDIÇÃO E ROMANEIOS/Modelos-Homologacao');
let manifest,JSZip;try{manifest=JSON.parse(await fs.readFile(path.join(dir,'modelos.json'),'utf8'));const req=createRequire(pathToFileURL((process.env.EXPEDICAO_NODE_MODULES||'C:/Users/cesar/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules')+'/_loader.cjs'));JSZip=req('jszip');}catch{}

test('optimized workbook readback detects altered bytes in any unauthorized ZIP part',{skip:!manifest||!JSZip},async()=>{
 const m=manifest.models[0],bytes=await fs.readFile(path.join(dir,m.filename));let loads=0;
 const wrapped={loadAsync:async(...args)=>{const zip=await JSZip.loadAsync(...args);if(++loads===2){const generate=zip.generateAsync.bind(zip);zip.generateAsync=async options=>{const key=Object.keys(zip.files).find(k=>k.startsWith('docProps/')&&!zip.files[k].dir);assert.ok(key);zip.file(key,'<unauthorized-change/>');return generate(options);};}return zip;}};
 const {Book}=createWorkbookEngine(wrapped),book=await Book.open(bytes,m.name);
 await assert.rejects(book.writeCopy({}),/Parte Excel divergente na leitura de retorno/);assert.equal(loads,3);
});
test('every approved model generates isolated copies; status is right of STATUS, unused labels cleared, all formulas/ZIP parts preserved',{skip:!manifest||!JSZip},async()=>{
 const {Book,hash}=createWorkbookEngine(JSZip),output=path.resolve(dir,'../Validacao');await fs.mkdir(output,{recursive:true});const results=[];
 for(const m of manifest.models){
  const bytes=await fs.readFile(path.join(dir,m.filename)),before=await hash(bytes),s=source(m.client),model={...m,centers:['TESTE']};
  if(m===manifest.models[0]||m.client==='nokia'){
   const info=await inspectModel(JSZip,m.client,bytes,m.name);assert.equal(info.sha256,m.sha256);
   const edited=await editModel(JSZip,model,bytes,{cnpj:m.cnpj,city:m.city,uf:m.uf,address:m.address||'Rua de teste, 1, CEP 01000-000',invoiceAddress:'Emissão de teste',observation:'Observação de teste'});
   const reread=await Book.open(edited.bytes,edited.model.name);assert.equal(reread.value('01 Pesagem v2','B13'),'Emissão de teste');assert.deepEqual(reread.formulas(),(await Book.open(bytes,m.name)).formulas());
   if(m.client==='nokia'){
    const h=harness();h.models.nokia=[{...m,active:true,revision:1}];h.deps.modelBytes=async()=>bytes;h.deps.base64=b=>Buffer.from(b).toString('base64');h.deps.editModel=(m,b,f)=>editModel(JSZip,m,b,f);h.deps.inspectModel=(c,b,n)=>inspectModel(JSZip,c,b,n);
    const fields={cnpj:m.cnpj,city:m.city,uf:m.uf,address:'Rua fictícia nova, 9, CEP 01000-000',invoiceAddress:'',observation:''};
    const checked=await h.call('model-edit-check',{client:'nokia',id:m.id,revision:1,fields});assert.equal(checked.status,200,JSON.stringify(checked.body));
    assert.equal((await h.call('model-edit-check',{client:'nokia',id:m.id,revision:0,fields})).status,409);
    const d=checked.body.destinations[0],payload={client:'nokia',filename:checked.body.model.name,bytes:checked.body.bytes,sha256:checked.body.model.sha256,destinationKey:d.key,expectedActiveIds:d.activeIds,sourceId:m.id,sourceRevision:1};
    assert.equal((await h.call('model-save',payload)).status,400);assert.equal((await h.call('model-save',{...payload,useModelAddress:true})).status,200);assert.equal(h.writes,0);
    const downloaded=await h.call('model-download',{client:'nokia',id:m.id});assert.match(downloaded.body.filename,/\.xlsx$/);assert.equal(downloaded.body.sha256,m.sha256);
   }
  }
  if(m.client==='claro'){
   s.destinations=[{cnpj:m.cnpj,center:'TESTE',region:'NORDESTE',ufRegional:'TEST - '+m.uf,city:m.city,address:m.address}];
   s.rows.forEach(r=>Object.assign(r,{J:m.cnpj,K:'TESTE',M:'TEST - '+m.uf,N:m.city}));
  }
  const g=(await sourceGroups(m.client,s,[model])).groups[0];assert.deepEqual(g.errors,[],m.name);
  const draft=draftFor(g);
  if(!/^[A-Z]{2}$/.test(m.uf)){assert.throws(()=>prepareExport(g,draft),/Texto inválido|UF/);results.push({model:m.name,blocked:true,reason:'UF do modelo anterior não possui duas letras',originalUnchanged:await hash(await fs.readFile(path.join(dir,m.filename)))===before});continue;}
  const plan=prepareExport(g,draft),result=await generateWorkbook(JSZip,model,bytes,g,plan),book=await Book.open(result.bytes,m.name),original=await Book.open(bytes,m.name);
  const targets=labelTargets(original);assert.equal(targets.length,m.boxCapacity);
  assert.equal(book.value('03 Etiquetas',targets[0].target),'SEM REPARO',m.name);
  assert.equal(book.value('03 Etiquetas',targets[1].target),m.client==='nokia'?'REPARADO':'03-REPARADO',m.name);
  for(const target of targets.slice(2))assert.equal(book.value('03 Etiquetas',target.target),'',m.name);
  assert.deepEqual(book.formulas(),original.formulas(),m.name);
  assert.equal(await hash(await fs.readFile(path.join(dir,m.filename))),before);
  const filename=m.client+'-'+m.sha256.slice(0,12)+'-TESTE.xlsx';await fs.writeFile(path.join(output,filename),result.bytes);
  results.push({model:m.name,modelHash:before,file:filename,outputHash:result.sha256,labels:targets.length,statusCells:targets.slice(0,2).map(t=>({cell:t.target,value:book.value('03 Etiquetas',t.target)})),formulasPreserved:true,otherPartsPreserved:true});
 }
 await fs.writeFile(path.join(output,'excel-resultados.json'),JSON.stringify({results,rejected:manifest.rejected},null,2));assert.equal(results.length,manifest.models.length);
});
