'use strict';
const {MAX_BYTES,resolveRegisteredMaterial}=require('./dropbox-material.cjs');
const list=value=>Array.isArray(value)?value:[],text=value=>typeof value==='string'?value:'';
const normalized=value=>text(value).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
function folderURL(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&['www.dropbox.com','dropbox.com'].includes(u.hostname)&&/^\/(?:scl\/fo|sh)\/[^/]+\//.test(u.pathname);}catch{return false;}}
const oldPath=value=>text(value).split(/[\\/]/).some(part=>/^(?:old|旧版|過去資料)(?:$|[\s_.（(\-])/i.test(part));
function eligible(name,kind,song,target){
 if(oldPath(name)||/[\\/\x00-\x1f\x7f]/.test(text(name)))return false;
 if(kind==='rec'){
  const title=normalized(song.title);return /\.docx$/i.test(name)&&title.length>=2&&normalized(name.slice(0,-5)).includes(title);
 }
 if(kind!=='live'||!/(?:^|[._ -])prepared\.json$/i.test(name)&&!/^prepared[._ -].*\.json$/i.test(name))return false;
 if(/^prepared\.json$/i.test(name))return true;
 const title=normalized(target.title);return title.length>=2&&normalized(name.slice(0,-5)).includes(title);
}
function sourceRecord(song,record){return {kind:'file',songId:song.id,materialId:record.id,fileId:record.id.slice(8),name:record.name,path:record.path,rev:record.rev||'',sourceFolder:record.sourceFolder};}
function validFile(entry){return entry?.['.tag']==='file'&&/^id:[A-Za-z0-9_-]{1,200}$/.test(text(entry.id))&&/^[A-Za-z0-9._-]{1,128}$/.test(text(entry.rev))&&Number.isSafeInteger(entry.size)&&entry.size>=0&&entry.size<=MAX_BYTES&&!oldPath(entry.path_display||entry.path_lower);}
async function readPage(response){
 const limit=256*1024,length=response.headers.get('content-length');if(length!==null&&(!/^\d+$/.test(length)||Number(length)>limit)){await response.body?.cancel();throw Error('response-size');}
 if(!response.body?.getReader)throw Error('response-body');
 const reader=response.body.getReader(),chunks=[];let size=0;
 try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>limit)throw Error('response-size');chunks.push(Buffer.from(part.value));}}
 catch(error){try{await reader.cancel();}catch{}throw error;}finally{reader.releaseLock();}
 return JSON.parse(Buffer.concat(chunks,size).toString('utf8'));
}
async function folderFiles(url,token,http){
 let endpoint='files/list_folder',body={path:'',shared_link:{url},recursive:false,include_deleted:false,limit:200},count=0;const entries=[],cursors=new Set();
 for(let pageCount=0;pageCount<25;pageCount++){
  const endpointURL='https://api.dropboxapi.com/2/'+endpoint,response=await http(endpointURL,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(25000)});
  if(!response.ok||response.redirected||response.url&&response.url!==endpointURL)throw Error('dropbox-access');
  const page=await readPage(response);if(!Array.isArray(page.entries)||typeof page.has_more!=='boolean')throw Error('response-shape');
  count+=page.entries.length;if(count>4000)throw Error('folder-size');entries.push(...page.entries);
  if(!page.has_more)return entries;
  if(!text(page.cursor)||page.cursor.length>2000||cursors.has(page.cursor))throw Error('cursor');
  cursors.add(page.cursor);endpoint='files/list_folder/continue';body={cursor:page.cursor};
 }
 throw Error('page-limit');
}
async function resolveFolderSources({state,target,token,fetch:http=fetch}){
 let next=state;const sources=[],pending=[],seen=new Set(),folders=new Set(),listed=new Map();
 const hold=(songId,reason,label)=>pending.push({songId,reason,label});
 const add=source=>{const key=source.songId+'\0'+source.materialId;if(!seen.has(key)){seen.add(key);sources.push({...source});}};
 for(const source of list(target?.sources).filter(source=>source.kind==='file')){
  if(!list(target.songIds).includes(source.songId)){hold(source.songId,'unregistered','対象曲に登録された資料を確認してください。');continue;}
  try{const saved=resolveRegisteredMaterial(state,{songId:source.songId,materialId:source.materialId});if(saved.id!==source.fileId)throw Error();add({...source,fileId:saved.id});}catch{hold(source.songId,'unregistered','登録資料の識別情報を確認してください。');}
 }
 for(const source of list(target?.sources).filter(source=>source.kind==='folder')){
  const matches=list(state?.songs).filter(song=>song?.id===source.songId),song=matches[0];
  if(matches.length!==1||!list(target.songIds).includes(song.id)||song.deleted||song.removed||source.url!==song.dropboxUrl||!folderURL(song.dropboxUrl)){
   hold(source.songId,'unregistered','対象曲に登録されたDropboxフォルダを確認してください。');continue;
  }
  const folderKey=song.id+'\0'+song.dropboxUrl;if(folders.has(folderKey))continue;folders.add(folderKey);
  // A saved exact file choice takes precedence over guessing among folder contents.
  const registered=list(song.workflow?.materials).filter(record=>{
   if(record.source!=='dropbox'||record.sourceFolder!==song.dropboxUrl||oldPath(record.path)||!eligible(record.name,target.kind,song,target))return false;
   try{resolveRegisteredMaterial(state,{songId:song.id,materialId:record.id});return true;}catch{return false;}
  });
  if(registered.length===1){add(sourceRecord(song,registered[0]));continue;}
  if(registered.length>1){for(let i=sources.length-1;i>=0;i--)if(sources[i].songId===song.id)sources.splice(i,1);hold(song.id,'ambiguous','登録済みの資料が複数あり、使用する版を確定できません。');continue;}
  if(sources.some(source=>source.songId===song.id))continue;
  if(!token){hold(song.id,'connection','Dropboxに再接続してください。');continue;}
  let entries;
  try{if(!listed.has(song.dropboxUrl))listed.set(song.dropboxUrl,folderFiles(song.dropboxUrl,token,http));entries=await listed.get(song.dropboxUrl);}
  catch{hold(song.id,'access','Dropboxに再接続するか、読み取れる資料を登録し直してください。');continue;}
  const candidates=entries.filter(entry=>validFile(entry)&&eligible(entry.name,target.kind,song,target));
  if(candidates.length!==1){hold(song.id,candidates.length?'ambiguous':'missing',candidates.length?'一致する資料が複数あるため、使用する版を確定できません。':'登録フォルダ直下に、曲名と版が一致する対応資料がありません。');continue;}
  const file=candidates[0],record={id:'dropbox:'+file.id,source:'dropbox',name:file.name,path:'/'+file.name,sourceFolder:song.dropboxUrl,rev:file.rev,size:file.size};
  // Do not replace a removed or conflicting registration to make it downloadable.
  if(list(song.workflow?.materials).some(existing=>existing.id===record.id)||list(song.production?.sourceFacts).some(existing=>existing.id===record.id)){
   hold(song.id,'conflict','この資料の登録状態を確認してください。');continue;
  }
  if(next===state)next=structuredClone(state);
  const draft=next.songs.find(item=>item.id===song.id);draft.workflow||={};draft.workflow.materials||=[];draft.workflow.materials.push(record);
  add(sourceRecord(song,record));
 }
 return {state:next,sources,pending};
}
module.exports={resolveFolderSources};
