const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLocaleLowerCase('pt-BR');
const collator=new Intl.Collator('pt-BR',{numeric:true,sensitivity:'base'});
export function matchesQuery(values,query){const haystack=normalize(values.join(' '));return normalize(query).split(/\s+/).filter(Boolean).every(term=>haystack.includes(term));}
export function compareValues(a,b,direction='ascending',type='text'){
 a=String(a??'').trim();b=String(b??'').trim();if(!a||!b)return a? -1:b?1:0;
 const decimal=v=>Number(v.includes(',')?v.replace(/\./g,'').replace(',','.'):v);
 const result=type==='decimal'?decimal(a)-decimal(b):collator.compare(a,b);
 return (direction==='descending'?-1:1)*(Number.isFinite(result)?result:collator.compare(a,b));
}

// Reorder existing rows so typed values, listeners and original item numbers stay intact.
export function setupTableTools(table,{searchInput,results}={}){
 let column=null,direction='ascending',nextRank=0;const ranks=new WeakMap();
 const tbody=table.tBodies[0],headers=()=>[...table.tHead.rows[0].cells];
 const rows=()=>[...tbody.rows].filter(row=>!row.dataset.empty);
 const cellValue=cell=>{if(!cell)return '';const control=cell.querySelector('input,select,textarea');return control?control.value:cell.textContent;};
 function filter(){
  const all=rows();let visible=0;
  for(const row of all){row.hidden=!matchesQuery([...row.cells].map(cellValue),searchInput?.value||'');if(!row.hidden)visible++;}
  if(results)results.textContent=`${visible} de ${all.length} peça${all.length===1?'':'s'}`;
  if(searchInput){let empty=tbody.querySelector('[data-empty]');if(!visible){if(!empty){empty=document.createElement('tr');empty.dataset.empty='true';const cell=document.createElement('td');cell.colSpan=headers().length;cell.textContent='Nenhuma peça encontrada. Altere ou limpe a busca.';empty.append(cell);tbody.append(empty);}}else empty?.remove();}
 }
 function sort(){
  const hs=headers();hs.forEach((th,index)=>{const active=index===column;th.setAttribute('aria-sort',active?direction:'none');const button=th.querySelector('button');if(button){button.querySelector('.sort-arrow').textContent=active?(direction==='ascending'?'↑':'↓'):'↕';button.title=`Ordenar por ${button.dataset.label} em ordem ${active&&direction==='ascending'?'decrescente':'crescente'}`;}});
  if(column!==null){const type=hs[column]?.dataset.sortType;rows().sort((a,b)=>compareValues(cellValue(a.cells[column]),cellValue(b.cells[column]),direction,type)||ranks.get(a)-ranks.get(b)).forEach(row=>tbody.append(row));}
  filter();
 }
 function refresh(){
  rows().forEach(row=>{if(!ranks.has(row))ranks.set(row,nextRank++);});
  headers().forEach((th,index)=>{if(th.querySelector('button'))return;const label=th.textContent;th.textContent='';const button=document.createElement('button');button.type='button';button.className='table-sort';button.dataset.label=label;button.append(document.createTextNode(label+' '));const arrow=document.createElement('span');arrow.className='sort-arrow';arrow.setAttribute('aria-hidden','true');button.append(arrow);button.onclick=()=>{direction=column===index&&direction==='ascending'?'descending':'ascending';column=index;sort();};th.append(button);});
  sort();
 }
 if(searchInput)searchInput.oninput=filter;
 return {refresh,filter,reset(){column=null;direction='ascending';if(searchInput)searchInput.value='';}};
}
