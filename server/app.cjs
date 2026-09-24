'use strict';
const express=require('express'),helmet=require('helmet'),cookieParser=require('cookie-parser');
const {rateLimit}=require('express-rate-limit');
const {OAuth2Client}=require('google-auth-library');
const {randomBytes,createHmac,timingSafeEqual,createHash}=require('node:crypto');
const path=require('node:path');
const Security=require('../security.js');
const ROOT=path.resolve(__dirname,'..'),COOKIE='__Host-shinkou',DAYS=30*86400;
const random=()=>randomBytes(32).toString('base64url');
const safeEqual=(a,b)=>{if(typeof a!=='string'||typeof b!=='string')return false;const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y)};
const err=(status,message)=>Object.assign(Error(message),{status});
const dataOnly=s=>Object.fromEntries(['v','songs','projects','templates','masters','trash','assistantRules','log','at'].filter(k=>k in s).map(k=>[k,s[k]]));
function createApp(env=process.env,dependencies={}){
 const app=express(),http=dependencies.fetch||fetch,verify=dependencies.verify|| (async token=>(await new OAuth2Client().verifyIdToken({idToken:token,audience:env.GOOGLE_CLIENT_ID})).getPayload());
 const origin=env.PUBLIC_ORIGIN||env.RENDER_EXTERNAL_URL||'',secret=env.SESSION_SECRET||'';
 const users=new Map();for(const [role,key]of [['viewer','VIEWER_EMAILS'],['editor','EDITOR_EMAILS'],['admin','OWNER_EMAILS']])for(const email of (env[key]||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean))users.set(email,role);
 const ready=secret.length>=32&&/^[\w.-]+\.apps\.googleusercontent\.com$/.test(env.GOOGLE_CLIENT_ID||'')&&users.size>0&&/^https:\/\/[^/]+$/.test(origin);
 const cookieOptions={httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:DAYS*1000};
 const mac=value=>createHmac('sha256',secret).update(value).digest('base64url');
 const pack=value=>{const body=Buffer.from(JSON.stringify(value)).toString('base64url');return body+'.'+mac(body)};
 function unpack(value){try{const [body,sig,extra]=String(value||'').split('.');if(extra||!safeEqual(mac(body),sig))return null;const data=JSON.parse(Buffer.from(body,'base64url'));if(data.exp<=Date.now()||data.epoch!==(env.SESSION_EPOCH||'1'))return null;return data}catch{return null}}
 const nonces=new Map(),revoked=new Map(),dropboxTokens=new Map(),oauthStates=new Map();
 function prune(){const now=Date.now();for(const map of [nonces,revoked,dropboxTokens,oauthStates])for(const [k,v]of map)if((typeof v==='number'?v:v.exp)<=now)map.delete(k)}
 app.disable('x-powered-by');app.set('trust proxy',1);
 app.use(helmet({crossOriginOpenerPolicy:{policy:'same-origin-allow-popups'},crossOriginEmbedderPolicy:false,contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'",'https://accounts.google.com/gsi/'],styleSrc:["'self'","'unsafe-inline'"],imgSrc:["'self'",'data:','https://*.googleusercontent.com'],connectSrc:["'self'",'https://accounts.google.com','https://www.googleapis.com','https://script.google.com','https://script.googleusercontent.com'],frameSrc:['https://accounts.google.com'],frameAncestors:["'self'"],objectSrc:["'none'"],baseUri:["'none'"],formAction:["'self'"]}},referrerPolicy:{policy:'no-referrer'}}));
 app.use((req,res,next)=>{res.set({'Cache-Control':'no-store','Permissions-Policy':'camera=(), microphone=(), geolocation=()'});next()});
 app.use(cookieParser());app.use(express.json({limit:'20mb',strict:true}));
 const limit=(max,windowMs=60000)=>rateLimit({windowMs,limit:max,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'操作が集中しています。少し待ってからお試しください。'}});
 app.get('/healthz',(req,res)=>res.json({ok:true}));
 app.get('/server-config.js',(req,res)=>res.type('js').send('window.ShinkouServerConfig=Object.freeze('+JSON.stringify({enabled:true,ready,clientId:ready?env.GOOGLE_CLIENT_ID:''})+');'));
 function csrf(req,res,next){if(req.get('origin')!==origin||req.get('sec-fetch-site')==='cross-site')return next(err(403,'別サイトからの操作は受け付けません'));next()}
 function authenticate(req,res,next){if(!ready)return next(err(503,'認証設定が完了していません。制作データは公開されていません。'));prune();const session=unpack(req.cookies[COOKIE]);
  if(!session||revoked.has(session.id)||!users.has(session.email))return next(err(401,'ログインしてください'));
  req.session=session;req.role=users.get(session.email);next();
 }
 const editor=(req,res,next)=>req.role==='viewer'?next(err(403,'閲覧専用です')):next();
 const admin=(req,res,next)=>req.role!=='admin'?next(err(403,'管理者のみ操作できます')):next();
 function protect(req,res,next){if(!safeEqual(req.get('x-shinkou-csrf'),mac('csrf:'+req.session.id)))return next(err(403,'操作の確認情報が一致しません'));next()}
 app.get('/api/auth/challenge',limit(20),(req,res)=>{if(!ready)throw err(503,'認証設定が完了していません');prune();if(nonces.size>10000)throw err(429,'時間をおいてお試しください');const id=random(),nonce=random();nonces.set(id,{nonce,exp:Date.now()+300000});res.cookie('__Host-shinkou-login',id,{...cookieOptions,maxAge:300000});res.json({nonce})});
 app.post('/api/auth/login',limit(10),csrf,async(req,res)=>{if(!ready)throw err(503,'認証設定が完了していません');const id=req.cookies['__Host-shinkou-login'],challenge=nonces.get(id);nonces.delete(id);res.clearCookie('__Host-shinkou-login',cookieOptions);
  if(!challenge||challenge.exp<Date.now()||typeof req.body.credential!=='string'||req.body.credential.length>16000)throw err(401,'ログインをやり直してください');
  let identity;try{identity=await verify(req.body.credential)}catch{throw err(401,'本人確認ができませんでした')}
  const email=String(identity.email||'').toLowerCase();
  if(!identity.sub||identity.email_verified!==true||identity.nonce!==challenge.nonce||(!email.endsWith('@gmail.com')&&!identity.hd)||!users.has(email))throw err(403,'このアカウントにはアクセス権がありません');
  const session={id:random(),sub:identity.sub,email,exp:Date.now()+DAYS*1000,epoch:env.SESSION_EPOCH||'1'};res.cookie(COOKIE,pack(session),cookieOptions);res.json({ok:true});
 });
 app.use('/api',authenticate);
 app.use('/api',(req,res,next)=>['GET','HEAD','OPTIONS'].includes(req.method)?next():csrf(req,res,error=>error?next(error):protect(req,res,next)));
 app.get('/api/session',(req,res)=>res.json({role:req.role,email:req.session.email,cacheId:mac('cache-id:'+req.session.sub),cacheKey:createHmac('sha256',secret).update('cache-key:'+req.session.sub).digest('base64'),csrf:mac('csrf:'+req.session.id),sync:!!env.GITHUB_TOKEN,ai:!!env.OPENAI_API_KEY,dropbox:!!env.DROPBOX_APP_KEY,googleClientId:env.GOOGLE_CLIENT_ID}));
 app.post('/api/logout',(req,res)=>{revoked.set(req.session.id,req.session.exp);dropboxTokens.delete(req.session.id);res.clearCookie(COOKIE,cookieOptions);res.json({ok:true})});
 const config={owner:env.DATA_OWNER,repo:env.DATA_REPO,path:env.DATA_PATH||'data.json',branch:env.DATA_BRANCH||'main'};
 let privateUntil=0;
 async function github(suffix,options={}){if(!env.GITHUB_TOKEN)throw err(503,'同期用のサーバー設定が未完了です');Security.repoConfig(config);return http('https://api.github.com/repos/'+config.owner+'/'+config.repo+suffix,{...options,redirect:'error',headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+env.GITHUB_TOKEN,'Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'},signal:AbortSignal.timeout(25000)})}
 async function privateRepo(){if(privateUntil>Date.now())return;const r=await github('');if(!r.ok||(await r.json()).private!==true)throw err(503,'同期先が非公開であることを確認できません');privateUntil=Date.now()+60000}
 const route=p=>'/contents/'+p.split('/').map(encodeURIComponent).join('/');
 async function read(p=config.path){await privateRepo();const r=await github(route(p)+'?ref='+encodeURIComponent(config.branch));if(r.status===404)return {json:null,sha:null};if(!r.ok)throw err(502,'同期データを取得できません');const j=await r.json();return {json:Security.clean(JSON.parse(Buffer.from(j.content,'base64').toString('utf8'))),sha:j.sha}}
 const viewerData=s=>({...dataOnly(s),songs:(s.songs||[]).map(({workflow,invoiceItems,invoiceTracking,dropboxUrl,note,...v})=>v),trash:[],log:[],assistantRules:[]});
 app.get('/api/data',limit(120),async(req,res)=>{const data=await read();res.json({json:data.json?(req.role==='viewer'?viewerData(data.json):dataOnly(data.json)):null,sha:data.sha})});
 app.put('/api/data',limit(30),editor,async(req,res)=>{
  let incoming;try{incoming=dataOnly(Security.validState(req.body.data))}catch{throw err(400,'進行データの形式を確認してください')}const old=await read();
  if((req.body.sha||null)!==old.sha)throw err(409,'別の端末で更新されています');
  const entry={at:new Date().toISOString(),by:req.session.email,action:'update',songs:incoming.songs.length,projects:incoming.projects.length};
  const stored={...incoming,_serverAudit:[entry,...(old.json?._serverAudit||[])].slice(0,1000)};
  const r=await github(route(config.path),{method:'PUT',body:JSON.stringify({message:'進行データ更新',branch:config.branch,content:Buffer.from(JSON.stringify(stored)).toString('base64'),...(old.sha?{sha:old.sha}:{})})});
  if(r.status===409)throw err(409,'別の端末で更新されています');if(!r.ok)throw err(502,'同期データを保存できません');
  // Immutable daily recovery copies contain no API keys. Existing copies are never overwritten.
  const day=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Tokyo'}),snapshot='snapshots/'+day+'.json';let backup='saved';
  try{const existing=await read(snapshot);if(!existing.json){const saved=await github(route(snapshot),{method:'PUT',body:JSON.stringify({message:'進行 日次バックアップ',branch:config.branch,content:Buffer.from(JSON.stringify(stored)).toString('base64')})});if(!saved.ok&&saved.status!==409)backup='pending'}}catch{backup='pending'}
  res.json({ok:true,backup});
 });
 app.get('/api/audit',admin,async(req,res)=>res.json({entries:(await read()).json?._serverAudit||[]}));
 app.get('/api/backups',admin,async(req,res)=>{await privateRepo();const r=await github('/contents/snapshots?ref='+encodeURIComponent(config.branch));if(r.status===404)return res.json({items:[]});if(!r.ok)throw err(502,'バックアップ一覧を取得できません');res.json({items:(await r.json()).filter(x=>/^\d{4}-\d{2}-\d{2}\.json$/.test(x.name)).map(x=>({day:x.name.slice(0,10)})).sort((a,b)=>b.day.localeCompare(a.day))})});
 app.get('/api/backups/:day',admin,async(req,res)=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(req.params.day))throw err(400,'日付を確認してください');const d=await read('snapshots/'+req.params.day+'.json');if(!d.json)throw err(404,'バックアップがありません');res.json({data:dataOnly(d.json)})});
 const allowedModels=new Set(['gpt-4.1-mini','gpt-5.4']);
 app.post('/api/ai',limit(8),editor,async(req,res)=>{if(!env.OPENAI_API_KEY)throw err(503,'AIのサーバー設定が未完了です');const {body,model}=req.body;
  const selected=body?.model||model;if(!allowedModels.has(selected))throw err(400,'使用できないモデルです');
  let payload;if(body){if(JSON.stringify(body).length>120000||!Array.isArray(body.input)||typeof body.instructions!=='string')throw err(400,'相談内容の形式を確認してください');payload={model:selected,input:body.input,instructions:body.instructions,text:{format:{type:'json_object'}},...(selected==='gpt-5.4'?{reasoning:{effort:'low'}}:{}),max_output_tokens:Math.min(16000,Math.max(1,Number(body.max_output_tokens)||4000)),store:false};}
  const response=await http('https://api.openai.com/v1/'+(body?'responses':'models/'+encodeURIComponent(selected)),{method:body?'POST':'GET',redirect:'error',headers:{Authorization:'Bearer '+env.OPENAI_API_KEY,'Content-Type':'application/json'},body:payload?JSON.stringify(payload):undefined,signal:AbortSignal.timeout(90000)});
  if(!response.ok)throw err(response.status===429?429:502,'AIサービスを利用できません。設定と利用上限を確認してください。');res.json(await response.json());
 });
 app.get('/api/dropbox/status',(req,res)=>res.json({connected:(dropboxTokens.get(req.session.id)?.exp||0)>Date.now()}));
 app.post('/api/dropbox/start',editor,limit(10),(req,res)=>{if(!/^[\w-]{6,100}$/.test(env.DROPBOX_APP_KEY||''))throw err(503,'Dropboxの接続設定が未完了です');const state=random(),verifier=random();oauthStates.set(state,{sid:req.session.id,verifier,exp:Date.now()+300000});
  const p=new URLSearchParams({client_id:env.DROPBOX_APP_KEY,response_type:'code',redirect_uri:origin+'/oauth/dropbox/callback',state,code_challenge_method:'S256',code_challenge:createHash('sha256').update(verifier).digest('base64url'),scope:'files.metadata.read',token_access_type:'online'});res.json({url:'https://www.dropbox.com/oauth2/authorize?'+p});
 });
 app.get('/oauth/dropbox/callback',authenticate,async(req,res)=>{const pending=oauthStates.get(req.query.state);oauthStates.delete(req.query.state);
  if(!pending||pending.exp<Date.now()||pending.sid!==req.session.id||typeof req.query.code!=='string')throw err(400,'Dropboxの接続をやり直してください');
  const r=await http('https://api.dropboxapi.com/oauth2/token',{method:'POST',redirect:'error',body:new URLSearchParams({code:req.query.code,grant_type:'authorization_code',client_id:env.DROPBOX_APP_KEY,code_verifier:pending.verifier,redirect_uri:origin+'/oauth/dropbox/callback'}),signal:AbortSignal.timeout(25000)});
  if(!r.ok)throw err(502,'Dropboxの接続を完了できません');const j=await r.json();if(!j.access_token||j.scope?.trim()!=='files.metadata.read')throw err(403,'Dropboxのアクセス権を確認してください');
  dropboxTokens.set(req.session.id,{token:j.access_token,exp:Date.now()+Math.min(14400,Number(j.expires_in)||14400)*1000-30000});res.redirect('/dropbox-complete.html');
 });
 app.post('/api/dropbox/list',limit(20),editor,async(req,res)=>{const token=dropboxTokens.get(req.session.id);if(!token||token.exp<Date.now())throw err(401,'Dropboxに再接続してください');const url=req.body.url,p=req.body.path||'';
  if(typeof url!=='string'||typeof p!=='string'||p.length>2000||p&&(!p.startsWith('/')||p.split('/').some(x=>x==='.'||x==='..')||/[\\\x00-\x1f]/.test(p)))throw err(400,'フォルダを確認してください');
  let u;try{u=new URL(url)}catch{throw err(400,'DropboxのURLを確認してください')}if(u.protocol!=='https:'||u.username||u.password||!['www.dropbox.com','dropbox.com','db.tt'].includes(u.hostname))throw err(400,'DropboxのURLを確認してください');
  const state=(await read()).json;if(!state?.songs?.some(s=>s.dropboxUrl===url))throw err(403,'曲に登録されたフォルダだけを参照できます');
  let endpoint='files/list_folder',body={path:p,shared_link:{url},recursive:false,include_deleted:false,limit:200},items=[];
  do{const r=await http('https://api.dropboxapi.com/2/'+endpoint,{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+token.token,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(25000)});if(!r.ok)throw err(502,'Dropboxのフォルダを読み取れません');const j=await r.json();items.push(...j.entries);if(!j.has_more)break;if(items.length>4000)throw err(400,'フォルダを分けて確認してください');endpoint='files/list_folder/continue';body={cursor:j.cursor};}while(true);
  res.json({items});
 });
 app.post('/api/dropbox/disconnect',(req,res)=>{dropboxTokens.delete(req.session.id);res.json({ok:true})});
 // Serve only explicitly listed application assets; never the source tree, server files or env files.
 const assets=new Set(['index.html','ui.css','security.js','server-client.js','core.js','invoices.js','production.js','workflow.js','connections.js','app.js','production-ui.js','invoice-ui.js','workflow-ui.js','ui.js','oauth-callback.html','oauth-callback.js','login.js','login.css','dropbox-complete.html','dropbox-complete.js']);
 app.get('/sw.js',(req,res)=>res.type('js').send("self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));"));
 app.get('/login',(req,res)=>res.sendFile(path.join(__dirname,'login.html')));
 app.get('/dropbox-complete.html',authenticate,(req,res)=>res.sendFile(path.join(__dirname,'dropbox-complete.html')));
 app.get('/dropbox-complete.js',(req,res)=>res.sendFile(path.join(__dirname,'dropbox-complete.js')));
 app.use((req,res,next)=>{const name=req.path==='/'?'index.html':req.path.slice(1);if(!['GET','HEAD'].includes(req.method)||!assets.has(name))return next(err(404,'見つかりません'));res.sendFile(path.join(['login.js','login.css'].includes(name)?__dirname:ROOT,name))});
 app.use((error,req,res,next)=>{if(res.headersSent)return next(error);const status=error.status||500;res.status(status).json({error:status>=500&&status!==503?'処理を完了できませんでした。入力は変更していません。':error.message||'操作を確認してください'});});
 return app;
}
module.exports={createApp};
