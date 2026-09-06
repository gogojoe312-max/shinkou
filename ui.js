/* 進行 2026-09-06：役割別表示と曲ごとの工程設定 */
let songTab='flow',flowDone=V.flowDone!==false;
const samePayload=(a,b)=>{const x=syncable(a),y=syncable(b);delete x.at;delete y.at;return ShinkouCore.equal(x,y)};
function matchesWho(s){if(V.who==='all')return true;const b=ballOf(s),k=b.c==='me'?'me':['other','room'].includes(b.c)?'other':b.c==='wait'?'wait':'todo';return !isFin(s)&&k===V.who}
const plainStage=x=>({VoDB:'歌の録音',ChoDB:'コーラス録音',楽器DB:'楽器の録音',ReVoDB:'追加の歌録音',VoEDIT:'歌の編集',ChoEDIT:'コーラス編集',ReVoEDIT:'追加録音の編集',ピッチ:'歌の音程調整',繋ぎ:'歌のつなぎ処理',リズムエディット:'歌のタイミング調整',ステム受け取り:'音声素材の受け取り',ステム発注:'音声素材の依頼'}[x]||x||'未設定');
function songSummary(s){
  const state=status(s),L=stages(s),x=L[state.i],ball=ballOf(s);
  const next=L.filter((z,i)=>!hasKids(L,i)&&!doneOf(s,L,i)).map(z=>({x:z,date:dlOf(s,z)})).filter(z=>z.date).sort((a,b)=>a.date.localeCompare(b.date))[0];
  const finished=L.length>0&&state.k==='fin';
  return {state,L,x,ball,next,finished,title:!L.length?'工程未設定':finished?'全工程完了':plainStage(x.n),issue:!L.length?'工程を設定してください':state.left!==null&&state.left<0?(-state.left)+'日超過':ball.c==='other'||ball.c==='room'?ball.t:!next&&!finished?'次の日程が未設定':finished?'完了':'—'};
}
function renderWorkspace(){
  document.body.classList.toggle('desk-mode',V.mode==='desk');
  document.getElementById('workspaceDate').textContent=new Date().toLocaleDateString('ja-JP',{month:'long',day:'numeric',weekday:'long'});
  document.getElementById('workspaceTitle').textContent=V.use==='cal'?'制作の予定':V.mode==='desk'?'制作状況':'制作中の楽曲';
  document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',(V.mode||'work')===b.dataset.mode));
  document.getElementById('grpSel').style.display=V.use==='cal'?'none':'';
  renderSyncNotice();
  const dirs=[...new Set(S.songs.map(s=>s.director).filter(Boolean))];
  document.getElementById('dirbar').style.display=dirs.length<=1?'none':'';

}
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{V.mode=b.dataset.mode;render()});
function renderDesk(el,list){
  const sorted=list.slice().sort(byDue),groups=new Map();
  sorted.forEach(s=>{const p=projOf(s.projectId),key=(s.artist||'グループ未設定')+' / '+projTitle(p);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(s)});
  el.innerHTML='<div class="desk-caption">状況確認用の表示</div>'+(!list.length?'<div class="empty">該当する楽曲がありません</div>':[...groups].map(([name,songs])=>'<section class="desk-project"><div class="desk-project-head"><h2>'+esc(name)+'</h2><span>'+songs.length+'曲</span></div><div class="desk-columns"><span>楽曲・担当</span><span>現在の状況</span><span>次の締切</span><span>確認事項</span></div>'+songs.map(s=>{
    const a=songSummary(s),groups=[...new Set(a.L.map(x=>x.gp||'その他'))],L=groups.map(g=>({name:g,done:a.L.filter(x=>(x.gp||'その他')===g).every(x=>doneOf(s,a.L,a.L.indexOf(x)))})),done=L.filter(x=>x.done).length;
    return '<button class="desk-row" data-desk-song="'+esc(s.id)+'"><span class="desk-song"><b>'+esc(songTitle(s))+'</b><small>'+esc(s.director||'担当未設定')+'</small></span><span><strong>'+esc(a.title)+'</strong><span class="phase-meter" aria-label="'+done+'/'+L.length+'工程完了">'+L.map(x=>'<i class="'+(x.done?'complete':'')+'"></i>').join('')+'</span></span><span><b>'+esc(a.next?D.md(a.next.date):'—')+'</b><small>'+esc(a.next?plainStage(a.next.x.n):'')+'</small></span><span class="desk-issue '+(a.state.left<0?'overdue':'')+'">'+esc(a.issue)+'<span class="row-arrow">›</span></span></button>'
  }).join('')+'</section>').join(''));
  el.querySelectorAll('[data-desk-song]').forEach(b=>b.onclick=()=>openSong(b.dataset.deskSong));
}
function songTabs(){return '<nav class="song-tabs" aria-label="曲の詳細">'+[['summary','概要'],['flow','工程'],['credits','クレジット'],['notes','メモ・履歴']].filter(([key])=>V.mode!=='desk'||key!=='flow').map(([key,label])=>'<button data-song-tab="'+key+'" aria-pressed="'+(songTab===key)+'">'+label+'</button>').join('')+'</nav>'}
function wireSongTabs(){document.querySelectorAll('[data-song-tab]').forEach(b=>b.onclick=()=>{songTab=b.dataset.songTab;drawSong()})}
function currentCard(s){
  const a=songSummary(s),x=a.x,o=x?stg(s,x.k):{},assigned=x?(o.asg||nameFor(s,x.role)||s.director||'未設定'):s.director||'未設定';
  return '<section class="current-card"><div class="current-eyebrow">'+(a.finished?'制作状況':'現在の作業')+'</div><div class="current-line"><h2>'+esc(a.title)+'</h2>'+(!a.finished&&x?'<span class="state-tag '+a.ball.c+'">'+esc(a.ball.t)+'</span>':'')+'</div><div class="current-meta"><span>締切 <b>'+esc(a.state.dl?D.md(a.state.dl):'未設定')+'</b></span><span>担当 <b>'+esc(assigned)+'</b></span>'+(a.state.left!==null&&a.state.left<=0?'<span class="overdue">'+(a.state.left<0?(-a.state.left)+'日超過':'今日')+'</span>':'')+'</div>'+(o.memo?'<p class="current-note">'+esc(o.memo.split('\n')[0])+'</p>':'')+(!RO&&V.mode!=='desk'&&x?'<div class="current-actions"><button class="btn pri" id="currentDone">完了にする</button><button class="btn" id="currentEdit">日程・担当を編集</button></div>':'')+'</section>';
}
function wireCurrent(){
  const s=cur,a=songSummary(s),x=a.x;
  const d=document.getElementById('currentDone');if(d)d.onclick=()=>{
    const o=stg(s,x.k);o.done=true;if(!o.date)o.date=D.today();o.st='';setKidDone(s,x.k,true);syncOrder(s);logAdd(plainStage(x.n)+'を完了: '+songTitle(s));mark();head();drawSong();render();
  };
  const e=document.getElementById('currentEdit');if(e)e.onclick=()=>{songTab='flow';stOpen=x.k;gpOpen[x.gp]=true;drawSong();document.querySelector('[data-srow="'+CSS.escape(x.k)+'"]')?.scrollIntoView({block:'nearest',behavior:'smooth'})};
}
function decorateSong(){
  const b=document.getElementById('shBody');b.insertAdjacentHTML('afterbegin',songTabs()+currentCard(cur)+'<div class="flow-toolbar"><div class="flow-switch" role="group" aria-label="工程の表示"><button data-flow="all" aria-pressed="'+flowDone+'">すべての工程</button><button data-flow="pending" aria-pressed="'+!flowDone+'">未完了のみ</button></div><button class="btn sm" id="manageStages">工程を設定</button></div>');
  b.classList.remove('summary-body');document.getElementById('manageStages').onclick=stageSettings;
  document.querySelectorAll('[data-flow]').forEach(e=>e.onclick=()=>{flowDone=e.dataset.flow==='all';V.flowDone=flowDone;viewSave();gpOpen={};drawSong()});
  wireSongTabs();wireCurrent();document.getElementById('shDel').style.display=RO?'none':'';
}
function drawSongPage(){
  const s=cur,a=songSummary(s),b=document.getElementById('shBody');
  let h=songTabs();
  if(songTab==='summary'){
    h+=currentCard(s)+'<div class="summary-grid"><section class="detail-panel"><h3>次の予定</h3>'+(a.next?'<div class="next-date">'+esc(D.md(a.next.date))+'</div><p>'+esc(plainStage(a.next.x.n))+'</p>':'<p class="muted">'+(a.finished?'残りの作業はありません':'日程未設定')+'</p>')+'</section><section class="detail-panel"><h3>確認事項</h3><p>'+esc(a.issue)+'</p></section></div>';
    h+='<section class="detail-panel"><h3>主要日程</h3><dl class="summary-dates">'+[['release','発売日'],['open','公演初日'],['rehearsal','リハーサル'],['mastering','マスタリング'],['deliver','音源提出']].filter(([k])=>s.dates[k]).map(([k,l])=>'<div><dt>'+l+'</dt><dd>'+esc(D.md(s.dates[k]))+'</dd></div>').join('')+'</dl></section>';
    const schedule=a.L.flatMap(x=>(stg(s,x.k).slots||[]).filter(v=>v.date&&!v.done).map(v=>({x,v}))).sort((u,v)=>u.v.date.localeCompare(v.v.date));
    h+='<section class="detail-panel"><h3>録音・作業日程</h3>'+(schedule.length?schedule.map(({x,v})=>'<div class="summary-event"><b>'+esc(D.md(v.date))+'</b><span>'+esc(plainStage(x.n))+'<small>'+esc([v.who,v.note].filter(Boolean).join(' · '))+'</small></span></div>').join(''):'<p class="muted">予定はありません</p>')+'</section>';
    if(s.note)h+='<section class="detail-panel"><h3>申し送り</h3><p class="preserve">'+esc(s.note)+'</p></section>';
    h+='<div class="summary-footer">担当 '+esc(s.director||'未設定')+' · 最終更新 '+(s.mtime?esc(new Date(s.mtime).toLocaleString('ja-JP')):'未記録')+'</div>';
    if(V.mode!=='desk'&&!RO)h+='<button class="btn w" id="editSongInfo">曲名・担当・基準日を編集</button>';
  }else if(songTab==='credits'){
    h+='<div class="detail-panel"><h3>制作クレジット</h3><div id="crW">'+crRows(s,'work')+'</div><button class="btn sm" data-add="work">＋ 人を追加</button></div><div class="detail-panel"><h3>ミュージシャンクレジット</h3><div id="crM">'+crRows(s,'mus')+'</div><button class="btn sm" data-add="mus">＋ 人を追加</button></div>';
  }else{
    h+='<section class="detail-panel"><h3>曲のメモ・申し送り</h3><textarea class="inp" data-f="note" rows="5" placeholder="申し送りを入力">'+esc(s.note||'')+'</textarea></section><section class="detail-panel"><h3>最近の更新</h3>'+(S.log.filter(z=>z.t.includes(songTitle(s))).slice(0,15).map(z=>'<div class="history-row"><small>'+esc(new Date(z.at).toLocaleDateString('ja-JP'))+'</small><span>'+esc(z.t)+'</span></div>').join('')||'<p class="muted">記録はありません</p>')+'</section>';
  }
  b.innerHTML=h;b.classList.add('summary-body');wireSongTabs();wireCurrent();
  if(songTab!=='summary')wireSong();
  const edit=document.getElementById('editSongInfo');if(edit)edit.onclick=()=>{secLoad()['基本情報']=true;secLoad()['基準日']=true;songTab='flow';drawSong();[...b.querySelectorAll('.sec')].find(x=>x.textContent.includes('基本情報'))?.scrollIntoView({block:'start'})};
  if(V.mode==='desk'||RO){b.querySelectorAll('input,textarea,select').forEach(e=>e.disabled=true);b.querySelectorAll('.detail-panel button').forEach(e=>e.disabled=true)}
  document.getElementById('shDel').style.display=V.mode==='desk'||RO?'none':'';
}
function stageSettings(){
  const s=cur;
  const draw=()=>{
    const L=s.stageList||[],active=new Set(stages(s).map(x=>x.k));
    const presets=S.templates.filter(t=>t.directorPreset&&t.sourceTemplateId===(s.use==='live'?'tpl_show':s.templateId));
    const h='<div class="stage-setting-head"><b>'+active.size+' / '+L.length+'工程を使用</b><button class="btn sm" id="saveDirectorPreset">担当者の標準に保存</button></div>'+(presets.length?'<div class="preset-row"><select class="inp" id="directorPresetPick"><option value="">担当者の標準設定を選択</option>'+presets.map(t=>'<option value="'+esc(t.id)+'">'+esc(t.name)+'</option>').join('')+'</select><button class="btn" id="useDirectorPreset">適用</button></div>':'')+'<div class="stage-settings">'+L.map((x,i)=>'<div class="stage-setting '+(x.d===1?'child':'')+'"><label><input type="checkbox" data-include="'+esc(x.k)+'" '+(active.has(x.k)?'checked':'')+'><span>'+esc(x.n)+'<small>'+esc(x.gp||'その他')+(!active.has(x.k)?' · 対象外':'')+'</small></span></label>'+(x.d!==1?'<button class="iconbtn" data-move="'+i+'|-1" aria-label="'+esc(x.n)+'を上に移動">↑</button><button class="iconbtn" data-move="'+i+'|1" aria-label="'+esc(x.n)+'を下に移動">↓</button>':'')+'</div>').join('')+'</div>';
    s3('工程設定',songTitle(s),h,[{sp:1},{t:'完了',c:'btn pri',f:()=>{hide('sheet3');head();drawSong();render()}}]);
    const b=document.getElementById('s3Body');
    b.querySelectorAll('[data-include]').forEach(e=>e.onchange=()=>{
      const i=L.findIndex(x=>x.k===e.dataset.include),x=L[i];
      if(x.d===1&&e.checked){let j=i-1;while(j>=0&&L[j].d===1)j--;if(j>=0)stg(s,L[j].k).excluded=false}
      stg(s,x.k).excluded=!e.checked;
      if(x.d!==1){for(let j=i+1;j<L.length&&L[j].d===1;j++)stg(s,L[j].k).excluded=!e.checked}
      logAdd('工程の対象を変更: '+songTitle(s)+' / '+x.n);mark();draw();head();drawSong();render();
    });
    b.querySelectorAll('[data-move]').forEach(e=>e.onclick=()=>{
      const [i,dir]=e.dataset.move.split('|').map(Number),blocks=[];
      L.forEach(x=>{if(x.d!==1||!blocks.length)blocks.push([]);blocks[blocks.length-1].push(x)});
      const pos=blocks.findIndex(z=>z.includes(L[i])),to=pos+dir;if(to<0||to>=blocks.length)return;if(blocks[pos][0].gp!==blocks[to][0].gp)return toast('同じ段階の中で並べ替えできます');
      [blocks[pos],blocks[to]]=[blocks[to],blocks[pos]];s.stageList=blocks.flat();mark();draw();
    });
    b.querySelector('#saveDirectorPreset').onclick=()=>{
      if(!s.director)return toast('基本情報で担当ディレクターを設定してください');
      const base=s.templateId,old=S.templates.find(t=>t.directorPreset&&t.director===s.director&&t.sourceTemplateId===base);
      const t={id:old?old.id:uid(),name:s.director+' / '+(S.templates.find(t=>t.id===base)?.name||'工程'),directorPreset:true,director:s.director,sourceTemplateId:base,stages:ShinkouCore.copy(s.stageList),excludedKeys:L.filter(x=>stg(s,x.k).excluded).map(x=>x.k),dates:(s.tplDates||[]).slice(),mastering:s.tplMastering?ShinkouCore.copy(s.tplMastering):null,mtime:Date.now()};
      if(old)S.templates[S.templates.indexOf(old)]=t;else S.templates.push(t);mark();toast('担当者の標準設定を保存しました');draw();
    };
    const use=b.querySelector('#useDirectorPreset');if(use)use.onclick=async()=>{
      const t=S.templates.find(t=>t.id===b.querySelector('#directorPresetPick').value);if(!t)return;
      if(!await ask('工程の構成を変更します。同じ工程の記録と日程は保持します。','適用する'))return;
      applyPreset(s,t);mark();draw();head();drawSong();render();
    };
  };draw();
}
function applyPreset(s,t){
  s.stageList=ShinkouCore.copy(t.stages);s.tplDates=t.dates.slice();s.tplMastering=ShinkouCore.copy(t.mastering);
  s.stageList.forEach(x=>stg(s,x.k).excluded=(t.excludedKeys||[]).includes(x.k));
}
function applyDirectorPreset(s){
  const t=S.templates.find(t=>t.directorPreset&&t.director===s.director&&t.sourceTemplateId===s.templateId);if(t)applyPreset(s,t);
}
// 純粋なデモは独立した保存領域を使い、接続設定を持たない。
const DEMO=new URLSearchParams(location.search).has('demo');
if(DEMO){
  syOk=()=>false;aiFetch=async()=>{throw new Error('デモではAIへの送信は行いません')};
  idb=function(){return new Promise((res,rej)=>{const r=indexedDB.open('shinkou-preview-20260906',2);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('kv'))r.result.createObjectStore('kv')};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})};
  const realBoot=boot;
  boot=async function(){await realBoot();if(!S.songs.length){seed();const active=S.songs[0],L=stages(active);L.forEach(x=>{const o=stg(active,x.k);o.done=['gather','sdemo','lyric','kario','demo','meeting','arr','stemO','stemR','stemM','vo','vodb','warigo','voes','rhythm','tsunagi'].includes(x.k)});stg(active,'pitch').st='me';stg(active,'pitch').dl=D.today();stg(active,'pitch').memo='歌の編集内容を確認して、ラフミックスへ進める';S.songs.forEach(s=>{s.dlFixed=true});mark();render()}document.body.classList.add('demo-mode');document.querySelector('.top .brand small').textContent='デモ · サンプルデータ'};
}
// 重なったシートでは最前面だけを操作・読み上げ対象にする。
const sheetFocus=new Map(),originalShow=show,originalHide=hide;
function modalState(){
  const sheets=[...document.querySelectorAll('.sheet')],top=sheets.filter(e=>e.classList.contains('on')).at(-1);
  sheets.forEach(e=>{e.inert=e!==top;e.setAttribute('aria-modal',e===top?'true':'false');e.setAttribute('aria-hidden',e===top?'false':'true')});
  return top;
}
show=function(id){sheetFocus.set(id,document.activeElement);originalShow(id);const top=modalState();if(top){top.setAttribute('tabindex','-1');top.focus()}};
hide=function(id){originalHide(id);const top=modalState(),previous=sheetFocus.get(id);if(previous&&previous.isConnected&&!previous.closest('[inert]'))previous.focus();else if(top)top.focus()};
document.addEventListener('keydown',e=>{if(e.key!=='Tab')return;const top=modalState();if(!top)return;
  const candidates=[...top.querySelectorAll('button,input,select,textarea,[tabindex="0"]')].filter(x=>!x.disabled&&x.getClientRects().length),first=candidates[0],last=candidates.at(-1);
  if(!first){e.preventDefault();return}if(e.shiftKey&&(document.activeElement===first||document.activeElement===top)){e.preventDefault();last.focus()}else if(!e.shiftKey&&(document.activeElement===last||document.activeElement===top)){e.preventDefault();first.focus()}
});
modalState();

function compactSongCard(s,rank){
  const a=songSummary(s),L=a.L,done=L.filter((x,i)=>!hasKids(L,i)&&doneOf(s,L,i)).length,total=L.filter((x,i)=>!hasKids(L,i)).length;
  const p=projOf(s.projectId),context=[s.artist,projTitle(p)].filter(Boolean).join(' · ');
  const due=a.finished?'完了':a.state.left<0&&a.state.left!==null?(-a.state.left)+'日超過':a.state.left===0?'今日':a.state.dl?D.md(a.state.dl):'締切未設定';
  return '<button class="song-card '+(!a.finished&&a.state.left!==null&&a.state.left<0?'late':'')+'" data-song="'+esc(s.id)+'"><span class="song-card-context">'+esc(context)+'</span><span class="song-card-title"><b>'+esc(songTitle(s))+'</b><span class="song-card-due">'+esc(due)+'</span></span><span class="song-card-status"><span>'+esc(a.finished?'全工程完了':a.x?a.x.n:'工程未設定')+'</span><span>'+esc(a.finished?'':a.ball.t)+'</span></span><span class="song-card-progress"><span><i style="width:'+Math.round(total?done/total*100:0)+'%"></i></span><small>'+done+' / '+total+' 完了</small></span></button>';
}
let reviewedSync=[];try{reviewedSync=JSON.parse(localStorage.getItem('shinkou_sync_reviewed')||'[]')}catch(e){}
function syncRecords(){return S.log.filter(z=>['sync-conflict','sync-difference'].includes(z.kind))}
function renderSyncNotice(){
 const records=syncRecords(),unread=records.filter(z=>!reviewedSync.includes(z.id));
 document.getElementById('overviewBar').innerHTML=records.length?'<button class="sync-notice '+(unread.length?'unread':'')+'" id="conflictsOpen">'+(unread.length?'同期で値の違い '+unread.length+'件':'同期の確認履歴')+'<span>確認する ›</span></button>':'';
 const button=document.getElementById('conflictsOpen');if(button)button.onclick=showSyncRecords;
}
function syncFieldLabel(path){
 const parts=String(path||'').split(' / '),s=S.songs.find(s=>s.id===parts[0]),x=s&&(s.stageList||[]).find(x=>parts.includes(x.k));
 const labels={title:'曲名',note:'メモ',dl:'締切',date:'日付',done:'完了状態',st:'状態',mtime:'更新時刻',slots:'日程',calRef:'予定の識別情報',slotId:'予定の識別情報',excluded:'対象工程',asg:'担当',stageList:'工程設定'};
 return [s?songTitle(s):'設定・データ',x?x.n:'',labels[parts.at(-1)]||parts.at(-1)].filter(Boolean).join(' / ');
}
function syncValue(v){if(v===undefined)return '未設定';if(v===true)return 'はい';if(v===false)return 'いいえ';return typeof v==='object'?JSON.stringify(v,null,2):String(v)||'空欄'}
function showSyncRecords(){
 const records=syncRecords();
 const h='<p class="sync-explanation">端末と同期先で値が異なった記録です。同時編集とは限りません。更新前の記録がない初回同期でも発生します。確認済みにしても、記録や曲の内容は消えません。</p>'+records.map(z=>'<details class="sync-record"><summary>'+esc(syncFieldLabel(z.detail&&z.detail.path))+'<small>'+esc(new Date(z.at).toLocaleString('ja-JP'))+'</small></summary><div class="sync-values"><div><b>この端末にあった値</b><pre>'+esc(syncValue(z.detail&&z.detail.local))+'</pre></div><div><b>同期先にあった値</b><pre>'+esc(syncValue(z.detail&&z.detail.remote))+'</pre></div></div></details>').join('');
 s3('同期の確認','値の違いの記録',h,[{t:'閉じる',c:'btn',f:()=>hide('sheet3')},{sp:1},{t:'確認済みにする',c:'btn pri',f:()=>{reviewedSync=[...new Set(reviewedSync.concat(records.map(z=>z.id)))].slice(-500);try{localStorage.setItem('shinkou_sync_reviewed',JSON.stringify(reviewedSync))}catch(e){}hide('sheet3');renderSyncNotice()}}]);
}
function setupActionDock(){
 const bar=document.getElementById('aiBar'),fab=document.getElementById('fab');if(!bar||!fab)return;
 bar.prepend(fab);const toggle=document.createElement('button');toggle.id='aiToggle';toggle.className='btn';toggle.textContent='AIに相談';toggle.setAttribute('aria-expanded','false');bar.append(toggle);
 toggle.onclick=()=>{const open=bar.classList.toggle('ai-open');toggle.textContent=open?'閉じる':'AIに相談';toggle.setAttribute('aria-expanded',String(open));if(open)document.getElementById('aiQ').focus()};
}
setupActionDock();

boot();
