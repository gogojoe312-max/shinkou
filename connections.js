/* 外部サービスは利用者の操作時だけ読む。トークンはメモリだけに保持する。 */
(function(root){'use strict';
const SCOPES={gmail:'https://www.googleapis.com/auth/gmail.readonly',draft:'https://www.googleapis.com/auth/gmail.compose',calendar:'https://www.googleapis.com/auth/calendar.readonly',event:'https://www.googleapis.com/auth/calendar.events'};
let config={},gt=null,dt=null,googleLoading=null;
const blocked=()=>config.demo||config.readOnly;
function setup(value){config={...value}}
function status(){return {google:!!gt&&gt.until>Date.now(),dropbox:!!dt&&dt.until>Date.now(),scopes:gt?.scopes||[]}}
function disconnect(){gt=dt=null}
function prepareGoogle(){if(root.google?.accounts?.oauth2)return Promise.resolve();if(googleLoading)return googleLoading;googleLoading=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://accounts.google.com/gsi/client';s.async=true;s.onload=resolve;s.onerror=()=>{googleLoading=null;s.remove();reject(Error('Googleの接続画面を読み込めませんでした'))};document.head.append(s)});return googleLoading}
function connectGoogle(kind){
 if(blocked())return Promise.reject(Error('デモ・閲覧画面では外部サービスに接続しません'));
 if(!/^[\w.-]+\.apps\.googleusercontent\.com$/.test(config.googleClientId||''))return Promise.reject(Error('Googleの接続設定が必要です'));
 if(!root.google?.accounts?.oauth2)return Promise.reject(Error('Googleの準備中です。少し待ってもう一度押してください'));
 const scope=SCOPES[kind];if(!scope)return Promise.reject(Error('接続先を確認してください'));
 // requestAccessToken はユーザーのタップと同じ処理内で呼ぶ。
 return new Promise((resolve,reject)=>{root.google.accounts.oauth2.initTokenClient({client_id:config.googleClientId,scope,include_granted_scopes:true,callback:r=>{if(r.error||!r.access_token)return reject(Error('Googleへの接続が完了しませんでした'));const scopes=(r.scope||'').split(' ');if(!scopes.includes(scope))return reject(Error('必要なアクセスが許可されていません'));gt={token:r.access_token,scopes,until:Date.now()+(Number(r.expires_in)||3500)*1000-30000};resolve(status())},error_callback:()=>reject(Error('接続を中止しました。もう一度接続できます'))}).requestAccessToken()});
}
const base64=bytes=>{let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s)};
const b64url=bytes=>base64(bytes).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
function connectDropbox(){
 if(blocked())return Promise.reject(Error('デモ・閲覧画面では外部サービスに接続しません'));
 if(!/^[a-zA-Z0-9_-]{6,100}$/.test(config.dropboxAppKey||''))return Promise.reject(Error('Dropboxの接続設定が必要です'));
 const popup=root.open('about:blank','shinkouDropbox','width=520,height=720');if(!popup)return Promise.reject(Error('接続画面を開けません。ポップアップを許可してください'));
 const state=b64url(crypto.getRandomValues(new Uint8Array(24))),verifier=b64url(crypto.getRandomValues(new Uint8Array(48))),redirect=new URL('oauth-callback.html',location.href).href.split('?')[0];
 return new Promise((resolve,reject)=>{
  let complete=false,redeeming=false,timer;const finish=(error,value)=>{if(complete)return;complete=true;clearInterval(timer);root.removeEventListener('message',receive);popup.close();error?reject(error):resolve(value)};
  const receive=async event=>{if(event.origin!==location.origin||event.source!==popup||event.data?.type!=='shinkou-oauth'||event.data.state!==state||complete||redeeming)return;if(event.data.error)return finish(Error('Dropboxへの接続を中止しました'));if(!event.data.code)return;redeeming=true;
   try{const r=await fetch('https://api.dropboxapi.com/oauth2/token',{method:'POST',body:new URLSearchParams({code:event.data.code,grant_type:'authorization_code',client_id:config.dropboxAppKey,code_verifier:verifier,redirect_uri:redirect}),signal:AbortSignal.timeout(25000)});if(!r.ok)throw Error('Dropboxへの接続を完了できませんでした');const j=await r.json();if(!j.access_token)throw Error('Dropboxへの接続を確認できませんでした');dt={token:j.access_token,until:Date.now()+(Number(j.expires_in)||14000)*1000-30000};finish(null,status())}catch(e){finish(e)}
  };
  root.addEventListener('message',receive);let ticks=0;timer=setInterval(()=>{if(popup.closed||++ticks>300)finish(Error('接続を中止しました。もう一度接続できます'))},1000);
  crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier)).then(hash=>{if(complete)return;const p=new URLSearchParams({client_id:config.dropboxAppKey,response_type:'code',redirect_uri:redirect,state,code_challenge_method:'S256',code_challenge:b64url(new Uint8Array(hash)),token_access_type:'online',scope:'files.metadata.read files.content.read sharing.read'});popup.location='https://www.dropbox.com/oauth2/authorize?'+p}).catch(e=>finish(e));
 });
}
async function json(service,path,options={}){
 if(blocked())throw Error('デモ・閲覧画面では外部サービスを使用しません');const token=service==='google'?gt:dt;
 if(!token||token.until<=Date.now())throw Error((service==='google'?'Google':'Dropbox')+'に接続してください（接続の有効期限があります）');
 const base=service==='google'?'https://www.googleapis.com/':'https://api.dropboxapi.com/2/';
 const r=await fetch(base+path,{...options,headers:{Authorization:'Bearer '+token.token,'Content-Type':'application/json',...options.headers},signal:AbortSignal.timeout(25000)});
 if(r.status===401){if(service==='google')gt=null;else dt=null;throw Error('接続の期限が切れました。もう一度接続してください')}
 if(!r.ok){const e=Error(r.status===403?'アクセス権を確認してください。必要な接続をやり直せます':r.status===429?'混み合っています。少し待ってからお試しください':'外部サービスを確認できませんでした（'+r.status+'）');e.status=r.status;throw e}return r.json();
}
function need(kind){if(!gt?.scopes.includes(SCOPES[kind]))throw Error('この操作用のGoogle接続を行ってください')}
function quoteQuery(v){return '"'+String(v||'').replace(/["\\\r\n]/g,' ').trim()+'"'}
async function mailSearch(s){need('gmail');const names=[s.title,s.work,...(s.workflow?.aliases||[])].filter(Boolean).slice(0,6);if(!names.length)throw Error('曲名を登録してください');const q='{'+names.map(quoteQuery).join(' ')+'} newer_than:180d -in:trash -in:spam';const j=await json('google','gmail/v1/users/me/messages?'+new URLSearchParams({q,maxResults:'20'}));const out=[];
 for(let i=0;i<(j.messages||[]).length;i+=4)out.push(...await Promise.all(j.messages.slice(i,i+4).map(m=>json('google','gmail/v1/users/me/messages/'+m.id+'?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date'))));
 return {messages:out,more:!!j.nextPageToken};
}
const head=(m,name)=>(m.payload?.headers||[]).find(h=>h.name.toLowerCase()===name.toLowerCase())?.value||'';
async function mailThread(id){need('gmail');if(!/^[a-f0-9]+$/i.test(id))throw Error('メールを確認してください');return json('google','gmail/v1/users/me/threads/'+id+'?format=full')}
function mailText(payload){let out=[];if(payload?.mimeType==='text/plain'&&payload.body?.data)try{const str=payload.body.data.replaceAll('-','+').replaceAll('_','/');out.push(new TextDecoder().decode(Uint8Array.from(atob(str),x=>x.charCodeAt(0))))}catch{}for(const p of payload?.parts||[])out.push(mailText(p));return out.join('\n').slice(0,18000)}
function mimeDraft(draft){
 const valid=v=>/^[^\s@,;<>\r\n]+@[^\s@,;<>\r\n]+\.[^\s@,;<>\r\n]+$/.test(v||'');if(!valid(draft.to))throw Error('宛先を確認してください');if(/[\r\n]/.test(draft.subject||''))throw Error('件名を確認してください');
 const encode=v=>base64(new TextEncoder().encode(v));const msg=['To: '+draft.to,'Subject: =?UTF-8?B?'+encode(draft.subject||'')+'?=','MIME-Version: 1.0','Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',''+encode(draft.body||'').match(/.{1,76}/g)?.join('\r\n')].join('\r\n');return b64url(new TextEncoder().encode(msg));
}
async function createDraft(draft){need('draft');return json('google','gmail/v1/users/me/drafts',{method:'POST',body:JSON.stringify({message:{raw:mimeDraft(draft)}})})}
function attachments(payload){return [...(payload?.filename?[{name:payload.filename,type:payload.mimeType,size:payload.body?.size||0}]:[]),...(payload?.parts||[]).flatMap(attachments)]}
async function calendars(){need('calendar');const items=[];let page='';do{const j=await json('google','calendar/v3/users/me/calendarList?'+new URLSearchParams({maxResults:'250',...(page?{pageToken:page}:{})}));items.push(...j.items);page=j.nextPageToken||'';if(items.length>2000)throw Error('カレンダーが多すぎるため一覧を確認できませんでした')}while(page);return items.filter(x=>!x.deleted)}
async function busy(ids,day){need('calendar');if(!ids.length||ids.length>50)throw Error('空きを確認するカレンダーを1〜50件選んでください');const lo=day+'T00:00:00+09:00',hi=new Date(Date.parse(lo)+864e5).toISOString();const j=await json('google','calendar/v3/freeBusy',{method:'POST',body:JSON.stringify({timeMin:lo,timeMax:hi,timeZone:'Asia/Tokyo',items:ids.map(id=>({id}))})});let all=[];for(const id of ids){const c=j.calendars?.[id];if(!c||c.errors?.length)throw Error('選択したカレンダーすべてを確認できませんでした。空き候補は表示しません');all.push(...c.busy.map(b=>({start:{dateTime:b.start},end:{dateTime:b.end}})))}return all}
async function createEvent(calendarId,event){need('event');if(!/^[a-v0-9]{5,1024}$/.test(event.id||'')||!Number.isFinite(Date.parse(event.start?.dateTime))||!Number.isFinite(Date.parse(event.end?.dateTime))||Date.parse(event.start.dateTime)>=Date.parse(event.end.dateTime)||event.attendees)throw Error('自分の予定の内容を確認してください');return json('google','calendar/v3/calendars/'+encodeURIComponent(calendarId)+'/events',{method:'POST',body:JSON.stringify({...event,start:{...event.start,timeZone:'Asia/Tokyo'},end:{...event.end,timeZone:'Asia/Tokyo'}})})}
async function dropboxList(url,path=''){
 const u=new URL(url);if(u.protocol!=='https:'||!['www.dropbox.com','dropbox.com','db.tt'].includes(u.hostname))throw Error('曲のDropbox共有リンクを登録してください');
 if(path&&(!path.startsWith('/')||path.includes('..')))throw Error('フォルダを確認してください');
 const items=[];let j=await json('dropbox','files/list_folder',{method:'POST',body:JSON.stringify({path,shared_link:{url},recursive:false,include_deleted:false,limit:200})});items.push(...j.entries);
 while(j.has_more){if(items.length>4000)throw Error('ファイルが多いためフォルダを分けて確認してください');j=await json('dropbox','files/list_folder/continue',{method:'POST',body:JSON.stringify({cursor:j.cursor})});items.push(...j.entries)}return items;
}
root.ShinkouConnections={SCOPES,setup,status,disconnect,prepareGoogle,connectGoogle,connectDropbox,mailSearch,head,mailThread,mailText,attachments,mimeDraft,createDraft,calendars,busy,createEvent,dropboxList};if(typeof module!=='undefined')module.exports=root.ShinkouConnections;
})(typeof globalThis!=='undefined'?globalThis:this);
