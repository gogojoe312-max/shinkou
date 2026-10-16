'use strict';
const {createHash}=require('node:crypto');
const MAX_BYTES=5*1024*1024,MAX_METADATA_BYTES=256*1024;
const RECONNECT='Dropboxに再接続するか、読み取れる資料を登録し直してください。';
const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const text=value=>typeof value==='string'&&value.length>0&&value.length<=2000&&!/[\x00-\x1f\x7f]/.test(value);
const fileId=value=>typeof value==='string'&&/^id:[A-Za-z0-9_-]{1,200}$/.test(value);
const filePath=value=>text(value)&&value.startsWith('/')&&!value.endsWith('/')&&!value.includes('\\')&&value.split('/').slice(1).every(part=>part&&part!=='.'&&part!=='..');
function sharedFolder(value){
 try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&['www.dropbox.com','dropbox.com','db.tt'].includes(u.hostname);}catch{return false;}
}
function resolveRegisteredMaterial(state,request){
 if(!object(request)||Object.keys(request).some(key=>!['songId','materialId'].includes(key))||!text(request.songId)||!text(request.materialId))fail(400,'曲と登録資料を指定してください。');
 const songs=(state?.songs||[]).filter(song=>song?.id===request.songId);
 if(songs.length!==1)fail(403,'曲に登録された資料だけを読み取れます。');
 const song=songs[0],materials=(song.workflow?.materials||[]).filter(row=>row?.id===request.materialId),facts=(song.production?.sourceFacts||[]).filter(row=>row?.id===request.materialId);
 if(materials.length+facts.length!==1)fail(403,'曲に登録された資料だけを読み取れます。');
 const record=materials[0]||facts[0];
 if(record.removed||record.deleted)fail(403,'一覧から外された資料は読み取れません。');
 let id,folder,path;
 if(materials.length){
  id=typeof record.id==='string'&&record.id.startsWith('dropbox:')?record.id.slice(8):'';
  if(record.source!=='dropbox'||!fileId(id)||record.sourceFolder!==song.dropboxUrl||!sharedFolder(record.sourceFolder)||!filePath(record.path)||!text(record.name)||record.path.split('/').at(-1)!==record.name)
   fail(403,'曲に登録されたDropboxフォルダと資料を確認してください。');
  folder=record.sourceFolder;path=record.path;
 }else{
  id=record.sourceId;
  if(record.scope!=='source-material'||!fileId(id))fail(403,'DropboxのファイルIDが登録された原資料だけを読み取れます。');
 }
 if(record.rev!==undefined&&(typeof record.rev!=='string'||!/^[A-Za-z0-9._-]{1,128}$/.test(record.rev)))fail(403,'登録資料の版を確認してください。');
 return {id,rev:record.rev,folder,path,name:materials.length?record.name:undefined};
}
async function boundedBytes(response,limit){
 const length=response.headers.get('content-length');
 if(length!==null&&(!/^\d+$/.test(length)||Number(length)>limit)){await response.body?.cancel();fail(413,'資料は5MB以下のファイルを登録してください。');}
 if(!response.body||typeof response.body.getReader!=='function')fail(502,'Dropboxの応答を確認できません。');
 const reader=response.body.getReader(),chunks=[];let size=0;
 try{
  while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>limit)fail(413,'資料は5MB以下のファイルを登録してください。');chunks.push(Buffer.from(part.value));}
 }catch(error){try{await reader.cancel();}catch{}throw error;}finally{reader.releaseLock();}
 return Buffer.concat(chunks,size);
}
function validateMetadata(metadata,registered){
 if(!object(metadata)||metadata['.tag']!=='file'||metadata.id!==registered.id||!text(metadata.name)||/[\\/]/.test(metadata.name)
  ||typeof metadata.rev!=='string'||!/^[A-Za-z0-9._-]{1,128}$/.test(metadata.rev)||!Number.isSafeInteger(metadata.size)||metadata.size<0)
  fail(409,'Dropboxの資料の識別情報を確認できません。資料を登録し直してください。');
 if(metadata.size>MAX_BYTES)fail(413,'資料は5MB以下のファイルを登録してください。');
 if(registered.rev&&metadata.rev!==registered.rev||registered.name&&metadata.name!==registered.name)fail(409,'登録後にDropboxの資料が更新されています。最新版を確認して登録し直してください。');
 if(metadata.content_hash!==undefined&&!/^[a-f0-9]{64}$/i.test(metadata.content_hash))fail(409,'Dropboxの資料の識別情報を確認できません。');
 return metadata;
}
function dropboxHash(bytes){
 const hashes=[];for(let offset=0;offset<bytes.length;offset+=4*1024*1024)hashes.push(createHash('sha256').update(bytes.subarray(offset,offset+4*1024*1024)).digest());
 return createHash('sha256').update(Buffer.concat(hashes)).digest('hex');
}
async function downloadRegisteredMaterial({state,request,token,fetch:http=fetch}){
 const registered=resolveRegisteredMaterial(state,request);
 const call=async(url,options)=>{
  let response;try{response=await http(url,{...options,redirect:'error',signal:AbortSignal.timeout(25000)});}catch{fail(403,'Dropboxの資料を取得できません。'+RECONNECT);}
  if(response.redirected||response.url&&response.url!==url||!response.ok)fail(response.status===429?429:403,'Dropboxの資料を取得できません。'+RECONNECT);
  return response;
 };
 const metadataRequest=async(endpoint,body)=>{
  const response=await call('https://api.dropboxapi.com/2/'+endpoint,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)});
  try{return JSON.parse((await boundedBytes(response,MAX_METADATA_BYTES)).toString('utf8'));}catch(error){if(error.status)throw error;fail(502,'Dropboxの応答を確認できません。');}
 };
 const metadata=validateMetadata(await metadataRequest('files/get_metadata',{path:registered.id,include_deleted:false}),registered);
 if(registered.folder){
  let endpoint='files/list_folder',body={path:registered.path.slice(0,registered.path.lastIndexOf('/')),shared_link:{url:registered.folder},recursive:false,include_deleted:false,limit:200},count=0,matches=[];const cursors=new Set();
  do{
   const page=await metadataRequest(endpoint,body);if(!Array.isArray(page.entries)||typeof page.has_more!=='boolean')fail(502,'Dropboxのフォルダを確認できません。');
   count+=page.entries.length;if(count>4000)fail(403,'登録資料のフォルダを分けて確認してください。');
   matches.push(...page.entries.filter(entry=>entry?.id===registered.id));
   if(!page.has_more)break;
   if(!text(page.cursor)||cursors.has(page.cursor)||cursors.size>=25)fail(502,'Dropboxのフォルダを確認できません。');cursors.add(page.cursor);endpoint='files/list_folder/continue';body={cursor:page.cursor};
  }while(true);
  if(matches.length!==1)fail(403,'資料が登録されたDropboxフォルダ内に見つかりません。'+RECONNECT);
  const listed=validateMetadata(matches[0],{...registered,rev:metadata.rev});
  if(listed.size!==metadata.size)fail(409,'Dropboxの資料が更新されています。登録し直してください。');
 }
 const response=await call('https://content.dropboxapi.com/2/files/download',{method:'POST',headers:{Authorization:'Bearer '+token,'Dropbox-API-Arg':JSON.stringify({path:registered.id,rev:metadata.rev})}});
 let result;try{result=JSON.parse(response.headers.get('dropbox-api-result'));}catch{fail(502,'Dropboxの応答を確認できません。');}
 // DownloadResult is FileMetadata and may omit the tagged-union discriminator.
 result=validateMetadata({...result,'.tag':result?.['.tag']||'file'},{...registered,rev:metadata.rev,name:metadata.name});
 if(result.size!==metadata.size||metadata.content_hash&&result.content_hash!==metadata.content_hash)fail(409,'Dropboxの資料が更新されています。登録し直してください。');
 const bytes=await boundedBytes(response,MAX_BYTES);
 if(bytes.length!==metadata.size)fail(409,'Dropboxの資料の大きさを確認できません。再取得してください。');
 const contentHash=metadata.content_hash||result.content_hash;
 if(contentHash&&dropboxHash(bytes)!==contentHash.toLowerCase())fail(409,'Dropboxの資料の内容を確認できません。再取得してください。');
 return {file:{id:metadata.id,name:metadata.name,rev:metadata.rev,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')},content:bytes.toString('base64')};
}
module.exports={MAX_BYTES,resolveRegisteredMaterial,downloadRegisteredMaterial};
