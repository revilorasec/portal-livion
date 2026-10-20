// Import original model files by reading them and saving verified private copies only.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createWorkbookEngine } from '../supabase/functions/expedicao-api/workbook.mjs';
const dir=path.resolve(import.meta.dirname,'../../../EXPEDIÇÃO E ROMANEIOS/Modelos-Homologacao');
const require=createRequire(pathToFileURL('C:/Users/cesar/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/_loader.cjs'));
const {Book,hash}=createWorkbookEngine(require('jszip')),manifest=JSON.parse(await fs.readFile(path.join(dir,'modelos.json'),'utf8'));
for(const filename of process.argv.slice(2)){
 const bytes=await fs.readFile(filename),originalHash=await hash(bytes),name=path.basename(filename),book=await Book.open(bytes,name),info=book.inspect();
 if(manifest.models.some(m=>m.sha256===info.sha256)){console.log(JSON.stringify({name,alreadyPresent:true}));continue;}
 const copy='claro-'+info.sha256+'.xlsx';await fs.writeFile(path.join(dir,copy),bytes,{flag:'wx'});
 const model={id:'claro-'+info.sha256.slice(0,20),client:'claro',name,sha256:info.sha256,filename:copy,cnpj:info.cnpj,city:info.city,uf:info.uf,address:info.address,capacity:info.capacity,boxCapacity:info.box_capacity,inheritedErrors:info.inherited_error_cells};
 if(await hash(await fs.readFile(filename))!==originalHash)throw Error('O original mudou durante a leitura.');
 manifest.models.push(model);console.log(JSON.stringify({name,cnpj:model.cnpj,city:model.city,address:model.address,originalUnchanged:true}));
}
await fs.writeFile(path.join(dir,'modelos.json'),JSON.stringify(manifest,null,2));
