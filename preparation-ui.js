/* 予定から準備対象を自動選択。資料の取得・保存は認証済みサーバーが行う。 */
(function(root){
'use strict';
let lastAttempt=0,busy=false,status=null;
const enabled=()=>root.ShinkouServer?.enabled&&root.ShinkouServer.session?.role!=='viewer'&&typeof RO!=='undefined'&&!RO&&typeof DEMO!=='undefined'&&!DEMO;
function targets(){try{return root.ShinkouPreparationTargets.select(S).targets;}catch{return [];}}
function html(){
 const rows=targets(),server=enabled();
 let message=server?'スケジュールと登録されたDropbox資料から自動で準備します。変更のない資料は再取り込みしません。':'スケジュールから準備対象を選んでいます。Dropbox資料の自動取得には、認証付きの進行アプリでDropboxに接続してください。';
 if(status?.state==='error')message='自動準備を完了できませんでした。次の確認時に再試行します。';
 else if(status?.state==='disconnected')message='Dropboxに接続すると、予定に合わせて資料を自動で準備します。';
 else if(status?.queued>0)message='資料を準備しました。歌チェックの接続済み端末に自動で取り込みます。';
 else if(status?.state==='pending')message='予定を確認しました。準備に不足している資料は下に表示します。';
 else if(status?.lastRunAt)message='予定と資料を確認しました。新しく追加する資料はありません。';
 return '<p class="hint" role="status">'+esc(message)+'</p>'+rows.map(t=>'<div class="st"><span class="nm"><span class="t">'+esc((t.kind==='rec'?'REC：':'LIVE：')+t.title)+'</span><span class="s">'+esc(t.dates.join('・'))+'</span></span></div>').join('')+(!rows.length?'<p class="hint">30日以内の準備対象はありません。</p>':'')+(status?.pending?.length?'<p class="hint">'+status.pending.map(p=>esc(p.label||p.reason||'資料の確認待ち')).filter((p,i,a)=>a.indexOf(p)===i).slice(0,8).join('<br>')+'</p>':'')+(server?'<button class="btn w" id="preparationDropbox">Dropboxに接続</button>':'');
}
function refresh(){const host=document.getElementById('preparationStatus');if(host){host.innerHTML=html();wire();}}
async function run(){
 if(!enabled()||busy||document.hidden||navigator.onLine===false||Date.now()-lastAttempt<300000)return;
 busy=true;lastAttempt=Date.now();
 try{status=await root.ShinkouServer.api('/api/preparation/run',{method:'POST',body:'{}'});}
 catch(e){status={state:e.status===401?'disconnected':'error'};}
 finally{busy=false;refresh();}
}
function wire(){const button=document.getElementById('preparationDropbox');if(button)button.onclick=()=>{
 button.disabled=true;
 root.ShinkouServer.connectDropbox().then(()=>{lastAttempt=0;run();},e=>toast(e.message)).finally(()=>{if(button.isConnected)button.disabled=false;});
};}
root.ShinkouPreparationUI={html,wire,run};
document.addEventListener('visibilitychange',()=>{if(!document.hidden)run();});
root.addEventListener('online',run);
})(window);
