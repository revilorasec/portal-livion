import {STATUSES, CLIENTS, statistics, percent} from './domain.mjs';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const colors=['#118a63','#d31d2b','#1155ee','#f5a623','#7868a6'];
const legend=items=>`<div class="chart-legend">${items.map(([label,color])=>`<span><i style="background:${color}"></i>${label}</span>`).join('')}</div>`;
export function volumeChart(rows,clients){
 const data=clients.map(c=>({name:CLIENTS.find(x=>x.key===c)?.name||c,...statistics(rows.filter(r=>r.client===c))}));
 if(!data.length)return '<p class="empty">Selecione um cliente.</p>';
 const max=Math.max(1,...data.map(x=>x.total)),step=Math.max(1,10**Math.floor(Math.log10(max))/2),top=Math.ceil(max/step)*step;
 const x=55,y=24,w=550,h=222,slot=w/data.length,bw=Math.min(190,slot*.65);
 let svg='';for(let i=0;i<=5;i++){const py=y+h-i*h/5;svg+=`<line x1="${x}" y1="${py}" x2="605" y2="${py}" stroke="#e5eaf2"/><text x="45" y="${py+4}" text-anchor="end">${Math.round(top*i/5).toLocaleString('pt-BR')}</text>`;}
 data.forEach((d,i)=>{let offset=0;STATUSES.forEach((s,j)=>{const value=d.counts[s],height=value/top*h;svg+=`<rect x="${x+i*slot+(slot-bw)/2}" y="${y+h-offset-height}" width="${bw}" height="${height}" fill="${colors[j]}"><title>${esc(d.name)} · ${s}: ${value}</title></rect>`;offset+=height;});svg+=`<text x="${x+i*slot+slot/2}" y="269" text-anchor="middle">${esc(d.name)}</text>`;});
 return legend(STATUSES.map((s,i)=>[s.charAt(0)+s.slice(1).toLowerCase(),colors[i]]))+`<svg class="plot" viewBox="0 0 630 285" role="img" aria-label="Volume por cliente e status">${svg}</svg>`;
}
export function repairChart(team){
 if(!team.length)return '<p class="empty">Nenhum técnico neste recorte.</p>';
 const h=Math.max(260,team.length*33+48),plotH=h-45,left=170,width=430;
 let svg='';for(let i=0;i<=10;i++){const x=left+i*width/10;svg+=`<line x1="${x}" y1="8" x2="${x}" y2="${plotH}" stroke="#e5eaf2"/><text x="${x}" y="${plotH+19}" text-anchor="middle">${i*10}%</text>`;}
 team.forEach((t,i)=>{const y=14+i*(plotH-14)/team.length;svg+=`<text x="160" y="${y+14}" text-anchor="end">${esc(t.name)}</text>`;[['general','#f5a623'],['real','#118a63']].forEach(([key,color],j)=>{if(t[key]!==null)svg+=`<rect x="${left}" y="${y+j*9}" width="${t[key]*width}" height="7" rx="3" fill="${color}"><title>${esc(t.name)} · ${key==='real'?'Real':'Geral'}: ${percent(t[key])}</title></rect>`;});});
 return legend([['Rep. geral','#f5a623'],['Rep. real','#118a63']])+`<svg class="plot" viewBox="0 0 630 ${h}" role="img" aria-label="Reparabilidade geral e real por técnico">${svg}</svg>`;
}
export function comparisonChart(team,statusA,statusB){
 if(!team.length)return '<p class="empty">Selecione técnicos para comparar.</p>';
 const max=Math.max(1,...team.flatMap(t=>[t.counts[statusA],t.counts[statusB]])),top=Math.ceil(max/10)*10,left=170,w=680,h=Math.max(220,team.length*43+55);
 let svg='';for(let i=0;i<=5;i++){const x=left+i*w/5;svg+=`<line x1="${x}" y1="10" x2="${x}" y2="${h-40}" stroke="#e5eaf2"/><text x="${x}" y="${h-20}" text-anchor="middle">${Math.round(top*i/5)}</text>`;}
 team.forEach((t,i)=>{const y=18+i*(h-55)/team.length;svg+=`<text x="160" y="${y+15}" text-anchor="end">${esc(t.name)}</text>`;[statusA,statusB].forEach((status,j)=>{const value=t.counts[status]||0;svg+=`<rect x="${left}" y="${y+j*11}" width="${value/top*w}" height="9" rx="3" fill="${colors[STATUSES.indexOf(status)]}"><title>${esc(t.name)} · ${status}: ${value}</title></rect>`;});});
 return legend([statusA,statusB].map(s=>[s.charAt(0)+s.slice(1).toLowerCase(),colors[STATUSES.indexOf(s)]]))+`<svg class="plot comparison-plot" viewBox="0 0 880 ${h}" role="img" aria-label="Comparação de quantidades por técnico">${svg}</svg>`;
}

