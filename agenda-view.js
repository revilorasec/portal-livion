/* Agenda: filters and ordering apply only to records already authorized by the APIs. */
const AgendaQuery = (() => {
  const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
  function select(rows, filters = {}, key = 'purchase', direction = -1) {
    const terms = normalize(filters.search).trim().split(/\s+/).filter(Boolean);
    const filtered = rows.filter(row => {
      const text = normalize([row.description, row.vendor, row.card, row.person, row.statusLabel].join(' '));
      if (!terms.every(term => text.includes(term))) return false;
      for (const field of ['cardId', 'personId', 'status']) if (filters[field] && String(row[field]) !== filters[field]) return false;
      for (const [field, from, to] of [['purchase', 'purchaseFrom', 'purchaseTo'], ['due', 'dueFrom', 'dueTo']]) {
        if ((filters[from] || filters[to]) && !row[field]) return false;
        if (filters[from] && row[field] < filters[from] || filters[to] && row[field] > filters[to]) return false;
      }
      if (filters.undated && row.due) return false;
      if (filters.minimum !== '' && filters.minimum != null && row.amount < Number(filters.minimum)) return false;
      if (filters.maximum !== '' && filters.maximum != null && row.amount > Number(filters.maximum)) return false;
      return true;
    });
    return filtered.sort((a,b) => {
      const x=a[key], y=b[key];
      if (x == null || x === '') return y == null || y === '' ? a.index-b.index : 1;
      if (y == null || y === '') return -1;
      const cmp = typeof x === 'number' && typeof y === 'number' ? x-y : String(x).localeCompare(String(y),'pt-BR',{numeric:true,sensitivity:'base'});
      return cmp * direction || a.purchase.localeCompare(b.purchase) || a.description.localeCompare(b.description) || a.number-b.number || a.index-b.index;
    });
  }
  function day(value) {
    if(!value)return '';
    const d=new Date(value);return Number.isFinite(+d)?new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(d):'';
  }
  return {select,day};
})();
if(typeof module!=='undefined')module.exports=AgendaQuery;

if(typeof document!=='undefined') {
  const order={card:{key:'purchase',direction:-1},reimbursement:{key:'purchase',direction:-1}};
  const fields=['search','cardId','personId','status','purchaseFrom','purchaseTo','dueFrom','dueTo','minimum','maximum'];
  const columns=[['purchase','Data da compra'],['due','Vencimento'],['description','Compra'],['card','Cartão'],['person','Pessoa'],['number','Parcela'],['amount','Previsto'],['paid','Reembolsado'],['pending','Pendente de reembolso'],['statusLabel','Situação']];
  function data() {
    const result=[];
    for(const e of expenses) {
      if(['CANCELADA','RECUSADA','RASCUNHO'].includes(e.status)||currentCompany()&&e.company_key!==currentCompany())continue;
      const c=by(cards,e.card_id,'card_id'),method=by(B.paymentMethods,e.payment_method_id,'payment_method_id');
      if(!e.card_id&&!/cr[eé]dito/i.test(method?.name||''))continue;
      if(/d[eé]bito/i.test(method?.name||'')||c?.payment_mode==='DEBITO')continue;
      const purchase=AgendaQuery.day(e.incurred_at),first=e.first_installment_due_date||CardBilling.firstDue(purchase,c?.closing_day,c?.due_day);
      for(const p of CardBilling.split(e.requested_amount,e.installment_count||1,first))result.push({kind:'card',purchase,due:p.due||'',description:e.description||'Despesa',vendor:e.vendor_name||'',card:c?.nickname||e.card_alias||'Cartão',cardId:e.card_id||'',person:user(e.paid_by_user_id),personId:String(e.paid_by_user_id),number:p.number,count:p.count,amount:p.amount,paid:null,pending:null,status:p.due?'FORECAST':'UNDATED',statusLabel:p.due?'Previsão da fatura':'Data a definir',index:result.length});
    }
    for(const p of agenda) {
      if(currentCompany()&&p.company_key!==currentCompany())continue;
      const e=by(expenses,p.expense_id,'expense_id')||p.expense_expenses||{},c=by(cards,e.card_id,'card_id');
      result.push({kind:'reimbursement',purchase:AgendaQuery.day(e.incurred_at),due:p.due_date||'',description:e.description||'Despesa',vendor:e.vendor_name||'',card:c?.nickname||e.card_alias||'—',cardId:e.card_id||'',person:user(p.payee_user_id),personId:String(p.payee_user_id),number:Number(p.installment_number),count:p.installment_count,amount:Number(p.scheduled_amount),paid:Number(p.reimbursed_amount),pending:Number(p.pending_amount),status:p.status,statusLabel:labels[p.status]||({PAGO:'Pago',PARCIAL:'Parcial',PREVISTO:'Previsto',CANCELADO:'Cancelado'}[p.status])||p.status,index:result.length});
    }
    return result;
  }
  function setup() {
    if($('agendaFilters'))return;
    $('agenda').innerHTML=`<div class="hero"><div><h2>Agenda de pagamentos</h2><p>Compras mais recentes primeiro. Clique nos títulos das colunas para alternar a ordem.</p></div></div>
      <style>
      #agendaFilters{padding:12px;margin-bottom:12px}
      #agendaFilters .af-bar{display:flex;align-items:end;gap:10px}
      #agendaFilters .af-search{flex:1;min-width:0}
      #agendaFilters input:not([type=checkbox]),#agendaFilters select{padding:6px 9px;min-height:34px}
      #agendaFilters .field{gap:3px;min-width:0}
      #agendaFilters details{margin-top:8px}
      #agendaFilters summary{cursor:pointer;color:var(--blue);font-weight:600;padding:4px 0;width:fit-content}
      #agendaFilters .af-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px 12px;margin-top:8px}
      #agendaFilters .af-check label{display:flex;align-items:center;gap:6px}
      #agendaFilters input[type=checkbox]{width:auto;margin:0}
      #af-message{margin:6px 0 0;font-size:12px}
      #af-message:empty{display:none}
      @media(max-width:700px){#agendaFilters .af-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:380px){#agendaFilters .af-grid{grid-template-columns:1fr}}
      </style>
      <form id="agendaFilters" class="card" onsubmit="return false"><div class="af-bar">
      <div class="field af-search"><label for="af-search">Pesquisar</label><input id="af-search" type="search" placeholder="Compra, fornecedor, cartão ou pessoa"></div>
      <button type="button" class="btn" id="af-clear">Limpar</button></div>
      <details><summary id="af-summary">Filtros avançados</summary><div class="af-grid">
      <div class="field"><label for="af-purchaseFrom">Compra de</label><input id="af-purchaseFrom" type="date"></div><div class="field"><label for="af-purchaseTo">Compra até</label><input id="af-purchaseTo" type="date"></div>
      <div class="field"><label for="af-dueFrom">Vencimento de</label><input id="af-dueFrom" type="date"></div><div class="field"><label for="af-dueTo">Vencimento até</label><input id="af-dueTo" type="date"></div>
      <div class="field"><label for="af-cardId">Cartão</label><select id="af-cardId"></select></div><div class="field"><label for="af-personId">Pessoa</label><select id="af-personId"></select></div>
      <div class="field"><label for="af-status">Situação</label><select id="af-status"></select></div>
      <div class="field"><label for="af-minimum">Valor mínimo da parcela</label><input id="af-minimum" type="number" min="0" step="0.01"></div><div class="field"><label for="af-maximum">Valor máximo da parcela</label><input id="af-maximum" type="number" min="0" step="0.01"></div>
      <div class="field af-check"><label><input id="af-undated" type="checkbox"> Sem vencimento definido</label></div>
      </div></details><p id="af-message" role="status" aria-live="polite"></p></form>
      <div class="card"><h3>Parcelas do cartão</h3><p>Previsões da fatura. Reembolso não confirma pagamento do cartão. Confira as datas com o banco.</p><div id="agendaCardTable"></div></div>
      <div class="card"><h3>Agenda de reembolsos</h3><p>Valores a receber de volta, separados da fatura do cartão.</p><div id="agendaReimbursementTable"></div></div>`;
    $('agendaFilters').addEventListener('input',paint);
    $('af-clear').onclick=()=>{$('agendaFilters').reset();paint()};
    $('agenda').addEventListener('click',event=>{
      const button=event.target.closest('button[data-agenda-key]');if(!button)return;
      const sorting=order[button.dataset.agendaKind],key=button.dataset.agendaKey;
      sorting.direction=sorting.key===key?-sorting.direction:1;sorting.key=key;paint();
      $('agenda').querySelector(`button[data-agenda-kind="${button.dataset.agendaKind}"][data-agenda-key="${key}"]`)?.focus();
    });
  }
  function options(rows,id,key,label) {
    const select=$('af-'+id),selected=select.value;
    const unique=new Map(rows.filter(r=>r[key]).map(r=>[String(r[key]),r[label]]));
    select.innerHTML='<option value="">Todos</option>'+[...unique].sort((a,b)=>String(a[1]).localeCompare(String(b[1]),'pt-BR')).map(([value,text])=>`<option value="${esc(value)}">${esc(text)}</option>`).join('');
    if(unique.has(selected))select.value=selected;
  }
  function table(rows,kind) {
    const sorting=order[kind],shown=kind==='card'?columns.filter(([k])=>!['paid','pending'].includes(k)):columns;
    const format=(r,k)=>k==='purchase'||k==='due'?(r[k]?r[k].split('-').reverse().join('/'):'Data a definir'):k==='number'?`${r.number}/${r.count}`:['amount','paid','pending'].includes(k)?money(r[k]):esc(r[k]);
    return `<p>${rows.length} parcela(s) encontrada(s)</p><div class="table-wrap"><table class="table"><thead><tr>`+shown.map(([key,label])=>`<th aria-sort="${sorting.key===key?(sorting.direction===1?'ascending':'descending'):'none'}"><button type="button" class="btn" style="white-space:nowrap" data-agenda-kind="${kind}" data-agenda-key="${key}" aria-label="Ordenar por ${label}">${label}${sorting.key===key?(sorting.direction===1?' ↑':' ↓'):' ↕'}</button></th>`).join('')+'</tr></thead><tbody>'+ (rows.map(r=>'<tr>'+shown.map(([key])=>'<td>'+format(r,key)+'</td>').join('')+'</tr>').join('')||`<tr><td colspan="${shown.length}" class="empty">Nenhuma parcela encontrada com estes filtros.</td></tr>`)+ '</tbody></table></div>';
  }
  function paint() {
    const filters=Object.fromEntries(fields.map(key=>[key,$('af-'+key).value]));filters.undated=$('af-undated').checked;
    const invalid=(filters.purchaseFrom&&filters.purchaseTo&&filters.purchaseFrom>filters.purchaseTo)||(filters.dueFrom&&filters.dueTo&&filters.dueFrom>filters.dueTo)||(filters.minimum!==''&&filters.maximum!==''&&Number(filters.minimum)>Number(filters.maximum));
    const active=fields.filter(key=>key!=='search'&&filters[key]!=='').length+Number(filters.undated);
    $('af-summary').textContent='Filtros avançados'+(active?' ('+active+' ativos)':'');
    $('af-message').textContent=invalid?'Confira os intervalos: o início ou mínimo deve ser menor ou igual ao fim ou máximo.':filters.undated&&(filters.dueFrom||filters.dueTo)?'Limpe o período de vencimento para pesquisar parcelas sem data.':'';
    const rows=invalid?[]:data();
    for(const [kind,id] of [['card','agendaCardTable'],['reimbursement','agendaReimbursementTable']])$(''+id).innerHTML=table(AgendaQuery.select(rows.filter(r=>r.kind===kind),filters,order[kind].key,order[kind].direction),kind);
  }
  renderAgenda=function(){setup();const rows=data();options(rows,'cardId','cardId','card');options(rows,'personId','personId','person');options(rows,'status','status','statusLabel');paint()};
}
