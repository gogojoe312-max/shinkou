'use strict';
const {createHash}=require('node:crypto');
const Targets=require('../preparation-targets.js');
const {MAX_BYTES,resolveRegisteredMaterial,downloadRegisteredMaterial}=require('./dropbox-material.cjs');
const OWNER='gogojoe312-max',REPO='shinkou-data',PATH='utacheck/prepared.json';
const POLL_MS=5*60*1000,MAX_TARGETS=20,MAX_FILES_PER_TARGET=10,MAX_FILES_PER_RUN=40,MAX_MANIFEST_BYTES=15*1024*1024;
const TYPES=new Set(['recording-song','recording-schedule','recording-addition','live-addition','live-update','material-update','original-excel']);
const SECRET_KEYS=new Set(['__proto__','constructor','prototype','ghToken','bkKey','bkGistId','editPass','token','password','secret','credentials','gistId','src','key','deliveryGroupId','deliveryMode']);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const id=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.-]{0,199}$/.test(value)&&!SECRET_KEYS.has(value);
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const failure=(status,message)=>Object.assign(Error(message),{status});
const clone=value=>JSON.parse(JSON.stringify(value));
const label=value=>String(value||'').slice(0,240);
function safeJSON(value,depth=0){
 if(depth>60)throw failure(409,'準備データの形式を確認してください。');
 if(value===null||['string','boolean'].includes(typeof value)||typeof value==='number'&&Number.isFinite(value))return;
 if(!value||typeof value!=='object')throw failure(409,'準備データの形式を確認してください。');
 for(const [key,item]of Object.entries(value)){if(SECRET_KEYS.has(key))throw failure(409,'準備データに接続情報は含められません。');safeJSON(item,depth+1);}
}
function operation(value,withHash=false){
 if(!object(value)||Object.keys(value).some(key=>!['id','type','packet',...(withHash?['sha256']:[])].includes(key))||!id(value.id)||!TYPES.has(value.type)||!object(value.packet))throw failure(409,'準備操作の形式を確認してください。');
 safeJSON(value.packet);const sha256=digest(value.packet);
 if(withHash&&value.sha256!==sha256)throw failure(409,'既存の準備操作の内容を確認できません。');
 return {id:value.id,type:value.type,sha256,packet:clone(value.packet)};
}
function validateManifest(value){
 if(value===null)return null;
 if(!object(value)||Object.keys(value).some(key=>!['app','version','owner','revision','createdAt','operations'].includes(key))||value.app!=='utacheck-private-preparation'||value.version!==1||value.owner!==OWNER||!id(value.revision)||typeof value.createdAt!=='string'||!Number.isFinite(Date.parse(value.createdAt))||!Array.isArray(value.operations)||value.operations.length>100)throw failure(409,'既存の準備一覧を確認できません。上書きはしていません。');
 if(Buffer.byteLength(JSON.stringify(value))>MAX_MANIFEST_BYTES)throw failure(413,'準備一覧の容量が上限に達しています。');
 const seen=new Set();for(const item of value.operations){operation(item,true);if(seen.has(item.id))throw failure(409,'既存の準備操作IDが重複しています。');seen.add(item.id);}
 return clone(value);
}
async function metadataRequest(endpoint,body,token,http){
 const url='https://api.dropboxapi.com/2/'+endpoint;
 let response;
 try{response=await http(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(25000),headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)});}
 catch{throw failure(403,'Dropboxの資料を確認できません。再接続してください。');}
 if(!response.ok||response.redirected||response.url&&response.url!==url)throw failure(response.status===429?429:403,'Dropboxの資料を確認できません。再接続してください。');
 if(Number(response.headers.get('content-length')||0)>256*1024)throw failure(502,'Dropboxの資料情報が大きすぎます。');
 if(!response.body?.getReader)throw failure(502,'Dropboxの資料情報を確認できません。');
 const reader=response.body.getReader(),chunks=[];let size=0;
 try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>256*1024)throw failure(502,'Dropboxの資料情報が大きすぎます。');chunks.push(Buffer.from(part.value));}}
 catch(error){try{await reader.cancel();}catch{}throw error;}finally{reader.releaseLock();}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw failure(502,'Dropboxの資料情報を確認できません。');}
}
async function metadata({state,source,token,fetch:http}){
 const registered=resolveRegisteredMaterial(state,{songId:source.songId,materialId:source.materialId});
 if(registered.id!==source.fileId)throw failure(409,'登録資料の識別情報が変わっています。');
 const file=await metadataRequest('files/get_metadata',{path:registered.id,include_deleted:false},token,http);
 if(!object(file)||file['.tag']!=='file'||file.id!==registered.id||typeof file.name!=='string'||!file.name||file.name.length>2000||/[\\/\x00-\x1f]/.test(file.name)||!Number.isSafeInteger(file.size)||file.size<0||typeof file.rev!=='string'||!/^[A-Za-z0-9._-]{1,128}$/.test(file.rev))throw failure(409,'Dropboxの資料の識別情報を確認できません。');
 if(file.size>MAX_BYTES)throw failure(413,'資料は5MB以下のファイルを登録してください。');
 if(registered.rev&&registered.rev!==file.rev||registered.name&&registered.name!==file.name)throw failure(409,'登録後にDropboxの資料が更新されています。最新版を確認して登録し直してください。');
 // Cached bytes must not outlive the exact saved folder authorization.
 if(registered.folder){
  let endpoint='files/list_folder',body={path:registered.path.slice(0,registered.path.lastIndexOf('/')),shared_link:{url:registered.folder},recursive:false,include_deleted:false,limit:200},count=0;
  const cursors=new Set(),matches=[];
  while(true){
   const page=await metadataRequest(endpoint,body,token,http);
   if(!Array.isArray(page.entries)||typeof page.has_more!=='boolean')throw failure(502,'Dropboxの登録フォルダを確認できません。');
   count+=page.entries.length;if(count>4000)throw failure(403,'登録資料のフォルダを分けて確認してください。');
   matches.push(...page.entries.filter(entry=>entry?.id===registered.id));
   if(!page.has_more)break;
   if(typeof page.cursor!=='string'||!page.cursor||page.cursor.length>2000||cursors.has(page.cursor)||cursors.size>=25)throw failure(502,'Dropboxの登録フォルダを確認できません。');
   cursors.add(page.cursor);endpoint='files/list_folder/continue';body={cursor:page.cursor};
  }
  if(matches.length!==1||matches[0]['.tag']!=='file'||matches[0].rev!==file.rev||matches[0].name!==file.name||matches[0].size!==file.size)throw failure(409,'登録フォルダ内の資料が変わっています。登録内容を確認してください。');
 }
 return {id:file.id,name:file.name,rev:file.rev,size:file.size,binding:digest({songId:source.songId,materialId:source.materialId,registered})};
}
function createPreparationService(options){
 const {readState,readManifest,writeManifest,config,fetch:http=fetch}=options;
 const now=options.now||Date.now,select=options.select||Targets.select;
 const compile=options.compile||((...args)=>require('./preparation-material.cjs').compile(...args));
 const resolveFolders=options.resolveFolders||((args)=>require('./preparation-folder.cjs').resolveFolderSources(args));
 const inspect=options.inspect||metadata,download=options.download||downloadRegisteredMaterial;
 const compiled=new Map(),materials=new Map();let materialBytes=0,compiledBytes=0,inflight=null,lastConnected=false;
 let status={state:'idle',running:false,lastRunAt:null,nextRunAt:0,targets:[],targetCount:0,queued:0,unchanged:0,pending:[]};
 const getStatus=()=>clone(status);
 const addPending=(target,reason,text)=>{if(status.pending.length<100)status.pending.push({targetId:target?.id||'',reason,label:label(text)});};
 function storeMaterial(key,value){
  if(materials.has(key)){materialBytes-=materials.get(key).bytes.length;materials.delete(key);}materials.set(key,value);materialBytes+=value.bytes.length;
  while(materialBytes>30*1024*1024||materials.size>60){const oldest=materials.keys().next().value;materialBytes-=materials.get(oldest).bytes.length;materials.delete(oldest);}
 }
 async function execute(token){
  if(config.owner!==OWNER||config.repo!==REPO)throw failure(503,'歌チェックの準備先を非公開の shinkou-data に設定してください。');
  const original=await readState();
  if(!original.json||!original.sha){status.state='pending';addPending(null,'unsaved','同期済みの進行データがありません。');return getStatus();}
  const selection=select(original.json,{now:new Date(now()),days:30});
  status.today=selection.today;status.through=selection.through;status.targetCount=selection.targets.length;
  const targets=selection.targets.slice(0,MAX_TARGETS);
  status.targets=targets.map(target=>({id:target.id,kind:target.kind,title:label(target.title),dates:target.dates,songIds:target.songIds}));
  for(const item of selection.pending||[])addPending(item,item.reason,item.label);
  if(selection.targets.length>MAX_TARGETS)addPending(null,'target-limit','準備対象が多いため、一度に確認できる件数を超えています。');
  if(!token){status.state='disconnected';addPending(null,'dropbox-disconnected','Dropboxに接続すると登録資料の準備を確認できます。');return getStatus();}
  const manifestFile=await readManifest(),existing=validateManifest(manifestFile.json);
  const existingOperations=existing?.operations||[],prepared=[];let inspectedFiles=0;
  for(const target of targets){
   let sourceState=original.json,sources=(target.sources||[]).filter(source=>source.kind==='file');
   if((target.sources||[]).some(source=>source.kind==='folder')){
    const resolved=await resolveFolders({state:original.json,target,token,fetch:http});sourceState=resolved.state;sources=resolved.sources;
    for(const item of resolved.pending||[])addPending(target,item.reason,item.label);
   }
   sources=sources.filter(source=>source.kind==='file');
   if(!sources.length){addPending(target,'source-missing','曲に対応するDropbox資料を選択してください。');continue;}
   if(sources.length>MAX_FILES_PER_TARGET||inspectedFiles+sources.length>MAX_FILES_PER_RUN){addPending(target,'source-limit','登録資料が多いため、一度に確認できる件数を超えています。');continue;}
   inspectedFiles+=sources.length;
   try{
    const metadataRows=[];
    for(const source of sources)metadataRows.push({source,file:await inspect({state:sourceState,source,token,fetch:http})});
    const key=digest({target,sources:metadataRows.map(({source,file})=>({songId:source.songId,materialId:source.materialId,file}))});
    let result=compiled.get(key)?.result;
    if(result)status.unchanged++;
    else{
     const input=[];
     for(const {source,file}of metadataRows){
      const cacheKey=digest({binding:file.binding,id:file.id,rev:file.rev,name:file.name,size:file.size});let cached=materials.get(cacheKey);
      if(!cached){
       const value=await download({state:sourceState,request:{songId:source.songId,materialId:source.materialId},token,fetch:http});
       if(value.file?.id!==file.id||value.file.rev!==file.rev||value.file.name!==file.name||value.file.size!==file.size)throw failure(409,'取得中にDropboxの資料が変わりました。次の確認をお待ちください。');
       const bytes=Buffer.from(value.content,'base64');if(bytes.length!==file.size||bytes.length>MAX_BYTES)throw failure(409,'取得した資料の大きさを確認できません。');
       cached={bytes};storeMaterial(cacheKey,cached);
      }
      input.push({songId:source.songId,materialId:source.materialId,fileId:file.id,name:file.name,rev:file.rev,bytes:cached.bytes});
     }
     const output=await compile(target,input);
     if(!object(output)||!Array.isArray(output.operations)||!Array.isArray(output.pending)||output.operations.length>100)throw failure(409,'準備結果の形式を確認できません。');
     result={operations:output.operations.map(item=>operation(item)),pending:output.pending.map(item=>({reason:label(item.reason),label:label(item.label)}))};
     const size=Buffer.byteLength(JSON.stringify(result));if(size>MAX_MANIFEST_BYTES)throw failure(413,'準備結果の容量が上限を超えています。');
     compiled.set(key,{result,size});compiledBytes+=size;
     while(compiled.size>60||compiledBytes>30*1024*1024){const oldest=compiled.keys().next().value;compiledBytes-=compiled.get(oldest).size;compiled.delete(oldest);}
    }
    prepared.push(...result.operations);for(const item of result.pending)addPending(target,item.reason,item.label);
   }catch(error){addPending(target,error.status===409?'source-changed':error.status===429?'rate-limited':'source-unavailable',error.status&&error.status<500?error.message:'資料の確認を完了できませんでした。次の確認で再試行します。');}
  }
  const operations=existingOperations.slice(),ids=new Map(operations.map(item=>[item.id,item])),hashes=new Set(operations.map(item=>item.type+':'+item.sha256));
  for(const item of prepared){
   if(ids.has(item.id)&&(ids.get(item.id).sha256!==item.sha256||ids.get(item.id).type!==item.type))throw failure(409,'同じ準備操作IDの内容が異なります。既存の操作は変更していません。');
   if(hashes.has(item.type+':'+item.sha256))continue;
   ids.set(item.id,item);hashes.add(item.type+':'+item.sha256);operations.push(item);
  }
  if(operations.length>100){status.state='pending';addPending(null,'queue-full','準備一覧が100件の上限に達しています。既存の準備を確認してください。');return getStatus();}
  if(operations.length>existingOperations.length){
   const current=await readState();
   if(current.sha!==original.sha)throw failure(409,'準備中に進行データが更新されました。次の確認で新しい日程を読み直します。');
   const createdAt=new Date(now()).toISOString(),next={app:'utacheck-private-preparation',version:1,owner:OWNER,revision:'auto-'+digest(operations).slice(0,40),createdAt,operations};
   validateManifest(next);await writeManifest(next,manifestFile.sha);status.queued=operations.length-existingOperations.length;
  }
  status.state=status.pending.length?'pending':status.queued?'queued':'unchanged';return getStatus();
 }
 function run({token}={}){
  if(inflight)return inflight;
  const connected=typeof token==='string'&&!!token;
  if(now()<status.nextRunAt&&!(connected&&!lastConnected))return Promise.resolve(getStatus());
  lastConnected=connected;status={state:'running',running:true,lastRunAt:now(),nextRunAt:now()+POLL_MS,targets:[],targetCount:0,queued:0,unchanged:0,pending:[]};
  inflight=(async()=>{
   try{await execute(connected?token:null);}
   catch(error){status.state='error';addPending(null,error.status===409?'conflict':'unavailable',error.status?error.message:'準備を完了できませんでした。次の確認で再試行します。');throw error;}
   finally{status.running=false;inflight=null;}
   return getStatus();
  })();return inflight;
 }
 return {run,status:getStatus};
}
module.exports={createPreparationService,validateManifest,metadata,digest,OWNER,REPO,PATH,POLL_MS,MAX_MANIFEST_BYTES};
