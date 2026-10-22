export const states = Object.freeze({AC:'Acre',AL:'Alagoas',AP:'Amapá',AM:'Amazonas',BA:'Bahia',CE:'Ceará',DF:'Distrito Federal',ES:'Espírito Santo',GO:'Goiás',MA:'Maranhão',MT:'Mato Grosso',MS:'Mato Grosso do Sul',MG:'Minas Gerais',PA:'Pará',PB:'Paraíba',PR:'Paraná',PE:'Pernambuco',PI:'Piauí',RJ:'Rio de Janeiro',RN:'Rio Grande do Norte',RS:'Rio Grande do Sul',RO:'Rondônia',RR:'Roraima',SC:'Santa Catarina',SP:'São Paulo',SE:'Sergipe',TO:'Tocantins'});
export function destinationState(value){const uf=String(value??'').trim().toUpperCase();return states[uf]?{uf,name:states[uf],src:'../assets/state-flags/'+uf+'.svg'}:null;}
export function savedDraftEntries(groups=[],drafts=[]){
 const byKey=new Map(groups.map(g=>[g.key,g]));
 return drafts.filter(saved=>!saved.archived_at).map(saved=>{const group=byKey.get(saved.group_key);let note='Nota indisponível';try{note=JSON.parse(saved.group_key)[1]||note;}catch{}
  return {key:saved.group_key,note:group?.note||note,group,saved,city:saved.payload?.destinationCity??group?.destination.city??'',uf:saved.payload?.destinationUf??group?.destination.uf??'',center:group?.destination.center||'',updatedAt:saved.updated_at||''};
 }).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||b.note.localeCompare(a.note,'pt-BR',{numeric:true}));
}
