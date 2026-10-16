'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {createApp}=require('../server/app.cjs');
const ORIGIN='https://shinkou.example',SCOPES='files.content.read files.metadata.read',FILE_ID='id:registered_123',FOLDER='https://www.dropbox.com/scl/fo/registered';
const ENV={PUBLIC_ORIGIN:ORIGIN,SESSION_SECRET:'test-only-session-secret-not-for-production',GOOGLE_CLIENT_ID:'test.apps.googleusercontent.com',OWNER_EMAILS:'owner@gmail.com',VIEWER_EMAILS:'viewer@gmail.com',GITHUB_TOKEN:'private-github-token',DROPBOX_APP_KEY:'test-dropbox',DATA_OWNER:'owner',DATA_REPO:'private'};
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
const headerJSON=value=>JSON.stringify(value).replace(/[^\x20-\x7e]/g,char=>'\\u'+char.charCodeAt(0).toString(16).padStart(4,'0'));
async function fixture(t){
 const bytes=Buffer.from('registered lyrics\n'),metadata={'.tag':'file',id:FILE_ID,name:'歌詞.docx',rev:'rev1',size:bytes.length,content_hash:createHash('sha256').update(createHash('sha256').update(bytes).digest()).digest('hex')};
 const state={v:1,songs:[{id:'song',title:'Song',dropboxUrl:FOLDER,production:{sourceFacts:[{id:'fact',scope:'source-material',sourceId:FILE_ID,sourceUrl:'https://www.dropbox.com/scl/fi/registered'}]},workflow:{materials:[{id:'dropbox:'+FILE_ID,name:'歌詞.docx',source:'dropbox',sourceFolder:FOLDER,path:'/資料/歌詞.docx',rev:'rev1'}]}}],projects:[],templates:[]};
 const settings={metadata,downloadMetadata:null,bytes,scope:SCOPES,folderItems:null,repeatCursor:false,privateRepo:true,downloadStatus:200},calls=[];let identity={};
 const external=async(url,options={})=>{
  calls.push({url,options});
  if(url==='https://api.github.com/repos/owner/private')return json({private:settings.privateRepo});
  if(url.startsWith('https://api.github.com/repos/owner/private/contents/data.json'))return json({content:Buffer.from(JSON.stringify(state)).toString('base64'),sha:'saved'});
  if(url.endsWith('/oauth2/token'))return json({access_token:'private-dropbox-token',scope:settings.scope,expires_in:14400});
  if(url.endsWith('/files/get_metadata'))return json(settings.metadata);
  if(url.endsWith('/files/list_folder'))return json({entries:settings.folderItems||[settings.metadata],has_more:settings.repeatCursor,...(settings.repeatCursor?{cursor:'repeat'}:{})});
  if(url.endsWith('/files/list_folder/continue'))return json({entries:[],has_more:true,cursor:'repeat'});
  if(url==='https://content.dropboxapi.com/2/files/download')return new Response(settings.bytes,{status:settings.downloadStatus,headers:{'Dropbox-API-Result':headerJSON(settings.downloadMetadata||settings.metadata)}});
  throw Error('Unexpected endpoint '+url);
 };
 const app=createApp(ENV,{fetch:external,verify:async()=>identity}),server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const request=(route,options={})=>fetch('http://127.0.0.1:'+server.address().port+route,{redirect:'manual',...options,headers:{Origin:ORIGIN,'Content-Type':'application/json',...options.headers}});
 async function login(email='owner@gmail.com'){
  const challenge=await request('/api/auth/challenge'),{nonce}=await challenge.json();identity={sub:email,email,email_verified:true,nonce};
  const login=await request('/api/auth/login',{method:'POST',headers:{Cookie:challenge.headers.getSetCookie()[0].split(';')[0]},body:'{"credential":"test-verified"}'});
  const cookie=login.headers.getSetCookie().find(value=>value.startsWith('__Host-shinkou=')).split(';')[0],session=await(await request('/api/session',{headers:{Cookie:cookie}})).json();
  return {Cookie:cookie,'X-Shinkou-CSRF':session.csrf};
 }
 async function connect(headers){
  const start=await request('/api/dropbox/start',{method:'POST',headers,body:'{}'}),data=await start.json();if(start.status!==200)return start;
  const url=new URL(data.url);assert.equal(url.searchParams.get('scope').split(' ').sort().join(' '),SCOPES);
  return request('/oauth/dropbox/callback?state='+url.searchParams.get('state')+'&code=test',{headers});
 }
 const download=(headers,body={songId:'song',materialId:'fact'})=>request('/api/dropbox/download',{method:'POST',headers,body:JSON.stringify(body)});
 return {state,settings,calls,request,login,connect,download};
}
test('registered downloads require authentication, editor role, CSRF and Dropbox connection',async t=>{
 const f=await fixture(t);assert.equal((await f.download({})).status,401);
 const viewer=await f.login('viewer@gmail.com');assert.equal((await f.download(viewer)).status,403);assert.equal((await f.connect(viewer)).status,403);
 const owner=await f.login();assert.equal((await f.download(owner)).status,401);assert.equal((await f.download({Cookie:owner.Cookie})).status,403);
 assert.equal(f.calls.length,0);
});
test('exact saved source fact downloads are revision-pinned and return only file metadata, base64 and SHA256',async t=>{
 const f=await fixture(t),owner=await f.login();assert.equal((await f.connect(owner)).status,302);
 f.settings.downloadMetadata={...f.settings.metadata};delete f.settings.downloadMetadata['.tag'];
 const response=await f.download(owner),body=await response.json();assert.equal(response.status,200);
 assert.deepEqual(body,{file:{id:FILE_ID,name:'歌詞.docx',rev:'rev1',size:f.settings.bytes.length,sha256:createHash('sha256').update(f.settings.bytes).digest('hex')},content:f.settings.bytes.toString('base64')});
 const metadata=f.calls.find(call=>call.url.endsWith('/files/get_metadata')),download=f.calls.find(call=>call.url.startsWith('https://content.dropboxapi.com/'));
 assert.deepEqual(JSON.parse(metadata.options.body),{path:FILE_ID,include_deleted:false});assert.deepEqual(JSON.parse(download.options.headers['Dropbox-API-Arg']),{path:FILE_ID,rev:'rev1'});
 assert.equal(download.options.redirect,'error');assert.doesNotMatch(JSON.stringify(body),/private-dropbox-token|private-github-token|sourceUrl/);assert.match(response.headers.get('cache-control'),/no-store/);
});
test('workflow materials must still be in the exact saved shared-folder path',async t=>{
 const f=await fixture(t),owner=await f.login();await f.connect(owner);
 assert.equal((await f.download(owner,{songId:'song',materialId:'dropbox:'+FILE_ID})).status,200);
 const list=f.calls.find(call=>call.url.endsWith('/files/list_folder'));assert.deepEqual(JSON.parse(list.options.body),{path:'/資料',shared_link:{url:FOLDER},recursive:false,include_deleted:false,limit:200});
 f.settings.folderItems=[{...f.settings.metadata,id:'id:other'}];
 assert.equal((await f.download(owner,{songId:'song',materialId:'dropbox:'+FILE_ID})).status,403);
});
test('unregistered, removed, wrong-scope and client-supplied URL/path requests never reach Dropbox content',async t=>{
 const f=await fixture(t),owner=await f.login();await f.connect(owner);
 for(const body of [{songId:'song',materialId:'missing'},{songId:'missing',materialId:'fact'},{songId:'song',materialId:'fact',url:'https://evil.example'},{songId:'song',materialId:'fact',path:FILE_ID}])assert([400,403].includes((await f.download(owner,body)).status));
 f.state.songs[0].production.sourceFacts[0].scope='unconfirmed';assert.equal((await f.download(owner)).status,403);
 f.state.songs[0].workflow.materials[0].sourceFolder='https://www.dropbox.com/scl/fo/other';assert.equal((await f.download(owner,{songId:'song',materialId:'dropbox:'+FILE_ID})).status,403);
 f.state.songs[0].production.sourceFacts[0].scope='source-material';f.state.songs[0].production.sourceFacts[0].removed=true;assert.equal((await f.download(owner)).status,403);
 assert.equal(f.calls.some(call=>call.url.includes('/2/files/')),false);
});
test('stored revision mismatch and download identity/revision changes return no content',async t=>{
 const f=await fixture(t),owner=await f.login();await f.connect(owner);
 f.state.songs[0].production.sourceFacts[0].rev='older';assert.equal((await f.download(owner)).status,409);assert.equal(f.calls.some(call=>call.url.includes('content.dropboxapi.com')),false);
 delete f.state.songs[0].production.sourceFacts[0].rev;
 for(const change of [{rev:'rev2'},{id:'id:other'},{size:f.settings.bytes.length+1}]){f.settings.downloadMetadata={...f.settings.metadata,...change};const response=await f.download(owner);assert.equal(response.status,409);assert.equal((await response.json()).content,undefined);}
});
test('oversized, truncated and tampered files are rejected before any bytes are returned',async t=>{
 const f=await fixture(t),owner=await f.login();await f.connect(owner);const original={...f.settings.metadata},originalBytes=f.settings.bytes;
 f.settings.metadata={...original,size:5*1024*1024+1};assert.equal((await f.download(owner)).status,413);assert.equal(f.calls.some(call=>call.url.includes('content.dropboxapi.com')),false);
 f.settings.metadata=original;f.settings.bytes=Buffer.from('short');assert.equal((await f.download(owner)).status,409);
 f.settings.bytes=Buffer.alloc(originalBytes.length,65);assert.equal((await f.download(owner)).status,409);
 f.settings.bytes=Buffer.alloc(5*1024*1024+1,65);assert.equal((await f.download(owner)).status,413);
});
test('repeated Dropbox continuation cursors stop folder verification without downloading content',async t=>{
 const f=await fixture(t),owner=await f.login();await f.connect(owner);f.settings.repeatCursor=true;
 assert.equal((await f.download(owner,{songId:'song',materialId:'dropbox:'+FILE_ID})).status,502);
 assert.equal(f.calls.filter(call=>call.url.endsWith('/files/list_folder/continue')).length,1);
 assert.equal(f.calls.some(call=>call.url.startsWith('https://content.dropboxapi.com/')),false);
});
test('public repositories and native Dropbox failures do not fall back to a source URL',async t=>{
 const f=await fixture(t),owner=await f.login();await f.connect(owner);f.settings.downloadStatus=403;
 const failed=await f.download(owner);assert.equal(failed.status,403);assert.match((await failed.json()).error,/再接続/);
 assert.equal(f.calls.some(call=>call.url.startsWith('https://www.dropbox.com/')),false);
 const other=await fixture(t),auth=await other.login();await other.connect(auth);other.settings.privateRepo=false;assert.equal((await other.download(auth)).status,503);assert.equal(other.calls.some(call=>call.url.includes('/2/files/')),false);
});
test('OAuth requires exactly metadata and content read scopes, never sharing or write scope',async t=>{
 for(const scope of ['files.metadata.read','files.metadata.read files.content.read sharing.read','files.metadata.read files.content.write']){const f=await fixture(t),owner=await f.login();f.settings.scope=scope;assert.equal((await f.connect(owner)).status,403);assert.equal((await f.download(owner)).status,401);}
});
