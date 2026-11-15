const validMonth=m=>/^20\d{2}-(0[1-9]|1[0-2])$/.test(m)&&m>='2026-10';
const stable=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(k=>[k,item[k]])):item);
const needsCorrection=r=>r.statement.countingRule!=='nokia-u-v1'&&r.statement.client!=='Claro'&&(r.statement.result.nokia>0||r.statement.equipment.some(e=>e.client==='Nokia'));
async function list(db,name,client){const originals=await db.bonusStatements(name,client),corrections=db.bonusStatementCorrections?await db.bonusStatementCorrections(name,client):[],byMonth=new Map(originals.map(r=>[r.month,r]));for(const row of corrections)byMonth.set(row.month,row);return [...byMonth.values()].sort((a,b)=>a.month.localeCompare(b.month)).map(row=>({...row,needsShipmentCorrection:needsCorrection(row)}));}
export async function bonusStatements(req,user,db,out){
 const appKey='desempenho-funcionarios';
 if(!user?.active||user.user_type!=='INTERNO'||(user.profile!=='ADMINISTRADOR'&&!(user.apps||[]).includes(appKey))||!(await db.app(appKey))?.active)return out(403,{message:'Aplicativo não liberado.'});
 const url=new URL(req.url),name=url.searchParams.get('technician')||'',client=url.searchParams.get('client')||'';
 if(!name||name.length>180||!['','Claro','Nokia'].includes(client))return out(400,{message:'Técnico ou cliente inválido.'});
 if(req.method==='GET')return out(200,{statements:await list(db,name,client)});
 if(user.profile!=='ADMINISTRADOR')return out(403,{message:'Somente administradores registram demonstrativos.'});
 const text=await req.text();if(text.length>600000)return out(400,{message:'Demonstrativo muito grande.'});
 let s;try{s=JSON.parse(text);}catch{return out(400,{message:'Demonstrativo inválido.'});}
 const currentMonth=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit'}).format(new Date());
 // Only completed months are frozen. Current month always remains a partial preview.
 if(!s||s.name!==name||s.client!==client||!validMonth(s.month)||s.month>=currentMonth||!s.config||!Array.isArray(s.config.bands)||!s.result||s.result.name!==name||!Array.isArray(s.equipment)||s.equipment.length>4000||!['repaired','irreparable','bonus'].every(k=>Number.isFinite(s.result[k])&&s.result[k]>=0))return out(400,{message:'Somente meses encerrados podem ser registrados com dados válidos.'});
 if(s.countingRule!=='nokia-u-v1')return out(409,{message:'Atualize o aplicativo antes de emitir: a competência Nokia usa exclusivamente a coluna U.'});
 const original=(await db.bonusStatements(name,client)).find(r=>r.month===s.month);
 if(original&&needsCorrection(original)){
  if(stable(s.config)!==stable(original.statement.config))return out(409,{message:'A correção deve manter as regras de pagamento do demonstrativo original.'});
  await db.insertBonusStatementCorrection({month:s.month,technician:name,client,statement:{...s,correctsCreatedAt:original.created_at,correctionReason:'Competência Nokia corrigida para Data da Expedição, coluna U. Original preservado.'},created_by:user.email});
 }else await db.insertBonusStatement({month:s.month,technician:name,client,statement:s,created_by:user.email});
 const statements=await list(db,name,client);
 return out(200,{statements});
}
export const statementFilter=value=>encodeURIComponent('"'+String(value).replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"');
