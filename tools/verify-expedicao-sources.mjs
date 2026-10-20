// One-time server-side verification. Removes its temporary secret config before network access.
import fs from 'node:fs/promises';
import path from 'node:path';
import { runtimeDependencies } from '../supabase/functions/expedicao-api/runtime.mjs';
import { norm } from '../supabase/functions/expedicao-api/common.mjs';
import * as claro from '../supabase/functions/expedicao-api/adapters/claro.mjs';
import { sourceGroups } from '../supabase/functions/expedicao-api/domain.mjs';
const configPath=process.argv[2];if(!configPath)throw Error('Informe o arquivo temporário de configuração.');
const config=JSON.parse(await fs.readFile(configPath,'utf8'));await fs.unlink(configPath);
const env={};for(const client of ['nokia','claro']){env['EXPEDICAO_'+client.toUpperCase()+'_URL']=config.urls[client];env['EXPEDICAO_'+client.toUpperCase()+'_SECRET']=config.secrets[client];}
const deps=runtimeDependencies(k=>env[k],null),root=path.resolve(import.meta.dirname,'../../../EXPEDIÇÃO E ROMANEIOS'),manifest=JSON.parse(await fs.readFile(path.join(root,'Modelos-Homologacao/modelos.json'),'utf8'));
const ready=[],pending=[],reports=[];
try{
 for(const client of ['nokia','claro']){
  const source=await deps.readSource(client),models=[];
  if(client==='claro')await fs.writeFile(path.join(root,'Validacao/destinos-conferidos.json'),JSON.stringify(source.destinations,null,2));
  for(const original of manifest.models.filter(m=>m.client===client)){
   const m={...original};
   if(client==='claro')m.centers=source.destinations.filter(d=>claro.modelMatches({...m,centers:[norm(d.center)]},{destination:{...d,cnpj:String(d.cnpj).replace(/\D/g,''),center:norm(d.center),uf:norm(d.ufRegional).split(' - ').pop()}})).map(d=>norm(d.center));
   if(client==='claro'&&!m.centers.length){pending.push({model:m.name,reason:'Destino não conferido no cadastro atual'});continue;}
   models.push(m);ready.push(m);
  }
  const report=await sourceGroups(client,source,models);reports.push({client,readOnly:true,rows:source.rows.length,destinations:source.destinations.length,groups:report.groups.length,groupsWithModel:report.groups.filter(g=>!g.errors.length).length,activeGroups:report.groups.filter(g=>g.items.some(i=>i.expedition)).length,blocked:report.groups.filter(g=>g.items.some(i=>i.expedition)&&g.errors.length).map(g=>({note:g.note,destination:g.destination.city,errors:g.errors}))});
 }
 const quote=v=>"'"+String(v).replaceAll("'","''")+"'";
 const sql=ready.map(m=>`update public.expedicao_models set metadata=${quote(JSON.stringify(m))}::jsonb,active=true where id=${quote(m.id)} and sha256=${quote(m.sha256)};`).join('\n');
 await fs.writeFile(path.join(root,'Validacao/modelos-conferidos.sql'),sql);
 await fs.writeFile(path.join(root,'Validacao/leitura-origens.json'),JSON.stringify({reports,readyModels:ready.length,pending},null,2));
 console.log(JSON.stringify({reports,readyModels:ready.length,pending}));
}catch(error){console.error(JSON.stringify({error:error.message,cause:error.cause?.code}));process.exitCode=1;}
