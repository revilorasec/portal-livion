(function(root){
 'use strict';
 const text=v=>v==null?'':String(v).trim();
 const escape=v=>text(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const columns=[
  ['Centro','Centro'],[' Fornecedores',null],['NF CLARO','Nota Fiscal Claro'],['Data de Lançt','Data Emisão Nota fiscal'],
  ['SERIAL_RECEBIDO','Nº de Série'],['Nº Equipamento','BP/SGP/NS (Nº EQUIPAMENTO)'],['NF REPARADOR','Nota fiscal retorno'],
  ['DT NF REPARADOR','Data nota fiscal de retorno'],['SERIAL DEVOLVIDO','Nº de Série Devolvido'],['Nº Equipamento','BP/SGP/NS (Nº EQUIPAMENTO)'],
  ['DT ENTREGA NA CLARO','Data Entrega na Claro'],['STATUS','Status'],['DETALHE DO STATUS','Detalhe do Status']
 ];
 const filterFields={wLocation:['Onde está','Todos os locais'],wStatus:['Status','Todos os status'],wRegional:['REGIONAL','Todas as regionais'],wUF:['UF - REGIONAL','Todas as UFs'],wCD:['CD','Todos os CDs']};
 // UTC calendar dates avoid changing the selected day with the browser's timezone.
 function calendarDate(value){
  if(value instanceof Date&&!isNaN(value))return new Date(Date.UTC(value.getUTCFullYear(),value.getUTCMonth(),value.getUTCDate()));
  const s=text(value);let m=s.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/),y,month,day;
  if(m){[,y,month,day]=m}else{m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:$|\s)/);if(!m)return null;[,day,month,y]=m}
  const d=new Date(Date.UTC(+y,+month-1,+day));
  return d.getUTCFullYear()===+y&&d.getUTCMonth()===+month-1&&d.getUTCDate()===+day?d:null;
 }
 const iso=d=>d.toISOString().slice(0,10);
 const displayDate=d=>d?`${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}/${d.getUTCFullYear()}`:'';
 function brazilToday(now=new Date()){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const values=Object.fromEntries(parts.map(p=>[p.type,p.value]));return calendarDate(`${values.year}-${values.month}-${values.day}`);
 }
 function weekRange(kind,now=new Date()){
  const today=brazilToday(now),monday=new Date(today);monday.setUTCDate(today.getUTCDate()-((today.getUTCDay()+6)%7));
  if(kind==='previous'){const from=new Date(monday),to=new Date(monday);from.setUTCDate(from.getUTCDate()-7);to.setUTCDate(to.getUTCDate()-3);return {from:iso(from),to:iso(to)}}
  return {from:iso(monday),to:iso(today)};
 }
 function validPeriod(filters){return !(filters.from&&filters.to&&filters.from>filters.to)}
 function matches(row,filters,skip){
  if(!validPeriod(filters))return false;
  const from=calendarDate(filters.from),to=calendarDate(filters.to),received=calendarDate(row['Data recebimento na Livion']);
  if((from||to)&&!received)return false;if(from&&received<from)return false;if(to&&received>to)return false;
  return Object.entries(filterFields).every(([id,[field]])=>id===skip||!filters[id]||text(row[field])===filters[id]);
 }
 function deliveryIsFormula(row){return row._entregaFormula===true||['true','1'].includes(text(row._entregaFormula).toLowerCase())||/^=\s*(?:HOJE|TODAY)\s*\(/i.test(text(row['Data Entrega na Claro']))}
 function reportRow(row){return columns.map(([,field],i)=>i===1?'Livion Solutions':i===10&&deliveryIsFormula(row)?'':text(row[field]))}
 async function buildWorkbook(ExcelJS,template,rows){
  const source=new ExcelJS.Workbook();await source.xlsx.load(template);const model=source.getWorksheet('2026')||source.worksheets[0];
  if(!model||model.columnCount!==13)throw new Error('O modelo da Claro está indisponível ou foi alterado.');
  // Keep the client's real header styles and column widths; discard instructions and sample remnants.
  const book=new ExcelJS.Workbook(),sheet=book.addWorksheet(model.name,{properties:structuredClone(model.properties),pageSetup:structuredClone(model.pageSetup),headerFooter:structuredClone(model.headerFooter)});
  for(let i=1;i<=13;i++){
   const from=model.getColumn(i),to=sheet.getColumn(i);to.width=from.width;to.hidden=from.hidden;to.style=structuredClone(from.style);
   const header=sheet.getCell(1,i);header.value=model.getCell(2,i).value;header.style=structuredClone(model.getCell(2,i).style);
  }
  if(model.getRow(2).height)sheet.getRow(1).height=model.getRow(2).height;
  const dataStyles=Array.from({length:13},(_,i)=>structuredClone(model.getCell(3,i+1).style));
  const dataHeight=model.getRow(3).height;
  rows.forEach(row=>{
   const added=sheet.addRow(reportRow(row));if(dataHeight)added.height=dataHeight;
   added.eachCell({includeEmpty:true},(cell,i)=>{cell.style=structuredClone(dataStyles[i-1]);if(i===11){const d=deliveryIsFormula(row)?null:calendarDate(row['Data Entrega na Claro']);if(d)cell.value=d}});
  });
  sheet.views=model.views.map(view=>view.state==='frozen'?{...view,ySplit:1,topLeftCell:'A2',activeCell:'A2'}:structuredClone(view));
  return book;
 }
 let excelPromise;
 function excelLibrary(){
  if(root.ExcelJS)return Promise.resolve(root.ExcelJS);
  if(!excelPromise)excelPromise=new Promise((resolve,reject)=>{
   const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';script.async=true;
   const timer=setTimeout(()=>{script.remove();reject(new Error('Não foi possível carregar a exportação. Tente novamente.'))},30000);
   script.onload=()=>{clearTimeout(timer);root.ExcelJS?resolve(root.ExcelJS):reject(new Error('Não foi possível carregar a exportação.'))};
   script.onerror=()=>{clearTimeout(timer);script.remove();reject(new Error('Não foi possível carregar a exportação. Verifique sua conexão e tente novamente.'))};
   document.head.appendChild(script);
  }).catch(error=>{excelPromise=null;throw error});return excelPromise;
 }
 function init({getRows,now=()=>new Date()}){
  const $=id=>document.getElementById(id);let filtered=[],page=1,exporting=false;const pageSize=100;
  const readFilters=()=>({from:$('wDateFrom').value,to:$('wDateTo').value,...Object.fromEntries(Object.keys(filterFields).map(id=>[id,$(id).value]))});
  function message(value,error=false){$('weeklyMessage').textContent=value;$('weeklyMessage').classList.toggle('error',error)}
  function rebuildOptions(filters){
   const data=getRows();for(const [id,[field,label]] of Object.entries(filterFields)){
    const select=$(id),current=filters[id];
    const values=[...new Set(data.filter(r=>matches(r,filters,id)).map(r=>text(r[field])).filter(Boolean))];
    // Preserve an explicit choice even if another filter leaves it with zero matches.
    if(current&&!values.includes(current))values.push(current);values.sort((a,b)=>a.localeCompare(b,'pt-BR',{numeric:true}));
    select.innerHTML=`<option value="">${label}</option>`+values.map(v=>`<option value="${escape(v)}">${escape(v)}</option>`).join('');select.value=current||'';
   }
  }
  function renderPage(){
   const pages=Math.max(1,Math.ceil(filtered.length/pageSize));page=Math.min(page,pages);const start=(page-1)*pageSize;
   $('weeklyTable').innerHTML='<thead><tr>'+columns.map(([title])=>`<th>${escape(title)}</th>`).join('')+'</tr></thead><tbody>'+filtered.slice(start,start+pageSize).map(row=>'<tr>'+reportRow(row).map(v=>`<td>${escape(v)||'—'}</td>`).join('')+'</tr>').join('')+'</tbody>';
   $('weeklyPageInfo').textContent=`Página ${page} de ${pages} · ${filtered.length?start+1:0}–${Math.min(start+pageSize,filtered.length)} de ${filtered.length.toLocaleString('pt-BR')} registros`;
   $('weeklyPrevPage').disabled=page<=1;$('weeklyNextPage').disabled=page>=pages;
  }
  function refresh(resetPage=true){
   const filters=readFilters();rebuildOptions(filters);filtered=getRows().filter(r=>matches(r,filters));if(resetPage)page=1;
   $('weeklyCount').textContent=`${filtered.length.toLocaleString('pt-BR')} registros`;
   $('weeklyPeriod').textContent=filters.from||filters.to?`${filters.from?displayDate(calendarDate(filters.from)):'Início'} a ${filters.to?displayDate(calendarDate(filters.to)):'hoje'}`:'Todos os períodos';
   for(const [id,kind] of [['weeklyPrevious','previous'],['weeklyCurrent','current']]){const period=weekRange(kind,now());$(id).setAttribute('aria-pressed',String(filters.from===period.from&&filters.to===period.to))}
   $('weeklyExport').disabled=exporting||!filtered.length||!validPeriod(filters);
   if(!validPeriod(filters))message('A data inicial deve ser anterior ou igual à data final.',true);
   else if(!filtered.length)message('Nenhum equipamento encontrado para os filtros selecionados.');
   else message('O Excel inclui todos os registros filtrados, nas 13 colunas do modelo da Claro.');renderPage();
  }
  async function download(){
   if(exporting)return;const filters=readFilters(),rows=getRows().filter(r=>matches(r,filters));if(!rows.length||!validPeriod(filters)){refresh();return}
   exporting=true;$('weeklyExport').disabled=true;message('Preparando o Excel…');
   try{
    const [ExcelJS,response]=await Promise.all([excelLibrary(),fetch('./assets/claro-relatorio-modelo.xlsx?v=1')]);
    if(!response.ok)throw new Error('Não foi possível carregar o modelo da Claro. Tente novamente.');
    const workbook=await buildWorkbook(ExcelJS,await response.arrayBuffer(),rows),bytes=await workbook.xlsx.writeBuffer();
    const blob=new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=`Relatorio_Semanal_Claro_${filters.from||'inicio'}_a_${filters.to||iso(brazilToday(now()))}.xlsx`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
    message(`Excel gerado com ${rows.length.toLocaleString('pt-BR')} registros.`);
   }catch(error){console.error('Relatório semanal:',error);message(error.message||'Não foi possível gerar o Excel. Tente novamente.',true)}finally{exporting=false;$('weeklyExport').disabled=!filtered.length||!validPeriod(readFilters())}
  }
  for(const id of ['wDateFrom','wDateTo',...Object.keys(filterFields)])$(id).addEventListener('change',()=>refresh());
  for(const [id,kind] of [['weeklyPrevious','previous'],['weeklyCurrent','current']])$(id).onclick=()=>{const period=weekRange(kind,now());$('wDateFrom').value=period.from;$('wDateTo').value=period.to;refresh()};
  $('weeklyClear').onclick=()=>{for(const id of ['wDateFrom','wDateTo',...Object.keys(filterFields)])$(id).value='';refresh()};
  $('weeklyPrevPage').onclick=()=>{if(page>1){page--;renderPage()}};$('weeklyNextPage').onclick=()=>{if(page*pageSize<filtered.length){page++;renderPage()}};
  $('weeklyExport').onclick=download;refresh();return {refresh};
 }
 const api={calendarDate,brazilToday,weekRange,matches,reportRow,buildWorkbook,init,columns};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.ClaroWeeklyReport=api;
})(typeof window!=='undefined'?window:globalThis);
