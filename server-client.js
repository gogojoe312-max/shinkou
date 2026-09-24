/* Same UI, server-verified access. No idle timer or automatic lock. */
(function(root){'use strict';
const enabled=!!root.ShinkouServerConfig?.enabled;let session=null;
async function api(path,options={}){
 const response=await fetch(path,{...options,credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json',...(session?{'X-Shinkou-CSRF':session.csrf}:{}),...options.headers}});
 let value;try{value=await response.json()}catch{throw Error('サーバーに接続できません。入力は保持しています。')}
 if(!response.ok){const e=Error(value.error||'処理を完了できませんでした');e.status=response.status;throw e}return value;
}
async function start(localBoot){
 if(!enabled)return localBoot();
 document.getElementById('main').textContent='接続を確認しています…';
 try{session=await api('/api/session')}catch(e){if(e.status===401){location.replace('/login');return}document.getElementById('main').textContent=e.message;return}
 if(new URLSearchParams(location.search).has('demo')||new URLSearchParams(location.search).has('data')){document.getElementById('main').textContent='認証付きの画面では公開データを取り込みません。通常のURLで開いてください。';return}
 // Different accounts never reuse each other's cached workspace. Only encrypted records persist.
 idb=function(){return new Promise((resolve,reject)=>{const r=indexedDB.open('shinkou-secure-'+session.cacheId,2);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('kv'))r.result.createObjectStore('kv')};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})};
 CK=await crypto.subtle.importKey('raw',Uint8Array.from(atob(session.cacheKey),x=>x.charCodeAt(0)),{name:'AES-GCM'},false,['encrypt','decrypt']);CKsalt=session.cacheId;CKiterations=0;encOn=true;session.cacheKey='';
 RO=RO||session.role==='viewer';if(session.role==='viewer'){V.mode='desk';V.dir='__all';V.use='all';V.fin='show'}
 let cached=null;try{const record=await kvGet('state');if(record?.enc)cached=await ShinkouSecurity.unpack(record,CK)}catch{toast('この端末の保存データを開けません。サーバーの保存内容を確認します。')}
 S=migrate(cached);S.settings=ShinkouSecurity.portable({settings:S.settings}).settings;
 S.settings.sync={on:true,owner:'server',repo:'private',path:'data.json',branch:'main',token:''};S.settings.connections={googleClientId:session.googleClientId};
 syOk=()=>!RO&&session.sync;
 ghRead=async c=>c?.path&&c.path!=='data.json'?{json:{},sha:'server-managed'}:api('/api/data');
 ghWrite=async(c,data,sha)=>{if(c?.path&&c.path!=='data.json')return 'ok';try{const result=await api('/api/data',{method:'PUT',body:JSON.stringify({data,sha})});if(result.backup==='pending')toast('同期済みです。日次バックアップは次回の同期時に再試行します。');return 'ok'}catch(e){if(e.status===409)return 'conflict';throw e}};
 aiFetch=async(body,model=AI_DEF_MODEL)=>{if(RO)throw Error('閲覧専用です');if(aiSending)throw Error('前の相談を送信中です');aiSending=true;try{const j=await api('/api/ai',{method:'POST',body:JSON.stringify({body,model})});if(body)j.localUsage=aiRecordUsage(j,aiCfg(),body.model);return j}finally{aiSending=false}};
 // Keep entry points and controls; the server owns keys, connections and access policies.
 const originalSettings=aiSettingsHTML;
 aiSettingsHTML=()=>originalSettings().replace(/<label class="fg"><span class="lbl">OpenAI APIキー<\/span>[\s\S]*?<\/label>/,'<p class="hint">AIの接続キーはサーバーで管理しています。</p>').replace(/<p class="hint">ChatGPTの月額プラン[\s\S]*?<\/p>/,'<p class="hint">ChatGPTの月額プランとは別のAPI課金です。</p>').replace(/<div class="row fg"><button class="btn" id="aiTest">[\s\S]*?<\/div>/,'<p class="hint">'+(session.ai?'AIに接続できます。':'AIの接続設定を準備しています。')+'</p>');
 if(RO){try{const remote=await api('/api/data');S=migrate(remote.json);render();dot('')}catch(e){document.getElementById('main').textContent=e.message}return}
 undoInit();render();dot('');syStart();
}
function securitySettings(){return '<p class="hint">'+esc(session?.email||'')+'でログインしています。制作データはこの端末にも暗号化して保存します。自動ロックは行いません。</p><button class="btn w" id="secureSignOut">ログアウト</button>'}
async function signOut(){await flush();if(dirty||SY.busy)return toast('保存・同期が終わってからログアウトしてください');if(!RO&&session.sync){await syncNow('logout');if(SY.st!=='ok')return toast('同期できないためログアウトしていません。接続を確認してください。')}await api('/api/logout',{method:'POST',body:'{}'});CK=null;location.replace('/login')}
async function backups(){const {items}=await api('/api/backups');s3('BACKUP','サーバーのバックアップ',items.map(x=>'<button class="btn w" data-server-backup="'+esc(x.day)+'">'+esc(x.day)+'</button>').join('')||'<p class="hint">まだバックアップがありません。</p>',[{t:'閉じる',c:'btn',f:()=>hide('sheet3')}]);
 document.querySelectorAll('[data-server-backup]').forEach(button=>button.onclick=async()=>{if(!await ask(button.dataset.serverBackup+'の内容に戻します。現在の内容は履歴に残ります。','戻す'))return;try{const result=await api('/api/backups/'+button.dataset.serverBackup);const settings=S.settings;S=migrate(result.data);S.settings=settings;logAdd('サーバーのバックアップから復元');mark();await syncNow('restore');render();hide('sheet3');toast(SY.st==='ok'?'復元しました':'端末に復元しました。同期状態を確認してください。')}catch(e){toast(e.message)}});
}
async function connectDropbox(){const popup=open('about:blank','shinkouDropbox','width=520,height=720');if(!popup)throw Error('ポップアップを許可してください');
 return new Promise((resolve,reject)=>{let ticks=0,complete=false,checking=false;const finish=(e)=>{if(complete)return;complete=true;clearInterval(timer);removeEventListener('message',receive);popup.close();e?reject(e):resolve({dropbox:true})};
  const receive=async event=>{if(event.origin!==location.origin||event.source!==popup||event.data?.type!=='shinkou-dropbox-server'||complete||checking)return;checking=true;try{if(!(await api('/api/dropbox/status')).connected)throw Error('接続を確認できません');finish()}catch(e){finish(e)}};
  addEventListener('message',receive);const timer=setInterval(()=>{if(++ticks>300||popup.closed&&!checking)finish(Error('接続を中止しました。もう一度接続できます'))},1000);
  api('/api/dropbox/start',{method:'POST',body:'{}'}).then(value=>{popup.location=value.url},finish);
 });
}
root.ShinkouServer={enabled,start,api,securitySettings,signOut,backups,connectDropbox,get session(){return session}};
})(window);
