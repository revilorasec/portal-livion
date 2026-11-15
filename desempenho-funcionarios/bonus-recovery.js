(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else{root.BonusRecovery=api;api.install(root)}
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const ruleFields=config=>({bands:config.bands,mediumPct:config.mediumPct,highComplexityPct:config.highComplexityPct,highRepairabilityPct:config.highRepairabilityPct});
  function findCandidates(storage,Engine,current){
    const excluded=new Set([JSON.stringify(ruleFields(Engine.migrateConfig(current))),JSON.stringify(ruleFields(Engine.defaults()))]),candidates=[];
    for(const [key,label] of [['portalBonusConfigV4','Cópia anterior — versão 4'],['portalBonusConfigV3','Cópia anterior — versão 3'],['portalBonusConfigV2','Cópia anterior — versão 2'],['portalBonusSavedConfigV1','Última cópia gravada neste navegador']]){
      try{
        const raw=JSON.parse(storage.getItem(key)||'null');if(!raw||!Array.isArray(raw.bands)||!raw.bands.length)continue;
        const {config,warnings}=Engine.validateConfig(raw),identity=JSON.stringify(ruleFields(config));
        if(warnings.length||excluded.has(identity))continue;
        excluded.add(identity);candidates.push({label,config});
      }catch{}
    }return candidates;
  }
  function applyCandidate(current,candidate,Engine){return Engine.migrateConfig({...current,...ruleFields(candidate.config)})}
  function install(win){
    const doc=win.document,Engine=win.BonusEngine,toolbar=doc.getElementById('bonusRestore')?.parentElement;
    if(!toolbar||!Engine)return;
    const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const money=value=>Number(value).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
    const button=doc.createElement('button');button.id='bonusRecoverLegacy';button.className='btn alt';button.textContent='Recuperar cópia antiga';toolbar.appendChild(button);
    button.onclick=()=>{
      doc.getElementById('bonusRecoveryModal')?.remove();
      const candidates=findCandidates(win.localStorage,Engine,savedBonusConfig()),modal=doc.createElement('div');modal.id='bonusRecoveryModal';modal.className='modal open';
      modal.innerHTML='<div class="dialog" style="width:min(940px,94vw);max-height:88vh;overflow:auto"><div class="toolbar"><h2>Recuperar regras deste navegador</h2><button class="btn alt" data-recovery-close>Fechar</button></div><p>Esta busca consulta somente cópias antigas guardadas neste navegador. A data dessas cópias não está disponível. Confira os valores antes de utilizá-los.</p>'+
        (candidates.length?candidates.map((candidate,index)=>'<section class="card"><h3>'+escape(candidate.label)+'</h3><p>Média: +'+candidate.config.mediumPct+'% · Alta: +'+candidate.config.highComplexityPct+'% · Reparabilidade ≥ 80%: +'+candidate.config.highRepairabilityPct+'%</p><div class="tablewrap"><table><thead><tr><th>Faixa</th><th>Reparadas</th><th>Baixa</th><th>Média</th><th>Alta</th></tr></thead><tbody>'+candidate.config.bands.map((band,i)=>'<tr><td>Faixa '+i+'</td><td>'+band.min+' a '+(band.max??'sem limite')+'</td><td>'+money(band.baseLow)+'</td><td>'+money(Engine.unitRate(candidate.config,band,1))+'</td><td>'+money(Engine.unitRate(candidate.config,band,2))+'</td></tr>').join('')+'</tbody></table></div><button class="btn" data-recovery-use="'+index+'">Carregar para conferir</button></section>').join(''):'<div class="empty">Nenhuma cópia antiga diferente dos valores atuais e dos valores de fábrica foi encontrada neste navegador.</div>')+
        '<p class="footnote">Carregar uma cópia não grava no banco. Depois de conferir, use Gravar regras. As classificações de PN e os técnicos atuais são preservados.</p></div>';
      modal.querySelector('[data-recovery-close]').onclick=()=>modal.remove();modal.onclick=event=>{if(event.target===modal)modal.remove()};
      modal.querySelectorAll('[data-recovery-use]').forEach(node=>{
        node.disabled=doc.getElementById('bonusMediumPct')?.disabled!==false;
        node.onclick=()=>{saveBonusConfig(applyCandidate(savedBonusConfig(),candidates[Number(node.dataset.recoveryUse)],Engine));renderBonusConfig();renderBonus();renderBonusTrend();modal.remove()};
      });doc.body.appendChild(modal);
    };
  }
  return {findCandidates,applyCandidate,install};
});
