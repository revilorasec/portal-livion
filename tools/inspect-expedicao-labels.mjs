import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createWorkbookEngine } from '../supabase/functions/expedicao-api/workbook.mjs';
const require=createRequire(pathToFileURL('C:/Users/cesar/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/_loader.cjs'));
const {Book}=createWorkbookEngine(require('jszip'));
const dir=path.resolve(import.meta.dirname,'../../../EXPEDIÇÃO E ROMANEIOS/Modelos-Homologacao');
const {models,rejected}=JSON.parse(await fs.readFile(path.join(dir,'modelos.json'),'utf8'));
console.log(JSON.stringify({rejected}));
for(const m of [models.find(m=>m.client==='claro'),models.find(m=>m.client==='nokia')]){
 const book=await Book.open(await fs.readFile(path.join(dir,m.filename)),m.name),cells=book.cells['03 Etiquetas'];
 console.log(JSON.stringify({client:m.client,capacity:m.capacity,boxCapacity:m.boxCapacity,labels:Object.entries(cells).filter(([,c])=>/STATUS|VOLUME/i.test(c.value)||c.formula.includes('VOLUME')).slice(0,18).map(([a,c])=>({address:a,value:c.value,formula:c.formula})),nearby:Object.entries(cells).filter(([a])=>/^[A-Z]+([1-9]|1[0-9]|2[0-5])$/.test(a)).map(([a,c])=>({address:a,value:c.value,formula:c.formula})),nokiaTargets:m.client==='nokia'?Object.fromEntries(['C10','E10','G10','C11','C12'].map(a=>[a,book.cells['02 Romaneio v2'][a]])):undefined}));
}
