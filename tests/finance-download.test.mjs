import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

test('private downloads accept only the active opaque dashboard and safe generated file types',async()=>{
 const source=await fs.readFile(new URL('../painel-financeiro/app.mjs',import.meta.url),'utf8');
 const events={},downloads=[],acks=[],elements=new Map();
 const frame={postMessage:data=>acks.push(data)};
 const element=id=>{if(!elements.has(id))elements.set(id,{hidden:false,contentWindow:id==='dashboard'?frame:null,files:[],removeAttribute(){},addEventListener(){}});return elements.get(id);};
 const context=vm.createContext({TextEncoder,Blob,Intl,Date,Set,Promise,AbortSignal,URL:{createObjectURL:()=> 'blob:synthetic-file',revokeObjectURL(){}},setTimeout(){},setInterval(){},addEventListener:(name,callback)=>events[name]=callback,document:{getElementById:element,addEventListener(){},body:{appendChild(){}},createElement:()=>({click(){downloads.push({name:this.download,url:this.href});},remove(){}})}});
 assert.ok(source.endsWith('load();\n'));
 vm.runInContext(source.slice(0,-8),context);
 vm.runInContext("token='synthetic-session';",context);
 const content='<!doctype html><html lang="pt-BR"><p>Exemplo sintético</p></html>';
 const request={type:'LIVION_FINANCE_FILE_DOWNLOAD',requestId:'12345678-1234-1234-1234-123456789abc',filename:'Relatorio.html',mime:'text/html;charset=utf-8',content};
 const dispatch=(data=request,source=frame,origin='null')=>events.message({data,source,origin});
 dispatch(request,{},'null');dispatch(request,frame,'https://untrusted.invalid');
 for(const patch of [{mime:'text/javascript'},{filename:'../outside.html'},{filename:'report.exe'},{requestId:'bad'},{content:''},{content:'x'.repeat(12*1024*1024+1)}])dispatch({...request,...patch});
 assert.equal(downloads.length,0);
 element('dashboard').hidden=true;dispatch();assert.equal(downloads.length,0);element('dashboard').hidden=false;
 vm.runInContext("token='';",context);dispatch();assert.equal(downloads.length,0);vm.runInContext("token='synthetic-session';",context);
 dispatch();assert.equal(downloads.length,1);assert.equal(downloads[0].name,'Relatorio.html');assert.equal(acks.length,1);assert.equal(acks[0].type,'LIVION_FINANCE_FILE_READY');assert.ok(!('token' in acks[0]));
 dispatch();assert.equal(downloads.length,1,'Repeated message cannot download twice');
 dispatch({...request,requestId:'22345678-1234-1234-1234-123456789abc',filename:'Lista.csv',mime:'text/csv;charset=utf-8',content:'nome;valor\nExemplo;1,00'});assert.equal(downloads.length,2);
 events.pagehide();dispatch({...request,requestId:'32345678-1234-1234-1234-123456789abc'});assert.equal(downloads.length,2,'Session-cleared frame cannot export');
});
