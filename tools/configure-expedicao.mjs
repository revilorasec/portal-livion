// Server-side installer. Reads secrets from the process environment; never logs or embeds them.
// Default is read-only. --apply uploads immutable model COPIES and registers only this module's metadata.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { runtimeDependencies } from '../supabase/functions/expedicao-api/runtime.mjs';
import { sha256,norm } from '../supabase/functions/expedicao-api/common.mjs';
import * as claro from '../supabase/functions/expedicao-api/adapters/claro.mjs';
import { sourceGroups } from '../supabase/functions/expedicao-api/domain.mjs';
const required=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','EXPEDICAO_NOKIA_URL','EXPEDICAO_NOKIA_SECRET','EXPEDICAO_CLARO_URL','EXPEDICAO_CLARO_SECRET'];
const missing=required.filter(k=>!process.env[k]);if(missing.length){console.error('Configuração ausente: '+missing.join(', ')+'. Defina os valores somente no ambiente seguro do instalador e nas funções.');process.exit(1);}
const apply=process.argv.includes('--apply'),dir=path.resolve(import.meta.dirname,'../../../EXPEDIÇÃO E ROMANEIOS/Modelos-Homologacao');
const require=createRequire(pathToFileURL((process.env.EXPEDICAO_NODE_MODULES||'C:/Users/cesar/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules')+'/_loader.cjs'));
const deps=runtimeDependencies(k=>process.env[k],require('jszip')),base=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
const headers={apikey:key,Authorization:'Bearer '+key};
const check=async(response,label)=>{if(!response.ok)throw Error(label+' falhou (HTTP '+response.status+'). Nenhum segredo foi registrado.');};
try{
 const manifest=JSON.parse(await fs.readFile(path.join(dir,'modelos.json'),'utf8')),ready=[],pending=[];
 for(const client of ['nokia','claro']){
  const source=await deps.readSource(client),clientModels=[];
  for(const model of manifest.models.filter(m=>m.client===client)){
   const bytes=new Uint8Array(await fs.readFile(path.join(dir,model.filename)));if(await sha256(bytes)!==model.sha256)throw Error('A cópia do modelo mudou: '+model.name);
   if(client==='claro'){
    model.centers=source.destinations.filter(d=>claro.modelMatches({...model,centers:[norm(d.center)]},{destination:{...d,cnpj:String(d.cnpj).replace(/\D/g,''),center:norm(d.center),uf:norm(d.ufRegional).split(' - ').pop()}})).map(d=>norm(d.center));
    if(!model.centers.length){pending.push({model:model.name,reason:'Sem destino único conferido no cadastro atual.'});continue;}
   }
   clientModels.push(model);ready.push({client,model:model.name});
   if(!apply)continue;
   const storagePath=client+'/'+model.sha256+'.xlsx';
   const upload=await fetch(base+'/storage/v1/object/expedicao-modelos/'+storagePath,{method:'POST',headers:{...headers,'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','x-upsert':'false'},body:bytes});
   if(!upload.ok&&![400,409].includes(upload.status))await check(upload,'Upload da cópia');
   const readback=await fetch(base+'/storage/v1/object/expedicao-modelos/'+storagePath,{headers});await check(readback,'Leitura da cópia');if(await sha256(new Uint8Array(await readback.arrayBuffer()))!==model.sha256)throw Error('A conferência da cópia remota falhou.');
   const response=await fetch(base+'/rest/v1/expedicao_models?on_conflict=id',{method:'POST',headers:{...headers,'Content-Type':'application/json',Prefer:'resolution=ignore-duplicates'},body:JSON.stringify({id:model.id,client,metadata:model,sha256:model.sha256,storage_path:storagePath,active:true})});await check(response,'Registro do modelo');
  }
  const report=await sourceGroups(client,source,clientModels);console.log(JSON.stringify({client,readOnly:!apply,pieces:report.groups.reduce((n,g)=>n+g.count,0),groups:report.groups.length,groupsWithModel:report.groups.filter(g=>!g.errors.length).length}));
 }
 console.log(JSON.stringify({applied:apply,readyModels:ready.length,pendingModels:pending,rejectedModels:manifest.rejected,writeEnabled:false}));
}catch(error){console.error(error.message);process.exitCode=1;}
