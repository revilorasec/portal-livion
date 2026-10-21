const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const defaults={nokia:'@RHCS/@EXPEDIÇÃO RHCS',claro:'@LIVION SOLUTIONS/@EXPEDIÇÃO LIVION'};
export function setupOutputSettings({api,action,clients,currentClient,onChange,canManage}){
 const status=new Map(),dialog=$('outputDialog');let session;
 const message=(text,error=false)=>{$('outputMessage').textContent=text;$('outputMessage').className='notice'+(error?' error':'');};
 async function refresh(){for(const c of clients)status.set(c,await api('cloud-status',null,c));onChange();}
 function render(){
  $('outputConnect').textContent=status.get(currentClient())?.connected?'Reconectar conta central':'Conectar conta central';
  $('outputFolders').innerHTML=clients.map(c=>{const s=status.get(c),pref=s?.settings;return `<section class="panel output-folder"><h3>${c==='claro'?'Claro':'Nokia'}</h3><p class="muted">${pref?'Destino central salvo pelo administrador. Todos os usuários usam esta pasta.':'Defina o destino uma vez para toda a equipe.'}</p><label>Pasta central no OneDrive<input id="output_${c}" value="${esc(pref?.folder.path||defaults[c])}" autocomplete="off" spellcheck="false"></label><p class="muted">Use o caminho dentro do OneDrive da conta central, sem o nome da unidade.</p><button class="secondary" data-save-output="${c}">Conferir e salvar destino central</button></section>`;}).join('');
  $('outputFolders').querySelectorAll('[data-save-output]').forEach(b=>b.onclick=()=>action(async()=>{try{const c=b.dataset.saveOutput;await api('cloud-folder',{client:c,path:$('output_'+c).value,revision:status.get(c)?.settings?.revision||0},c);await refresh();render();message('Destino central conferido e salvo. Toda a equipe usará esta pasta automaticamente.');}catch(e){message(e.message,true);throw e;}}));
 }
 $('outputClose').onclick=()=>dialog.close();
 $('outputConnect').onclick=()=>action(async()=>{try{
  session=await api('cloud-connect',{client:currentClient()});
  $('outputAuth').hidden=false;$('outputAuth').innerHTML=`<p>Abra a confirmação Microsoft e entre somente com <b>${esc(session.owner)}</b>.</p><p>Código: <strong>${esc(session.userCode)}</strong></p><p><a class="secondary" target="_blank" rel="noopener noreferrer" href="${esc(session.verificationUri)}">Abrir confirmação Microsoft</a></p><button id="outputCheck" class="secondary">Já autorizei · conferir conexão</button>`;
  $('outputCheck').onclick=()=>action(async()=>{try{const result=await api('cloud-poll',{client:currentClient(),sessionId:session.sessionId});if(result.pending)return message('Aguardando sua confirmação na Microsoft. Após autorizar, confira novamente.');$('outputAuth').hidden=true;session=null;await refresh();render();message('Conta central conectada. Confira e salve os destinos abaixo. A equipe não precisará acessar o OneDrive.');}catch(e){message(e.message,true);throw e;}});
  message('Autorize a conexão da conta central. Nenhuma senha será compartilhada com a equipe.');
 }catch(e){message(e.message,true);throw e;}});
 return {
  load:refresh,
  open(){if(!canManage)throw Error('Somente o administrador configura os destinos centrais.');render();message('Estes destinos valem para toda a equipe. Os usuários da expedição não precisam de acesso ao OneDrive.');dialog.showModal();},
  description(){return status.get(currentClient())?.ready?'Salvamento automático no destino central definido pelo administrador.':'O administrador precisa concluir a configuração do destino central.';},
  ready(){return status.get(currentClient())?.ready===true;},
  async prepare(){await refresh();if(!this.ready())throw Error('O administrador precisa conectar e configurar o destino central. Você não precisa conectar OneDrive.');}
 };
}
