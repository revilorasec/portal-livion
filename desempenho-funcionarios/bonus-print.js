(function(){
  'use strict';
  const printStyle=`
    @page{size:A4 portrait;margin:12mm}
    *{box-sizing:border-box}body{margin:0;background:#fff;color:#172033;font:10pt/1.35 Arial,sans-serif}
    h1{font-size:17pt;margin:0 0 3mm}h2{font-size:13pt}h3{font-size:11pt;margin:3mm 0 2mm}
    .print-meta{font-size:9pt;color:#526177;margin-bottom:4mm}.bonus-detail-hero{display:flex;justify-content:space-between;gap:5mm;padding:3mm;background:#f4f8fd;border:1px solid #dfe6f0;border-radius:2mm;break-inside:avoid}
    .bonus-detail-hero h3{margin:0 0 2mm}.bonus-detail-total{font-size:18pt;font-weight:bold;white-space:nowrap;color:#087443}
    .bonus-detail-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:2mm;margin:3mm 0}.mini{border:1px solid #dfe6f0;border-radius:2mm;padding:2mm;break-inside:avoid}.mini span{display:block;font-size:8pt;color:#526177}.mini b{display:block;font-size:10pt;margin-top:1mm}
    .bonus-reasons{border:1px solid #dfe6f0;padding:2.5mm;margin:3mm 0;break-inside:avoid}.bonus-reasons ul{margin:1mm 0;padding-left:5mm}.bonus-reasons p{margin:1mm 0}.bonus-muted{color:#526177;font-size:9pt}
    .tablewrap{overflow:visible!important;max-height:none!important;border:0!important}table{width:100%;border-collapse:collapse;table-layout:fixed;white-space:normal;font-size:8pt;margin:2mm 0 4mm}th,td{position:static!important;padding:1.7mm;text-align:left;border-bottom:1px solid #dfe6f0;overflow-wrap:anywhere;vertical-align:top}th{background:#f4f8fd;font-weight:bold}thead{display:table-header-group}tr{break-inside:avoid}
    .status-pill{font-size:8pt}.print-signature{margin-top:5mm;break-inside:avoid;border-top:1px solid #dfe6f0;padding-top:3mm}.print-signature p{margin:0 0 4mm}.signature-lines{display:grid;grid-template-columns:1fr 2fr;gap:8mm;margin-top:9mm}.signature-lines span{border-top:1px solid #172033;padding-top:2mm;text-align:center;font-size:9pt}
    .print-annex{break-before:page}.print-annex h2{margin:0 0 3mm}details{display:block}summary{display:block;font-weight:bold;margin:3mm 0}button,input,select{display:none!important}
    body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  `;
  function printAudit(){
    const source=document.getElementById('bonusDetailContent');
    if(!source?.children.length)return;
    const content=source.cloneNode(true);
    content.removeAttribute('id');
    content.querySelectorAll('button,script').forEach(node=>node.remove());
    content.querySelectorAll('details').forEach(node=>node.open=true);
    const annexes=[...content.querySelectorAll(':scope > details')];
    annexes.forEach(node=>node.remove());
    const doc=document.implementation.createHTMLDocument('Demonstrativo do bônus');
    doc.documentElement.lang='pt-BR';
    const tech=source.querySelector('.bonus-detail-hero h3')?.textContent.trim()||'Técnico';
    const period=source.querySelector('.bonus-detail-hero > div > div')?.textContent.trim()||'';
    doc.title=`Bônus - ${tech} - ${period}`;
    const style=doc.createElement('style');style.textContent=printStyle;doc.head.appendChild(style);
    const heading=doc.createElement('h1');heading.textContent='Demonstrativo de bônus — conferência';doc.body.appendChild(heading);
    const meta=doc.createElement('div');meta.className='print-meta';meta.textContent='Livion Solutions · Emitido em '+new Date().toLocaleString('pt-BR');doc.body.appendChild(meta);
    doc.body.appendChild(doc.importNode(content,true));
    const signature=doc.createElement('section');signature.className='print-signature';
    signature.innerHTML='<p>Declaro que conferi as quantidades e o cálculo do bônus apresentados neste demonstrativo.</p><p>Observações: ____________________________________________________________________</p><div class="signature-lines"><span>Data da conferência</span><span>Assinatura do técnico</span></div>';
    doc.body.appendChild(signature);
    if(annexes.length){const annex=doc.createElement('section');annex.className='print-annex';const title=doc.createElement('h2');title.textContent='Anexo — equipamentos e composição do cálculo';annex.appendChild(title);const owner=doc.createElement('p');owner.textContent=tech+' · '+period;annex.appendChild(owner);annexes.forEach(node=>annex.appendChild(doc.importNode(node,true)));doc.body.appendChild(annex);}
    document.getElementById('bonusAuditPrintFrame')?.remove();
    const frame=document.createElement('iframe');frame.id='bonusAuditPrintFrame';frame.title='Impressão do demonstrativo de bônus';frame.setAttribute('aria-hidden','true');frame.style.cssText='position:fixed;width:1px;height:1px;left:-10000px;top:0;border:0';
    frame.onload=()=>{frame.contentWindow.focus();frame.contentWindow.print();};
    frame.srcdoc='<!doctype html>'+doc.documentElement.outerHTML;document.body.appendChild(frame);
  }
  function install(){
    const header=document.querySelector('#bonusDetailModal .modalhead');
    if(!header||document.getElementById('bonusAuditPrint'))return;
    const actions=document.createElement('div');actions.className='actions';
    const button=document.createElement('button');button.id='bonusAuditPrint';button.type='button';button.className='btn';button.textContent='Imprimir / Salvar PDF';button.onclick=printAudit;actions.appendChild(button);
    const close=header.querySelector('[data-close]');if(close)actions.appendChild(close);header.appendChild(actions);
  }
  install();new MutationObserver(install).observe(document.body,{childList:true,subtree:true});
})();
