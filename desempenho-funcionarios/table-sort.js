(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else{root.PerformanceTableSort=api;api.install(document)}
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const collator=new Intl.Collator('pt-BR',{sensitivity:'base',numeric:true});
  const norm=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
  const months=['janeiro','fevereiro','marco','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  const label=header=>header.textContent.replace(/\s*[▲▼↕]$/u,'').trim();

  function sortValue(text,heading=''){
    const value=norm(text).replace(/\u00a0/g,' '),title=norm(heading);
    if(!value||/^(?:—|–|-|valor oculto|nao informad[oa]|sem medicao)$/.test(value))return null;
    if(/^(?:mes|devolucao|medicao|data\b)/.test(title)){
      const br=value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s.*)?$/);
      if(br)return Number(br[3])*10000+Number(br[2])*100+Number(br[1]);
      const iso=value.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?(?:[t\s].*)?$/);
      if(iso)return Number(iso[1])*10000+Number(iso[2])*100+Number(iso[3]||1);
      const written=value.match(/^([a-z]+)(?:\s+de\s+|,?\s+)(\d{4})$/);
      if(written&&months.includes(written[1]))return Number(written[2])*10000+(months.indexOf(written[1])+1)*100+1;
    }
    // Identifiers keep their precision and leading zeros.
    if(/part number|^pn\b|^id$|tecnico|cliente|origem|garantia|descricao|fabricante|status|complexidade/.test(title))return value;
    const numeric=value.replace(/^r\$\s*/,'').replace(/\s*(?:%|dias?|[º°])$/,'').replace(/\s/g,'');
    if(/^-?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?$/.test(numeric))return Number(numeric.replace(/\./g,'').replace(',','.'));
    return value;
  }

  function compare(a,b,direction='ascending'){
    if(a===null||b===null)return a===b?0:a===null?1:-1;
    const result=typeof a==='number'&&typeof b==='number'?a-b:collator.compare(String(a),String(b));
    return direction==='descending'?-result:result;
  }

  function install(doc){
    const states=new Map();
    const tableKey=table=>{
      if(table.id)return table.id;
      const owner=table.parentElement?.closest('[id]')||doc.body;
      return (owner.id||'body')+':table:'+Array.from(owner.querySelectorAll('table')).indexOf(table);
    };
    const headers=table=>Array.from(table.tHead?.rows[0]?.cells||[]).filter(h=>h.tagName==='TH'&&h.colSpan===1&&label(h)&&norm(label(h))!=='acao');
    const cellValue=(row,column,heading)=>{
      const cell=row.cells[column],select=cell?.querySelector('select');
      return sortValue(select?select.selectedOptions[0]?.textContent:cell?.textContent,heading);
    };
    function apply(table){
      const state=states.get(tableKey(table)),heads=headers(table);
      for(const head of heads){
        // Remove arrows supplied by the original ranking/PN renderers.
        for(const node of head.childNodes)if(node.nodeType===3)node.nodeValue=node.nodeValue.replace(/\s*[▲▼]$/u,'');
        head.dataset.tableSortable='true';head.tabIndex=0;
        head.setAttribute('aria-sort',state?.column===head.cellIndex?state.direction:'none');
        head.title='Ordenar por '+label(head)+' — clique para alternar crescente/decrescente';
      }
      if(!state)return;
      const head=heads.find(h=>h.cellIndex===state.column);if(!head)return;
      for(const body of table.tBodies){
        const rows=Array.from(body.rows);
        // Empty notices and summary rows with merged cells stay in place.
        const sortable=rows.filter(row=>row.cells.length===table.tHead.rows[0].cells.length&&Array.from(row.cells).every(cell=>cell.colSpan===1));
        const heading=label(head),values=new Map(sortable.map(row=>[row,cellValue(row,state.column,heading)]));
        const sorted=[...sortable].sort((a,b)=>compare(values.get(a),values.get(b),state.direction));
        if(sorted.every((row,index)=>row===sortable[index]))continue;
        const markers=sortable.map(row=>{const marker=doc.createComment('sort');body.replaceChild(marker,row);return marker});
        markers.forEach((marker,index)=>body.replaceChild(sorted[index],marker));
      }
    }
    function activate(event){
      const head=event.target.closest?.('th[data-table-sortable]');if(!head)return;
      if(event.type==='keydown'&&!['Enter',' '].includes(event.key))return;
      event.preventDefault();event.stopImmediatePropagation();
      const table=head.closest('table'),key=tableKey(table),old=states.get(key);
      states.set(key,{column:head.cellIndex,direction:old?.column===head.cellIndex&&old.direction==='ascending'?'descending':'ascending'});
      apply(table);
    }
    const refresh=()=>doc.querySelectorAll('table').forEach(apply);
    // Disconnect during our DOM changes to avoid observer loops.
    const observer=new MutationObserver(()=>{observer.disconnect();refresh();observe()});
    const observe=()=>observer.observe(doc.body,{childList:true,subtree:true,characterData:true});
    doc.addEventListener('click',activate,true);doc.addEventListener('keydown',activate,true);
    doc.addEventListener('change',refresh);
    refresh();observe();
    return {refresh,disconnect(){observer.disconnect();doc.removeEventListener('click',activate,true);doc.removeEventListener('keydown',activate,true);doc.removeEventListener('change',refresh)}};
  }
  return {sortValue,compare,install};
});
