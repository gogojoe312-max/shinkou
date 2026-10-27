'use strict';
const Results=require('./preparation-results-protocol.cjs');
const {OWNER,REPO}=require('./preparation-service.cjs');
const {ORIGIN}=require('./preparation-delivery.cjs');
const configured=env=>typeof env.GITHUB_TOKEN==='string'&&!!env.GITHUB_TOKEN&&(!env.DATA_OWNER||env.DATA_OWNER===OWNER)&&(!env.DATA_REPO||env.DATA_REPO===REPO)&&(!env.DATA_BRANCH||env.DATA_BRANCH==='main');
function createPreparationResultsDelivery({env=process.env,fetch:http=fetch}={}){
 function cors(req,res,next){
  res.set({'Cache-Control':'no-store',Vary:'Origin'});
  if(req.get('origin')!==ORIGIN)return res.status(403).json({status:'pending',code:'ORIGIN_REJECTED'});
  res.set('Access-Control-Allow-Origin',ORIGIN);
  if(req.method==='OPTIONS'){
   const headers=(req.get('access-control-request-headers')||'').toLowerCase().split(',').map(v=>v.trim()).filter(Boolean);
   if(req.get('access-control-request-method')!=='POST'||headers.some(v=>!['authorization','content-type'].includes(v)))return res.status(403).json({status:'pending',code:'INVALID_PREFLIGHT'});
   return res.set({'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type'}).status(204).end();
  }
  if(req.method!=='POST')return res.status(405).json({status:'pending',code:'METHOD_NOT_ALLOWED'});
  next();
 }
 async function handle(req,res){
  if(Object.keys(req.query).length)return res.status(400).json({status:'pending',code:'INVALID_REQUEST'});
  const match=/^Bearer ([^\s]{1,8192})$/.exec(req.get('authorization')||'');if(!match)return res.status(401).json({status:'pending',code:'INVALID_AUTH'});
  try{
   Results.validate(req.body);
   const r=await http('https://api.github.com/user',{method:'GET',redirect:'error',cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(15000),headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+match[1]}});
   if(!r.ok||r.redirected||r.url&&r.url!=='https://api.github.com/user')return res.status(401).json({status:'pending',code:'IDENTITY_UNAVAILABLE'});
   const text=await r.text();if(text.length>32768)return res.status(401).json({status:'pending',code:'IDENTITY_UNAVAILABLE'});
   if(JSON.parse(text).login!==OWNER)return res.status(403).json({status:'pending',code:'OWNER_MISMATCH'});
   if(!configured(env))return res.status(503).json({status:'pending',code:'RESULT_WRITER_UNAVAILABLE'});
   const result=await Results.write({report:req.body,token:env.GITHUB_TOKEN,fetch:http});
   return res.status(result.status==='confirmed'?200:503).json(result);
  }catch{return res.status(400).json({status:'pending',code:'INVALID_RESULTS'});}
 }
 return {cors,handle,configured:()=>configured(env)};
}
module.exports={createPreparationResultsDelivery};
