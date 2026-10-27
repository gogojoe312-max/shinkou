'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const http=require('node:http');
const {createCipheriv,createHash}=require('node:crypto');
const {createApp}=require('../server/app.cjs');
const {createPreparationDelivery,ORIGIN}=require('../server/preparation-delivery.cjs');
const {OWNER,REPO,PATH,digest}=require('../server/preparation-service.cjs');
const CALLER='synthetic-gist-scope-token',SERVER='synthetic-server-repo-token',BASE='https://api.github.com/repos/'+OWNER+'/'+REPO;
const json=(value,status=200,headers={})=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json',...headers}});
const manifest=()=>{
 const packet={app:'synthetic-packet',title:'確認用の準備'};
 return {app:'utacheck-private-preparation',version:1,owner:OWNER,revision:'synthetic-v1',createdAt:'2026-10-16T00:00:00Z',
  operations:[{id:'synthetic-operation',type:'recording-song',sha256:digest(packet),packet}]};
};
function network(change={}){
 const calls=[],text=JSON.stringify(change.manifest===undefined?manifest():change.manifest);
 const file={type:'file',path:PATH,name:'prepared.json',encoding:'base64',size:Buffer.byteLength(text),sha:'a'.repeat(40),content:Buffer.from(text).toString('base64'),download_url:'https://never-follow.example/private',...change.file};
 const fetch=async(url,options)=>{
  calls.push({url,options});assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');assert.equal(options.cache,'no-store');assert.equal(options.body,undefined);assert(options.signal instanceof AbortSignal);
  assert(calls.length<=(change.maxRequests||4),'fixed reads only, without retries or source discovery');
  if(change.before)await change.before(url,options);
  if(change.response){const value=await change.response(url,options);if(value)return value;}
  if(url==='https://api.github.com/user'){assert.equal(options.headers.Authorization,'Bearer '+CALLER);return json({login:change.login||OWNER});}
  assert.equal(options.headers.Authorization,'Bearer '+SERVER,'repository credential belongs to the server');
  if(url===BASE)return json({private:true,full_name:OWNER+'/'+REPO,owner:{login:OWNER},...change.repository});
  if(url===BASE+'/contents/'+PATH+'?ref=main')return json(file);
  if(url===BASE+'/git/blobs/'+'a'.repeat(40))return json({sha:file.sha,size:file.size,encoding:'base64',content:Buffer.from(text).toString('base64'),...change.blob});
  throw Error('Unexpected source URL');
 };
 return {fetch,calls,file};
}
async function fixture(t,{env={},readBundle,...change}={}){
 const net=network(change),app=createApp({GITHUB_TOKEN:SERVER,...env},{fetch:net.fetch,...(readBundle?{preparationDelivery:{readBundle}}:{})});
 const server=app.listen(0,'127.0.0.1');await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port;
 const request=(options={},path='/utacheck/prepared')=>fetch(base+path,{...options,headers:{Origin:ORIGIN,Authorization:'Bearer '+CALLER,...options.headers}});
 return {...net,request,base};
}
async function failureResponse(response,code,status){
 assert.equal(response.status,status);const body=await response.json();
 assert.deepEqual(body,{status:'unavailable',code,stage:'relay'});assert.doesNotMatch(JSON.stringify(body),/synthetic-.*token|private server detail/);return body;
}

test('owner gist-scope token delivers the fixed private preparation through server credentials without Google setup',async t=>{
 const f=await fixture(t),config=await(await f.request({},'/server-config.js')).text();assert.match(config,/"ready":false/);
 const response=await f.request();assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);
 assert.equal(response.headers.get('access-control-allow-origin'),ORIGIN);assert.equal(response.headers.get('access-control-allow-credentials'),null);assert.equal(response.headers.get('set-cookie'),null);
 const result=await response.json();assert.deepEqual(result,{status:'ready',manifest:manifest(),sourceSha:'a'.repeat(40),sourcePath:PATH});
 assert.doesNotMatch(JSON.stringify(result),/synthetic-gist-scope-token|synthetic-server-repo-token/);
 assert.deepEqual(f.calls.map(call=>call.url),['https://api.github.com/user',BASE,BASE+'/contents/'+PATH+'?ref=main']);
 assert.equal((await f.request({},'/api/data')).status,503,'existing Google protection is unchanged');
});

test('CORS allows only the exact app origin and a GET Authorization preflight',async t=>{
 const f=await fixture(t);
 const preflight=await f.request({method:'OPTIONS',headers:{Authorization:'','Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'authorization'}});
 assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-origin'),ORIGIN);assert.equal(preflight.headers.get('access-control-allow-headers'),'Authorization');
 for(const origin of ['https://evil.example',ORIGIN+'.evil.example','null']){
  const response=await f.request({headers:{Origin:origin}});await failureResponse(response,'ORIGIN_MISMATCH',403);assert.equal(response.headers.get('access-control-allow-origin'),null);
 }
 for(const headers of [{'Access-Control-Request-Method':'POST'},{'Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'authorization, x-source'}])await failureResponse(await f.request({method:'OPTIONS',headers}),'INVALID_PREFLIGHT',403);
 assert.equal(f.calls.length,0);
});

test('missing token is rejected and wrong-account or invalid tokens never reach the repository',async t=>{
 const f=await fixture(t);for(const authorization of ['',CALLER,'Bearer a b'])await failureResponse(await f.request({headers:{Authorization:authorization}}),'HTTP_401',401);assert.equal(f.calls.length,0);
 const wrong=await fixture(t,{login:'another-owner'});await failureResponse(await wrong.request(),'OWNER_MISMATCH',403);assert.equal(wrong.calls.length,1);
 const invalid=await fixture(t,{response:url=>url.endsWith('/user')?json({message:CALLER},401):null});await failureResponse(await invalid.request(),'HTTP_401',401);assert.equal(invalid.calls.length,1);
});

test('missing server token and conflicting configured source fail closed without falling back to caller repo access',async t=>{
 for(const env of [{GITHUB_TOKEN:''},{GITHUB_TOKEN:'bad\nheader'},{DATA_OWNER:'another-owner'},{DATA_REPO:'another-repo'},{DATA_BRANCH:'other'}]){
  const f=await fixture(t,{env});await failureResponse(await f.request(),'RELAY_NOT_CONFIGURED',503);assert.equal(f.calls.length,0);
 }
});

test('query/body source overrides and other methods are not accepted',async t=>{
 const f=await fixture(t);
 for(const query of ['?repo=elsewhere','?path=data.json','?token=caller','?url=https://evil.example'])await failureResponse(await f.request({},'/utacheck/prepared'+query),'INVALID_REQUEST',400);
 await failureResponse(await f.request({method:'POST',body:'{"repo":"elsewhere"}'}),'METHOD_NOT_ALLOWED',405);
 const head=await f.request({method:'HEAD'});assert.equal(head.status,405);assert.equal(f.calls.length,0);
 const body=await new Promise((resolve,reject)=>{
  const request=http.request(f.base+'/utacheck/prepared',{method:'GET',headers:{Origin:ORIGIN,Authorization:'Bearer '+CALLER,'Content-Length':'2'}},response=>{
   const chunks=[];response.on('data',chunk=>chunks.push(chunk));response.on('end',()=>resolve({status:response.statusCode,body:JSON.parse(Buffer.concat(chunks))}));
  });request.on('error',reject);request.end('{}');
 });
 assert.deepEqual(body,{status:400,body:{status:'unavailable',code:'INVALID_REQUEST',stage:'relay'}});assert.equal(f.calls.length,0);
});

test('a nonbrowser request without Origin still requires owner authentication and receives no permissive CORS header',async t=>{
 const f=await fixture(t),response=await fetch(f.base+'/utacheck/prepared',{headers:{Authorization:'Bearer '+CALLER}});
 assert.equal(response.status,200);assert.equal(response.headers.get('access-control-allow-origin'),null);assert.equal((await response.json()).status,'ready');assert.equal(f.calls.length,3);
});

test('a private repository with the exact owner and name is required on every request',async t=>{
 for(const [repository,code]of [[{private:false},'REPOSITORY_NOT_PRIVATE'],[{full_name:OWNER+'/different'},'REPOSITORY_MISMATCH'],[{owner:{login:'different'}},'REPOSITORY_MISMATCH']]){
  const f=await fixture(t,{repository});await failureResponse(await f.request(),code,502);assert.equal(f.calls.length,2);
 }
});

test('large files use only the exact immutable blob with the server credential',async t=>{
 const f=await fixture(t,{file:{encoding:'none',content:''}}),result=await(await f.request()).json();assert.equal(result.status,'ready');assert.equal(f.calls.length,4);assert.equal(f.calls[3].url,BASE+'/git/blobs/'+'a'.repeat(40));
 const wrong=await fixture(t,{file:{encoding:'none',content:''},blob:{sha:'b'.repeat(40)}});await failureResponse(await wrong.request(),'INVALID_FILE',502);assert.equal(wrong.calls.length,4);
});

test('malformed manifests, changed operation hashes and connection fields are never delivered',async t=>{
 const changed=manifest();changed.operations[0].packet.title='changed';
 const secret=manifest();secret.operations[0].packet.token='should-never-be-delivered';secret.operations[0].sha256=digest(secret.operations[0].packet);
 for(const value of [null,{},[],{...manifest(),owner:'another'},changed,secret]){
  const f=await fixture(t,{manifest:value});await failureResponse(await f.request(),'INVALID_MANIFEST',502);assert.equal(f.calls.length,3);
 }
});

test('file metadata and unexpected redirects reject before returning any manifest',async t=>{
 for(const file of [{path:'data.json'},{type:'symlink'},{size:0},{size:16*1024*1024},{sha:'bad'},{encoding:'utf8'},{truncated:true},{content:'bad!'}]){
  const f=await fixture(t,{file});await failureResponse(await f.request(),'INVALID_FILE',502);
 }
 const redirect=await fixture(t,{response:url=>{if(!url.endsWith('/user'))return;const response=json({login:OWNER});Object.defineProperty(response,'redirected',{value:true});return response;}});
 await failureResponse(await redirect.request(),'REDIRECTED',502);assert.equal(redirect.calls.length,1);
});

test('upstream repository failures return sanitized source status and never read their error bodies',async t=>{
 let bodyRead=false;
 const f=await fixture(t,{response:url=>url===BASE?{status:404,body:{getReader(){bodyRead=true;throw Error(SERVER);}}}:null});
 await failureResponse(await f.request(),'SOURCE_UNAVAILABLE',502);assert.equal(f.calls.length,2);assert.equal(bodyRead,false);
 const g=await fixture(t,{response:()=>{throw Error(CALLER+' '+SERVER);}});await failureResponse(await g.request(),'SOURCE_UNAVAILABLE',502);
});

test('metadata limits enforce both announced and streamed bytes',async t=>{
 const header=await fixture(t,{response:()=>json({login:OWNER},200,{'Content-Length':String(64*1024+1)})});await failureResponse(await header.request(),'RESPONSE_TOO_LARGE',502);assert.equal(header.calls.length,1);
 const streamed=await fixture(t,{response:()=>new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array(64*1024+1));controller.close();}}),{headers:{'Content-Length':'1'}})});
 await failureResponse(await streamed.request(),'RESPONSE_TOO_LARGE',502);assert.equal(streamed.calls.length,1);
});

test('a total timeout aborts the request and bounds completion even when upstream does not resolve',async()=>{
 let signal;
 const delivery=createPreparationDelivery({env:{GITHUB_TOKEN:SERVER},timeoutMs:15,fetch:async(url,options)=>{signal=options.signal;return new Promise(()=>{});}});
 const result=await delivery.read(CALLER);assert.deepEqual(result,{status:504,body:{status:'unavailable',code:'TIMEOUT',stage:'relay'}});assert.equal(signal.aborted,true);
});

test('the route rate-limits unauthenticated attempts and returns readable CORS errors',async t=>{
 const f=await fixture(t);
 for(let i=0;i<12;i++)assert.equal((await f.request({headers:{Authorization:''}})).status,401);
 const limited=await f.request({headers:{Authorization:''}});await failureResponse(limited,'RATE_LIMITED',429);assert.equal(limited.headers.get('access-control-allow-origin'),ORIGIN);assert.equal(f.calls.length,0);
});

test('concurrent preparation downloads are bounded without retaining caller sessions',async()=>{
 const releases=[],net=network({maxRequests:6,before:async url=>{if(url.endsWith('/user'))await new Promise(resolve=>releases.push(resolve));}});
 const delivery=createPreparationDelivery({env:{GITHUB_TOKEN:SERVER},fetch:net.fetch});
 const first=delivery.read(CALLER),second=delivery.read(CALLER);assert.equal((await delivery.read(CALLER)).body.code,'RATE_LIMITED');
 releases.forEach(resolve=>resolve());
 const results=await Promise.all([first,second]);assert(results.every(result=>result.status===200));
 assert.equal(net.calls.length,6);assert.equal(net.calls.filter(call=>call.url.endsWith('/user')).length,2);
});

const BUNDLE_KEY=Buffer.alloc(32,7).toString('base64');
function encryptedBundle(value=manifest()){
 const raw=Buffer.from(JSON.stringify(value,null,2)+'\n'),nonce=Buffer.alloc(12,9);
 const cipher=createCipheriv('aes-256-gcm',Buffer.from(BUNDLE_KEY,'base64'),nonce);
 cipher.setAAD(Buffer.from('utacheck-private-preparation:v1'));
 const ciphertext=Buffer.concat([cipher.update(raw),cipher.final()]);
 return {app:'utacheck-encrypted-preparation',version:1,nonce:nonce.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:ciphertext.toString('base64'),
  sourceSha:createHash('sha1').update('blob '+raw.length+'\0').update(raw).digest('hex')};
}
const bundledEnv={GITHUB_TOKEN:'',PREPARATION_BUNDLE_KEY:BUNDLE_KEY};
const bundleBytes=value=>Buffer.from(JSON.stringify(value));
test('a verified owner receives an authenticated encrypted bundle without any server GitHub credential',async t=>{
 const bundle=encryptedBundle();let loads=0;
 const f=await fixture(t,{env:bundledEnv,readBundle:async signal=>{loads++;assert.equal(signal.aborted,false);return bundleBytes(bundle);}});
 const response=await f.request();assert.equal(response.status,200);
 const result=await response.json();assert.deepEqual(result,{status:'ready',manifest:manifest(),sourceSha:bundle.sourceSha,sourcePath:PATH});
 assert.equal(loads,1);assert.deepEqual(f.calls.map(call=>call.url),['https://api.github.com/user']);
 const exposed=JSON.stringify(result);for(const secret of [BUNDLE_KEY,bundle.ciphertext,bundle.tag,CALLER,SERVER])assert.equal(exposed.includes(secret),false);
 for(const file of ['/prepared-bundle.json','/server/prepared-bundle.json'])assert.equal((await f.request({},file)).status,404);
});
test('wrong owners and unauthenticated callers cannot load or decrypt the bundle',async t=>{
 let loads=0;const f=await fixture(t,{env:bundledEnv,login:'another-owner',readBundle:async()=>{loads++;return bundleBytes(encryptedBundle());}});
 await failureResponse(await f.request(),'OWNER_MISMATCH',403);
 await failureResponse(await f.request({headers:{Authorization:''}}),'HTTP_401',401);assert.equal(loads,0);assert.equal(f.calls.length,1);
});
test('a missing bundle and invalid encryption configuration return sanitized unavailable results',async t=>{
 const f=await fixture(t,{env:bundledEnv,readBundle:async()=>{throw Object.assign(Error(BUNDLE_KEY),{code:'ENOENT'});}});
 const missing=await failureResponse(await f.request(),'SOURCE_UNAVAILABLE',502);assert.equal(JSON.stringify(missing).includes(BUNDLE_KEY),false);assert.equal(f.calls.length,1);
 for(const key of ['',Buffer.alloc(31,7).toString('base64'),BUNDLE_KEY.slice(0,-1),BUNDLE_KEY+'\n']){
  let loads=0;const g=await fixture(t,{env:{...bundledEnv,PREPARATION_BUNDLE_KEY:key},readBundle:async()=>{loads++;return bundleBytes(encryptedBundle());}});
  await failureResponse(await g.request(),'RELAY_NOT_CONFIGURED',503);assert.equal(loads,0);assert.equal(g.calls.length,0);
 }
});
test('wrong keys, tampered authenticated bytes, and a changed Git blob SHA never disclose plaintext',async t=>{
 const original=encryptedBundle(),patches=[{sourceSha:'b'.repeat(40)},{app:'other-bundle'},{nonce:'bad'}, {extra:'unexpected'}];
 for(const field of ['nonce','tag','ciphertext']){
  const bytes=Buffer.from(original[field],'base64');bytes[0]^=1;patches.push({[field]:bytes.toString('base64')});
 }
 for(const patch of patches){
  const f=await fixture(t,{env:bundledEnv,readBundle:async()=>bundleBytes({...original,...patch})});
  const result=await failureResponse(await f.request(),'INVALID_BUNDLE',502);assert.equal(JSON.stringify(result).includes(BUNDLE_KEY),false);assert.equal(f.calls.length,1);
 }
 const wrong=await fixture(t,{env:{...bundledEnv,PREPARATION_BUNDLE_KEY:Buffer.alloc(32,8).toString('base64')},readBundle:async()=>bundleBytes(original)});
 await failureResponse(await wrong.request(),'INVALID_BUNDLE',502);assert.equal(wrong.calls.length,1);
});
test('decrypted data still requires the preparation schema and valid operation hashes',async t=>{
 const changed=manifest();changed.operations[0].sha256='b'.repeat(64);
 for(const value of [null,{},changed]){
  const f=await fixture(t,{env:bundledEnv,readBundle:async()=>bundleBytes(encryptedBundle(value))});
  await failureResponse(await f.request(),'INVALID_BUNDLE',502);assert.equal(f.calls.length,1);
 }
});
test('configured private repository delivery stays preferred over the bundled snapshot',async t=>{
 let loads=0;const f=await fixture(t,{env:{PREPARATION_BUNDLE_KEY:BUNDLE_KEY},readBundle:async()=>{loads++;return bundleBytes(encryptedBundle());}});
 assert.equal((await f.request()).status,200);assert.equal(loads,0);assert.equal(f.calls.length,3);
});
test('deployment health checks the configured bundle once and exposes only readiness without private data',async t=>{
 const valid=encryptedBundle();
 for(const [env,bundle,expected]of [[bundledEnv,valid,true],[bundledEnv,{...valid,sourceSha:'b'.repeat(40)},false],[{GITHUB_TOKEN:''},valid,false],
  [{...bundledEnv,PREPARATION_BUNDLE_KEY:Buffer.alloc(32,8).toString('base64')},valid,false]]){
  let loads=0;const f=await fixture(t,{env,readBundle:async()=>{loads++;return bundleBytes(bundle);}});
  for(let i=0;i<2;i++){
   const response=await f.request({headers:{Authorization:''}},'/healthz');assert.equal(response.status,200);
   const body=await response.json();assert.deepEqual(body,{ok:true,preparationBundleReady:expected,preparationRepositoryConfigured:false,revision:null});
   for(const secret of [BUNDLE_KEY,valid.ciphertext,valid.sourceSha,'operations',CALLER,SERVER])assert.equal(JSON.stringify(body).includes(secret),false);
  }
  assert.equal(loads,env.PREPARATION_BUNDLE_KEY?1:0);assert.equal(f.calls.length,0);
 }
});
test('deployment health reports false for a missing or stalled bundle without propagating errors',async()=>{
 for(const readBundle of [async()=>{throw Error(BUNDLE_KEY);},async()=>new Promise(()=>{})]){
  const delivery=createPreparationDelivery({env:bundledEnv,readBundle,timeoutMs:15,fetch:async()=>{throw Error('No network allowed');}});
  assert.equal(await delivery.bundleReady(),false);assert.equal(await delivery.bundleReady(),false);
 }
});

test('versioned recording-update passes through direct private and encrypted preparation without replacing prior queue operations',async t=>{
 const m=manifest();m.operations.push({...structuredClone(m.operations[0]),id:'qa-dot-next-update',type:'recording-update'});
 const f=await fixture(t,{manifest:m});assert.deepEqual((await(await f.request()).json()).manifest,m);
});
