import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const report=require('../claro-weekly-report.js');
const reference=new Date('2026-11-25T18:00:00Z');

test('atalhos seguem segunda–sexta anterior e segunda–hoje em Brasília',()=>{
 assert.deepEqual(report.weekRange('previous',reference),{from:'2026-11-16',to:'2026-11-20'});
 assert.deepEqual(report.weekRange('current',reference),{from:'2026-11-23',to:'2026-11-25'});
 assert.deepEqual(report.weekRange('previous',new Date('2027-01-04T15:00:00Z')),{from:'2026-12-28',to:'2027-01-01'});
 assert.deepEqual(report.weekRange('current',new Date('2026-11-23T01:00:00Z')),{from:'2026-11-16',to:'2026-11-22'});
 assert.deepEqual(report.weekRange('current',new Date('2026-11-23T15:00:00Z')),{from:'2026-11-23',to:'2026-11-23'});
});
test('recebimento é inclusivo, valida datas e combina todos os filtros',()=>{
 const row={'Data recebimento na Livion':'20/11/2026 23:59:59','Onde está':'CLARO',Status:'03-REPARADO',REGIONAL:'Bahia','UF - REGIONAL':'Bahia - BA',CD:'Salvador'};
 const filters={...report.weekRange('previous',reference),wLocation:'CLARO',wStatus:'03-REPARADO',wRegional:'Bahia',wUF:'Bahia - BA',wCD:'Salvador'};
 assert.equal(report.matches(row,filters),true);
 for(const id of ['wLocation','wStatus','wRegional','wUF','wCD'])assert.equal(report.matches(row,{...filters,[id]:'outro'}),false);
 for(const value of ['15/11/2026','21/11/2026','23/11/2026','','31/11/2026'])assert.equal(report.matches({...row,'Data recebimento na Livion':value},filters),false);
 assert.equal(report.matches(row,{from:'2026-11-25',to:'2026-11-20'}),false);
 assert.equal(report.matches({...row,'Data recebimento na Livion':'16/11/2026'},filters),true);
 assert.equal(report.matches({...row,'Data recebimento na Livion':'2026-11-20T23:30:00'},filters),true);
});
test('mapeamento mantém 13 colunas, fornecedor fixo, AA duplicada e fórmula vazia',()=>{
 const row={'Centro':'0007193','Nota Fiscal Claro':'0000123','Data Emisão Nota fiscal':'10/11/2026','Nº de Série':'000000001234567890123456','BP/SGP/NS (Nº EQUIPAMENTO)':'00000999','Nota fiscal retorno':'000345','Data nota fiscal de retorno':'24/11/2026','Nº de Série Devolvido':'=SERIAL-TEXTO','Data Entrega na Claro':'25/11/2026',Status:'03-REPARADO','Detalhe do Status':'Concluído',_entregaFormula:true};
 const values=report.reportRow(row);assert.equal(values.length,13);assert.equal(values[1],'Livion Solutions');assert.equal(values[5],values[9]);assert.equal(values[10],'');assert.equal(values[4],row['Nº de Série']);
 assert.equal(report.reportRow({...row,_entregaFormula:false})[10],'25/11/2026');
 assert.equal(report.reportRow({...row,_entregaFormula:false,'Data Entrega na Claro':'=HOJE()'})[10],'');
});
test('xlsx preserva cabeçalhos, larguras e estilos do modelo; remove instruções e resíduos',{skip:!process.env.EXCELJS_TEST_PACKAGE},async()=>{
 const ExcelJS=require(process.env.EXCELJS_TEST_PACKAGE),bytes=readFileSync(new URL('../assets/claro-relatorio-modelo.xlsx',import.meta.url));
 const original=new ExcelJS.Workbook();await original.xlsx.load(bytes);const template=original.worksheets[0];
 const row={'Centro':'0007193','Nota Fiscal Claro':'000123','Data Emisão Nota fiscal':'10/11/2026','Nº de Série':'00000012345678901234567890','BP/SGP/NS (Nº EQUIPAMENTO)':'0009','Nº de Série Devolvido':'=TEXTO','Data Entrega na Claro':'25/11/2026',_entregaFormula:true};
 const book=await report.buildWorkbook(ExcelJS,bytes,[row,{...row,_entregaFormula:false}]);
 const reloaded=new ExcelJS.Workbook();await reloaded.xlsx.load(await book.xlsx.writeBuffer());const sheet=reloaded.worksheets[0];
 assert.equal(sheet.rowCount,3);assert.equal(sheet.columnCount,13);assert.equal(reloaded.worksheets.length,1);
 for(let i=1;i<=13;i++){assert.equal(sheet.getCell(1,i).value,i===4?'Data NF Claro':template.getCell(2,i).value);assert.deepEqual(sheet.getCell(1,i).style,template.getCell(2,i).style);assert.equal(sheet.getColumn(i).width,template.getColumn(i).width)}
 assert.equal(sheet.getCell('B2').value,'Livion Solutions');assert.equal(sheet.getCell('B3').value,'Livion Solutions');assert.equal(sheet.getCell('E2').value,row['Nº de Série']);assert.equal(sheet.getCell('I2').value,'=TEXTO');assert.equal(sheet.getCell('I2').type,ExcelJS.ValueType.String);
 assert.ok(!sheet.getCell('K2').value);assert.equal(sheet.getCell('K3').value.toISOString().slice(0,10),'2026-11-25');assert.equal(sheet.views[0].ySplit,1);
 const empty=await report.buildWorkbook(ExcelJS,bytes,[]);assert.equal(empty.worksheets[0].rowCount,1);
});
