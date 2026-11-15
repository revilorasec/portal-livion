import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {panelEquipmentFields,normalizePanelRows} from '../supabase/functions/desempenho-api/service.mjs';
const Equipment=createRequire(import.meta.url)('../desempenho-funcionarios/bonus-equipment.js');
test('colunas Claro/Nokia, serial e nota como texto, SLA zero e UF abreviada',()=>{
 const claro={cliente:'Claro','Nº de Série':'000012345678901234567890','Dias na Livion':0,'UF - REGIONAL':'São Paulo - SP','Nota Fiscal Claro':'000123'};
 const nokia={cliente:'Nokia','Nº Série':'NK-00099','Dias em Reparo':18,Entidade:'MG','Nº Doc Envio':'009800'};
 for(const row of [claro,nokia]){const api=panelEquipmentFields(row),ui=Equipment.fields({...row,...api});assert.equal(ui.serial,row===claro?'000012345678901234567890':'NK-00099');assert.equal(ui.customerDocument,row===claro?'000123':'009800');assert.equal(ui.uf,row===claro?'SP':'MG');assert.equal(ui.sla,row===claro?'0':'18');}
 assert.equal(Equipment.uf('São Paulo'), '');assert.equal(Equipment.uf('São Paulo - SP'),'SP');
});
test('join por cliente/ID acrescenta apenas metadados e mantém devolução Nokia',()=>{
 const combined=[{cliente:'Claro',id:'1',dataDevolucao:'20/10/2026',status:'REPARADO'},{cliente:'Nokia',id:'1',dataDevolucao:'21/10/2026',status:'REPARADO'}];
 const rows=normalizePanelRows('combined',combined,[{ID:'1','Data Expedição':'20/10/2026','Nº de Série':'C','UF - REGIONAL':'São Paulo - SP','Nota Fiscal Claro':'1','Dias na Livion':0}],[{ID:'1','Nº Série':'N',Entidade:'MG','Nº Doc Envio':'2','Dias em Reparo':7,'Data eSmart (Devolução)':'01/01/1999'}]);
 assert.deepEqual(rows.map(r=>r.serial),['C','N']);assert.equal(rows[1].dataDevolucao,'21/10/2026');assert.equal(rows[0].sla,0);
});
test('registros anteriores recebem metadados por ID sem alterar valores, datas ou SLAs já registrados',()=>{
 const equipment=[{client:'Claro',id:'1',date:'20/10/2026',sla:'5'},{client:'Nokia',id:'1',date:'21/10/2026'}],copy=JSON.stringify(equipment);
 const enriched=Equipment.enrich(equipment,[{cliente:'Claro',id:'1',serial:'C',sla:99,uf:'SP',customerDocument:'001'},{cliente:'Nokia',id:'1',serial:'N',sla:18,uf:'MG',customerDocument:'002'}]);
 assert.equal(JSON.stringify(equipment),copy);assert.equal(enriched[0].sla,'5');assert.equal(enriched[0].date,'20/10/2026');assert.equal(enriched[1].sla,'18');assert.equal(enriched[1].serial,'N');
});
