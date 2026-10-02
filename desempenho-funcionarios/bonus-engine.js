(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.BonusEngine=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const LEVELS=['low','medium','high'];
  const LEVEL_LABELS=['Baixa','Média','Alta'];
  const HIGH_REPAIRABILITY_THRESHOLD=80;
  const roundMoney=value=>Math.round((Number(value)||0)*100+Number.EPSILON)/100;
  const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
  const clone=value=>JSON.parse(JSON.stringify(value));
  const canonicalPn=value=>String(value??'').normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]/g,'');

  function defaults(){
    return {
      version:6,
      mediumPct:25,
      highComplexityPct:50,
      highRepairabilityPct:0,
      bands:[
        {min:0,max:60,baseLow:0},
        {min:61,max:75,baseLow:2.5},
        {min:76,max:90,baseLow:3},
        {min:91,max:105,baseLow:3.5},
        {min:106,max:null,baseLow:4}
      ],
      pnLevels:{},
      technicians:{}
    };
  }

  function migrateConfig(raw){
    const base=defaults(),source=raw&&typeof raw==='object'?clone(raw):{};
    const multipliers=Array.isArray(source.multipliers)?source.multipliers:base.multipliers;
    const mediumPct=source.mediumPct??((finite(multipliers?.[1],1)-1)*100);
    const highComplexityPct=source.highComplexityPct??((finite(multipliers?.[2],1)-1)*100);
    const highRepairabilityPct=source.highRepairabilityPct??0;
    const oldBands=Array.isArray(source.bands)&&source.bands.length?source.bands:base.bands;
    const bands=oldBands.map((band,index)=>({
      min:Math.max(0,Math.trunc(finite(band.min,index?0:0))),
      max:band.max===null||band.max===''?null:Math.max(0,Math.trunc(finite(band.max,0))),
      baseLow:Math.max(0,finite(band.baseLow??band.baseStandard??band.standard??band.base??band.baseHigh??band.high,0))
    })).sort((a,b)=>a.min-b.min);
    if(bands.length)bands[0].baseLow=0;
    const pnLevels={},pnConflicts=new Set();
    for(const [storedKey,storedLevel] of Object.entries(source.pnLevels&&typeof source.pnLevels==='object'&&!Array.isArray(source.pnLevels)?source.pnLevels:{})){
      const key=canonicalPn(String(storedKey).includes('|')?String(storedKey).split('|').at(-1):storedKey),level=Number(storedLevel);
      if(!key||![0,1,2].includes(level)||pnConflicts.has(key))continue;
      if(Object.prototype.hasOwnProperty.call(pnLevels,key)&&pnLevels[key]!==level){delete pnLevels[key];pnConflicts.add(key)}
      else pnLevels[key]=level;
    }
    return {
      version:6,
      mediumPct:Math.max(0,finite(mediumPct,base.mediumPct)),
      highComplexityPct:Math.max(0,finite(highComplexityPct,base.highComplexityPct)),
      highRepairabilityPct:Math.max(0,finite(highRepairabilityPct,base.highRepairabilityPct)),
      bands,
      pnLevels,
      technicians:source.technicians&&typeof source.technicians==='object'&&!Array.isArray(source.technicians)?source.technicians:{}
    };
  }

  function validateConfig(raw){
    const config=migrateConfig(raw),warnings=[],bands=[...config.bands].sort((a,b)=>a.min-b.min);
    if(!bands.length)warnings.push('Cadastre pelo menos a Faixa 0.');
    if(bands.length&&bands[0].min!==0)warnings.push('A Faixa 0 deve começar em 0.');
    if(bands.length&&bands[0].baseLow!==0)warnings.push('A Faixa 0 deve permanecer com valor zero.');
    for(let index=0;index<bands.length;index++){
      const band=bands[index];
      if(band.max!==null&&band.max<band.min)warnings.push(`Faixa ${index}: o máximo é menor que o mínimo.`);
      if(index){
        const previous=bands[index-1];
        if(previous.max===null)warnings.push(`Faixa ${index-1}: somente a última faixa pode ficar sem máximo.`);
        else if(band.min<=previous.max)warnings.push(`Faixas ${index-1} e ${index} se sobrepõem na quantidade ${band.min}.`);
        else if(band.min>previous.max+1)warnings.push(`Existe uma lacuna entre ${previous.max+1} e ${band.min-1} reparadas.`);
      }
    }
    if(bands.length&&bands.at(-1).max!==null)warnings.push('A última faixa deve ficar sem máximo para cobrir todas as quantidades.');
    return {config,warnings};
  }

  const techIsActive=(config,name)=>config.technicians?.[name]!=='inactive';
  function levelFor(row,config){
    const key=canonicalPn(row.partNumber);
    const value=config.pnLevels?.[key];
    return [0,1,2].includes(Number(value))?Number(value):null;
  }
  function unitRate(config,band,level,repairability=null){
    const base=finite(band.baseLow,0);
    const increase=level===1?config.mediumPct:level===2?config.highComplexityPct:0;
    const repairabilityIncrease=repairability!==null&&repairability>=HIGH_REPAIRABILITY_THRESHOLD?config.highRepairabilityPct:0;
    return roundMoney(base*(1+increase/100)*(1+repairabilityIncrease/100));
  }
  function rowIsEligible(row,month,client,returnMonth){
    return row&&row.devolvido&&!row.dataFormula&&returnMonth(row.dataDevolucao)===month&&(!client||row.cliente===client)&&['REPARADO','IRREPARÁVEL'].includes(row.status)&&row.tecnico;
  }

  function calculateMonth(rows,month,rawConfig,options={}){
    const {config,warnings}=validateConfig(rawConfig),client=options.client||'',returnMonth=options.returnMonth||(()=>''),selected=options.selectedTechs?new Set(options.selectedTechs):null,includeInactive=options.includeInactive===true,groups=new Map();
    for(const row of rows){
      if(!rowIsEligible(row,month,client,returnMonth))continue;
      if(selected&&!selected.has(row.tecnico))continue;
      if(!includeInactive&&!techIsActive(config,row.tecnico))continue;
      const group=groups.get(row.tecnico)||{name:row.tecnico,repaired:0,irreparable:0,claro:0,nokia:0,levels:[0,0,0],unclassified:0,repairedRows:[]};
      if(row.status==='REPARADO'){
        group.repaired++;
        group.repairedRows.push(row);
        const level=levelFor(row,config);
        if(level===null)group.unclassified++;else group.levels[level]++;
      }else group.irreparable++;
      const clientKey=String(row.cliente||'').toLowerCase();
      if(clientKey==='claro'||clientKey==='nokia')group[clientKey]++;
      groups.set(row.tecnico,group);
    }
    return [...groups.values()].map(group=>{
      const total=group.repaired+group.irreparable;
      const repairability=total?group.repaired/total*100:null;
      const band=config.bands.find(item=>group.repaired>=item.min&&(item.max===null||group.repaired<=item.max))||null;
      const bandIndex=band?config.bands.indexOf(band):-1;
      const active=techIsActive(config,group.name);
      const pnMap=new Map();
      for(const row of group.repairedRows){
        const key=canonicalPn(row.partNumber),level=levelFor(row,config),entry=pnMap.get(key)||{key,partNumber:key,clientes:[],descricao:row.descricao||'',quantity:0,level,unitRate:0,subtotal:0};
        entry.quantity++;
        if(row.cliente&&!entry.clientes.includes(row.cliente))entry.clientes.push(row.cliente);
        if(!entry.descricao&&row.descricao)entry.descricao=row.descricao;
        pnMap.set(key,entry);
      }
      const reasons=[];
      if(warnings.length)reasons.push('A configuração das faixas possui erro e precisa ser corrigida.');
      if(!active)reasons.push('O técnico está inativo.');
      if(!group.repaired)reasons.push('Não há peças reparadas elegíveis no período.');
      if(!band)reasons.push('A quantidade não está coberta por uma faixa válida.');
      if(bandIndex===0)reasons.push('Faixa 0 — Sem pagamento de bônus.');
      if(group.unclassified)reasons.push(`${group.unclassified} equipamento(s) sem classificação de complexidade foram calculados pelo valor da Baixa.`);
      const highRepairabilityApplied=repairability!==null&&repairability>=HIGH_REPAIRABILITY_THRESHOLD&&config.highRepairabilityPct>0;
      if(highRepairabilityApplied)reasons.push(`Acréscimo de ${config.highRepairabilityPct.toFixed(2).replace('.',',')}% aplicado por reparabilidade igual ou superior a ${HIGH_REPAIRABILITY_THRESHOLD}%.`);
      const payable=!warnings.length&&active&&group.repaired>0&&band&&bandIndex>0;
      const complexity=LEVELS.map((key,level)=>{
        const quantity=group.levels[level]+(level===0?group.unclassified:0),rate=payable?unitRate(config,band,level,repairability):0;
        return {key,label:LEVEL_LABELS[level],level,quantity,unitRate:rate,subtotal:roundMoney(quantity*rate)};
      });
      for(const entry of pnMap.values()){
        entry.unitRate=payable?unitRate(config,band,entry.level===null?0:entry.level,repairability):0;
        entry.subtotal=roundMoney(entry.quantity*entry.unitRate);
      }
      const bonus=payable?roundMoney(complexity.reduce((sum,item)=>sum+item.subtotal,0)):0;
      const rate=group.repaired?roundMoney(bonus/group.repaired):0;
      return {...group,repairability,highRepairabilityApplied,highRepairabilityThreshold:HIGH_REPAIRABILITY_THRESHOLD,band,bandIndex,active,payable,complexity,partNumbers:[...pnMap.values()].sort((a,b)=>b.quantity-a.quantity||a.partNumber.localeCompare(b.partNumber,'pt-BR')),reasons,rate,bonus,configWarnings:warnings};
    });
  }

  return {LEVELS,LEVEL_LABELS,HIGH_REPAIRABILITY_THRESHOLD,roundMoney,canonicalPn,defaults,migrateConfig,validateConfig,techIsActive,levelFor,unitRate,calculateMonth};
});
