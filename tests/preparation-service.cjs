'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createPreparationService,validateManifest,metadata,digest,OWNER,REPO,POLL_MS}=require('../server/preparation-service.cjs');
const clone=value=>JSON.parse(JSON.stringify(value));
const source={kind:'file',songId:'song',materialId:'fact',fileId:'id:file',name:'歌詞.docx',rev:''};
const target={id:'rec:song',kind:'rec',title:'歌',dates:['2026-10-16'],songIds:['song'],sources:[source],slots:[],needs:[]};
const op=(name='old')=>{const packet={app:'fixture',name};return {id:'operation-'+name,type:'recording-song',sha256:digest(packet),packet};};
const manifest=operations=>({app:'utacheck-private-preparation',version:1,owner:OWNER,revision:'existing',createdAt:'2026-10-15T00:00:00Z',operations});
test('private manifest retains original Excel binary packets and optional legacy exports under the existing size bound',()=>{
 const file={name:'original.xls',size:4,sha256:'a'.repeat(64),base64:'UEsDBA=='},packet={app:'utacheck-original-excel',version:1,...file,exportFile:{...file,name:'export.xlsx'}};
 const value=manifest([{id:'original-fixture',type:'original-excel',sha256:digest(packet),packet}]);assert.deepEqual(validateManifest(value),value);
 const changed=clone(value);changed.operations[0].packet.base64='UEsDBQ==';assert.throws(()=>validateManifest(changed),error=>error.status===409);
});
function fixture(overrides={}){
 const state={songs:[{id:'song',production:{sourceFacts:[{id:'fact',scope:'source-material',sourceId:'id:file'}]}}],projects:[]};
 const settings={sha:'data-1',manifest:null,manifestSha:null,rev:'rev1',targets:[clone(target)],pending:[],downloadHook:null,writeConflict:false,compileHook:null};
 const calls={read:0,manifest:0,metadata:0,download:0,compile:0,write:[],resolve:0};let time=Date.parse('2026-10-16T00:00:00Z');
 const service=createPreparationService({config:{owner:OWNER,repo:REPO},now:()=>time,
  readState:async()=>{calls.read++;return {json:clone(state),sha:settings.sha};},
  readManifest:async()=>{calls.manifest++;return {json:clone(settings.manifest),sha:settings.manifestSha};},
  writeManifest:async(value,sha)=>{calls.write.push({value:clone(value),sha});if(settings.writeConflict||sha!==settings.manifestSha)throw Object.assign(Error('manifest conflict'),{status:409});settings.manifest=clone(value);settings.manifestSha='manifest-'+calls.write.length;},
  select:()=>({today:'2026-10-16',through:'2026-11-14',targets:clone(settings.targets),pending:clone(settings.pending)}),
  resolveFolders:async({state:input,target:selected})=>{calls.resolve++;return {state:input,sources:selected.sources.filter(item=>item.kind==='file'),pending:[]};},
  fetch:async(url,options)=>{calls.metadata++;assert.equal(url,'https://api.dropboxapi.com/2/files/get_metadata');assert.deepEqual(JSON.parse(options.body),{path:'id:file',include_deleted:false});assert.equal(options.redirect,'error');return new Response(JSON.stringify({'.tag':'file',id:'id:file',name:'歌詞.docx',rev:settings.rev,size:4}));},
  download:async({state:input,request,token})=>{calls.download++;assert(input.songs.some(song=>song.id===request.songId));assert.equal(token,'dropbox-private');if(settings.downloadHook)await settings.downloadHook();return {file:{id:'id:file',name:'歌詞.docx',rev:settings.rev,size:4},content:Buffer.from('word').toString('base64')};},
  compile:async(selected,materials)=>{calls.compile++;if(settings.compileHook)return settings.compileHook(selected,materials);assert(Buffer.isBuffer(materials[0].bytes));const packet={app:'fixture',target:selected.id,date:selected.dates[0],rev:materials[0].rev};return {operations:[{id:'auto-'+digest(packet).slice(0,32),type:'recording-song',packet}],pending:[]};},...overrides});
 return {service,state,settings,calls,run:()=>service.run({token:'dropbox-private'}),advance:()=>{time+=POLL_MS+1;}};
}
test('saved targets append immutable hashed operations and unchanged runs check metadata without download or compile',async()=>{
 const f=fixture();f.settings.manifest=manifest([op()]);f.settings.manifestSha='manifest-old';const preserved=JSON.stringify(f.settings.manifest.operations[0]);
 let result=await f.run();assert.equal(result.state,'queued');assert.equal(result.queued,1);assert.equal(f.calls.write[0].sha,'manifest-old');assert.equal(JSON.stringify(f.settings.manifest.operations[0]),preserved);validateManifest(f.settings.manifest);
 const counts={...f.calls};await f.run();assert.equal(f.calls.read,counts.read);assert.equal(f.calls.metadata,counts.metadata);
 f.advance();result=await f.run();assert.equal(result.state,'unchanged');assert.equal(result.unchanged,1);assert.equal(f.calls.metadata,2);assert.equal(f.calls.download,1);assert.equal(f.calls.compile,1);assert.equal(f.calls.write.length,1);assert(!JSON.stringify(result).includes('dropbox-private'));assert(!JSON.stringify(result).includes('d29yZA=='));
});
test('new metadata revision re-downloads once and appends without editing an earlier operation',async()=>{
 const f=fixture();await f.run();const old=JSON.stringify(f.settings.manifest.operations[0]);f.advance();f.settings.rev='rev2';await f.run();assert.equal(f.calls.download,2);assert.equal(f.calls.compile,2);assert.equal(f.settings.manifest.operations.length,2);assert.equal(JSON.stringify(f.settings.manifest.operations[0]),old);
});
test('changed schedule recompiles cached unchanged source bytes and unchanged packets dedupe by hash',async()=>{
 const f=fixture();await f.run();f.advance();f.settings.targets[0].dates=['2026-10-17'];await f.run();assert.equal(f.calls.metadata,2);assert.equal(f.calls.download,1);assert.equal(f.calls.compile,2);assert.equal(f.settings.manifest.operations.length,2);
 f.advance();const packet=clone(f.settings.manifest.operations[1].packet);f.settings.targets[0].title='別の表示';f.settings.compileHook=()=>({operations:[{id:'another-id',type:'recording-song',packet}],pending:[]});const result=await f.run();assert.equal(result.queued,0);assert.equal(f.settings.manifest.operations.length,2);
});
test('simultaneous polls share a single flight',async()=>{
 const f=fixture();let finish;f.settings.downloadHook=()=>new Promise(resolve=>{finish=resolve;});const first=f.run(),second=f.run();assert.equal(first,second);
 while(!finish)await new Promise(resolve=>setImmediate(resolve));assert.equal(f.service.status().running,true);finish();await first;assert.equal(f.calls.download,1);assert.equal(f.calls.write.length,1);assert.equal(f.service.status().running,false);
});
test('no connection returns disconnected status and connecting can immediately run despite backoff',async()=>{
 const f=fixture();let result=await f.service.run();assert.equal(result.state,'disconnected');assert.equal(f.calls.metadata,0);assert.equal(f.calls.download,0);result=await f.run();assert.equal(result.state,'queued');
});
test('missing or folder-only unresolved sources remain pending without fabricated materials',async()=>{
 const f=fixture();f.settings.targets[0].sources=[{kind:'folder',songId:'song',url:'https://www.dropbox.com/scl/fo/registered/path'}];const before=JSON.stringify(f.state);const result=await f.run();assert.equal(result.state,'pending');assert.equal(f.calls.resolve,1);assert.equal(f.calls.download,0);assert.equal(f.calls.compile,0);assert.equal(f.calls.write.length,0);assert.equal(JSON.stringify(f.state),before);
});
test('pinned registered revision mismatch stays pending without reading source content',async()=>{
 const f=fixture();f.state.songs[0].production.sourceFacts[0].rev='registered-old';const result=await f.run();assert.equal(result.state,'pending');assert.equal(result.pending[0].reason,'source-changed');assert.equal(f.calls.download,0);assert.equal(f.calls.write.length,0);
});
test('a schedule edit during download aborts before manifest write and backs off retries',async()=>{
 const f=fixture();f.settings.downloadHook=()=>{f.settings.sha='data-new';};await assert.rejects(f.run(),error=>error.status===409);assert.equal(f.calls.write.length,0);assert.equal(f.service.status().state,'error');const downloads=f.calls.download;await f.run();assert.equal(f.calls.download,downloads);
});
test('manifest SHA conflicts never retry an overwrite and preserve the existing queue',async()=>{
 const f=fixture();f.settings.manifest=manifest([op()]);f.settings.manifestSha='existing';f.settings.writeConflict=true;const before=JSON.stringify(f.settings.manifest);await assert.rejects(f.run(),error=>error.status===409);assert.equal(f.calls.write.length,1);assert.equal(f.calls.write[0].sha,'existing');assert.equal(JSON.stringify(f.settings.manifest),before);await f.run();assert.equal(f.calls.write.length,1);
});
test('existing invalid hashes, wrong owners and reused operation IDs cannot be overwritten',async()=>{
 for(const change of [m=>m.owner='someone-else',m=>m.operations[0].sha256='0'.repeat(64)]){const f=fixture();f.settings.manifest=manifest([op()]);change(f.settings.manifest);await assert.rejects(f.run(),error=>error.status===409);assert.equal(f.calls.download,0);assert.equal(f.calls.write.length,0);}
 const f=fixture();f.settings.manifest=manifest([op()]);f.settings.compileHook=()=>({operations:[{id:'operation-old',type:'recording-song',packet:{app:'changed'}}],pending:[]});await assert.rejects(f.run(),error=>error.status===409);assert.equal(f.calls.write.length,0);
});
test('full manifests preserve every existing operation and retain compiled work without repeating bytes',async()=>{
 const f=fixture();f.settings.manifest=manifest(Array.from({length:100},(_,i)=>op('old'+i)));const before=JSON.stringify(f.settings.manifest);let result=await f.run();assert.equal(result.pending.at(-1).reason,'queue-full');assert.equal(f.calls.write.length,0);assert.equal(JSON.stringify(f.settings.manifest),before);f.advance();result=await f.run();assert.equal(f.calls.download,1);assert.equal(f.calls.compile,1);assert.equal(result.unchanged,1);
});
test('source and target limits bound work and owner/repository mismatch fails before external reads',async()=>{
 const f=fixture();f.settings.targets=Array.from({length:21},(_,i)=>({...clone(target),id:'rec:'+i,sources:Array.from({length:11},()=>clone(source))}));const result=await f.run();assert.equal(result.targets.length,20);assert.equal(result.targetCount,21);assert.equal(f.calls.metadata,0);assert(result.pending.some(item=>item.reason==='target-limit'));
 const wrong=fixture({config:{owner:'elsewhere',repo:REPO}});await assert.rejects(wrong.run(),error=>error.status===503);assert.equal(wrong.calls.read,0);
});
test('metadata checks revalidate exact folder membership before reusing unchanged cached material',async()=>{
 const folder='https://www.dropbox.com/scl/fo/registered/key',registered={id:'dropbox:id:file',source:'dropbox',sourceFolder:folder,path:'/資料/歌詞.docx',name:'歌詞.docx',rev:'r1'};
 const state={songs:[{id:'song',dropboxUrl:folder,workflow:{materials:[registered]}}]},file={'.tag':'file',id:'id:file',name:'歌詞.docx',rev:'r1',size:4};let listed=[file];const calls=[];
 const args={state,source:{songId:'song',materialId:registered.id,fileId:'id:file'},token:'private',fetch:async(url,options)=>{calls.push(url);return new Response(JSON.stringify(url.endsWith('/get_metadata')?file:{entries:listed,has_more:false}));}};
 assert.equal((await metadata(args)).rev,'r1');listed=[];await assert.rejects(metadata(args),error=>error.status===409);assert.equal(calls.filter(url=>url.endsWith('/list_folder')).length,2);assert(calls.every(url=>!url.includes('content.dropboxapi.com')));
});
