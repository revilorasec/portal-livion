(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else{root.PerformanceExcel=api;api.install(root)}
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const MONEY='"R$" #,##0.00;[Red]("R$" #,##0.00);"R$" 0.00';
  const PERCENT='0.00%';
  const collator=new Intl.Collator('pt-BR',{sensitivity:'base',numeric:true});
  const round=value=>Math.round((Number(value)||0)*100)/100;
  const dateLabel=value=>new Date(value).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'});
  const monthLabel=value=>new Date(value+'-01T12:00:00Z').toLocaleDateString('pt-BR',{month:'long',year:'numeric',timeZone:'America/Sao_Paulo'});
  function excelDate(value){
    const text=String(value||'').trim();
    const iso=text.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/),br=text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if(iso)return new Date(Date.UTC(+iso[1],+iso[2]-1,+(iso[3]||1)));
    if(br)return new Date(Date.UTC(+br[3],+br[2]-1,+br[1]));
    return text;
  }
  function buildBonusReport(input,Engine){
    const config=Engine.migrateConfig(input.config),months=[...input.months],names=[...input.names],selected=new Set(names);
    const rows=JSON.parse(JSON.stringify(input.rows)).filter(row=>selected.has(row.tecnico)&&row.devolvido&&!row.dataFormula&&
      months.includes(input.returnMonth(row.dataDevolucao))&&(!input.client||row.cliente===input.client)&&['REPARADO','IRREPARÁVEL'].includes(row.status));
    const results=months.flatMap(month=>{
      const calculated=Engine.calculateMonth(rows,month,config,{client:input.client,returnMonth:input.returnMonth,selectedTechs:names,includeInactive:input.includeInactive===true});
      if(!input.includeEmpty)return calculated.map(result=>({...result,month}));
      const byName=new Map(calculated.map(result=>[result.name,result]));
      return names.map(name=>({...byName.get(name)||{name,repaired:0,irreparable:0,repairability:null,bonus:0,rate:0,band:null,bandIndex:-1,payable:false,active:Engine.techIsActive(config,name),reasons:['Sem devoluções elegíveis no período.'],unclassified:0},month}));
    });
    const order=new Map((input.order||[]).map((key,index)=>[key,index]));
    results.sort((a,b)=>(order.get(a.month+'|'+a.name)??Number.MAX_SAFE_INTEGER)-(order.get(b.month+'|'+b.name)??Number.MAX_SAFE_INTEGER)||a.month.localeCompare(b.month)||collator.compare(a.name,b.name));
    if(!results.length)throw Error('Não há dados nos filtros escolhidos para exportar.');
    const byKey=new Map(results.map(result=>[result.month+'|'+result.name,result]));
    const equipment=rows.filter(row=>byKey.has(input.returnMonth(row.dataDevolucao)+'|'+row.tecnico)).map(row=>{
      const month=input.returnMonth(row.dataDevolucao),result=byKey.get(month+'|'+row.tecnico),level=Engine.levelFor(row,config),repaired=row.status==='REPARADO';
      const unitRate=repaired&&result.payable?Engine.unitRate(config,result.band,level===null?0:level,result.repairability):0;
      return {month,name:row.tecnico,client:row.cliente,id:row.id,date:row.dataDevolucao,status:row.status,pn:row.partNumber,
        description:row.descricao||'',level:!repaired?'Não se aplica':level===null?'Não classificado (Baixa)':Engine.LEVEL_LABELS[level],
        unitRate,bonus:unitRate,measurement:row.medicao||'',warranty:row.garantia||''};
    });
    equipment.sort((a,b)=>(order.get(a.month+'|'+a.name)??0)-(order.get(b.month+'|'+b.name)??0)||a.month.localeCompare(b.month)||collator.compare(a.name,b.name)||collator.compare(a.id,b.id));
    for(const result of results){
      const detail=equipment.filter(row=>row.month===result.month&&row.name===result.name);
      if(detail.filter(row=>row.status==='REPARADO').length!==result.repaired||detail.filter(row=>row.status==='IRREPARÁVEL').length!==result.irreparable||round(detail.reduce((sum,row)=>sum+row.bonus,0))!==round(result.bonus))
        throw Error('O detalhamento não confere com o bônus de '+result.name+'. Atualize os dados antes de exportar.');
    }
    return {kind:'bonus',title:input.includeEmpty?'Bônus por devolução — evolução mensal':'Bônus por devolução — pagamentos',
      createdAt:input.createdAt||new Date().toISOString(),client:input.client||'Claro + Nokia',months,names,config,results,equipment,
      total:round(results.reduce((sum,result)=>sum+result.bonus,0)),sourceStatus:input.sourceStatus||'',configStatus:input.configStatus||'',
      nokiaDateSource:typeof Engine.bonusReturnRow==='function'?'Coluna U — Data da Expedição':'Coluna W — Data eSmart (Devolução)'};
  }

  function baseSheet(workbook,name,title,context,widths){
    const sheet=workbook.addWorksheet(name,{views:[{state:'frozen',xSplit:2,ySplit:7,showGridLines:false}],pageSetup:{paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,showGridLines:false,printTitlesRow:'1:7'}});
    const last=widths.length;
    sheet.columns=widths.map(width=>({width}));
    sheet.properties.defaultRowHeight=21;
    const merged=(row,text)=>{sheet.mergeCells(row,1,row,last);sheet.getCell(row,1).value=text;sheet.getCell(row,1).alignment={vertical:'middle',wrapText:true}};
    merged(1,'LIVION SOLUTIONS · '+title);sheet.getRow(1).height=34;sheet.getCell('A1').font={name:'Aptos',size:17,bold:true,color:{argb:'FF153F73'}};
    merged(2,context.filters);sheet.getRow(2).height=30;sheet.getCell('A2').font={name:'Aptos',size:11,bold:true,color:{argb:'FF153F73'}};
    merged(3,'Exportado em '+dateLabel(context.createdAt)+' (horário de Brasília)');
    merged(4,context.note||'Fonte: Desempenho Técnico do Portal Livion. Valores calculados na data da exportação.');sheet.getRow(4).height=30;
    sheet.headerFooter.oddFooter='&LPortal Livion&RPágina &P de &N';
    return sheet;
  }
  function table(sheet,name,headers,rows,formats={}){
    sheet.addTable({name,ref:'A7',headerRow:true,totalsRow:false,style:{theme:'TableStyleMedium2',showRowStripes:true},columns:headers.map(name=>({name})),rows:rows.length?rows:[headers.map(()=>null)]});
    sheet.getRow(7).height=32;
    sheet.getRow(7).eachCell(cell=>{cell.font={name:'Aptos',bold:true,size:10,color:{argb:'FFFFFFFF'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF153F73'}};cell.alignment={vertical:'middle',horizontal:'center',wrapText:true}});
    for(let row=8;row<8+rows.length;row++){
      sheet.getRow(row).eachCell({includeEmpty:true},(cell,column)=>{cell.font={name:'Aptos',size:11};cell.alignment={vertical:'middle',wrapText:true};if(formats[column])cell.numFmt=formats[column]});
      sheet.getRow(row).height=Math.min(409,Math.max(30,...rows[row-8].map((value,index)=>typeof value==='string'?Math.ceil(value.length/(sheet.getColumn(index+1).width*.9))*15+6:0)));
    }
  }
  function totalRow(sheet,row,values){
    values.forEach((value,index)=>{const cell=sheet.getCell(row,index+1);cell.value=value;cell.font={name:'Aptos',bold:true,size:11,color:{argb:'FF153F73'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFEAF2FC'}}});
    sheet.getRow(row).height=28;
  }
  function sumFormula(column,end,result){return {formula:`SUM(${column}8:${column}${end})`,result}}
  async function createWorkbook(report,ExcelJS){
    const workbook=new ExcelJS.Workbook();workbook.creator='Portal Livion';workbook.created=new Date(report.createdAt);workbook.modified=new Date(report.createdAt);workbook.calcProperties.fullCalcOnLoad=true;
    if(report.kind!=='bonus'){
      report.tables.forEach((data,index)=>{
        const name=(data.name||'Dados '+(index+1)).replace(/[\\/*?:\[\]]/g,' ').slice(0,27)+' '+(index+1);
        const sheet=baseSheet(workbook,name,report.title,{...report,filters:report.filters},data.headers.map((header,i)=>i===0?28:Math.min(42,Math.max(18,header.length+3))));
        table(sheet,'DadosFiltrados'+index,data.headers,data.rows,data.formats);
      });return workbook;
    }
    const period=report.months.length===1?monthLabel(report.months[0]):monthLabel(report.months[0])+' a '+monthLabel(report.months.at(-1));
    const filters=period+' · '+report.client+' · '+report.names.length+' técnico(s) selecionado(s)';
    const context={createdAt:report.createdAt,filters,note:'Fonte: Desempenho Técnico do Portal Livion. Valores exibidos na data da exportação.'+(report.configStatus?' Regras: '+report.configStatus:'')};
    const payment=baseSheet(workbook,'Pagamentos',report.title,context,[22,29,19,14,15,19,18,21,48]);
    const paymentRows=report.results.map(result=>[excelDate(result.month),result.name,result.bonus,result.repaired,result.irreparable,
      result.repairability===null?null:result.repairability/100,result.band?`Faixa ${result.bandIndex}`:'Sem faixa',result.rate,result.reasons.join(' ')]);
    table(payment,'BonusPorTecnico',['Competência','Técnico','Bônus a pagar (R$)','Reparadas','Irreparáveis','Reparabilidade','Faixa aplicada','Valor médio/peça (R$)','Observações do cálculo'],paymentRows,{1:'[$-416]mmmm/yyyy',3:MONEY,6:PERCENT,8:MONEY});
    const last=7+paymentRows.length,total=last+1,repaired=report.results.reduce((sum,r)=>sum+r.repaired,0),irreparable=report.results.reduce((sum,r)=>sum+r.irreparable,0);
    totalRow(payment,total,['TOTAL','',sumFormula('C',last,report.total),sumFormula('D',last,repaired),sumFormula('E',last,irreparable),
      {formula:`IF(D${total}+E${total}=0,0,D${total}/(D${total}+E${total}))`,result:repaired+irreparable?repaired/(repaired+irreparable):0},'',null,'']);
    payment.getCell(total,3).numFmt=MONEY;payment.getCell(total,6).numFmt=PERCENT;
    payment.mergeCells('A5:B5');payment.getCell('A5').value='TOTAL DO BÔNUS';payment.getCell('A5').font={bold:true,color:{argb:'FF153F73'},size:12};
    payment.getCell('C5').value={formula:'C'+total,result:report.total};payment.getCell('C5').numFmt=MONEY;payment.getCell('C5').font={size:17,bold:true,color:{argb:'FF118A63'}};payment.getRow(5).height=32;
    const details=baseSheet(workbook,'Equipamentos','Equipamentos considerados no bônus',context,[22,29,17,25,20,21,24,45,27,22,22,25,23]);
    const equipmentRows=report.equipment.map(row=>[excelDate(row.month),row.name,row.client,row.id,excelDate(row.date),row.status,row.pn,row.description,row.level,row.unitRate,row.bonus,row.measurement,row.warranty]);
    table(details,'EquipamentosDoBonus',['Competência','Técnico','Cliente','ID','Data da competência','Status','Part Number','Descrição','Complexidade','Valor unitário (R$)','Bônus da peça (R$)','Medição de origem','Garantia'],equipmentRows,{1:'[$-416]mmmm/yyyy',5:'dd/mm/yyyy',10:MONEY,11:MONEY});
    const detailLast=7+Math.max(equipmentRows.length,1);
    totalRow(details,detailLast+1,['TOTAL','','','','','','','','','',sumFormula('K',detailLast,report.total)]);details.getCell(detailLast+1,11).numFmt=MONEY;
    const rules=baseSheet(workbook,'Regras','Regras usadas no cálculo',context,[35,24,24,24,24,24]);
    const config=report.config,ruleRows=[
      ['Cliente',report.client],['Técnicos selecionados',report.names.join(', ')],['Origem da consulta',report.sourceStatus||'Dados exibidos no app'],
      ['Nokia',report.nokiaDateSource],['Claro','Coluna AJ — Data Expedição'],['Datas com fórmula','Não entram no cálculo'],
      ['Reparabilidade','Reparadas / (reparadas + irreparáveis)'],['PN não classificado','Calculado pelo valor da complexidade Baixa'],
      ['Acréscimo da Média',config.mediumPct/100],['Acréscimo da Alta',config.highComplexityPct/100],['Acréscimo por reparabilidade ≥ 80%',config.highRepairabilityPct/100],['Situação das regras',report.configStatus||'Configuração exibida na exportação']
    ];
    ruleRows.forEach(([label,value],index)=>{const row=index+7;rules.getCell(row,1).value=label;rules.mergeCells(row,2,row,6);const cell=rules.getCell(row,2);cell.value=value;cell.alignment={wrapText:true,vertical:'middle'};if(typeof value==='number')cell.numFmt=PERCENT;rules.getRow(row).height=label==='Técnicos selecionados'?Math.max(32,Math.ceil(String(value).length/100)*20):30});
    const header=ruleRows.length+9;rules.getRow(header).values=['Faixa','Mín. reparadas','Máx. reparadas','Baixa (R$)','Média (R$)','Alta (R$)'];rules.getRow(header).eachCell(cell=>{cell.font={bold:true,color:{argb:'FFFFFFFF'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF153F73'}}});
    config.bands.forEach((band,index)=>{const row=rules.getRow(header+index+1);row.values=['Faixa '+index,band.min,band.max===null?'Sem limite':band.max,band.baseLow,round(band.baseLow*(1+config.mediumPct/100)),round(band.baseLow*(1+config.highComplexityPct/100))];[4,5,6].forEach(column=>row.getCell(column).numFmt=MONEY)});
    return workbook;
  }

  let libraryPromise;
  function loadLibrary(win){
    if(win.ExcelJS)return Promise.resolve(win.ExcelJS);
    if(libraryPromise)return libraryPromise;
    libraryPromise=new Promise((resolve,reject)=>{
      const script=win.document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';script.crossOrigin='anonymous';
      const timer=setTimeout(()=>{script.remove();libraryPromise=null;reject(Error('A biblioteca de Excel não carregou. Confira a conexão e tente novamente.'))},25000);
      script.onload=()=>{clearTimeout(timer);if(win.ExcelJS)resolve(win.ExcelJS);else{libraryPromise=null;reject(Error('Não foi possível iniciar a exportação Excel.'))}};
      script.onerror=()=>{clearTimeout(timer);script.remove();libraryPromise=null;reject(Error('Não foi possível carregar a exportação Excel. Confira a conexão e tente novamente.'))};win.document.head.appendChild(script);
    });return libraryPromise;
  }
  function fileName(report){
    const stamp=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date(report.createdAt)).replace(/[^0-9]/g,'');
    const period=report.kind==='bonus'?report.months.length===1?report.months[0]:report.months[0]+'_a_'+report.months.at(-1):'filtrado';
    return (report.kind==='bonus'?'Bonus_':'Desempenho_')+period+'_'+String(report.client||report.tab||'Todos').replace(/[^A-Za-z0-9_-]/g,'_')+'_'+stamp+'.xlsx';
  }
  function install(win){
    const doc=win.document;
    function bonusSnapshot(trend){
      if(presentationMode)throw Error('Encerre o modo apresentação para exportar o bônus com os nomes dos técnicos.');
      const month=doc.getElementById('bonusMonth').value,client=doc.getElementById('bonusClient').value;
      const months=trend?bonusMonthSequence(month,Number(doc.getElementById('bonusTrendMonths').value)||10):[month];
      const names=trend?[...bonusTrendTechs]:[...activeTechs];
      const byLabel=new Map(months.map(m=>[medLabel(m),m]));
      const order=trend?[...doc.querySelectorAll('#bonusTrendTable tbody tr')].filter(row=>row.cells.length===6).map(row=>byLabel.get(row.cells[0].textContent.trim())+'|'+row.cells[1].textContent.trim()):
        [...doc.querySelectorAll('#bonusTable tbody tr')].filter(row=>row.querySelector('[data-bonus-detail]')).map(row=>month+'|'+row.querySelector('[data-bonus-detail]').dataset.bonusDetail);
      return buildBonusReport({rows:months.flatMap(m=>bonusRowsForMonth(m,client)),months,client,names,config:savedBonusConfig(),returnMonth,
        includeInactive:trend&&doc.getElementById('bonusTrendIncludeInactive').checked,includeEmpty:trend,order,sourceStatus:doc.getElementById('sourceStatus').textContent,configStatus:doc.getElementById('bonusSettingsStatus')?.textContent||''},win.BonusEngine);
    }
    function viewSnapshot(){
      if(presentationMode)throw Error('Encerre o modo apresentação para exportar os dados identificados.');
      const tab=doc.querySelector('.tab.active')?.dataset.tab||'overview';
      if(tab==='bonus')return bonusSnapshot(false);
      const panel=doc.getElementById('tab-'+tab),tables=[];
      for(const html of panel.querySelectorAll('table')){
        if(!html.getClientRects().length||!html.tHead)continue;
        const headers=[...html.tHead.rows[0].cells].map(cell=>cell.textContent.replace(/\s*[▲▼↕]$/u,'').trim());
        const columns=headers.map((text,index)=>({text,index})).filter(column=>column.text&&column.text!=='Ação');
        const formats={};
        const rows=[...html.tBodies].flatMap(body=>[...body.rows]).filter(row=>row.cells.length===headers.length&&[...row.cells].every(cell=>cell.colSpan===1)).map(row=>columns.map((column,index)=>{
          const cell=row.cells[column.index],select=cell.querySelector('select'),text=(select?select.selectedOptions[0]?.textContent:cell.textContent)||'';
          const value=win.PerformanceTableSort?.sortValue(text,column.text)??text;
          if(typeof value==='number'&&text.includes('%')){formats[index+1]=PERCENT;return value/100}
          if(typeof value==='number'&&/R\$/.test(text))formats[index+1]=MONEY;
          return typeof value==='number'?value:text;
        }));
        if(rows.length)tables.push({name:html.closest('.card')?.querySelector('h2,h3')?.textContent||'Dados',headers:columns.map(c=>c.text),rows,formats});
      }
      if(!tables.length)throw Error('Não há dados visíveis nesta aba para exportar.');
      const filters=[...doc.querySelectorAll('.filters select')].map(select=>select.selectedOptions[0]?.textContent).filter(Boolean);
      if(doc.getElementById('fSearch').value)filters.push('Busca: '+doc.getElementById('fSearch').value);
      filters.push('Técnicos marcados: '+[...activeTechs].join(', '));
      return {kind:'view',tab,title:doc.querySelector('.tab.active').textContent,filters:filters.join(' · '),createdAt:new Date().toISOString(),tables};
    }
    async function download(button,trend=false){
      const text=button.textContent;
      try{
        const report=trend?bonusSnapshot(true):viewSnapshot();
        doc.querySelectorAll('[data-export-excel]').forEach(node=>node.disabled=true);button.textContent='Gerando Excel…';
        const ExcelJS=await loadLibrary(win),workbook=await createWorkbook(report,ExcelJS),buffer=await workbook.xlsx.writeBuffer();
        const url=win.URL.createObjectURL(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})),anchor=doc.createElement('a');anchor.href=url;anchor.download=fileName(report);doc.body.appendChild(anchor);anchor.click();anchor.remove();setTimeout(()=>win.URL.revokeObjectURL(url),10000);
      }catch(error){win.alert(error.message||'Não foi possível exportar os dados.');}
      finally{doc.querySelectorAll('[data-export-excel]').forEach(node=>node.disabled=false);button.textContent=text;}
    }
    function button(parent,id,label,trend=false){if(!parent||doc.getElementById(id))return;const node=doc.createElement('button');node.id=id;node.className='btn alt';node.dataset.exportExcel='true';node.textContent=label;node.onclick=()=>download(node,trend);parent.appendChild(node)}
    button(doc.querySelector('header .actions'),'exportPerformanceExcel','Exportar Excel');
    button(doc.getElementById('bonusGrandTotal')?.closest('.toolbar'),'exportBonusExcel','Exportar mês (Excel)');
    button(doc.getElementById('bonusTrendCount')?.closest('.toolbar'),'exportBonusPeriodExcel','Exportar período (Excel)',true);
  }
  return {buildBonusReport,createWorkbook,fileName,excelDate,install};
});
