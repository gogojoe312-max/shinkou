'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const sha='1234567890abcdef1234567890abcdef12345678',base='https://api.github.com/repos/test/private',config={owner:'test',repo:'private',branch:'main',path:'data.json',token:'test-only-token'};
const large={songs:[{id:'sample',note:'検証'.repeat(400000)}],projects:[]};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status});
function harness(mode,body,{small=false,wrongSha=false,fail=false,privateDenied=false,shaValue=sha}={}){
 const calls=[],content=Buffer.from(JSON.stringify(body)).toString('base64');
 const get=async(url,options)=>{calls.push({url,options});if(url.includes('/contents/'))return json(small?{sha:shaValue,content,encoding:'base64'}:{sha:shaValue,content:'',encoding:'none',download_url:'https://untrusted.example/data.json'});if(url===base+'/git/blobs/'+shaValue)return json({sha:wrongSha?'0'.repeat(40):shaValue,encoding:'base64',content},fail?403:200);throw Error('unexpected destination '+url)};
 const context={Buffer,config,Security:require('../security.js'),ShinkouSecurity:require('../security.js'),privateRepo:async()=>{if(privateDenied)throw Error('private check failed')},requirePrivateRepo:async()=>{if(privateDenied)throw Error('private check failed')},route:p=>'/contents/'+p,github:(suffix,options)=>get(base+suffix,options),fetch:get,b64dec:s=>Buffer.from(s,'base64').toString('utf8'),err:(code,message)=>Error(message)};vm.createContext(context);
 if(mode==='browser'){const src=fs.readFileSync(__dirname+'/../app.js','utf8');vm.runInContext(src.slice(src.indexOf('async function ghRead('),src.indexOf('async function ghWrite(')),context);return {read:()=>context.ghRead(config),calls};}
 const src=fs.readFileSync(__dirname+'/../server/app.cjs','utf8');vm.runInContext(src.slice(src.indexOf('async function read(p=config.path)'),src.indexOf(' const viewerData=')),context);return {read:()=>context.read(),calls};
}
for(const mode of ['browser','server']){
 test(mode+' decodes an over-1MiB payload by immutable SHA in the same repository',async()=>{assert(Buffer.byteLength(JSON.stringify(large))>1024*1024);const c=harness(mode,large),r=await c.read();assert.deepEqual(JSON.parse(JSON.stringify(r.json)),large);assert.equal(r.sha,sha);assert.equal(c.calls.length,2);assert.equal(c.calls[1].url,base+'/git/blobs/'+sha);assert(c.calls.every(x=>x.url.startsWith(base)));});
 test(mode+' keeps the small inline path and original SHA',async()=>{const c=harness(mode,{songs:[],projects:[]},{small:true}),r=await c.read();assert.deepEqual(JSON.parse(JSON.stringify(r.json)),{songs:[],projects:[]});assert.equal(r.sha,sha);assert.equal(c.calls.length,1);});
 test(mode+' rejects missing identity, changed blob and failed read',async()=>{for(const opts of [{shaValue:'invalid'},{wrongSha:true},{fail:true},{privateDenied:true}]){const c=harness(mode,large,opts);await assert.rejects(c.read);if(opts.privateDenied)assert.equal(c.calls.length,0);if(opts.shaValue)assert.equal(c.calls.length,1);}});
}
module.exports={harness};
for(const mode of ['browser','server'])test(mode+' rejects parseable but invalid state without returning an empty dataset',async()=>{for(const body of [null,{},[],{songs:[]}]){const c=harness(mode,body);await assert.rejects(c.read);assert(c.calls.every(x=>!x.options?.method||x.options.method==='GET'));}});
