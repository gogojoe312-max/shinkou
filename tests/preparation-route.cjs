'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createApp}=require('../server/app.cjs');
const {OWNER,REPO,PATH,digest}=require('../server/preparation-service.cjs');
const ORIGIN='https://shinkou.example',BASE='https://api.github.com/repos/'+OWNER+'/'+REPO;
const ENV={PUBLIC_ORIGIN:ORIGIN,SESSION_SECRET:'test-only-session-secret-not-production',GOOGLE_CLIENT_ID:'test.apps.googleusercontent.com',OWNER_EMAILS:'owner@gmail.com',VIEWER_EMAILS:'viewer@gmail.com',GITHUB_TOKEN:'private-gh-token',DROPBOX_APP_KEY:'test-dropbox',DATA_OWNER:OWNER,DATA_REPO:REPO};
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
async function fixture(t){
 const state={songs:[{id:'song',title:'保存済みの曲',artist:'歌手',stageList:[{k:'vo',n:'VoDB',t:'multi'}],stages:{vo:{slots:[{date:'2026-10-20'}]}},production:{sourceFacts:[{id:'fact',scope:'source-material',sourceId:'id:file'}]}}],projects:[]};
 const settings={manifest:null,manifestSha:null,conflict:false,dataSha:'data-old'},calls={external:[],write:[],compile:0,download:0};let identity={};
 const app=createApp(ENV,{verify:async()=>identity,fetch:async(url,options={})=>{
  calls.external.push(url);
  if(url===BASE)return json({private:true});
  if(url.startsWith(BASE+'/contents/data.json'))return json({sha:settings.dataSha,content:Buffer.from(JSON.stringify(state)).toString('base64')});
  if(url.startsWith(BASE+'/contents/'+PATH)){
   if(options.method==='PUT'){const body=JSON.parse(options.body);calls.write.push(body);if(settings.conflict||body.sha!==settings.manifestSha&&!(settings.manifestSha===null&&body.sha===undefined))return json({message:'conflict'},409);settings.manifest=JSON.parse(Buffer.from(body.content,'base64'));settings.manifestSha='manifest-new';return json({content:{sha:settings.manifestSha}});}
   return settings.manifest?json({sha:settings.manifestSha,content:Buffer.from(JSON.stringify(settings.manifest)).toString('base64')}):json({},404);
  }
  if(url.endsWith('/oauth2/token'))return json({access_token:'private-db-token',scope:'files.content.read files.metadata.read',expires_in:14400});
  if(url.endsWith('/files/get_metadata'))return json({'.tag':'file',id:'id:file',name:'歌詞.docx',rev:'r1',size:4});
  throw Error('Unexpected endpoint '+url);
 },preparation:{now:()=>Date.parse('2026-10-16T00:00:00Z'),download:async()=>{calls.download++;return {file:{id:'id:file',name:'歌詞.docx',rev:'r1',size:4},content:Buffer.from('word').toString('base64')};},compile:async(target,materials)=>{
  calls.compile++;assert.equal(target.title,'保存済みの曲');assert.equal(materials[0].songId,'song');const packet={app:'fixture',songId:'song',date:target.dates[0]};return {operations:[{id:'operation-'+digest(packet).slice(0,20),type:'recording-song',packet}],pending:[]};
 }}});
 const server=app.listen(0,'127.0.0.1');await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});t.after(()=>new Promise(resolve=>server.close(resolve)));
 const request=(path,options={})=>fetch('http://127.0.0.1:'+server.address().port+path,{redirect:'manual',...options,headers:{Origin:ORIGIN,'Content-Type':'application/json',...options.headers}});
 async function login(email='owner@gmail.com'){
  const challenge=await request('/api/auth/challenge'),data=await challenge.json();identity={sub:email,email,email_verified:true,nonce:data.nonce};
  const response=await request('/api/auth/login',{method:'POST',headers:{Cookie:challenge.headers.getSetCookie()[0].split(';')[0]},body:JSON.stringify({credential:'verified'})});
  const cookie=response.headers.getSetCookie().find(value=>value.startsWith('__Host-shinkou=')).split(';')[0],session=await(await request('/api/session',{headers:{Cookie:cookie}})).json();return {Cookie:cookie,'X-Shinkou-CSRF':session.csrf};
 }
 async function connect(headers){const start=await(await request('/api/dropbox/start',{method:'POST',headers,body:'{}'})).json();const response=await request('/oauth/dropbox/callback?state='+new URL(start.url).searchParams.get('state')+'&code=verified',{headers});assert.equal(response.status,302);}
 return {request,login,connect,calls,settings,run:(headers,body={})=>request('/api/preparation/run',{method:'POST',headers,body:JSON.stringify(body)})};
}
test('preparation endpoints require authentication/editor access and mutations require CSRF with no client target bindings',async t=>{
 const f=await fixture(t);assert.equal((await f.run({})).status,401);assert.equal((await f.request('/api/preparation/status')).status,401);
 const viewer=await f.login('viewer@gmail.com');assert.equal((await f.run(viewer)).status,403);assert.equal((await f.request('/api/preparation/status',{headers:viewer})).status,403);
 const owner=await f.login();assert.equal((await f.run({Cookie:owner.Cookie})).status,403);
 for(const body of [{songId:'client'},{target:{id:'client'}},{owner:'elsewhere'},{sources:[]},null,[]])assert.equal((await f.run(owner,body)).status,400);
 assert.equal(f.calls.external.length,0);
});
test('a connected editor queues saved due targets and reads the preparation manifest separately from progress state',async t=>{
 const f=await fixture(t),owner=await f.login();let response=await f.run(owner);assert.equal(response.status,200);assert.equal((await response.json()).state,'disconnected');
 await f.connect(owner);response=await f.run(owner);assert.equal(response.status,200);const result=await response.json();assert.equal(result.state,'queued');assert.equal(result.queued,1);assert.equal(f.calls.compile,1);assert.equal(f.calls.write.length,1);assert.equal(f.settings.manifest.owner,OWNER);assert.equal(f.settings.manifest.operations.length,1);assert(!('songs'in f.settings.manifest));
 const status=await(await f.request('/api/preparation/status',{headers:owner})).json();assert.equal(status.running,false);assert.equal(status.queued,1);assert.doesNotMatch(JSON.stringify(status),/private-db-token|private-gh-token|d29yZA==/);
 await f.run(owner);assert.equal(f.calls.download,1);assert.equal(f.calls.write.length,1);
});
test('manifest lease conflict returns HTTP 409 and never overwrites or retries the queued contents',async t=>{
 const f=await fixture(t),owner=await f.login();await f.connect(owner);f.settings.conflict=true;const response=await f.run(owner);assert.equal(response.status,409);assert.equal(f.settings.manifest,null);assert.equal(f.calls.write.length,1);await f.run(owner);assert.equal(f.calls.write.length,1);
 const status=await(await f.request('/api/preparation/status',{headers:owner})).json();assert.equal(status.state,'error');assert.equal(status.pending.at(-1).reason,'conflict');
});
