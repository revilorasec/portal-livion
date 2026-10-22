import { APP, permissions, authorize, sourceGroups, validateDraft, boxUpdates, prepareExport } from './domain.mjs';
import { ExpeditionError, need, text, sha256 } from './common.mjs';
import { decodeModel,modelDestinations } from './models.mjs';
const ORIGINS = new Set(['https://portal.livionsolutions.com.br', 'https://revilorasec.github.io']);
export function createService(deps) {
  return async req => {
    const origin = req.headers.get('origin'), headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Vary': 'Origin', 'X-Content-Type-Options': 'nosniff', 'Access-Control-Allow-Origin': ORIGINS.has(origin) ? origin : 'https://portal.livionsolutions.com.br', 'Access-Control-Allow-Headers': 'authorization,content-type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' };
    const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
    try {
      need(!origin || ORIGINS.has(origin), 'Origem não permitida.', 403);
      if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
      need(['GET', 'POST'].includes(req.method), 'Método não permitido.', 405);
      const raw = req.headers.get('authorization') || ''; need(/^Bearer \S+$/.test(raw) && raw.length < 10000, 'Entre no Portal Livion.', 401);
      const identity = await deps.identify(raw.slice(7)), user = await deps.db.user(identity);
      need(user?.active && user.user_type === 'INTERNO' && (!user.microsoft_id || user.microsoft_id === identity.id), 'Usuário não liberado.', 403);
      need(await deps.db.appEnabled(APP), 'Aplicativo ainda não liberado.', 403);
      const url = new URL(req.url), route = url.pathname.split('/').pop();
      const clients = ['nokia', 'claro'].filter(c => permissions(user, c).view);
      if (route === 'context' && req.method === 'GET') return reply({ clients, user: { name: user.name, email: user.email }, canManageModels:user.profile==='ADMINISTRADOR',canManageOutput:user.profile==='ADMINISTRADOR',centralOutput:Boolean(deps.cloud), permissions: Object.fromEntries(clients.map(c => [c, permissions(user, c)])) });
      const modelRoute=route==='models'||route.startsWith('model-');
      const bodyText = req.method === 'POST' ? await req.text() : ''; need(bodyText.length <= (modelRoute?3000000:250000), 'Solicitação muito grande.', 413);
      let body = {}; if (bodyText) { try { body = JSON.parse(bodyText); } catch { throw new ExpeditionError(400, 'Solicitação inválida.'); } }
      need(body && typeof body === 'object' && !Array.isArray(body), 'Solicitação inválida.');
      const client = req.method === 'GET' ? url.searchParams.get('client') : body.client;
      authorize(user, client, 'view');
      if(route==='cloud-status'&&req.method==='GET')return reply(await deps.cloud.status(client,user.profile==='ADMINISTRADOR'));
      if(['cloud-connect','cloud-poll','cloud-folder'].includes(route)){
        need(req.method==='POST'&&user.profile==='ADMINISTRADOR','Somente o administrador pode configurar o armazenamento central.',403);
        if(route==='cloud-connect')return reply(await deps.cloud.connect(user.email));
        if(route==='cloud-poll')return reply(await deps.cloud.poll(user.email,body.sessionId));
        need(Number.isSafeInteger(body.revision)&&body.revision>=0,'Atualize as configurações centrais.');
        return reply(await deps.cloud.saveFolder(client,body.path,body.revision,user.email));
      }
      if(route==='settings'){
        need(!deps.cloud,'Use as configurações centrais do administrador. A equipe não precisa conectar OneDrive.',403);
        if(req.method==='GET')return reply({client,settings:await deps.db.settings(user.email,client)});
        authorize(user,client,'generate');need(Number.isSafeInteger(body.revision)&&body.revision>=0,'Atualize as configurações.');
        const folder=await deps.verifyFolder(raw.slice(7),body.folder);
        return reply(await deps.db.saveSettings({client,actor:user.email,folder,revision:body.revision}));
      }
      if(modelRoute){
        need(user.profile==='ADMINISTRADOR','Somente administradores podem gerenciar modelos.',403);
        const actor=user.email;
        const catalog=await deps.db.allModels(client),stored=catalog.find(m=>m.id===(body.id||url.searchParams.get('id')));
        if(route==='models'&&req.method==='GET')return reply({client,models:catalog});
        if(route==='model-download'&&['GET','POST'].includes(req.method)){
          need(stored,'Modelo não encontrado.',404);const bytes=await deps.modelBytes(stored);need(await sha256(bytes)===stored.sha256,'A cópia do modelo não passou na conferência.',409);
          return reply({filename:/\.xlsx$/i.test(stored.name)?stored.name:stored.name+'.xlsx',bytes:deps.base64(bytes),sha256:stored.sha256});
        }
        if(route==='model-state'&&req.method==='POST'){
          need(stored&&['archive','restore'].includes(body.action),'Modelo ou ação inválida.');need(Number.isInteger(body.revision),'Revisão inválida.');
          return reply(await deps.db.manageModel({client,action:body.action,id:stored.id,revision:body.revision,actor}));
        }
        need(req.method==='POST'&&['model-check','model-edit-check','model-save'].includes(route),'Operação de modelo inválida.',404);
        let bytes,model;
        if(route==='model-edit-check'){
          need(stored&&!stored.deletedAt&&stored.revision===body.revision,'O modelo mudou. Atualize o catálogo.',409);
          const original=await deps.modelBytes(stored);need(await sha256(original)===stored.sha256,'O modelo original não passou na conferência.',409);
          const result=await deps.editModel(stored,original,body.fields);bytes=result.bytes;model=result.model;
        }else{bytes=decodeModel(body);model=await deps.inspectModel(client,bytes,body.filename);}
        const source=await deps.readSource(client),active=catalog.filter(m=>m.active&&!m.deletedAt),destinations=modelDestinations(client,model,source,active);
        need(destinations.length,'O CNPJ do modelo não identifica um destino único e válido no cadastro atual. Confira o cadastro antes de ativar.');
        if(route!=='model-save')return reply({model,destinations,...(route==='model-edit-check'?{bytes:deps.base64(bytes),sourceId:stored.id,sourceRevision:stored.revision}:{})});
        need(model.sha256===body.sha256,'O arquivo mudou após a validação.',409);
        if(body.sourceId){const previous=catalog.find(m=>m.id===body.sourceId);need(previous&&!previous.deletedAt&&Number.isInteger(body.sourceRevision)&&previous.revision===body.sourceRevision,'A versão editada mudou. Atualize o catálogo.',409);}
        const selected=destinations.find(d=>d.key===body.destinationKey);need(selected,'Selecione um destino conferido.');
        need(selected.matches||body.useModelAddress===true,'O endereço do modelo difere do cadastro. Confirme expressamente o uso do endereço do modelo.');
        need(Array.isArray(body.expectedActiveIds)&&body.expectedActiveIds.every(v=>typeof v==='string'),'Atualize a validação do destino.');
        need(JSON.stringify([...body.expectedActiveIds].sort())===JSON.stringify(selected.activeIds),'O modelo ativo mudou. Confira novamente.',409);
        model={...model,centers:client==='claro'?[selected.center]:undefined,overrideDestination:body.useModelAddress===true,validatedBy:actor,validatedAt:new Date().toISOString()};
        const saved=await deps.db.manageModel({client,action:'save',model,center:selected.center,contentBase64:deps.base64(bytes),expectedActiveIds:selected.activeIds,sourceId:body.sourceId,sourceRevision:body.sourceRevision,actor});
        return reply(saved);
      }
      if(route==='draft-archive'&&req.method==='POST'){
        authorize(user,client,'edit');
        need(typeof body.groupKey==='string'&&body.groupKey.length>0&&body.groupKey.length<=1000&&Number.isSafeInteger(body.revision)&&body.revision>0,'Atualize a lista de rascunhos antes de remover.');
        return reply(await deps.db.archiveDraft({client,groupKey:body.groupKey,revision:body.revision,actor:user.email}));
      }
      const actor = user.email, source = await deps.readSource(client), models = await deps.db.models(client), loaded = await sourceGroups(client, source, models, req.method==='POST'?body.groupKey:undefined);
      const states = await deps.db.dispatches(client);
      for (const group of loaded.groups) { const state = states.find(s => s.group_key === group.key); group.dispatch = state || null; group.dispatchState = state?.fingerprint === group.dispatchFingerprint ? 'EXPEDIDO' : group.active ? 'EM_EXPEDICAO' : 'FINALIZADO_BD'; group.changedSinceDispatch = Boolean(state && state.fingerprint !== group.dispatchFingerprint); }
      if (route === 'load' && req.method === 'GET') return reply({ ...loaded, client, permissions: permissions(user, client), writeEnabled: deps.writeEnabled(client), drafts: await deps.db.drafts(client), pendingOperations: await deps.db.pending(client),pendingCloudJobs:deps.cloud?await deps.cloud.pending(client):[] });
      const group = loaded.groups.find(g => g.key === body.groupKey); need(group, 'A nota não existe mais nesta origem.', 409, 'CONFLICT');
      need(body.fingerprint === group.fingerprint, 'O BD, destino ou modelo mudou. Atualize e confira a nota.', 409, 'CONFLICT');
      if (route === 'draft' && req.method === 'POST') {
        authorize(user, client, 'edit');
        need(Number.isSafeInteger(body.revision) && body.revision >= 0 && body.revision < 2147483647, 'Revisão do rascunho inválida.');
        const draft = validateDraft(group, body.draft);
        if(group.dispatchState!=='EM_EXPEDICAO')need(group.items.every(i=>text(i.box)===text(draft.assignments[i.id])),'As caixas do histórico devem permanecer iguais ao BD.',409);
        const saved = await deps.db.saveDraft({ client, groupKey: group.key, fingerprint: group.fingerprint, revision: body.revision, draft, actor });
        return reply(saved);
      }
      if (route === 'boxes' && req.method === 'POST') {
        authorize(user, client, 'write'); need(group.dispatchState !== 'EXPEDIDO', 'A expedição já foi concluída.', 409);
        need(deps.writeEnabled(client), 'A gravação está bloqueada até a homologação da integração.', 503, 'WRITE_DISABLED');
        const updates = boxUpdates(group, body.draft); need(/^[a-f0-9-]{36}$/.test(body.operationId), 'Identificador da operação inválido.');
        const payloadHash = await sha256(JSON.stringify({ group: group.key, updates }));
        const op = await deps.db.beginOperation({ id: body.operationId, client, groupKey: group.key, fingerprint: group.fingerprint, payloadHash, updates, actor });
        if (op.state !== 'PREPARED') {
          need(op.state!=='NOT_WRITTEN','Esta tentativa foi encerrada sem gravação. Atualize a nota e inicie uma nova gravação.',409,'NOT_WRITTEN');
          return reply({ operation: op, pending: op.state !== 'CONFIRMED' });
        }
        // A durable claim is committed before any network request. A timeout never retries a POST.
        need(await deps.db.claimOperation(op.id), 'Operação já em execução. Confira o histórico.', 409);
        let writeError;
        try { await deps.writeSource(client, { operationId: op.id, group, updates, actor }); } catch(error) { writeError=error; }
        // A lost Google response is not proof that the write failed. Always read
        // the actual cells once, without resending the write, before marking pending.
        try {
          const reread = await sourceGroups(client, await deps.readSource(client), models, group.key), current = reread.groups.find(g => g.key === group.key);
          if(!(current && updates.every(u => current.items.some(i => i.id === u.id && text(i.box) === u.box && (client !== 'nokia' || i.expeditionDate)))))throw writeError||new ExpeditionError(409,'A gravação ainda não foi confirmada por leitura de retorno.','PENDING');
          const saved = await deps.db.finishOperation(op.id, 'CONFIRMED', { verified: updates.length }, actor); return reply({ operation: saved, verified: updates.length });
        } catch(error) {
          const failure=writeError||error,known=failure instanceof ExpeditionError;
          const code=known?failure.code:'SOURCE_UNCONFIRMED';
          const message=(known?failure.message+' ':'A resposta da gravação não foi confirmada. ')+'Use Conferir gravação; nenhuma gravação foi repetida.';
          console.warn('expedicao_boxes_pending',JSON.stringify({client,operationId:op.id,code}));
          await deps.db.finishOperation(op.id, 'PENDING', { message,code }, actor);
          return reply({ pending: true, operationId: op.id, message,code }, 202);
        }
      }
      if (route === 'reconcile' && req.method === 'POST') {
        authorize(user, client, 'write'); const op = await deps.db.operation(body.operationId);
        need(op && op.client === client && op.group_key === group.key, 'Operação inválida.', 404);
        need(['DISPATCHED', 'PENDING', 'CONFIRMED'].includes(op.state), 'A operação não foi enviada.', 409);
        const matched = op.updates.every(u => group.items.some(i => i.id === u.id && i.box === u.box && (client !== 'nokia' || i.expeditionDate)));
        if(!matched&&['DISPATCHED','PENDING'].includes(op.state)&&Date.now()-Date.parse(op.updated_at)>=600000){
          // Wait beyond the Google worker lifetime, then release only a completely
          // unwritten, unchanged request. This never sends a Google write or retry.
          const fields=client==='nokia'?['id','location','sourceNote','barcode','serial','pn','note','box','status','expeditionDate']:['id','location','sourceNote','pn','serial','iw','sap','sgp','status','box','note'];
          const unchanged=op.updates.length>0&&op.updates.every(u=>group.items.some(i=>i.id===u.id&&text(i.box)===text(u.oldBox)&&u.box!==u.oldBox&&u.expected&&fields.every(f=>text(i[f])===text(u.expected[f]))));
          if(unchanged){
            const operation=await deps.db.finishOperation(op.id,'NOT_WRITTEN',{unchanged:op.updates.length,readOnlyCheck:true},actor);
            need(operation.state==='NOT_WRITTEN','A operação mudou durante a conferência. Atualize a nota.',409);
            return reply({operation,notWritten:true,message:'Nenhuma caixa desta tentativa foi gravada. O histórico foi preservado e a nota foi liberada. Confira o rascunho e clique em Gravar caixas no BD.'});
          }
        }
        need(matched, 'Os valores ainda não correspondem à operação. O histórico foi preservado; nenhuma escrita foi repetida.', 409, 'PENDING');
        return reply({ operation: await deps.db.finishOperation(op.id, 'CONFIRMED', { verified: op.updates.length, reconciled: true }, actor) });
      }
      if (route === 'generate' && req.method === 'POST') {
        authorize(user, client, 'generate');
        const plan = prepareExport(group, body.draft);
        need(group.items.every(i => text(i.box) === text(plan.draft.assignments[i.id])), 'Grave e confira as caixas no BD antes de gerar e concluir a expedição.', 409);
        const model = models.find(m => m.id === group.model.id), bytes = await deps.modelBytes(model);
        need(await sha256(bytes) === model.sha256, 'O modelo não corresponde à versão conferida.', 409);
        if(deps.cloud){
          const started=await deps.cloud.begin({id:body.operationId,client,groupKey:group.key,fingerprint:group.fingerprint,actor});
          const job=started.job;
          if(!started.created){need(job.state==='COMPLETED','Este salvamento já foi iniciado. Use Conferir salvamento; nenhuma gravação será repetida.',409,'CLOUD_PENDING');return reply({exportId:job.export_id,dispatchState:'EXPEDIDO',alreadyDispatched:true,central:true});}
          try{
            need(!(await deps.db.pending(client)).some(op=>op.group_key===group.key),'Há gravação de caixas pendente de conferência.',409);
            const result=await deps.generateWorkbook(model,bytes,group,plan);
            const record=await deps.db.recordExport({client,groupKey:group.key,fingerprint:group.fingerprint,dispatchFingerprint:group.dispatchFingerprint,actor,modelId:model.id,modelHash:model.sha256,fileHash:result.sha256,output:plan.output,ids:group.items.map(i=>i.id),draft:plan.draft});
            const receipt=await deps.cloud.save(job,record,result,plan.output);
            const fresh=await sourceGroups(client,await deps.readSource(client),await deps.db.models(client),group.key),current=fresh.groups.find(g=>g.key===group.key);
            need(current?.fingerprint===group.fingerprint,'O Excel foi salvo, mas o BD ou modelo mudou. Use Conferir salvamento para revisar a conclusão.',409,'CLOUD_PENDING');
            await deps.db.completeDispatch({exportId:record.id,groupKey:group.key,client,fingerprint:group.dispatchFingerprint,actor,savedPath:receipt.path,fileHash:result.sha256});
            await deps.cloud.complete(job.id);
            return reply({central:true,exportId:record.id,dispatchState:'EXPEDIDO',alreadyDispatched:group.dispatchState==='EXPEDIDO',filename:plan.output.filename});
          }catch(e){await deps.cloud.failBeforeUpload(job.id);throw e;}
        }
        const result = await deps.generateWorkbook(model, bytes, group, plan);
        // Bind completion to the fresh BD snapshot, generated bytes and authenticated actor.
        const record = await deps.db.recordExport({ client, groupKey: group.key, fingerprint: group.fingerprint, dispatchFingerprint:group.dispatchFingerprint, actor, modelId: model.id, modelHash: model.sha256, fileHash: result.sha256, output: plan.output, ids: group.items.map(i => i.id), draft: plan.draft });
        return reply({ exportId: record.id, ...plan.output, sha256: result.sha256, bytes: deps.base64(result.bytes), alreadyDispatched: group.dispatchState === 'EXPEDIDO', warnings: model.inheritedErrors?.length ? ['O modelo contém erros em cache anteriores à geração. As fórmulas foram preservadas para recálculo no Excel.'] : [] });
      }
      if (route === 'saved' && req.method === 'POST') {
        need(!deps.cloud,'A conclusão é confirmada pelo servidor após conferir o arquivo central.',403);
        authorize(user, client, 'generate'); const exp = await deps.db.export(body.exportId);
        need(exp && exp.client === client && exp.group_key === group.key && exp.actor_email === actor, 'Comprovante de geração inválido.', 403);
        need(exp.file_hash === body.sha256 && exp.fingerprint === group.fingerprint, 'Arquivo ou BD divergente da geração. Atualize e confira.', 409);
        need(group.items.every(i => text(i.box) === text(exp.draft.assignments[i.id])), 'Grave e confira as caixas no BD antes de concluir a expedição.', 409);
        need(!(await deps.db.pending(client)).some(op => op.group_key === group.key), 'Há gravação pendente de conferência para esta nota.', 409);
        const result = await deps.db.completeDispatch({ exportId: exp.id, groupKey: group.key, client, fingerprint: group.dispatchFingerprint, actor, savedPath: text(body.savedPath).slice(0, 1500), fileHash: body.sha256 });
        return reply({ ...result, dispatchState: 'EXPEDIDO' });
      }
      if(route==='cloud-reconcile'&&req.method==='POST'){
        authorize(user,client,'generate');const job=await deps.cloud.job(body.operationId);
        need(job&&job.client===client&&job.group_key===group.key&&(job.actor_email===actor||user.profile==='ADMINISTRADOR'),'Salvamento não disponível para este usuário e nota.',403);
        need(job.export_id,'O salvamento não chegou à criação do arquivo. Peça ao administrador para conferir.',409);
        const exp=await deps.db.export(job.export_id);
        need(exp&&exp.client===client&&exp.group_key===group.key,'O comprovante desta geração não corresponde à nota.',409);
        const receipt=await deps.cloud.verify(job,exp,actor);
        if(receipt.notSaved)return reply({notSaved:true,message:'A pasta central está acessível, mas esta tentativa não salvou o Excel. A nota foi liberada. Clique em Gerar Excel e concluir expedição para iniciar um novo salvamento.'});
        need(exp.fingerprint===group.fingerprint,'O BD ou modelo mudou desde a geração. Confira antes de concluir.',409);
        need(group.items.every(i=>text(i.box)===text(exp.draft.assignments[i.id])),'As caixas não correspondem ao arquivo gerado.',409);
        need(!(await deps.db.pending(client)).some(op=>op.group_key===group.key),'Há gravação de caixas pendente de conferência.',409);
        await deps.db.completeDispatch({exportId:exp.id,groupKey:group.key,client,fingerprint:group.dispatchFingerprint,actor:exp.actor_email,savedPath:receipt.path,fileHash:exp.file_hash});
        await deps.cloud.complete(job.id);return reply({central:true,dispatchState:'EXPEDIDO'});
      }
      throw new ExpeditionError(404, 'Operação não encontrada.');
    } catch (error) {
      const known = error instanceof ExpeditionError;
      return reply({ message: known ? error.message : 'O serviço não conseguiu concluir a operação. Seus dados foram preservados.', code: known ? error.code : 'SERVICE_UNAVAILABLE' }, known ? error.status : 503);
    }
  };
}
