export const technicalFields=['fabricante','modelo','partNumber','tipo','velocidade','distancia','comprimentoOnda','fibra','fibras','conector','observacoes'];
export const normalizedRef=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/^NF(?:-?E)?\s*[:#-]?\s*/,'').replace(/[^A-Z0-9]/g,'');
export const operationKey=r=>[r.kind,normalizedRef(r.document),r.product_code.toUpperCase(),r.kind==='purchase'?normalizedRef(r.lot):''].join('|');
const fail=code=>{throw Error(code);};
const text=(value,max=160)=>typeof value==='string'&&value.trim().length<=max?value.trim():fail('INVALID_TRANSCEIVER');
export function validateCatalog(input){
 if(!input||typeof input!=='object'||Array.isArray(input))fail('INVALID_TRANSCEIVER');
 const code=text(input.product_code,64);if(!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(code))fail('INVALID_TRANSCEIVER');
 const fields={};for(const key of technicalFields){fields[key]=input.fields?.[key]==null?'':text(input.fields[key],key==='observacoes'?1000:160);}
 if(fields.fibras&&!/^\d{1,3}$/.test(fields.fibras))fail('INVALID_TRANSCEIVER');
 const revision=input.revision??0;if(!Number.isInteger(revision)||revision<0)fail('INVALID_TRANSCEIVER');return {product_code:code,fields,revision};
}
export function validateOperation(input){
 const product_code=validateCatalog({product_code:input?.product_code}).product_code;
 if(!['purchase','sale'].includes(input?.kind))fail('INVALID_TRANSCEIVER');
 const document=text(input.document,100),counterparty=text(input.counterparty,160),lot=text(input.lot??'',100),date=text(input.date,10);
 if(!normalizedRef(document)||!counterparty||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T12:00:00Z'))||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date)fail('INVALID_TRANSCEIVER');
 const numeric=(v,required=false)=>v==null||v===''?(required?fail('INVALID_TRANSCEIVER'):null):typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1e9?v:fail('INVALID_TRANSCEIVER');
 const quantity=numeric(input.quantity,true),unit_cost=numeric(input.unit_cost,input.kind==='purchase'),unit_price=numeric(input.unit_price,input.kind==='sale');
 if(quantity<=0||quantity>1e8||input.kind==='purchase'&&!normalizedRef(lot)||quantity*Math.max(unit_cost??0,unit_price??0)>1e12)fail('INVALID_TRANSCEIVER');
 const r={product_code,kind:input.kind,document,counterparty,lot,date,quantity,unit_cost,unit_price,notes:text(input.notes??'',1000)};
 return {...r,source_key:operationKey(r)};
}
