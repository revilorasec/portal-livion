const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(__dirname+'/despesas-reembolsos-v2.js','utf8');
function harness(startImpl){
 const events=[],timers=[],nodes={};let success;
 class Scanner{
  constructor(id,cfg){events.push(['config',cfg]);this.state=1}
  static async getCameras(){return [{id:'front',label:'Front camera'},{id:'back',label:'Back camera'}]}
  async start(device,cfg,cb){success=cb;events.push(['start',device,cfg]);if(startImpl)await startImpl();this.state=2}
  getState(){return this.state}
  async stop(){events.push(['stop']);this.state=1}
  clear(){events.push(['clear'])}
  async applyVideoConstraints(){events.push(['focus'])}
 }
 const context=vm.createContext({window:{Html5Qrcode:Scanner,Html5QrcodeSupportedFormats:{QR_CODE:0}},URL,console:{info(){},error(){},debug(){},warn(){}},setTimeout:fn=>{timers.push(fn);return timers.length},clearTimeout(){},$:id=>nodes[id]??=( {innerHTML:'',textContent:'',classList:{add(){},remove(){}}}),parseKey:()=>({}),fillFiscal:()=>events.push(['fill']),fiscalApi:async()=>({}),inferredCategory:()=>'',money:String});
 vm.runInContext("let qrScanner=null,qrNativeStream=null,qrNativeTimer=null,qrNativeVideo=null,qrScanDone=false,qrFallbackTimer=null,qrScanEngine='';",context);
 vm.runInContext(source.slice(source.indexOf('async function loadQrScanner()'),source.indexOf('function localItemsFromText(')),context);
 return {context,events,timers,nodes,run:s=>vm.runInContext(s,context),decode:raw=>success(raw)};
}
test('software decoder uses rear camera, full frame and mirrored decoding',async()=>{
 const h=harness();await h.run('startQrScan()');const cfg=h.events.find(e=>e[0]==='config')[1],start=h.events.find(e=>e[0]==='start');
 assert.equal(cfg.useBarCodeDetectorIfSupported,false);assert.equal(cfg.experimentalFeatures.useBarCodeDetectorIfSupported,false);assert.equal(start[1],'back');assert.equal(start[2].disableFlip,false);assert.equal(start[2].qrbox,undefined);
});
test('decoded QR stops camera and processes only once',async()=>{
 const h=harness();await h.run('startQrScan()');h.decode('https://example.test/qr');h.decode('https://example.test/qr');await new Promise(setImmediate);
 assert.equal(h.events.filter(e=>e[0]==='fill').length,1);assert.equal(h.events.filter(e=>e[0]==='stop').length,1);assert.equal(h.run('qrScanner'),null);assert.equal(h.timers.length,1);
});
test('closing while camera permission/start is pending prevents late reopening',async()=>{
 let release;const h=harness(()=>new Promise(r=>release=r));const pending=h.run('startQrScan()');await new Promise(setImmediate);assert.ok(release);await h.run('stopQrScan()');release();await pending;assert.ok(h.events.some(e=>e[0]==='stop'));assert.equal(h.run('qrScanDone'),true);
});
test('denied permission gives an actionable message without reopening camera',async()=>{
 const h=harness(()=>{const e=Error('Permission denied');e.name='NotAllowedError';throw e});await h.run('startQrScan()');assert.match(h.nodes.scanStatus.textContent,/Permissão da câmera negada/);assert.equal(h.run('qrScanDone'),true);
});
