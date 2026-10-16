'use strict';
const {validateManifest,OWNER,REPO,PATH,MAX_MANIFEST_BYTES}=require('./preparation-service.cjs');
const ORIGIN='https://gogojoe312-max.github.io',API='https://api.github.com';
const META_BYTES=64*1024,ENCODED_BYTES=21*1024*1024,TIMEOUT_MS=20000,MAX_ACTIVE=2;
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
const validToken=value=>typeof value==='string'&&value.length>0&&value.length<=8192&&!/[\x00-\x20\x7f]/.test(value);
const failure=(code,status=502)=>Object.assign(Error(code),{deliveryCode:code,status});
const unavailable=(code,status=502)=>({status,body:{status:'unavailable',code,stage:'relay'}});

async function boundedJSON(response,maximum,signal){
 const length=response.headers?.get?.('content-length');
 if(length!==null&&length!==undefined&&(!/^\d+$/.test(length)||Number(length)>maximum))throw failure('RESPONSE_TOO_LARGE');
 if(!response.body?.getReader)throw failure('INVALID_RESPONSE');
 const reader=response.body.getReader(),chunks=[];let size=0;
 try{
  while(true){
   signal.throwIfAborted();const part=await reader.read();signal.throwIfAborted();if(part.done)break;
   if(!(part.value instanceof Uint8Array))throw failure('INVALID_RESPONSE');
   size+=part.value.byteLength;if(size>maximum)throw failure('RESPONSE_TOO_LARGE');chunks.push(Buffer.from(part.value));
  }
 }catch(error){try{await reader.cancel();}catch{}throw error;}finally{reader.releaseLock();}
 let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks,size)));}catch{throw failure('INVALID_RESPONSE');}
 if(!object(value))throw failure('INVALID_RESPONSE');return value;
}

function createPreparationDelivery({env=process.env,fetch:http=fetch,timeoutMs=TIMEOUT_MS}={}){
 let active=0;
 async function read(callerToken){
  if(!validToken(callerToken))return unavailable('HTTP_401',401);
  if(!validToken(env.GITHUB_TOKEN)||(env.DATA_OWNER||OWNER)!==OWNER||(env.DATA_REPO||REPO)!==REPO||(env.DATA_BRANCH||'main')!=='main')return unavailable('RELAY_NOT_CONFIGURED',503);
  if(active>=MAX_ACTIVE)return unavailable('RATE_LIMITED',429);
  active++;
  const controller=new AbortController();let timer;
  try{
   const task=async()=>{
    let requests=0;
    const request=async(path,token,maximum,identity=false)=>{
     controller.signal.throwIfAborted();if(++requests>4)throw failure('SOURCE_UNAVAILABLE');
     const url=API+path,response=await http(url,{method:'GET',credentials:'omit',cache:'no-store',redirect:'error',signal:controller.signal,
      headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token,'X-GitHub-Api-Version':'2022-11-28'}});
     controller.signal.throwIfAborted();
     if(!response||!Number.isInteger(response.status))throw failure('INVALID_RESPONSE');
     if(response.redirected||response.url&&response.url!==url)throw failure('REDIRECTED');
     if(response.status!==200)throw failure(identity&&[401,403,404,429].includes(response.status)?'HTTP_'+response.status:'SOURCE_UNAVAILABLE',identity&&response.status===401?401:502);
     return boundedJSON(response,maximum,controller.signal);
    };
    // The caller credential identifies its owner only. It is never used to read
    // repository contents and is not retained in a session, cache or log.
    const identity=await request('/user',callerToken,META_BYTES,true);
    if(identity.login!==OWNER)throw failure('OWNER_MISMATCH',403);
    const prefix='/repos/'+OWNER+'/'+REPO,repository=await request(prefix,env.GITHUB_TOKEN,META_BYTES);
    if(repository.private!==true)throw failure('REPOSITORY_NOT_PRIVATE');
    if(repository.full_name!==OWNER+'/'+REPO||repository.owner?.login!==OWNER)throw failure('REPOSITORY_MISMATCH');
    const file=await request(prefix+'/contents/'+PATH+'?ref=main',env.GITHUB_TOKEN,ENCODED_BYTES);
    if(file.type!=='file'||file.path!==PATH||file.name!=='prepared.json'||!['base64','none'].includes(file.encoding)
      ||file.truncated===true||own(file,'target')||own(file,'submodule_git_url')||!Number.isSafeInteger(file.size)||file.size<1||file.size>MAX_MANIFEST_BYTES
      ||typeof file.sha!=='string'||!/^[a-f0-9]{40}$/.test(file.sha))throw failure('INVALID_FILE');
    let blob=file;
    if(file.encoding==='none'){
     if(file.content!=='')throw failure('INVALID_FILE');
     blob=await request(prefix+'/git/blobs/'+file.sha,env.GITHUB_TOKEN,ENCODED_BYTES);
     if(blob.sha!==file.sha||blob.size!==file.size||blob.encoding!=='base64'||blob.truncated===true)throw failure('INVALID_FILE');
    }
    if(typeof blob.content!=='string'||blob.content.length>ENCODED_BYTES)throw failure('INVALID_FILE');
    const encoded=blob.content.replace(/[\r\n]/g,'');
    if(!encoded||encoded.length%4||!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))throw failure('INVALID_FILE');
    const bytes=Buffer.from(encoded,'base64');if(bytes.length!==file.size)throw failure('INVALID_FILE');
    let manifest;
    try{manifest=validateManifest(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));if(!manifest)throw Error();}
    catch{throw failure('INVALID_MANIFEST');}
    controller.signal.throwIfAborted();
    return {status:200,body:{status:'ready',manifest,sourceSha:file.sha,sourcePath:PATH}};
   };
   return await Promise.race([task(),new Promise((resolve,reject)=>{timer=setTimeout(()=>{controller.abort();reject(failure('TIMEOUT',504));},timeoutMs);})]);
  }catch(error){return unavailable(error?.deliveryCode||'SOURCE_UNAVAILABLE',error?.deliveryCode?error.status:502);}
  finally{clearTimeout(timer);controller.abort();active--;}
 }
 function cors(req,res,next){
  res.vary('Origin');res.set('Cache-Control','no-store');
  const origin=req.get('origin');
  if(origin&&origin!==ORIGIN)return res.status(403).json(unavailable('ORIGIN_MISMATCH',403).body);
  if(origin)res.set('Access-Control-Allow-Origin',ORIGIN);
  if(req.method==='OPTIONS'){
   const headers=String(req.get('access-control-request-headers')||'').toLowerCase().split(',').map(value=>value.trim()).filter(Boolean);
   if(req.get('access-control-request-method')!=='GET'||headers.some(value=>value!=='authorization'))return res.status(403).json(unavailable('INVALID_PREFLIGHT',403).body);
   res.set({'Access-Control-Allow-Methods':'GET, OPTIONS','Access-Control-Allow-Headers':'Authorization'});
  }
  next();
 }
 async function handle(req,res){
  if(!['GET','OPTIONS'].includes(req.method))return res.status(405).json(unavailable('METHOD_NOT_ALLOWED',405).body);
  if(Object.keys(req.query).length||req.get('transfer-encoding')||req.get('content-length')&&req.get('content-length')!=='0')return res.status(400).json(unavailable('INVALID_REQUEST',400).body);
  if(req.method==='OPTIONS')return res.status(204).end();
  const authorization=req.get('authorization')||'',match=/^Bearer ([^\s]+)$/.exec(authorization);
  const result=await read(match?.[1]);res.status(result.status).json(result.body);
 }
 return {cors,handle,read};
}
module.exports={createPreparationDelivery,ORIGIN};
