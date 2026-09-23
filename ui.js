/* ホーム・曲の詳細・相談。作業の表示と編集は production-ui.js に集約。 */
let songTab='summary';
const samePayload=(a,b)=>{const x=syncable(a),y=syncable(b);delete x.at;delete y.at;return ShinkouCore.equal(x,y)};
function matchesWho(s){
 if(V.who==='all')return true;const r=productionReport(s);if(r.archive)return false;
 return r.nodes.some(n=>!n.done&&(V.who==='wait'?n.state==='waiting':V.who==='todo'?['unknown','todo'].includes(n.state):V.who==='other'?n.wait||(['doing','review','received'].includes(n.state)&&!!n.owner&&n.owner!=='自分'):['doing','review','received'].includes(n.state)&&n.owner==='自分'));
}
const plainStage=x=>({VoDB:'歌の録音',ChoDB:'コーラス録音',楽器DB:'楽器の録音',ReVoDB:'追加の歌録音',VoEDIT:'歌の編集',ChoEDIT:'コーラス編集',ReVoEDIT:'追加録音の編集',ピッチ:'歌の音程調整',繋ぎ:'歌のつなぎ処理',リズムエディット:'歌のタイミング調整',ステム受け取り:'音声素材の受け取り',ステム発注:'音声素材の依頼'}[x]||x||'未設定');
function songHasMV(s){return typeof s.mvEnabled==='boolean'?s.mvEnabled:!!s.dates?.mv||sortOf(s)==='single'}
function songSnapshotContents(s){return productionSnapshot(s)}
function songSnapshotHTML(s){return '<div class="song-snapshot" data-snapshot-song="'+esc(s.id)+'">'+songSnapshotContents(s)+'</div>'}
function songOverview(list){return productionOverview(list)}
function refreshCompletion(s){
 document.querySelectorAll('[data-snapshot-song]').forEach(root=>{if(root.dataset.snapshotSong===s.id){root.innerHTML=songSnapshotContents(s);wireSnapshotEditors(root)}});
 const brief=document.getElementById('homeBrief');if(brief){brief.innerHTML=assistantBriefHTML(pool());wireBriefLinks(brief)}
 refreshProductionShows();
 if(cur?.id===s.id)head();
}
function deskPreviewURL(){const u=new URL(location.href);u.searchParams.set('mode','desk');u.hash='';return u.href}
function wireSnapshotEditors(root){
 wireProduction(root);
 root.querySelectorAll('[data-show-completed]').forEach(b=>b.onclick=()=>{
  V.fin=V.fin==='show'?'hide':'show';viewSave();document.getElementById('finSel').value=V.fin;render();
 });
}

function renderWorkspace(){
  document.body.classList.toggle('desk-mode',V.mode==='desk');
  document.body.classList.toggle('assistant-first',V.mode!=='desk'&&V.use!=='cal');
  document.getElementById('workspaceDate').textContent=new Date().toLocaleDateString('ja-JP',{month:'long',day:'numeric',weekday:'long'});
  document.getElementById('workspaceTitle').textContent=V.use==='cal'?'予定':V.mode==='desk'?'制作状況':'制作の見通し';
  const label=document.getElementById('filterLabel');if(label)label.textContent='絞り込み'+(V.dir!=='__all'?' · '+V.dir:'')+(V.who!=='all'?' · 状態指定':'')+(V.fin==='show'?' · 完了含む':'')+(V.use!=='master'?' · '+({live:'ライブ',cal:'予定',all:'すべて'}[V.use]||V.use):'');
  document.getElementById('grpSel').style.display=V.use==='cal'?'none':'';
  renderSyncNotice();
  const dirs=[...new Set(S.songs.map(s=>s.director).filter(Boolean))];
  document.getElementById('dirbar').style.display=dirs.length<=1?'none':'';

}
const deskParams=new URLSearchParams(location.search);
V.mode=deskParams.has('data')||deskParams.get('mode')==='desk'?'desk':'work';
if(V.mode==='desk'){RO=true;V.dir='__all';V.who='all';V.fin='show';V.use='all';}
function renderDesk(el,list){
  el.innerHTML='<p class="desk-caption">デスク用 · 閲覧のみ</p>'+songOverview(list);
  el.querySelectorAll('[data-brief-song]').forEach(b=>b.onclick=()=>openSong(b.dataset.briefSong));wireSnapshotEditors(el);
}
function songTabs(){return '<nav class="song-tabs" aria-label="曲の詳細">'+[['summary','状況'],['credits','クレジット'],['notes','メモ・履歴']].filter(([key])=>V.mode!=='desk'||key==='summary').map(([key,label])=>'<button data-song-tab="'+key+'" aria-pressed="'+(songTab===key)+'">'+label+'</button>').join('')+'</nav>'}
function wireSongTabs(){document.querySelectorAll('[data-song-tab]').forEach(b=>b.onclick=()=>{songTab=b.dataset.songTab;drawSong()})}
function drawSongPage(){
  const s=cur,b=document.getElementById('shBody');
  if(V.mode==='desk')songTab='summary';
  let h=songTabs();
  if(songTab==='summary'){
    h+=assistantSongCard(s);
    if(s.note&&V.mode!=='desk')h+='<section class="detail-panel"><h3>申し送り</h3><p class="preserve">'+esc(s.note)+'</p></section>';
    if(V.mode!=='desk'&&!RO)h+='<div class="summary-options"><button class="btn" id="editSongInfo">'+(productionIsLive(s)?'情報を編集':'曲の情報を編集')+'</button></div>';
  }else if(songTab==='credits'){
    h+='<div class="detail-panel"><h3>制作クレジット</h3><div id="crW">'+crRows(s,'work')+'</div><button class="btn sm" data-add="work">＋ 人を追加</button></div><div class="detail-panel"><h3>ミュージシャンクレジット</h3><div id="crM">'+crRows(s,'mus')+'</div><button class="btn sm" data-add="mus">＋ 人を追加</button></div>';
  }else{
    h+='<section class="detail-panel"><h3>曲のメモ・申し送り</h3><textarea class="inp" data-f="note" rows="5" placeholder="申し送りを入力">'+esc(s.note||'')+'</textarea></section><section class="detail-panel"><h3>最近の更新</h3>'+(S.log.filter(z=>z.t.includes(songTitle(s))).slice(0,15).map(z=>'<div class="history-row"><small>'+esc(new Date(z.at).toLocaleDateString('ja-JP'))+'</small><span>'+esc(z.t)+'</span></div>').join('')||'<p class="muted">記録はありません</p>')+'</section>';
  }
  b.innerHTML=h;wireSnapshotEditors(b);b.classList.add('summary-body');wireSongTabs();
  const plan=document.getElementById('summaryPlan');if(plan)plan.onclick=()=>plannerSheet();
  const assistant=document.getElementById('songAssistant');if(assistant)assistant.onclick=()=>plannerSheet();
  const resume=document.getElementById('songResume');if(resume)resume.onclick=()=>resumeAssistantConversation();
  if(songTab!=='summary')wireSong();
  const edit=document.getElementById('editSongInfo');if(edit)edit.onclick=()=>productionSongInfo(s);
  if(V.mode==='desk'||RO){b.querySelectorAll('input,textarea,select').forEach(e=>e.disabled=true);b.querySelectorAll('.detail-panel button').forEach(e=>e.disabled=true)}
  document.getElementById('shDel').style.display=V.mode==='desk'||RO?'none':'';
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
  boot=async function(){await realBoot();if(!S.songs.length){seed();const active=S.songs[0],L=stages(active);L.forEach(x=>{const o=stg(active,x.k);o.done=['gather','sdemo','lyric','kario','demo','meeting','arr','stemO','stemR','stemM','vo','vodb','warigo','voes','rhythm','tsunagi'].includes(x.k)});stg(active,'pitch').st='me';stg(active,'pitch').dl=D.today();stg(active,'pitch').memo='歌の編集内容を確認して、ラフミックスへ進める';S.songs.forEach(s=>{s.dlFixed=true});mark();render()}seedLivePreview();document.body.classList.add('demo-mode');document.querySelector('.top .brand small').textContent='デモ · サンプルデータ'};
}
function seedLivePreview(){
 if(!DEMO||S.projects.some(p=>p.id==='demo_show_autumn'))return;
 const a={id:'demo_show_autumn',mode:'live',kind:'ライブ',custom:'秋ツアー',artist:'サンプルグループ',release:D.addD(D.today(),28),rehearsal:D.addD(D.today(),14),venue:'サンプルホール'},b={...a,id:'demo_show_special',custom:'記念公演',release:D.addD(D.today(),45),rehearsal:D.addD(D.today(),35)};
 S.projects.push(a,b);
 const add=(p,type,k,state,who,offset)=>{const s=newSong({templateId:'tpl_show'});Object.assign(s,{title:type,ltype:type,projectId:p.id,artist:p.artist,stageList:showStages(type),dlFixed:true});s.dates.open=p.release;s.dates.rehearsal=p.rehearsal;S.songs.push(s);const before=s.stageList.findIndex(x=>x.k===k);s.stageList.forEach((x,i)=>{const o=stg(s,x.k);if(i<before||state==='done'){o.done=true;o.date=D.today()}});if(state!=='done')Object.assign(stg(s,k),{st:state,asg:who,dl:D.addD(D.today(),offset)});};
 add(a,'オープニングSE','build','req','編曲担当',3);add(a,'BUVo','lrec','me','自分',7);add(a,'歌割','make','done','',0);add(b,'ダンス曲','order','','',12);add(b,'カラオケ','make','done','',0);mark();render();
}
// キーボードを除いた表示範囲に画面を固定し、本文だけをスクロールする。
function setupFixedViewport(){
 const viewport=window.visualViewport,root=document.documentElement;
 function revealInput(){
  const input=document.activeElement;
  if(!input||!input.matches('input,textarea,select')||input.closest('[inert]'))return;
  const scroller=input.closest('.sbody,#main,.top');if(!scroller)return;
  const field=input.getBoundingClientRect(),area=scroller.getBoundingClientRect();
  const visibleHeight=area.height-24;
  if(visibleHeight<=0)return;
  if(field.top<area.top+12)scroller.scrollTop+=field.top-area.top-12;
  else if(field.bottom>area.bottom-12)scroller.scrollTop+=Math.min(field.bottom-area.bottom+12,field.top-area.top-12);
 }
 function update(){
  // ピンチ拡大を許可するブラウザーでは、拡大そのものをリサイズと扱わない。
  if(viewport&&viewport.scale!==1)return;
  const height=viewport?viewport.height:window.innerHeight;
  root.style.setProperty('--app-height',Math.round(height)+'px');
  root.style.setProperty('--app-top',Math.round(viewport?viewport.offsetTop:0)+'px');
  document.body.classList.toggle('keyboard-open',window.innerHeight-height>100);
  revealInput();
 }
 viewport?.addEventListener('resize',update);
 viewport?.addEventListener('scroll',update);
 window.addEventListener('resize',update);
 window.addEventListener('pageshow',update);
 document.addEventListener('focusin',()=>requestAnimationFrame(revealInput));
 update();
}
setupFixedViewport();

// 重なったシートでは最前面だけを操作・読み上げ対象にする。
const sheetFocus=new Map(),originalShow=show,originalHide=hide;
function modalState(){
  const sheets=[...document.querySelectorAll('.sheet')],top=sheets.filter(e=>e.classList.contains('on')).at(-1);
  sheets.forEach(e=>{e.inert=e!==top;e.setAttribute('aria-modal',e===top?'true':'false');e.setAttribute('aria-hidden',e===top?'false':'true')});
  return top;
}
show=function(id){sheetFocus.set(id,document.activeElement);document.getElementById(id).classList.toggle('input-sheet',!!document.getElementById(id).querySelector('#plannerText'));originalShow(id);const top=modalState();if(top){top.setAttribute('tabindex','-1');top.focus({preventScroll:true})}};
hide=function(id){originalHide(id);const top=modalState(),previous=sheetFocus.get(id);if(previous&&previous.isConnected&&!previous.closest('[inert]'))previous.focus({preventScroll:true});else if(top)top.focus({preventScroll:true})};
document.addEventListener('keydown',e=>{if(e.key!=='Tab')return;const top=modalState();if(!top)return;
  const candidates=[...top.querySelectorAll('button,input,select,textarea,[tabindex="0"]')].filter(x=>!x.disabled&&x.getClientRects().length),first=candidates[0],last=candidates.at(-1);
  if(!first){e.preventDefault();return}if(e.shiftKey&&(document.activeElement===first||document.activeElement===top)){e.preventDefault();last.focus()}else if(!e.shiftKey&&(document.activeElement===last||document.activeElement===top)){e.preventDefault();first.focus()}
});
modalState();

function setupSimpleHome(){
 const top=document.querySelector('.top'),tools=document.querySelector('.tools');if(!top||!tools)return;
 const filters=document.createElement('details');filters.id='homeFilters';filters.innerHTML='<summary><span id="filterLabel">絞り込み</span><span aria-hidden="true">⌄</span></summary><div class="filter-content"></div>';
 const box=filters.querySelector('.filter-content');
 ['dirbar','grpSel','whoSel','finSel'].forEach(id=>{const el=document.getElementById(id);if(el)box.append(el)});
 top.append(filters);
 // Home has one consistent deadline order; grouping controls remain for legacy views.
 document.getElementById('grpSel').setAttribute('aria-label','並び順');
 document.getElementById('whoSel').setAttribute('aria-label','作業状況');document.getElementById('finSel').setAttribute('aria-label','完了曲の表示');
}
setupSimpleHome();

let reviewedSync=[];try{reviewedSync=JSON.parse(localStorage.getItem('shinkou_sync_reviewed')||'[]')}catch(e){}
function syncRecords(){return S.log.filter(z=>['sync-conflict','sync-difference'].includes(z.kind))}
function renderSyncNotice(){
 const bar=document.getElementById('overviewBar');if(bar){bar.replaceChildren();bar.hidden=true}
}
function syncFieldLabel(path){
 const parts=String(path||'').split(' / '),s=S.songs.find(s=>s.id===parts[0]),x=s&&(s.stageList||[]).find(x=>parts.includes(x.k));
 const labels={title:'曲名',note:'メモ',dl:'締切',date:'日付',done:'完了状態',st:'状態',mtime:'更新時刻',slots:'日程',calRef:'予定の識別情報',slotId:'予定の識別情報',excluded:'対象工程',asg:'担当',stageList:'工程設定'};
 return [s?songTitle(s):'設定・データ',x?x.n:'',labels[parts.at(-1)]||parts.at(-1)].filter(Boolean).join(' / ');
}
function syncValue(v){if(v===undefined)return '未設定';if(v===true)return 'はい';if(v===false)return 'いいえ';return typeof v==='object'?JSON.stringify(v,null,2):String(v)||'空欄'}
function showSyncRecords(){
 const records=syncRecords();
 const h='<p class="sync-explanation">端末と同期先で値が異なった記録です。同時編集とは限りません。更新前の記録がない初回同期でも発生します。確認済みにしても、記録や曲の内容は消えません。</p>'+(!records.length?'<p class="hint">同期の確認履歴はありません。</p>':'')+records.map(z=>'<details class="sync-record"><summary>'+esc(syncFieldLabel(z.detail&&z.detail.path))+'<small>'+esc(new Date(z.at).toLocaleString('ja-JP'))+'</small></summary><div class="sync-values"><div><b>この端末にあった値</b><pre>'+esc(syncValue(z.detail&&z.detail.local))+'</pre></div><div><b>同期先にあった値</b><pre>'+esc(syncValue(z.detail&&z.detail.remote))+'</pre></div></div></details>').join('');
 s3('同期の確認','値の違いの記録',h,[{t:'閉じる',c:'btn',f:()=>hide('sheet3')},{sp:1},{t:'確認済みにする',c:'btn pri',f:()=>{reviewedSync=[...new Set(reviewedSync.concat(records.map(z=>z.id)))].slice(-500);try{localStorage.setItem('shinkou_sync_reviewed',JSON.stringify(reviewedSync))}catch(e){}hide('sheet3');renderSyncNotice()}}]);
}
function plannerSheet(initial=''){
 if(typeof initial!=='string')initial='';
 if(RO)return toast('閲覧専用です');
 const scope=conversationScope();
 s3('AIアシスタント',cur?songTitle(cur)+'の相談':'制作全体の相談',
 '<label class="planner-lead" for="plannerText">今の状況を、そのままどうぞ。</label><textarea id="plannerText" class="inp" rows="4" inputmode="text" placeholder="例：歌録りが終わりました。次に何をすればいいですか？"></textarea><div class="planner-prompts"><button class="btn" data-prompt="今の制作状況を整理して、確認が必要な情報や不足していそうな工程を質問してください。">不足を確認</button><button class="btn" data-prompt="今後の予定を一緒に考えてください。納期から無理のない日程を組むために、まず必要なことを質問してください。">予定を相談</button></div>'+aiChoiceHTML('plannerMode')+'<p class="hint">登録中の制作情報を、設定済みのAIに送って相談します。変更は提案を確認してから反映します。</p><p id="plannerError" role="status"></p>',
 [{t:'閉じる',c:'btn',f:()=>hide('sheet3')},{sp:1},{t:'相談する',c:'btn pri',f:async()=>{
   const text=document.getElementById('plannerText').value.trim();if(!text)return;
   const error=document.getElementById('plannerError'),button=document.querySelector('#s3Foot .pri');button.disabled=true;error.textContent='状況を整理しています…';const stopWaiting=aiWait(error);
   const revision=aiViewRevision;
   try{const r=await aiCall(text,scope,document.getElementById('plannerMode').value);if(revision!==aiViewRevision||scope!==conversationScope()||!error.isConnected)return;aiPreview(r.out,r.msgs,text,r.scope)}catch(e){if(revision!==aiViewRevision||!error.isConnected)return;error.textContent=e.message||String(e);button.disabled=false}finally{stopWaiting()}
 }}]);
 const input=document.getElementById('plannerText');input.value=initial;
 const updateModel=wireAIChoice('plannerMode',input,scope);
 document.querySelectorAll('[data-prompt]').forEach(b=>b.onclick=()=>{input.value=b.dataset.prompt;updateModel();input.focus({preventScroll:true});input.setSelectionRange(input.value.length,input.value.length)});
 // iPhoneはタップの処理中にfocusする必要がある。タイマーや通信の後へ移さない。
 input.focus({preventScroll:true});
 input.setSelectionRange(input.value.length,input.value.length);
}

function setupActionDock(){
 const bar=document.getElementById('aiBar'),fab=document.getElementById('fab');if(!bar||!fab)return;
 bar.prepend(fab);const toggle=document.createElement('button');toggle.id='aiToggle';toggle.className='btn';toggle.textContent='AIに相談';toggle.setAttribute('aria-expanded','false');bar.append(toggle);
 toggle.onclick=()=>plannerSheet();
}
setupActionDock();

function rulesForSong(song){return (S.assistantRules||[]).filter(r=>!r.removed&&(r.scope==='global'||r.scope==='song'&&r.songId===song.id||r.scope==='director'&&r.director===song.director));}
function ruleScopeLabel(r){return r.scope==='global'?'すべての制作':r.scope==='director'?(r.director+'さんの制作'):(songTitle(S.songs.find(s=>s.id===r.songId)||{})+'だけ');}
function validRule(op){return typeof op.text==='string'&&!!op.text.trim()&&op.text.length<=1200&&(['global','director','song'].includes(op.scope))&&(op.scope!=='song'||Number.isInteger(op.s)&&!!S.songs[op.s])&&(op.scope!=='director'||typeof op.director==='string'&&!!op.director.trim()&&op.director.length<=100);}
function saveAssistantRule(value,id){
 if(RO)throw new Error('閲覧専用です');
 const old=(S.assistantRules||[]).find(r=>r.id===id),text=String(value.text||'').trim();
 if(!text||text.length>1200)throw new Error('覚える内容を1〜1200文字で入力してください');
 if(!['song','director','global'].includes(value.scope))throw new Error('適用範囲を選んでください');
 if(value.scope==='song'&&!S.songs.some(s=>s.id===value.songId))throw new Error('曲を選んでください');
 if(value.scope==='director'&&!String(value.director||'').trim())throw new Error('ディレクターを入力してください');
 const rule={id:old?.id||uid(),text,scope:value.scope,songId:value.scope==='song'?value.songId:'',director:value.scope==='director'?String(value.director).trim():'',mtime:Date.now(),created:old?.created||Date.now(),removed:!!old?.removed};
 if(!S.assistantRules)S.assistantRules=[];
 if(old)S.assistantRules[S.assistantRules.indexOf(old)]=rule;else S.assistantRules.push(rule);
 mark();return rule;
}
function assistantKnowledge(){
 const all=S.assistantRules||[],active=all.filter(r=>!r.removed);
 const rows=items=>items.map(r=>'<div class="knowledge-row"><small>'+esc(ruleScopeLabel(r))+'</small><p>'+esc(r.text)+'</p><div><button class="btn sm" data-rule-edit="'+esc(r.id)+'">編集</button><button class="btn sm" data-rule-toggle="'+esc(r.id)+'">'+(r.removed?'再び使う':'使わなくする')+'</button></div></div>').join('');
 s3('アシスタント','覚えていること','<p class="hint">指摘や進め方を、ここに記録します。AIモデル自体を学習させるのではなく、次の相談時に必要な知識を渡します。</p>'+ (active.length?rows(active):'<div class="empty">まだ登録されていません。相談の中で教えるか、ここから追加できます。</div>')+(all.some(r=>r.removed)?'<details class="knowledge-archive"><summary>使わなくした内容</summary>'+rows(all.filter(r=>r.removed))+'</details>':''),[{t:'閉じる',c:'btn',f:()=>hide('sheet3')},{sp:1},{t:'追加',c:'btn pri',f:()=>editAssistantRule()}]);
 const b=document.getElementById('s3Body');
 b.querySelectorAll('[data-rule-edit]').forEach(x=>x.onclick=()=>editAssistantRule(x.dataset.ruleEdit));
 b.querySelectorAll('[data-rule-toggle]').forEach(x=>x.onclick=()=>{if(RO)return;const r=S.assistantRules.find(r=>r.id===x.dataset.ruleToggle);r.removed=!r.removed;r.mtime=Date.now();mark();assistantKnowledge()});
}
function editAssistantRule(id){
 const r=(S.assistantRules||[]).find(r=>r.id===id)||{scope:cur?'song':'global',text:'',songId:cur?.id||'',director:cur?.director||''};
 s3('覚えていること',id?'内容を編集':'次の相談に活かす',
 '<label class="new-song-field">覚える内容<textarea class="inp" id="ruleText" rows="4" maxlength="1200" placeholder="例：歌割りは録音前にディレクターへ確認する">'+esc(r.text)+'</textarea></label><label class="new-song-field">適用する範囲<select class="inp" id="ruleScope">'+[['song','この曲だけ'],['director','ディレクターの制作'],['global','すべての制作']].map(([v,t])=>'<option value="'+v+'" '+(v===r.scope?'selected':'')+'>'+t+'</option>').join('')+'</select></label><label class="new-song-field" id="ruleSongField">曲<select class="inp" id="ruleSong"><option value="">曲を選択</option>'+S.songs.map(s=>'<option value="'+esc(s.id)+'" '+(r.songId===s.id?'selected':'')+'>'+esc(songTitle(s))+'</option>').join('')+'</select></label><label class="new-song-field" id="ruleDirectorField">ディレクター<input class="inp" id="ruleDirector" value="'+esc(r.director||'')+'"></label><p id="ruleError" role="status"></p>',
 [{t:'戻る',c:'btn',f:assistantKnowledge},{sp:1},{t:'この範囲で保存',c:'btn pri',f:()=>{try{saveAssistantRule({text:document.getElementById('ruleText').value,scope:document.getElementById('ruleScope').value,songId:document.getElementById('ruleSong').value,director:document.getElementById('ruleDirector').value},id);assistantKnowledge();render()}catch(e){document.getElementById('ruleError').textContent=e.message}}}]);
 const update=()=>{const scope=document.getElementById('ruleScope').value;document.getElementById('ruleSongField').hidden=scope!=='song';document.getElementById('ruleDirectorField').hidden=scope!=='director'};
 document.getElementById('ruleScope').onchange=update;update();
}
function conversationScope(){return cur?.id||'global';}
function saveAssistantConversation(msgs,q,scope=conversationScope()){
 if(RO)return;
 const cfg=aiCfg();if(!cfg.conversations)cfg.conversations=[];
 const record={scope,q:String(q||'').slice(-1000),msgs:ShinkouCore.copy(msgs.slice(-12)),at:Date.now()};
 cfg.conversations=[record,...cfg.conversations.filter(x=>x.scope!==scope)].slice(0,20);mark();
}
async function resumeAssistantConversation(){
 const row=(aiCfg().conversations||[]).find(r=>r.scope===conversationScope());if(!row)return plannerSheet();
 const last=row.msgs.filter(m=>m.role==='assistant').at(-1);let result;try{result=JSON.parse(last?.content||'{}')}catch{result={ans:'前の相談に続けて入力できます。'}}
 // Earlier proposed operations may already be applied: never replay them on resume.
 const safeMsgs=row.msgs.map(m=>{if(m.role!=='assistant')return m;try{const value=JSON.parse(m.content);value.ops=[];return {...m,content:JSON.stringify(value)}}catch{return m}});
 safeMsgs.push({role:'user',content:'前の相談を再開します。過去の操作は再実行しないでください。次の発言で明示された新しい変更だけを提案してください。最新データ:'+JSON.stringify(aiCtx())});
 aiPreview({ops:[],ans:result.ans||'前の相談の続きです。',questions:result.questions||[]},safeMsgs,row.q,row.scope);
}
function assistantSongCard(s){
 return '<section class="assistant-status">'+songSnapshotHTML(s)+(!RO?'<button class="btn pri" id="songAssistant">状況を伝える・相談する</button>'+((aiCfg().conversations||[]).some(r=>r.scope===s.id)?'<button class="btn" id="songResume">前の相談の続き</button>':''):'')+'</section>';
}
function wireBriefLinks(root){
 root.querySelectorAll('[data-brief-song]').forEach(b=>b.onclick=()=>openSong(b.dataset.briefSong));
 root.querySelectorAll('[data-ask-song]').forEach(b=>b.onclick=()=>{cur=S.songs.find(s=>s.id===b.dataset.askSong);plannerSheet('この曲の今の状況と次の予定を整理したいです。必要なことを質問してください。')});
}
function assistantBriefHTML(list){
 const items=list.flatMap(s=>{const r=productionReport(s);return r.applicable?r.actions.slice(0,1).map(a=>({s,a,r})):[]}).sort((a,b)=>a.a.score-b.a.score).slice(0,3);
 return items.length?'<section class="assistant-brief"><h3>先に確認しておきたいこと</h3><small>記録と日程から優先順に表示</small>'+items.map(({s,a})=>'<button class="brief-row" data-brief-song="'+esc(s.id)+'"><span><b>'+esc(songTitle(s))+'</b><small>'+esc(a.title)+'</small></span><span>›</span></button>').join('')+'</section>':'';
}
function renderAssistantHome(el,list){
 const history=(aiCfg().conversations||[]).find(r=>r.scope==='global');
 document.body.classList.add('assistant-first');
 el.innerHTML=songOverview(list)+'<section class="assistant-welcome"><div><small>'+esc(new Date().toLocaleDateString('ja-JP',{month:'long',day:'numeric',weekday:'long'}))+'</small><h2>今日は、どこから進めますか。</h2></div><button class="btn sm" id="assistantMemory">覚えていること</button></section><section class="assistant-composer"><label for="assistantInput">状況や予定を、そのまま話してください。</label><textarea id="assistantInput" rows="3" placeholder="歌録りが終わりました。来月発売に向けて、次を一緒に考えたいです。"></textarea>'+aiChoiceHTML('homeAIMode')+'<div><button class="btn" id="assistantReview">不足を一緒に確認</button><button class="btn pri" id="assistantSend">相談する ↑</button></div><p id="assistantError" role="status"></p></section>'+(history?'<button class="continue-chat" id="assistantContinue">前の相談の続きから ›</button>':'')+'<div id="homeBrief">'+assistantBriefHTML(list)+'</div>';
 el.querySelector('#assistantMemory').onclick=()=>{cur=null;assistantKnowledge()};
 wireBriefLinks(el);wireSnapshotEditors(el);
 wireAIChoice('homeAIMode',el.querySelector('#assistantInput'),'global');
 const send=async()=>{const input=el.querySelector('#assistantInput'),text=input.value.trim();if(!text)return;if(RO)return;cur=null;const button=el.querySelector('#assistantSend'),error=el.querySelector('#assistantError');button.disabled=true;input.disabled=true;error.textContent='状況を整理しています…';const stopWaiting=aiWait(error);const revision=aiViewRevision;try{const r=await aiCall(text,'global',document.getElementById('homeAIMode').value);if(revision!==aiViewRevision||conversationScope()!=='global'||!input.isConnected)return;aiPreview(r.out,r.msgs,text,r.scope);error.textContent='';input.value=''}catch(e){error.textContent=e.message||String(e)}finally{stopWaiting();if(error.textContent==='状況を整理しています…')error.textContent='';button.disabled=false;input.disabled=false}};
 el.querySelector('#assistantSend').onclick=send;
 el.querySelector('#assistantReview').onclick=()=>{cur=null;plannerSheet('現在の記録をもとに、抜けている可能性のある情報や次の段取りを一緒に整理してください。不明なことは質問してください。')};
 const resume=el.querySelector('#assistantContinue');if(resume)resume.onclick=()=>{cur=null;resumeAssistantConversation()};
}


boot();
