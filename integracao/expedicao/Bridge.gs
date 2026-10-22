/** Install in TWO NEW Apps Script projects, one for Nokia and one for Claro.
 * Do not replace the existing HTML endpoints. Script Properties:
 * EXPEDICAO_CLIENT=nokia|claro, EXPEDICAO_SPREADSHEET_ID, EXPEDICAO_SECRET,
 * EXPEDICAO_WRITE_ENABLED=false (enable only after isolated homologation).
 * Enable Advanced Google Sheets API. All access is server-to-server HMAC signed.
 */
function doPost(e) {
  try {
    var props = PropertiesService.getScriptProperties(), client = props.getProperty('EXPEDICAO_CLIENT');
    if (client !== 'nokia' && client !== 'claro') throw Error('CONFIG');
    var envelope = JSON.parse(e.postData.contents), secret = props.getProperty('EXPEDICAO_SECRET');
    if (!secret || Math.abs(Date.now() - Number(envelope.timestamp)) > 120000 || !/^[a-f0-9-]{36}$/.test(envelope.nonce)) throw Error('AUTH');
    var signed = envelope.timestamp + '\n' + envelope.nonce + '\n' + envelope.data;
    var expected = Utilities.computeHmacSha256Signature(signed, secret).map(function(n) { return ('0' + ((n + 256) % 256).toString(16)).slice(-2); }).join('');
    if (!expeditionEqual_(expected, String(envelope.signature || ''))) throw Error('AUTH');
    var lock = LockService.getScriptLock(); if (!lock.tryLock(30000)) throw Error('BUSY');
    try {
      var cache = CacheService.getScriptCache(); if (cache.get('nonce:' + envelope.nonce)) throw Error('REPLAY'); cache.put('nonce:' + envelope.nonce, '1', 180);
      var payload = JSON.parse(envelope.data), sheetName = client === 'nokia' ? 'BD_Nokia' : 'CLARO_BD';
      var spreadsheetId = props.getProperty('EXPEDICAO_SPREADSHEET_ID');
      var width = client === 'nokia' ? 25 : 38, data = expeditionRead_(spreadsheetId,sheetName,width);
      expeditionHeaders_(data[0], client);
      if (payload.action === 'read') {
        var rows = data.slice(1).map(function(values) { var row = {}; values.forEach(function(v, i) { row[expeditionColumn_(i)] = String(v); }); return row; }).filter(function(r) { return r.A; });
        var destinations = [];
        if (client === 'claro') {
          var regional = expeditionRead_(spreadsheetId,'CD_Regional',12);
          if (expeditionNorm_(regional[0][0]) !== 'CNPJ' || expeditionNorm_(regional[0][1]) !== 'CENTRO' || expeditionNorm_(regional[0][4]) !== 'CD') throw Error('SCHEMA');
          destinations = regional.slice(1).filter(function(r) { return r[0]; }).map(function(r) { return { cnpj:r[0],center:r[1],region:r[2],ufRegional:r[3],city:r[4],address:r[8]||r[7] }; });
        }
        return expeditionReply_({ok:true,client:client,schemaVersion:1,sheet:sheetName,capturedAt:new Date().toISOString(),rows:rows,destinations:destinations});
      }
      if (['boxes','check-boxes'].indexOf(payload.action) < 0 || props.getProperty('EXPEDICAO_WRITE_ENABLED') !== 'true') throw Error('WRITE_DISABLED');
      var updates = payload.updates, group = payload.group;
      if (!/^[a-f0-9-]{36}$/.test(payload.operationId) || !payload.actor || !group || group.client !== client || !Array.isArray(updates) || !updates.length || updates.length > 500) throw Error('INVALID');
      var byId = {}, seen = {}, boxCol = client === 'nokia' ? 21 : 36, noteCol = client === 'nokia' ? 18 : 37, locationCol = client === 'nokia' ? 2 : 3, statusCol = client === 'nokia' ? 24 : 31;
      data.slice(1).forEach(function(row,i) { if (!row[0]) return; if (byId[row[0]]) throw Error('DUPLICATE_ID'); byId[row[0]]={row:i+2,values:row}; });
      var members=data.slice(1).filter(function(r){
        if(String(r[noteCol])!==String(group.note))return false;
        if(client==='nokia')return true;
        return String(r[9]).replace(/\D/g,'')===group.destination.cnpj && expeditionNorm_(r[10])===group.destination.center && ['EXPEDICAO','CLARO','>CLARO'].indexOf(expeditionNorm_(r[3]))>=0;
      });
      if(!Array.isArray(group.items)||members.length!==group.items.length)throw Error('CONFLICT');
      group.items.forEach(function(i){var found=byId[i.id];if(!found||!members.some(function(r){return r[0]===i.id;}))throw Error('CONFLICT');var r=found.values;
        var checks=client==='nokia'?{2:i.location,6:i.sourceNote,9:i.barcode,10:i.serial,11:i.pn,18:i.note,21:i.box,24:i.status}:{3:i.location,7:i.sourceNote,16:i.pn,17:i.serial,19:i.iw,20:i.sap,26:i.sgp,31:i.status,36:i.box,37:i.note};
        Object.keys(checks).forEach(function(c){if(String(r[c]||'')!==String(checks[c]||''))throw Error('CONFLICT');});
      });
      var targets = [], verifyRanges = [];
      updates.forEach(function(u) {
        var id=String(u.id||''),found=byId[id],b=String(u.box||''),old=String(u.oldBox||''),expected=u.expected;
        if (!found || seen[id] || !/^[1-9][0-9]{0,5}$/.test(b) || !expected) throw Error('INVALID'); seen[id]=true;
        var r=found.values,location=expeditionNorm_(r[locationCol]);
        if (String(r[noteCol])!==String(group.note) || !r[statusCol] || (client==='nokia' ? location.indexOf('EXPEDICAO')<0 : location!=='EXPEDICAO')) throw Error('CONFLICT');
        if (String(r[boxCol])!==old || String(r[statusCol])!==expected.status) throw Error('CONFLICT');
        if (client==='claro' && (String(r[9]).replace(/\D/g,'')!==group.destination.cnpj || expeditionNorm_(r[10])!==group.destination.center)) throw Error('CONFLICT');
        if (client==='nokia' && (old || Number(b)>999)) throw Error('CONFLICT');
        targets.push({range:"'"+sheetName+"'!"+(client==='nokia'?'V':'AK')+found.row,values:[[Number(b)]]});
        verifyRanges.push({range:targets[targets.length-1].range,expected:String(Number(b))});
        if(client==='nokia' && !r[20]) { var timeZone=Sheets.Spreadsheets.get(spreadsheetId,{fields:'properties.timeZone'}).properties.timeZone,offset=Utilities.formatDate(new Date(),timeZone,'Z'),minutes=(Number(offset.slice(1,3))*60+Number(offset.slice(3,5)))*(offset[0]==='-'?-1:1),serial=(Date.now()+minutes*60000-Date.UTC(1899,11,30))/86400000; targets.push({range:"'"+sheetName+"'!U"+found.row,values:[[serial]]}); verifyRanges.push({range:targets[targets.length-1].range,date:true}); }
      });
      // Different statuses may share a box. The complete source snapshot must still match.
      data.slice(1).forEach(function(r) {
        if(String(r[noteCol])!==String(group.note))return;
        if(client==='claro'&&(String(r[9]).replace(/\D/g,'')!==group.destination.cnpj||expeditionNorm_(r[10])!==group.destination.center))return;
        var u=updates.filter(function(u){return u.id===String(r[0]);})[0],b=u?String(u.box):String(r[boxCol]||'');
        if(b&&!expeditionNorm_(r[statusCol]))throw Error('CONFLICT');
      });
      // Single batch after all validation. Only V/U or AK are permitted.
      if(payload.action==='check-boxes')return expeditionReply_({ok:true,client:client,schemaVersion:1,operationId:payload.operationId,validated:updates.length,written:0});
      Sheets.Spreadsheets.Values.batchUpdate({valueInputOption:'RAW',data:targets},spreadsheetId);
      var actual=Sheets.Spreadsheets.Values.batchGet(spreadsheetId,{ranges:verifyRanges.map(function(v){return v.range;}),valueRenderOption:'FORMATTED_VALUE'}).valueRanges||[];
      verifyRanges.forEach(function(v,i){var value=actual[i]&&actual[i].values&&actual[i].values[0]?String(actual[i].values[0][0]||''):'';if(v.date?!value:value!==v.expected)throw Error('READBACK');});
      return expeditionReply_({ok:true,client:client,schemaVersion:1,operationId:payload.operationId,verified:updates.length,capturedAt:new Date().toISOString()});
    } finally { lock.releaseLock(); }
  } catch(error) { return expeditionReply_({ok:false,error:String(error.message||'ERROR').match(/^(AUTH|BUSY|REPLAY|CONFIG|SCHEMA|WRITE_DISABLED|INVALID|DUPLICATE_ID|CONFLICT|READBACK)$/)?error.message:'ERROR'}); }
}
function doGet() { return expeditionReply_({ok:false,error:'AUTH'}); }
function autorizarLeitura() {
  var props=PropertiesService.getScriptProperties(),client=props.getProperty('EXPEDICAO_CLIENT');
  if(client!=='nokia'&&client!=='claro')throw Error('CONFIG');
  var sheetName=client==='nokia'?'BD_Nokia':'CLARO_BD',data=expeditionRead_(props.getProperty('EXPEDICAO_SPREADSHEET_ID'),sheetName,client==='nokia'?25:38);
  expeditionHeaders_(data[0],client);
  console.log(JSON.stringify({client:client,readOnly:true,sheet:sheetName,dataRows:data.slice(1).filter(function(r){return r[0];}).length}));
}
// Advanced Sheets reads accept spreadsheets.readonly; SpreadsheetApp.openById requires broader access.
function expeditionRead_(id,name,width) { var values=Sheets.Spreadsheets.Values.get(id,"'"+name+"'!A:"+expeditionColumn_(width-1),{valueRenderOption:'FORMATTED_VALUE'}).values||[];if(!values.length)throw Error('SCHEMA');return values.map(function(row){return Array.from({length:width},function(_,i){return String(row[i]===undefined?'':row[i]);});}); }
function expeditionColumn_(n) { var s='';do{s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26)-1;}while(n>=0);return s; }
function expeditionNorm_(v) { return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toUpperCase(); }
function expeditionEqual_(a,b) { if(a.length!==b.length)return false;var diff=0;for(var i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0; }
function expeditionHeaders_(row,client) { var expected=client==='nokia'?{0:'ID',2:'Onde Está',6:'Nº Doc Envio',9:'Código de Barras',10:'Nº Série',11:'Part Number',18:'Nº Doc Liberação',20:'Data da Expedição',21:'Caixa',24:'Status do Atendimento'}:{0:'ID',3:'Onde está',7:'Nota Fiscal Claro',9:'CNPJ',10:'Centro',16:'Part. Number',17:'Nº de Série',20:'CÓD. SAP',31:'Status',36:'Caixa',37:'Nota fiscal retorno'};Object.keys(expected).forEach(function(i){if(expeditionNorm_(row[i])!==expeditionNorm_(expected[i]))throw Error('SCHEMA');}); }
function expeditionReply_(data) { return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON); }
