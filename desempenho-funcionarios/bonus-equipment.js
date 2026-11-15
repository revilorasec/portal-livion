(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.BonusEquipment=api;})(globalThis,function(){
 'use strict';
 const text=value=>String(value??'').trim();
 function uf(value){const match=text(value).toUpperCase().match(/(?:^|[^A-Z])([A-Z]{2})$/);return match&&'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ').includes(match[1])?match[1]:'';}
 function fields(row){const claro=text(row.cliente||row.client).toUpperCase()==='CLARO',sla=Object.hasOwn(row,'sla')?row.sla:row[claro?'Dias na Livion':'Dias em Reparo']??row.dias;return {serial:text(row.serial??row[claro?'Nº de Série':'Nº Série']),sla:sla===null||sla===undefined?'':text(sla),uf:uf(row.uf??row[claro?'UF - REGIONAL':'Entidade']),customerDocument:text(row.customerDocument??row[claro?'Nota Fiscal Claro':'Nº Doc Envio'])};}
 function enrich(equipment,rows=typeof RAW==='undefined'?[]:RAW){const byId=new Map(rows.map(r=>[text(r.cliente||r.client).toUpperCase()+'|'+text(r.id||r.ID),r]));return equipment.map(e=>{const source=byId.get(text(e.client||e.cliente).toUpperCase()+'|'+text(e.id||e.ID)),fallback=fields(source||{}),current=fields(e);return {...e,...Object.fromEntries(Object.entries(current).map(([key,value])=>[key,value!==''?value:fallback[key]]))};});}
 return {fields,uf,enrich};
});
