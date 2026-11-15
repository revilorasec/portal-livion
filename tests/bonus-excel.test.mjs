import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const Engine=require('../desempenho-funcionarios/bonus-engine.js');
const Export=require('../desempenho-funcionarios/bonus-excel.js');
const month=value=>String(value).slice(0,7);
let nextId=0;
const row=(name,status='REPARADO',date='2026-10-15',client='Nokia')=>({id:'ID-'+nextId++,cliente:client,tecnico:name,status,partNumber:'00012345678901234567890',descricao:'=Equipamento de teste',dataDevolucao:date,dataFormula:false,devolvido:true,medicao:'',garantia:'Fora da Garantia'});
const input=()=>({rows:[...Array.from({length:79},()=>row('TÉCNICO A')),...Array.from({length:13},()=>row('TÉCNICO A','IRREPARÁVEL')),
  row('OUTRO'),row('TÉCNICO A','REPARADO','2026-11-15'),row('TÉCNICO A','REPARADO','2026-10-15','Claro')],months:['2026-10'],names:['TÉCNICO A'],client:'Nokia',config:Engine.defaults(),returnMonth:month,createdAt:'2026-11-15T15:00:00Z'});

test('exporta somente cliente, mês e técnicos selecionados e confere valor com equipamentos',()=>{
  const report=Export.buildBonusReport(input(),Engine);
  assert.equal(report.results.length,1);assert.equal(report.results[0].repaired,79);assert.equal(report.results[0].irreparable,13);
  assert.equal(report.total,237);assert.equal(report.equipment.length,92);
  assert.equal(report.equipment.reduce((sum,row)=>sum+row.bonus,0),report.total);
  assert.ok(report.equipment.every(row=>row.name==='TÉCNICO A'&&row.client==='Nokia'&&row.month==='2026-10'));
  assert.equal(report.results[0].repairability,79/92*100);
});
test('exportação mantém cópia das regras e dos dados capturados antes do download',()=>{
  const source=input(),report=Export.buildBonusReport(source,Engine);source.rows[0].descricao='ALTERADO';source.config.bands[2].baseLow=999;
  assert.equal(report.equipment[0].description,'=Equipamento de teste');assert.equal(report.config.bands[2].baseLow,3);assert.equal(report.total,237);
});
test('evolução respeita período, ordem exibida, meses vazios e inativos',()=>{
  const source=input();source.names=['TÉCNICO A','INATIVO'];source.months=['2026-09','2026-10'];source.includeEmpty=true;source.includeInactive=true;
  source.config.technicians.INATIVO='inactive';source.rows.push(row('INATIVO'));source.order=['2026-10|INATIVO','2026-10|TÉCNICO A','2026-09|TÉCNICO A','2026-09|INATIVO'];
  const report=Export.buildBonusReport(source,Engine);assert.equal(report.results.length,4);assert.equal(report.results[0].name,'INATIVO');assert.equal(report.results[0].bonus,0);
  assert.equal(report.results[1].bonus,237);assert.equal(report.results[2].repaired,0);assert.equal(report.total,237);
});
test('sem dados não cria planilha vazia de pagamento e arquivo identifica competência',()=>{
  assert.throws(()=>Export.buildBonusReport({...input(),names:[]},Engine),/Não há dados/);
  const report=Export.buildBonusReport(input(),Engine);assert.equal(Export.fileName(report),'Bonus_2026-10_Nokia_20261115120000.xlsx');
});

test('XLSX real preserva moedas, datas, fórmulas de total e identificadores como texto',{skip:!process.env.EXCELJS_TEST_PACKAGE},async()=>{
  const ExcelJS=require(process.env.EXCELJS_TEST_PACKAGE),report=Export.buildBonusReport(input(),Engine),workbook=await Export.createWorkbook(report,ExcelJS);
  const bytes=await workbook.xlsx.writeBuffer(),loaded=new ExcelJS.Workbook();await loaded.xlsx.load(bytes);
  assert.deepEqual(loaded.worksheets.map(sheet=>sheet.name),['Pagamentos','Equipamentos','Regras']);
  const summary=loaded.getWorksheet('Pagamentos');assert.equal(summary.getCell('C8').value,237);assert.equal(summary.getCell('F8').value,79/92);
  assert.equal(summary.getCell('C5').value.result,237);assert.ok(summary.getCell('A8').value instanceof Date);assert.equal(summary.views[0].ySplit,7);
  const details=loaded.getWorksheet('Equipamentos');assert.equal(details.getCell('G8').value,'00012345678901234567890');assert.equal(details.getCell('H8').value,'=Equipamento de teste');
  assert.equal(typeof details.getCell('H8').value,'string');assert.equal(details.getCell('K100').value.result,237);
  assert.match(summary.getCell('C8').numFmt,/R\$/);assert.equal(summary.getCell('F8').numFmt,'0.00%');
});
