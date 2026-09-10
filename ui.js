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
// 登録済みの記録を表示する。未入力の状況・日程は推測で補わない。
function songSnapshot(s){
  const a=songSummary(s),pending=a.L.filter((x,i)=>!hasKids(a.L,i)&&!doneOf(s,a.L,i));
  const x=pending.find(x=>whoOf(s,x).c==='me')||pending[0];
  const w=x?whoOf(s,x):null,n=x?plainStage(x.n):'',o=x?stg(s,x.k):{};
  const state=a.finished?'完了':!x?'状況未登録':n+' · '+w.t;
  const action=a.finished?'完了した作業を見返せます':!x?'今の状況と次の予定を相談':w.c==='me'?n+'の内容を確認・進行':w.c==='other'||w.c==='room'?n+'の返事・受け取り状況を確認':w.c==='wait'?n+'の予定を確認':w.c==='late'?w.t+'を確認':n+'の依頼・段取りを確認';
  const date=a.next?.date||'',left=date?D.to(date):null;
  return {state,action,memo:String(o.memo||'').split('\n')[0],date,left,dueTask:a.next?plainStage(a.next.x.n):'',finished:a.finished};
}
// 日程調整の完了を、録音・編集そのものの完了として扱わない。
function songMilestones(s){
  const L=stages(s),definitions=[
    ['アレンジ',['arr']],['VoDB',['vodb']],['VoEDIT',['rhythm','tsunagi','pitch']],
    ['ミックス',['td']],['マスタリング',['mas']]
  ];
  for(const [name,keys,schedule] of [['ChoDB',['chodb'],'cho'],['楽器DB',['instdb'],'instrec'],['追加VoDB',['revodb'],'revo']]){
    if(L.some(x=>keys.includes(x.k))&&[...keys,schedule].some(k=>{const o=s.stages?.[k]||{};return o.done||o.st||o.dl||(o.slots||[]).some(v=>v.date)}))definitions.splice(definitions.length-2,0,[name,keys]);
  }
  return definitions.map(([name,keys])=>{
    const indexes=L.map((x,i)=>keys.includes(x.k)||(name==='VoEDIT'&&x.n==='VoEDIT')?i:-1).filter(i=>i>=0);
    const complete=indexes.filter(i=>doneOf(s,L,i)).length;
    const partial=indexes.some(i=>hasKids(L,i)&&kidsOf(L,i).some(x=>s.stages?.[x.k]?.done));
    return {name,state:!indexes.length?'記録なし':complete===indexes.length?'完了':complete||partial?'一部完了':'未完了',done:indexes.length>0&&complete===indexes.length};
  });
}
function songKeyDates(s){
  const L=stages(s),active=k=>L.some(x=>x.k===k),dateText=d=>{
    if(!d)return '未登録';
    return String(d).slice(0,4)!==D.today().slice(0,4)?String(d).replace(/-0?/g,'/'):D.md(d);
  };
  const slots=active('vo')?(s.stages?.vo?.slots||[]).filter(v=>v.date):[];
  const dates=[...new Set(slots.map(v=>v.date))].sort();
  const rec=active('vodb')?(s.stages?.vodb||{}):{};
  let vo=dates.map(d=>dateText(d)+(slots.filter(v=>v.date===d).every(v=>v.done)?' 済':D.to(d)<0?' 実施確認':'' )).join('・');
  let voNote=dates.length?'':rec.done&&rec.date?'完了記録':rec.dl?'期限（録音日未登録）':'';
  if(!vo)vo=rec.done&&rec.date?dateText(rec.date):rec.dl?dateText(rec.dl):'未登録';
  const out=[{label:'発売日',value:dateText(relOf(s))},{label:'MV撮影日',value:dateText(s.dates?.mv)},{label:'VoDB日',value:vo,note:voNote}];
  if(s.use==='live')out.push({label:'ライブ初披露',value:dateText(s.dates?.live||s.dates?.open)});
  return out;
}
function songSnapshotHTML(s){
  const a=songSnapshot(s),due=a.date?D.md(a.date):a.finished?'完了':'未設定';
  const urgency=a.left===null?'':a.left<0?(-a.left)+'日超過':a.left===0?'今日まで':a.left===1?'明日まで':'あと'+a.left+'日';
  const milestones='<div class="song-milestones" aria-label="主要作業の登録状況">'+songMilestones(s).map(m=>'<span class="milestone '+(m.done?'complete':'')+'"><b>'+esc(m.name)+'</b><small>'+(m.done?'✓ ':'')+esc(m.state)+'</small></span>').join('')+'</div>';
  const dates='<dl class="song-key-dates">'+songKeyDates(s).map(d=>'<div><dt>'+esc(d.label)+'</dt><dd>'+esc(d.value)+(d.note?'<small>'+esc(d.note)+'</small>':'')+'</dd></div>').join('')+'</dl>';
  return '<div class="song-snapshot">'+dates+milestones+'<div class="snapshot-status"><small>現在の状態</small><strong>'+esc(a.state)+'</strong></div><div class="snapshot-action"><small>次に確認すること</small><span>'+esc(a.action)+'</span></div><div class="snapshot-deadline '+(a.left!==null&&a.left<=0?'overdue':!a.date?'unscheduled':'')+'"><small>次の締切</small><strong>'+esc(due)+'</strong><span>'+esc([a.dueTask,urgency].filter(Boolean).join(' · '))+'</span></div>'+(a.memo?'<p class="snapshot-memo">'+esc(a.memo)+'</p>':'')+'</div>';
}
function songOverview(list){
  const sorted=list.slice().sort((a,b)=>{const x=songSnapshot(a),y=songSnapshot(b);return Number(x.finished)-Number(y.finished)||(x.date||'9999').localeCompare(y.date||'9999')});
  return '<section class="song-overview"><div class="overview-heading"><h2>楽曲の状況</h2><span>'+list.length+'曲</span></div><p class="hint">登録済みの作業・日程から表示しています。締切が近い順です。</p><div class="snapshot-list">'+(sorted.map(s=>'<button class="snapshot-card" data-brief-song="'+esc(s.id)+'"><span class="snapshot-title"><b>'+esc(songTitle(s))+'</b><small>'+esc(s.artist||'')+'</small></span>'+songSnapshotHTML(s)+'</button>').join('')||'<p class="empty">表示する楽曲がありません。検索・絞り込み条件も確認してください。</p>')+'</div></section>';
}
function deskPreviewURL(){
  const u=new URL(location.href);u.searchParams.set('mode','desk');u.hash='';return u.href;
}
function renderWorkspace(){
  document.body.classList.toggle('desk-mode',V.mode==='desk');
  document.body.classList.toggle('assistant-first',V.mode!=='desk'&&V.use!=='cal');
  document.getElementById('workspaceDate').textContent=new Date().toLocaleDateString('ja-JP',{month:'long',day:'numeric',weekday:'long'});
  document.getElementById('workspaceTitle').textContent=V.use==='cal'?'予定':V.mode==='desk'?'制作状況':'アシスタント';
  const label=document.getElementById('filterLabel');if(label)label.textContent='絞り込み'+(V.dir!=='__all'?' · '+V.dir:'')+(V.who!=='all'?' · 状態指定':'')+(V.fin==='show'?' · 完了含む':'')+(V.use!=='master'?' · '+({live:'ライブ',cal:'予定',all:'すべて'}[V.use]||V.use):'');
  document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',(V.mode||'work')===b.dataset.mode));
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
  el.querySelectorAll('[data-brief-song]').forEach(b=>b.onclick=()=>openSong(b.dataset.briefSong));
}
function songTabs(){return '<nav class="song-tabs" aria-label="曲の詳細">'+[['summary','状況'],['credits','クレジット'],['notes','メモ・履歴']].filter(([key])=>V.mode!=='desk'||key!=='flow').map(([key,label])=>'<button data-song-tab="'+key+'" aria-pressed="'+(songTab===key)+'">'+label+'</button>').join('')+'</nav>'}
function wireSongTabs(){document.querySelectorAll('[data-song-tab]').forEach(b=>b.onclick=()=>{songTab=b.dataset.songTab;drawSong()})}
function currentCard(s){
  const a=songSummary(s),x=a.x,o=x?stg(s,x.k):{},assigned=x?(o.asg||nameFor(s,x.role)||s.director||'未設定'):s.director||'未設定';
  return '<section class="current-card"><div class="current-eyebrow">'+(a.finished?'制作状況':'次の作業候補')+'</div><div class="current-line"><h2>'+esc(a.title)+'</h2>'+(!a.finished&&x?'<span class="state-tag '+a.ball.c+'">'+esc(a.ball.t)+'</span>':'')+'</div><div class="current-meta"><span>締切 <b>'+esc(a.state.dl?D.md(a.state.dl):'未設定')+'</b></span><span>担当 <b>'+esc(assigned)+'</b></span>'+(a.state.left!==null&&a.state.left<=0?'<span class="overdue">'+(a.state.left<0?(-a.state.left)+'日超過':'今日')+'</span>':'')+'</div>'+(o.memo?'<p class="current-note">'+esc(o.memo.split('\n')[0])+'</p>':'')+(!RO&&V.mode!=='desk'&&x?'<div class="current-actions"><button class="btn pri" id="currentDone">完了にする</button><button class="btn" id="currentEdit">日程・担当を編集</button></div>':'')+'</section>';
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
    h+=assistantSongCard(s);
    if(a.next&&a.next.x.k!==a.x?.k)h+='<div class="next-inline"><span>近い期限 · '+esc(plainStage(a.next.x.n))+'</span><b>'+esc(D.md(a.next.date))+'</b></div>';
    const dates=[['release','発売'],['open','公演初日'],['rehearsal','リハーサル'],['mastering','マスタリング'],['deliver','音源提出']].filter(([k])=>s.dates[k]);
    if(dates.length)h+='<section class="detail-panel"><h3>主要日程</h3><dl class="summary-dates">'+dates.map(([k,l])=>'<div><dt>'+l+'</dt><dd>'+esc(D.md(s.dates[k]))+'</dd></div>').join('')+'</dl></section>';
    if(s.note)h+='<section class="detail-panel"><h3>申し送り</h3><p class="preserve">'+esc(s.note)+'</p></section>';
    if(V.mode!=='desk'&&!RO)h+='<div class="summary-options"><button class="btn" id="editSongInfo">基本情報を編集</button><button class="btn" id="legacyRecords">作業記録を確認</button></div>';
  }else if(songTab==='credits'){
    h+='<div class="detail-panel"><h3>制作クレジット</h3><div id="crW">'+crRows(s,'work')+'</div><button class="btn sm" data-add="work">＋ 人を追加</button></div><div class="detail-panel"><h3>ミュージシャンクレジット</h3><div id="crM">'+crRows(s,'mus')+'</div><button class="btn sm" data-add="mus">＋ 人を追加</button></div>';
  }else{
    h+='<section class="detail-panel"><h3>曲のメモ・申し送り</h3><textarea class="inp" data-f="note" rows="5" placeholder="申し送りを入力">'+esc(s.note||'')+'</textarea></section><section class="detail-panel"><h3>最近の更新</h3>'+(S.log.filter(z=>z.t.includes(songTitle(s))).slice(0,15).map(z=>'<div class="history-row"><small>'+esc(new Date(z.at).toLocaleDateString('ja-JP'))+'</small><span>'+esc(z.t)+'</span></div>').join('')||'<p class="muted">記録はありません</p>')+'</section>';
  }
  b.innerHTML=h;b.classList.add('summary-body');wireSongTabs();wireCurrent();
  b.querySelectorAll('[data-phase]').forEach(button=>button.onclick=()=>{songTab='flow';gpOpen={};a.L.forEach(x=>gpOpen[x.gp]=false);gpOpen[button.dataset.phase]=true;flowDone=true;V.flowDone=true;viewSave();drawSong()});
  const plan=document.getElementById('summaryPlan');if(plan)plan.onclick=()=>plannerSheet();
  const assistant=document.getElementById('songAssistant');if(assistant)assistant.onclick=()=>plannerSheet();
  const resume=document.getElementById('songResume');if(resume)resume.onclick=()=>resumeAssistantConversation();
  const legacy=document.getElementById('legacyRecords');if(legacy)legacy.onclick=()=>{songTab='flow';drawSong()};
  if(songTab!=='summary')wireSong();
  const edit=document.getElementById('editSongInfo');if(edit)edit.onclick=()=>{secLoad()['基本情報']=true;secLoad()['基準日']=true;songTab='flow';drawSong();[...b.querySelectorAll('.sec')].find(x=>x.textContent.includes('基本情報'))?.scrollIntoView({block:'start'})};
  if(V.mode==='desk'||RO){b.querySelectorAll('input,textarea,select').forEach(e=>e.disabled=true);b.querySelectorAll('.detail-panel button').forEach(e=>e.disabled=true)}
  document.getElementById('shDel').style.display=V.mode==='desk'||RO?'none':'';
}
function directorSongDraft(director,templateId,title){
  const s=newSong({director:director.trim(),templateId,title:(title||'').trim()});
  applyDirectorPreset(s);
  return s;
}
function newDirectorSong(){
  const names=[...new Set([...(S.masters.director||[]),...S.songs.map(s=>s.director),...S.templates.filter(t=>t.directorPreset).map(t=>t.director)].filter(Boolean))];
  const initial=V.dir&&V.dir!=='__all'?V.dir:(names.length===1?names[0]:'');
  const base=V.use==='live'?'tpl_show':'tpl_single';
  const h='<div class="new-song-intro">ディレクターの標準工程で始めます。</div><label class="new-song-field">ディレクター<input id="newDirector" class="inp" list="newDirectorNames" placeholder="選択、または名前を入力" value="'+esc(initial)+'"><datalist id="newDirectorNames">'+names.map(n=>'<option value="'+esc(n)+'">').join('')+'</datalist></label><label class="new-song-field">曲名・項目名<input class="inp" id="newSongTitle" placeholder="あとで入力もできます"></label><label class="new-song-field">制作の種類<select class="inp" id="newSongBase">'+S.templates.filter(t=>!t.directorPreset).map(t=>'<option value="'+esc(t.id)+'" '+(t.id===base?'selected':'')+'>'+esc(t.name)+'</option>').join('')+'</select></label><div id="newSongPreview" class="new-song-preview"></div>';
  s3('新しい曲','ディレクターから作成',h,[{t:'キャンセル',c:'btn',f:()=>hide('sheet3')},{sp:1},{t:'作成',c:'btn pri',f:()=>{
    const d=document.getElementById('newDirector').value.trim();if(!d)return toast('ディレクターを選んでください');
    const song=directorSongDraft(d,document.getElementById('newSongBase').value,document.getElementById('newSongTitle').value);
    if(song.use==='live'){const p=openShow();if(p&&p.director===d){song.projectId=p.id;song.artist=p.artist||''}}
    applySort(song);applySolo(song);S.songs.unshift(song);if(!S.masters.director.includes(d))S.masters.director.push(d);
    V.dir=d;V.use=song.use;mark();hide('sheet3');render();openSong(song.id);
  }}]);
  const preview=()=>{
    const d=document.getElementById('newDirector').value.trim(),id=document.getElementById('newSongBase').value;
    const t=S.templates.find(t=>t.directorPreset&&t.director===d&&t.sourceTemplateId===id);
    const draft=directorSongDraft(d,id,'');
    document.getElementById('newSongPreview').innerHTML='<b>'+esc(t?d+'さんの標準工程':'基本工程から作成')+'</b><p>'+stages(draft).length+'工程'+(t?' · 保存済みの構成を使用します。':' · 標準はまだ登録されていません。')+'</p><small>曲の「工程設定」で一度整え、「担当者の標準に保存」すると、次から自動で使えます。日程や完了状態は引き継ぎません。</small>';
  };
  document.getElementById('newDirector').oninput=preview;document.getElementById('newSongBase').onchange=preview;preview();
}

function stageSettings(){
  const s=cur;
  const draw=()=>{
    const L=s.stageList||[],active=new Set(stages(s).map(x=>x.k));
    const presets=S.templates.filter(t=>t.directorPreset&&t.director===s.director&&t.sourceTemplateId===(s.use==='live'?'tpl_show':s.templateId));
    const h='<div class="stage-setting-head"><b>'+active.size+' / '+L.length+'工程を使用</b><button class="btn sm" id="saveDirectorPreset">担当者の標準に保存</button></div>'+(presets.length?'<div class="preset-row"><select class="inp" id="directorPresetPick"><option value="">担当者の標準設定を選択</option>'+presets.map(t=>'<option value="'+esc(t.id)+'">'+esc(t.name)+'</option>').join('')+'</select><button class="btn" id="useDirectorPreset">適用</button></div>':'')+'<div class="stage-settings">'+L.map((x,i)=>'<div class="stage-setting '+(x.d===1?'child':'')+'"><label><input type="checkbox" data-include="'+esc(x.k)+'" '+(active.has(x.k)?'checked':'')+'><span>'+esc(x.n)+'<small>'+esc(x.gp||'その他')+(!active.has(x.k)?' · 対象外':'')+'</small></span></label>'+(x.d!==1?'<button class="iconbtn" data-move="'+i+'|-1" aria-label="'+esc(x.n)+'を上に移動">↑</button><button class="iconbtn" data-move="'+i+'|1" aria-label="'+esc(x.n)+'を下に移動">↓</button>':'')+'</div>').join('')+'</div>';
    s3('工程設定',songTitle(s),h,[{sp:1},{t:'完了',c:'btn pri',f:()=>{hide('sheet3');head();drawSong();render()}}]);
    const b=document.getElementById('s3Body');
    b.querySelectorAll('[data-include]').forEach(e=>e.onchange=async()=>{
      const i=L.findIndex(x=>x.k===e.dataset.include),x=L[i];
      if(!e.checked&&!await ask('「'+x.n+'」'+(x.d!==1?'と配下の工程':'')+'を対象外にします。必要な作業ではないことをご確認ください。記録は残り、あとで戻せます。','対象外にする')){e.checked=true;return}
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
    b.querySelector('#saveDirectorPreset').onclick=async()=>{
      if(!s.director)return toast('基本情報で担当ディレクターを設定してください');
      const base=s.templateId,old=S.templates.find(t=>t.directorPreset&&t.director===s.director&&t.sourceTemplateId===base);
      if(!await ask(s.director+'さんの標準として保存します。対象外の工程も引き継がれます。必要な工程がすべて選ばれているかご確認ください。既存の曲は変更しません。','標準に保存'))return;
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

let homeFocus='all';
function homeSignal(s){
 const a=songSummary(s),date=a.next?.date||'',left=date?D.to(date):null;
 const waiting=a.L.some((x,i)=>!hasKids(a.L,i)&&!doneOf(s,a.L,i)&&['other','room'].includes(whoOf(s,x).c));
 return {a,date,left,soon:!a.finished&&left!==null&&left<=7,waiting:!a.finished&&waiting};
}
function renderFocusedHome(el,list){
 const selected=list.filter(s=>{const a=homeSignal(s);return homeFocus==='all'||(homeFocus==='soon'?a.soon:a.waiting)});
 const sorted=selected.slice().sort((a,b)=>{const x=homeSignal(a),y=homeSignal(b);return Number(x.a.finished)-Number(y.a.finished)||(x.date||'9999').localeCompare(y.date||'9999')||byOrd(a,b)});
 el.innerHTML='<div class="home-focus" role="group" aria-label="確認する楽曲">'+[['all','すべて',list.length],['soon','7日以内・超過',list.filter(s=>homeSignal(s).soon).length],['waiting','相手待ち',list.filter(s=>homeSignal(s).waiting).length]].map(([key,title,n])=>'<button data-home-focus="'+key+'" aria-pressed="'+(homeFocus===key)+'">'+title+' <span>'+n+'</span></button>').join('')+'</div><div class="home-list">'+(sorted.map(s=>compactSongCard(s)).join('')||'<div class="empty"><h3>該当する曲はありません</h3><p>「すべて」から他の曲を確認できます。</p></div>')+'</div>';
 el.querySelectorAll('[data-home-focus]').forEach(b=>b.onclick=()=>{homeFocus=b.dataset.homeFocus;render()});
 el.querySelectorAll('[data-song]').forEach(b=>b.onclick=()=>openSong(b.dataset.song));
}
function compactSongCard(s){
 const {a,date,left}=homeSignal(s),context=[s.artist,projTitle(projOf(s.projectId))].filter(Boolean).join(' · ');
 const due=a.finished?'完了':left!==null&&left<0?(-left)+'日超過':left===0?'今日':date?D.md(date):'日程未設定';
 const task=a.next?plainStage(a.next.x.n):a.title,ball=a.next?whoOf(s,a.next.x):a.ball;
 return '<button class="song-card '+(left!==null&&left<0?'late':'')+'" data-song="'+esc(s.id)+'"><span class="song-card-context">'+esc(context)+'</span><span class="song-card-title"><b>'+esc(songTitle(s))+'</b><span class="song-card-due">'+esc(due)+'</span></span><span class="song-card-status"><span>'+esc(a.finished?'全工程完了':task)+'</span><span>'+esc(a.finished?'':ball.t)+'</span></span></button>';
}
function setupSimpleHome(){
 const top=document.querySelector('.top'),tools=document.querySelector('.tools');if(!top||!tools)return;
 const filters=document.createElement('details');filters.id='homeFilters';filters.innerHTML='<summary><span id="filterLabel">絞り込み</span><span aria-hidden="true">⌄</span></summary><div class="filter-content"></div>';
 const box=filters.querySelector('.filter-content');
 ['workspaceMode','dirbar','useBar','grpSel','whoSel','finSel'].forEach(id=>{const el=document.getElementById(id);if(el)box.append(el)});
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
 '<p class="planner-lead">決まっていることも、迷っていることも、そのままお話しください。</p><div class="planner-prompts"><button class="btn" data-prompt="今の制作状況を整理して、確認が必要な情報や不足していそうな工程を質問してください。">不足を確認</button><button class="btn" data-prompt="今後の予定を一緒に考えてください。納期から無理のない日程を組むために、まず必要なことを質問してください。">予定を相談</button></div><textarea id="plannerText" class="inp" rows="6" placeholder="例：来月発売で、歌録りは来週の予定です。何から決めればいいですか？"></textarea><p class="hint">登録中の制作情報を、設定済みのAIに送って相談します。変更は提案を確認してから反映します。</p><p id="plannerError" role="status"></p>',
 [{t:'閉じる',c:'btn',f:()=>hide('sheet3')},{sp:1},{t:'相談する',c:'btn pri',f:async()=>{
   const text=document.getElementById('plannerText').value.trim();if(!text)return;
   const error=document.getElementById('plannerError'),button=document.querySelector('#s3Foot .pri');button.disabled=true;error.textContent='状況を整理しています…';const stopWaiting=aiWait(error);
   const revision=aiViewRevision;
   try{const r=await aiCall(text,scope);if(revision!==aiViewRevision||scope!==conversationScope()||!error.isConnected)return;aiPreview(r.out,r.msgs,text,r.scope)}catch(e){if(revision!==aiViewRevision||!error.isConnected)return;error.textContent=e.message||String(e);button.disabled=false}finally{stopWaiting()}
 }}]);
 document.getElementById('plannerText').value=initial;
 document.querySelectorAll('[data-prompt]').forEach(b=>b.onclick=()=>{document.getElementById('plannerText').value=b.dataset.prompt;document.getElementById('plannerText').focus()});
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
function assistantBrief(list){
 const tasks=list.flatMap(s=>{const L=stages(s);return L.filter((x,i)=>!hasKids(L,i)&&!doneOf(s,L,i)).map(x=>({song:s,x,date:dlOf(s,x)})).filter(t=>t.date)}).sort((a,b)=>a.date.localeCompare(b.date));
 return {near:tasks.filter(t=>D.to(t.date)<=7).slice(0,3),missing:list.filter(s=>!isFin(s)&&!homeSignal(s).date).slice(0,2)};
}
function renderAssistantHome(el,list){
 const brief=assistantBrief(list),history=(aiCfg().conversations||[]).find(r=>r.scope==='global');
 document.body.classList.add('assistant-first');
 el.innerHTML='<section class="assistant-welcome"><div><small>'+esc(new Date().toLocaleDateString('ja-JP',{month:'long',day:'numeric',weekday:'long'}))+'</small><h2>今日は、どこから進めますか。</h2></div><button class="btn sm" id="assistantMemory">覚えていること</button></section><section class="assistant-composer"><label for="assistantInput">状況や予定を、そのまま話してください。</label><textarea id="assistantInput" rows="3" placeholder="歌録りが終わりました。来月発売に向けて、次を一緒に考えたいです。"></textarea><div><button class="btn" id="assistantReview">不足を一緒に確認</button><button class="btn pri" id="assistantSend">相談する ↑</button></div><p id="assistantError" role="status"></p></section>'+(history?'<button class="continue-chat" id="assistantContinue">前の相談の続きから ›</button>':'')+'<section class="assistant-brief"><h3>近い予定・期限</h3><small>登録されている日程から表示</small>'+(brief.near.length?brief.near.map(t=>'<button class="brief-row" data-brief-song="'+esc(t.song.id)+'"><span><b>'+esc(songTitle(t.song))+'</b><small>'+esc(plainStage(t.x.n))+'</small></span><strong class="'+(D.to(t.date)<0?'overdue':'')+'">'+esc(D.to(t.date)<0?(-D.to(t.date))+'日超過':D.to(t.date)===0?'今日':D.md(t.date))+'</strong></button>').join(''):'<p class="muted">7日以内の予定は登録されていません。</p>')+'</section>'+(brief.missing.length?'<section class="assistant-brief"><h3>一緒に確認したいこと</h3>'+brief.missing.map(s=>'<button class="brief-row" data-ask-song="'+esc(s.id)+'"><span><b>'+esc(songTitle(s))+'</b><small>次の予定が未登録です。今の状況を整理しますか？</small></span><span>›</span></button>').join('')+'</section>':'')+'<details class="assistant-library"><summary>楽曲を探す <span>'+list.length+'曲</span></summary><div class="home-list">'+(list.map(s=>'<button class="brief-row" data-brief-song="'+esc(s.id)+'"><span><b>'+esc(songTitle(s))+'</b><small>'+esc([s.artist,s.director].filter(Boolean).join(' · '))+'</small></span><span>›</span></button>').join('')||'<p>まだ楽曲がありません。相談欄から新しい制作を始められます。</p>')+'</div></details>';
 el.querySelector('.assistant-library')?.remove();
 el.insertAdjacentHTML('afterbegin',songOverview(list));
 el.querySelector('#assistantMemory').onclick=()=>{cur=null;assistantKnowledge()};
 el.querySelectorAll('[data-brief-song]').forEach(b=>b.onclick=()=>openSong(b.dataset.briefSong));
 el.querySelectorAll('[data-ask-song]').forEach(b=>b.onclick=()=>{cur=S.songs.find(s=>s.id===b.dataset.askSong);plannerSheet('この曲の今の状況と次の予定を整理したいです。必要なことを質問してください。')});
 const send=async()=>{const input=el.querySelector('#assistantInput'),text=input.value.trim();if(!text)return;if(RO)return;cur=null;const button=el.querySelector('#assistantSend'),error=el.querySelector('#assistantError');button.disabled=true;input.disabled=true;error.textContent='状況を整理しています…';const stopWaiting=aiWait(error);const revision=aiViewRevision;try{const r=await aiCall(text,'global');if(revision!==aiViewRevision||conversationScope()!=='global'||!input.isConnected)return;aiPreview(r.out,r.msgs,text,r.scope);error.textContent='';input.value=''}catch(e){error.textContent=e.message||String(e)}finally{stopWaiting();if(error.textContent==='状況を整理しています…')error.textContent='';button.disabled=false;input.disabled=false}};
 el.querySelector('#assistantSend').onclick=send;
 el.querySelector('#assistantReview').onclick=()=>{cur=null;plannerSheet('現在の記録をもとに、抜けている可能性のある情報や次の段取りを一緒に整理してください。不明なことは質問してください。')};
 const resume=el.querySelector('#assistantContinue');if(resume)resume.onclick=()=>{cur=null;resumeAssistantConversation()};
}


boot();
