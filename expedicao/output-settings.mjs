import {defaultFolders,resolveFolder,saveCloudWorkbook} from './onedrive.mjs?v=4';
const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function graphToken(interactive=false){
 if(window.parent===window||typeof window.parent.__PORTAL_GET_EXPEDICAO_GRAPH_TOKEN__!=='function')throw Error('Atualize o Portal para conectar o OneDrive.');
 try{return await window.parent.__PORTAL_GET_EXPEDICAO_GRAPH_TOKEN__(interactive);}catch{throw Error('Use Conectar OneDrive nas configurações para entrar com sua conta Microsoft. As pastas já salvas foram preservadas.');}
}
export function setupOutputSettings({api,action,clients,permissions,currentClient,onChange}){
 const saved=new Map(),dialog=$('outputDialog');
 const message=(text,error=false)=>{$('outputMessage').textContent=text;$('outputMessage').className='notice'+(error?' error':'');};
 function render(){
  $('outputFolders').innerHTML=clients.map(c=>{const pref=saved.get(c);return `<section class="panel output-folder"><h3>${c==='claro'?'Claro':'Nokia'}</h3><p class="muted">${pref?'Pasta salva na sua conta. Disponível nos seus dispositivos.':'Configure uma vez para salvar pelo computador, celular e tablet.'}</p><label>Pasta no seu OneDrive<input id="output_${c}" value="${esc(pref?.folder.path||defaultFolders[c])}" autocomplete="off" spellcheck="false"></label><p class="muted">${pref?'Destino atual: '+esc(pref.folder.path):'Use o caminho da pasta dentro do OneDrive, sem C:\\ e sem o nome da unidade.'}</p><button class="secondary" data-save-output="${c}" ${!permissions[c]?.generate?'disabled':''}>Conferir e salvar pasta</button></section>`;}).join('');
  $('outputFolders').querySelectorAll('[data-save-output]').forEach(b=>b.onclick=()=>action(async()=>{try{const c=b.dataset.saveOutput,token=await graphToken(),folder=await resolveFolder(token,$('output_'+c).value),result=await api('settings',{client:c,revision:saved.get(c)?.revision||0,folder},c,token);saved.set(c,result);render();onChange();message('Pasta conferida e salva na sua conta. Ela será usada nos seus dispositivos até você alterar.');}catch(e){message(e.message,true);throw e;}}));
 }
 $('outputClose').onclick=()=>dialog.close();
 $('outputConnect').onclick=()=>action(async()=>{try{await graphToken(true);message('OneDrive conectado. Confira e salve as pastas abaixo.');}catch(e){message(e.message,true);throw e;}});
 return {
  async load(){for(const c of clients){const result=await api('settings',null,c);if(result.settings)saved.set(c,result.settings);}onChange();},
  open(){render();message('As pastas ficam vinculadas à sua conta do Portal. A Microsoft pode pedir uma nova conexão quando sua sessão expirar.');dialog.showModal();},
  description(){const target=saved.get(currentClient())?.folder;return target?'Saída no OneDrive: '+target.path:'Configure a pasta do OneDrive para salvar pelo computador, celular ou tablet.';},
  ready(){return saved.has(currentClient());},
  async prepare(){if(!saved.has(currentClient())){this.open();throw Error('Conecte o OneDrive e salve a pasta de saída nas configurações.');}return graphToken();},
  async save(result,token){const target=saved.get(currentClient())?.folder;if(!target)throw Error('Configure a pasta do OneDrive antes de gerar.');return saveCloudWorkbook(token,target,result);}
 };
}
