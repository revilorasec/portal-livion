// Keep this module identical to the copy deployed with expedicao-api.
const normalized=value=>String(value??'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').replace(/\s*-\s*/g,'-');
export function boxStatusKey(_client,status){return normalized(status);}
export function describeBoxStatus(_client,statuses){
 const values=new Map();let missing=false;
 for(const value of statuses){const key=normalized(value);if(!key){missing=true;continue;}if(!values.has(key))values.set(key,String(value).trim());}
 const keys=[...values.keys()].sort();
 return {valid:!missing&&keys.length>0,combined:keys.length>1,missing,label:keys.map(key=>values.get(key)).join(' / ')};
}
