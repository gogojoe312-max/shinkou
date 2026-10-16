'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {resolveFolderSources}=require('../server/preparation-folder.cjs'),{resolveRegisteredMaterial}=require('../server/dropbox-material.cjs');
const folder='https://www.dropbox.com/scl/fo/folder/key?rlkey=test';
function fixture(title='音楽・テスト（new ver.）',kind='rec'){
 const song={id:'song',title,dropboxUrl:folder},state={songs:[song]};
 return {state,target:{kind,title:'テスト公演',songIds:['song'],sources:[{kind:'folder',songId:'song',url:folder}]},token:'secret'};
}
const file=(name,id='id:lyrics',extra={})=>({'.tag':'file',id,name,rev:'rev1',size:100,path_display:'/Music/'+name,...extra});
function fetchPages(pages){const calls=[];return {calls,fetch:async(url,options)=>{calls.push({url,body:JSON.parse(options.body),options});return Response.json(pages[Math.min(calls.length-1,pages.length-1)]);}};}
test('one exact normalized DOCX creates only a transient registered root-file record',async()=>{
 const input=fixture(),before=JSON.stringify(input.state),http=fetchPages([{entries:[file('アーティスト_音楽テスト（new ver.）_歌詞_20261016.docx')],has_more:false}]);
 const result=await resolveFolderSources({...input,...http});assert.equal(JSON.stringify(input.state),before);assert.notEqual(result.state,input.state);assert.equal(result.pending.length,0);assert.equal(result.sources.length,1);
 const source=result.sources[0];assert.equal(source.materialId,'dropbox:id:lyrics');assert.equal(source.rev,'rev1');assert.equal(source.path,'/アーティスト_音楽テスト（new ver.）_歌詞_20261016.docx');assert.equal(source.sourceFolder,folder);
 assert.equal(resolveRegisteredMaterial(result.state,{songId:'song',materialId:source.materialId}).id,'id:lyrics');assert.equal(http.calls[0].body.path,'');assert.equal(http.calls[0].body.recursive,false);assert.deepEqual(http.calls[0].body.shared_link,{url:folder});assert(!JSON.stringify(result).includes('secret'));
});
test('aliases, shortened names and another version never silently match the song',async()=>{
 for(const name of ['音楽テスト_歌詞.docx','音楽テスト（old ver.）.docx','音楽_歌詞.docx','音楽テスト（new ver.）.pdf','音楽テスト（new ver.）.doc']){
  const input=fixture(),http=fetchPages([{entries:[file(name)],has_more:false}]),result=await resolveFolderSources({...input,...http});assert.equal(result.sources.length,0,name);assert.equal(result.state,input.state);assert.equal(result.pending[0].reason,'missing');
 }
});
test('multiple exact candidates refuse latest-mtime guessing',async()=>{
 const input=fixture('テスト曲'),http=fetchPages([{entries:[file('テスト曲_歌詞.docx','id:one',{server_modified:'2026-10-10'}),file('テスト曲_歌詞_修正.docx','id:two',{server_modified:'2026-10-16'})],has_more:false}]);
 const result=await resolveFolderSources({...input,...http});assert.equal(result.sources.length,0);assert.equal(result.pending[0].reason,'ambiguous');assert.equal(result.state,input.state);
});
test('one exact saved workflow file wins before folder matching and preserves registered revision',async()=>{
 const input=fixture('テスト曲');input.state.songs[0].workflow={materials:[{id:'dropbox:id:saved',source:'dropbox',sourceFolder:folder,name:'テスト曲_歌詞.docx',path:'/資料/テスト曲_歌詞.docx',rev:'savedrev'}]};
 const result=await resolveFolderSources({...input,fetch:()=>{throw Error('must not list');}});assert.equal(result.state,input.state);assert.equal(result.sources[0].fileId,'id:saved');assert.equal(result.sources[0].rev,'savedrev');assert.equal(result.pending.length,0);
});
test('OLD folders/files, directories, oversize files and malformed revisions are never selected',async()=>{
 const input=fixture('テスト曲'),entries=[file('テスト曲.docx','id:old',{path_display:'/Music/OLD/テスト曲.docx'}),file('OLD_テスト曲.docx','id:oldName'),file('テスト曲.docx','id:folder',{'.tag':'folder'}),file('テスト曲.docx','id:large',{size:5*1024*1024+1}),file('テスト曲.docx','id:bad',{rev:''})];
 const result=await resolveFolderSources({...input,...fetchPages([{entries,has_more:false}])});assert.equal(result.sources.length,0);assert.equal(result.pending[0].reason,'missing');
});
test('unregistered folder or wrong song cannot cause Dropbox requests',async()=>{
 for(const change of [x=>x.target.sources[0].url=folder+'changed',x=>x.target.songIds=['other'],x=>x.state.songs[0].dropboxUrl='https://evil.example/folder']){
  const input=fixture();change(input);const result=await resolveFolderSources({...input,fetch:()=>{throw Error('must not request');}});assert.equal(result.pending[0].reason,'unregistered');assert.equal(result.sources.length,0);
 }
});
test('pagination checks all candidates, stops repeated cursors and caps 25 total pages',async()=>{
 let input=fixture('テスト曲'),http=fetchPages([{entries:[],has_more:true,cursor:'next'},{entries:[file('テスト曲.docx')],has_more:false}]),result=await resolveFolderSources({...input,...http});assert.equal(result.sources.length,1);assert.equal(http.calls.length,2);assert.deepEqual(http.calls[1].body,{cursor:'next'});
 http=fetchPages([{entries:[],has_more:true,cursor:'same'}]);result=await resolveFolderSources({...input,...http});assert.equal(result.sources.length,0);assert.equal(http.calls.length,2);
 http=fetchPages(Array.from({length:26},(_,i)=>({entries:[],has_more:true,cursor:'cursor'+i})));result=await resolveFolderSources({...input,...http});assert.equal(result.sources.length,0);assert.equal(http.calls.length,25);
 http=fetchPages([{entries:Array.from({length:4001},()=>({'.tag':'folder'})),has_more:false}]);result=await resolveFolderSources({...input,...http});assert.equal(result.sources.length,0);assert.equal(result.pending[0].reason,'access');
});
test('LIVE accepts only explicitly prepared JSON and does not choose ordinary lyrics or schedules',async()=>{
 const input=fixture('歌割','live');let result=await resolveFolderSources({...input,...fetchPages([{entries:[file('歌割.docx'),file('テスト公演.json','id:ordinary'),file('prepared.json','id:prepared')],has_more:false}])});assert.equal(result.sources[0].fileId,'id:prepared');
 result=await resolveFolderSources({...input,...fetchPages([{entries:[file('別公演.prepared.json')],has_more:false}])});assert.equal(result.sources.length,0);
 result=await resolveFolderSources({...input,...fetchPages([{entries:[file('テスト公演.prepared.json')],has_more:false}])});assert.equal(result.sources.length,1);
});
test('removed registrations remain removed and native Dropbox errors do not fall back to arbitrary URLs',async()=>{
 const input=fixture('テスト曲');input.state.songs[0].workflow={materials:[{id:'dropbox:id:lyrics',source:'dropbox',sourceFolder:folder,name:'テスト曲.docx',path:'/テスト曲.docx',rev:'rev1',removed:true}]};let result=await resolveFolderSources({...input,...fetchPages([{entries:[file('テスト曲.docx')],has_more:false}])});assert.equal(result.sources.length,0);assert.equal(result.pending[0].reason,'conflict');assert.equal(result.state,input.state);
 result=await resolveFolderSources({...fixture(),fetch:async()=>new Response('',{status:403})});assert.equal(result.sources.length,0);assert.equal(result.pending[0].reason,'access');
});
