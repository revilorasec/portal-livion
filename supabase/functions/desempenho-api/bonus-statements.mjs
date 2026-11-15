const validMonth=m=>/^20\d{2}-(0[1-9]|1[0-2])$/.test(m)&&m>='2026-10';
export async function bonusStatements(req,user,db,out){
 const appKey='desempenho-funcionarios';
 if(!user?.active||user.user_type!=='INTERNO'||(user.profile!=='ADMINISTRADOR'&&!(user.apps||[]).includes(appKey))||!(await db.app(appKey))?.active)return out(403,{message:'Aplicativo não liberado.'});
 const url=new URL(req.url),name=url.searchParams.get('technician')||'',client=url.searchParams.get('client')||'';
 if(!name||name.length>180||!['','Claro','Nokia'].includes(client))return out(400,{message:'Técnico ou cliente inválido.'});
 if(req.method==='GET')return out(200,{statements:await db.bonusStatements(name,client)});
 if(user.profile!=='ADMINISTRADOR')return out(403,{message:'Somente administradores registram demonstrativos.'});
 const text=await req.text();if(text.length>600000)return out(400,{message:'Demonstrativo muito grande.'});
 let s;try{s=JSON.parse(text);}catch{return out(400,{message:'Demonstrativo inválido.'});}
 const currentMonth=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit'}).format(new Date());
 // Only completed months are frozen. Current month always remains a partial preview.
 if(!s||s.name!==name||s.client!==client||!validMonth(s.month)||s.month>=currentMonth||!s.config||!Array.isArray(s.config.bands)||!s.result||s.result.name!==name||!Array.isArray(s.equipment)||s.equipment.length>4000||!['repaired','irreparable','bonus'].every(k=>Number.isFinite(s.result[k])&&s.result[k]>=0))return out(400,{message:'Somente meses encerrados podem ser registrados com dados válidos.'});
 await db.insertBonusStatement({month:s.month,technician:name,client,statement:s,created_by:user.email});
 const statements=await db.bonusStatements(name,client);
 return out(200,{statements});
}
export const statementFilter=value=>encodeURIComponent('"'+String(value).replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"');
