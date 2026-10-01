/* 曲ごとの進み具合、対応待ち、次の一手。AIを呼ばず記録から表示する。 */
function productionReport(s){return ShinkouProduction.report(s,{today:D.today(),release:relOf(s)})}
function productionDate(d){return d?.value?(d.value.slice(0,4)===D.today().slice(0,4)?D.md(d.value):d.value.replace(/-/g,'/')):d?.kind==='completed'?'日付未登録':'未定'}
function productionDateKind(d){return d?.kind==='completed'?'完了':d?.value?({confirmed:'確定',tentative:'仮',target:'目安',registered:'登録日'}[d.kind]||'登録日'):''}
function productionButton(s,kind,key,cls,html){return '<button type="button" class="production-button '+cls+'" data-production-song="'+esc(s.id)+'" data-production-kind="'+kind+'" data-production-key="'+esc(key||'')+'">'+html+'</button>'}
function productionStateSummary(s){
 const r=productionReport(s),contacts=(s.workflow?.communications||[]).filter(c=>c.state!=='done');
 const current=r.nodes.find(n=>!n.done&&['doing','review','received','requested','revision','waiting'].includes(n.state));
 const state=r.archive?'完了':r.progress?.state|| (current?current.label+' · '+(ShinkouProduction.STATES[current.state]||'未確認'):'状態未確認');
 const waiting=[...contacts.map(c=>(c.state==='waiting'?(c.person||'相手')+'の返答待ち':c.state==='reply'?'自分の返信待ち':'内容確認待ち')+'：'+(c.subject||c.person||'連絡')),...r.balls.map(productionBallText)];
 const dates=Object.entries(r.dates||{}).filter(([k,d])=>d?.value).map(([k,d])=>({label:({release:'発売',vocal:'歌録り',mv:'MV',master:'マスタリング',live:'ライブ',open:'公演',rehearsal:'リハーサル',deliver:'提出',selection:'選曲',teacher:'先生確認',lyricCheck:'歌詞確認',credits:'クレジット確認'}[k]||k),...d}));
 const due=r.nodes.filter(n=>!n.done&&!n.excluded&&n.due?.value).sort((a,b)=>a.due.value.localeCompare(b.due.value))[0];
 const materials=(s.workflow?.materials||[]).filter(f=>!f.removed&&!f.deleted),unverified=materials.filter(f=>!f.approved||(f.rev&&f.approvedRev!==f.rev));
 const admin=r.nodes.filter(n=>['invoice','credits','lyricCheck'].includes(n.id)&&!n.done&&!n.excluded);
 return {r,state,waiting:[...new Set(waiting)],dates,due,materials,checks:[...unverified.map(f=>(f.name||'資料')+'（版・内容未確認）'),...admin.map(n=>n.label+'（'+(ShinkouProduction.STATES[n.state]||'未確認')+'）')]};
}
function productionEvidenceHTML(s,summary,collection='songs'){
 const url=v=>{try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password?u.href:''}catch{return ''}};
 const rows=summary.materials.map(f=>{const link=url(f.url),approved=f.approved&&(!f.rev||f.approvedRev===f.rev);return '<li>'+(link?'<a href="'+esc(link)+'" target="_blank" rel="noopener noreferrer">'+esc(f.name||'資料')+'</a>':esc(f.name||'資料'))+'<small>'+esc([f.rev?'版 '+f.rev:'版未登録',approved?'確認済み':'最新版未確認',f.source||'',f.approvedAt?'確認 '+new Date(f.approvedAt).toLocaleString('ja-JP'):'確認日時未登録'].filter(Boolean).join(' · '))+'</small></li>'});
 const contacts=(s.workflow?.communications||[]).filter(c=>c.url||c.memo).slice(-3).map(c=>{const link=url(c.url);return '<li>'+(link?'<a href="'+esc(link)+'" target="_blank" rel="noopener noreferrer">'+esc(c.subject||'元の連絡')+'</a>':esc(c.subject||'連絡記録'))+'<small>'+esc(c.updatedAt?'記録更新 '+new Date(c.updatedAt).toLocaleString('ja-JP'):'確認日時未登録')+'</small></li>'});
 const records=(S.log||[]).filter(z=>z.detail?.evidence&&z.detail.collection===collection&&z.detail.id===s.id).slice(0,3).map(z=>{const e=z.detail.evidence;return '<li>'+esc(e.fact||z.t)+'<small>'+esc([e.source||'出典未登録',e.observedAt?'確認 '+e.observedAt:'確認日時未登録'].join(' · '))+'</small></li>'});
 const note=s.note?'<p class="state-note">記録メモ：'+esc(s.note)+'</p>':'';
 return (rows.length||contacts.length||records.length?'<ul class="state-evidence">'+rows.concat(contacts,records).join('')+'</ul>':'<p class="muted">資料・根拠・確認日時は未登録です。</p>')+note;
}
function productionNearDates(x){
 const end=D.addD(D.today(),30),all=[...x.dates,...x.r.nodes.filter(n=>!n.done&&!n.excluded&&n.due?.value).map(n=>({label:n.label,...n.due}))];
 return all.filter(d=>d.kind==='confirmed'&&d.value>=D.today()&&d.value<=end).sort((a,b)=>a.value.localeCompare(b.value)).filter((d,i,all)=>all.findIndex(v=>v.value===d.value&&v.label===d.label)===i).slice(0,2);
}
function productionCompactItem(s,index){
 const x=productionStateSummary(s),r=x.r,next=r.actions[0],dates=productionNearDates(x),schedules=(r.progress?.schedules||[]).map(z=>z.label+' '+z.dates.map(d=>productionDate({value:d})).join('・')+(z.tentative?'（仮）':'（登録）')).join(' / ');
 const meta=r.archive?[]:[...x.waiting.slice(0,1),...dates.map(d=>d.label+' '+productionDate(d)+' 確定'),schedules].filter(Boolean);
 const badge=r.archive?'<span class="viewer-status complete"><span aria-hidden="true">✓</span> 完了</span>':r.audioComplete?'<span class="viewer-status audio">音源完了</span>':'';
 return '<button class="polished-row'+(r.archive?' recorded-complete':'')+'" data-brief-song="'+esc(s.id)+'"><span class="polished-number">'+(index?String(index).padStart(2,'0'):'•')+'</span><span class="polished-row-main"><span class="viewer-row-title"><strong>'+esc(songTitle(s))+'</strong>'+badge+'</span>'+(!r.archive?'<span class="polished-state">'+esc(x.state)+'</span>':'')+(!r.archive&&next?'<span class="polished-next"><span>次</span>'+esc(next.title)+'</span>':!r.archive&&r.progress?.detail?'<span class="polished-next">'+esc(r.progress.detail)+'</span>':'')+(meta.length?'<span class="polished-meta">'+esc(meta.join(' · '))+'</span>':'')+'</span><span class="polished-arrow" aria-hidden="true">›</span></button>';
}

function productionSnapshot(s){
 const x=productionStateSummary(s),r=x.r,b=(kind,key,cls,html)=>productionButton(s,kind,key,cls,html),next=r.actions[0],near=productionNearDates(x);
 const schedules=(r.progress?.schedules||[]).map(z=>'<span>'+esc(z.label+' '+z.dates.map(d=>productionDate({value:d})).join('・')+' · '+(z.tentative?'仮':'登録日'))+'</span>').join('');
 const dates=schedules+x.dates.map(d=>'<span>'+esc(d.label+' '+productionDate(d)+' · '+productionDateKind(d))+'</span>').join('');
 const overview='<div class="polished-focus'+(r.archive?' viewer-complete-focus':'')+'">'+(r.archive?'<span class="viewer-status complete"><span aria-hidden="true">✓</span> 完了</span><p class="viewer-complete-note">登録された工程・対応が完了しています。</p>':'<p class="polished-focus-state">'+esc(x.state)+'</p>')+(!r.archive&&r.progress?.detail?'<p class="polished-focus-detail">'+esc(r.progress.detail)+'</p>':'')+(!r.archive&&next?'<div class="polished-action"><small>次の作業</small><strong>'+esc(next.title)+'</strong></div>':'')+(x.waiting.length?'<p class="polished-waiting">対応：'+esc(x.waiting.join(' / '))+'</p>':'')+(near.length?'<div class="polished-date-chips">'+near.map(d=>'<span>'+esc(d.label)+' <b>'+esc(productionDate(d))+'</b> 確定</span>').join(''):'')+'</div>';
 const info='<details class="polished-info" data-state-fold="info:'+esc(s.id)+'"><summary><span>日程・資料・確認事項</span><small>'+(x.checks.length?x.checks.length+'件の確認項目':'記録を見る')+'</small></summary><section><h4>日程</h4><div class="state-dates">'+(dates||'<span>日程未登録</span>')+(x.due?'<span>登録期日：'+esc(x.due.label+' '+productionDate(x.due.due)+' · '+productionDateKind(x.due.due))+'</span>':'')+'</div></section><section><h4>素材・請求書・クレジット</h4><p>'+esc(x.checks.join(' / ')||'不足の記録はありません。必要素材の確認状況は資料記録をご確認ください。')+'</p></section><section class="state-evidence-section"><h4>資料・根拠・確認日時</h4>'+productionFolderLink(s)+productionEvidenceHTML(s,x)+'</section>'+(!r.archive&&!x.waiting.length?'<p class="polished-unconfirmed">対応待ちの記録はありません。現在の状況は未確認です。</p>':'')+'</details>';
 const details='<details class="state-detail" data-state-fold="song:'+esc(s.id)+'"><summary>工程の記録</summary><div class="production-progress">'+r.groups.filter(g=>g.id!=='delivery').map(g=>b('group',g.id,'production-phase '+(g.done?'complete':''),'<span class="phase-mark">'+(g.done?'✓':'')+'</span><span><b>'+esc(g.label)+'</b><small>'+esc(g.text)+'</small></span>')).join('')+'</div>'+(!(RO||VIEW_ONLY)?'<div class="production-footer">'+b('all','','production-more','作業・提出を訂正')+b('dates','','production-more','日程を訂正')+b('workflow','','production-more','連絡・資料を記録')+'</div>':'')+'</details>';
 return overview+info+details;
}

function productionIsLive(s){return s.use==='live'||s.templateId==='tpl_show'||isShow(projOf(s.projectId))}

function productionReleaseGroups(list,matched=pool({includeCompleted:true})){
 const visible=new Set(list.filter(s=>!productionIsLive(s)).map(s=>s.projectId||'unassigned:'+s.artist));
 const groups=new Map();
 for(const s of matched.filter(s=>!productionIsLive(s))){
  const p=projOf(s.projectId),id=p&&!isShow(p)?p.id:'unassigned:'+s.artist;
  if(!visible.has(id))continue;
  if(!groups.has(id))groups.set(id,{id,p:p&&!isShow(p)?p:null,artist:s.artist,items:[]});
  groups.get(id).items.push({s,r:productionReport(s)});
 }
 return [...groups.values()].map(g=>{
  g.items.sort((a,b)=>{const pos=s=>{const i=g.p?.tracklist?.findIndex(t=>t.title===s.title);return i>=0?i:(s.ord||0)};return pos(a.s)-pos(b.s)});
  g.done=g.items.filter(x=>x.r.audioComplete).length;
  g.deadline=g.items.flatMap(({s,r})=>r.nodes.filter(n=>!n.done&&!n.excluded&&n.due.value).map(n=>({s,n}))).sort((a,b)=>a.n.due.value.localeCompare(b.n.due.value))[0];
  return g;
 }).sort((a,b)=>(a.p?.release||'9999').localeCompare(b.p?.release||'9999'));
}
function productionUpcomingVocal(s,r,today=D.today()){
 if(r.audioComplete||r.archive)return null;
 return r.progress?.schedules.find(x=>['vocal','revocal'].includes(x.kind))||null;
}
function productionReleaseContents(list){
 return productionReleaseGroups(list).map(g=>{
  const name=g.p?.custom||((g.p?.num?g.p.num+'枚目 ': '')+(g.p?.kind||'案件未設定'));
  const entries=(g.p?.tracklist||[]).map((t,i)=>({t,index:i+1,item:g.items.find(x=>x.s.id===t.songId||x.s.title===t.title)})).filter(e=>e.item||!(V.q||V.who!=='all'||V.dir!=='__all'));
  for(const item of g.items)if(!entries.some(e=>e.item===item))entries.push({t:{title:item.s.title},index:entries.length+1,item});
  const row=({t,index,item})=>item?productionCompactItem(item.s,index):'<div class="polished-row unregistered"><span class="polished-number">'+String(index).padStart(2,'0')+'</span><span class="polished-row-main"><strong>'+esc(t.title)+'</strong><span class="polished-state">制作状況未登録</span></span></div>';
  const completed=entries.filter(e=>e.item?.r.archive),active=entries.filter(e=>!e.item?.r.archive&&V.fin!=='done');
  const rows=active.map(row).join('')+(completed.length&&(V.fin!=='hide'||V.q)?'<details '+(V.q||V.fin==='done'?'open ':'')+'class="polished-completed" data-state-fold="completed:'+esc(g.id)+'"><summary>✓ 完了 '+completed.length+'曲 <span>開く</span></summary>'+completed.map(row).join('')+'</details>':'');
  const tasks=g.p?'<details class="release-common" data-state-fold="project:'+esc(g.p.id)+'"><summary>作品の共通作業 <span>'+ShinkouProduction.RELEASE_TASKS.filter(t=>['done','na'].includes(ShinkouProduction.releaseTask(g.p,t.id,S.songs).state)).length+'/'+ShinkouProduction.RELEASE_TASKS.length+'</span></summary>'+ShinkouProduction.RELEASE_TASKS.map(t=>{
   const v=ShinkouProduction.releaseTask(g.p,t.id,S.songs);
   return '<div class="release-common-task"><span>'+ (['done','na'].includes(v.state)?'✓':'○')+' '+esc(t.label)+'</span><small>'+esc([ShinkouProduction.STATES[v.state]||'未確認',v.owner,v.due].filter(Boolean).join(' · '))+'</small></div>';
  }).join('')+'</details>':'';
  return '<article class="release-card"><header><small>'+esc(g.artist||g.p?.artist||'')+'</small><h3>'+esc(name)+'</h3><div class="release-summary"><span>発売 '+esc(g.p?.release?g.p.release.replace(/-/g,'/'):'未定')+' · '+esc(g.p?.release?productionDateKind({value:g.p.release,kind:g.p.dateKinds?.release||'registered'}):'')+'</span><span class="viewer-counts"><span>進行中 '+active.length+'</span><span class="viewer-complete-count">✓ 完了 '+completed.length+'</span></span></div>'+(g.p?.note||S.log.some(z=>z.detail?.collection==='projects'&&z.detail.id===g.p?.id&&z.detail.evidence)?'<details class="state-project-evidence" data-state-fold="evidence:'+esc(g.id)+'"><summary>作品のメモ・根拠</summary>'+productionEvidenceHTML(g.p,{materials:[]},'projects')+'</details>':'')+'</header><div class="release-song-list">'+rows+'</div>'+tasks+'</article>';
 }).join('')||'<div class="production-empty">表示する作品がありません</div>';
}
function refreshProductionReleases(){
 const root=document.querySelector('.release-list');if(!root)return;
 const open=new Set([...root.querySelectorAll('[data-state-fold][open]')].map(x=>x.dataset.stateFold));
 root.innerHTML=productionReleaseContents(pool());root.querySelectorAll('[data-state-fold]').forEach(x=>x.open=open.has(x.dataset.stateFold));wireProduction(root);wireBriefLinks(root);
}
function productionReleaseTaskEditor(projectId,id){
 if(RO||VIEW_ONLY)return;const p=projOf(projectId),def=ShinkouProduction.RELEASE_TASKS.find(t=>t.id===id);if(!p||!def)return;
 const original=JSON.stringify(p.productionTasks?.[id]),v=ShinkouProduction.releaseTask(p,id,S.songs);
 const h='<label class="quick-field">状態<select class="inp" id="releaseTaskState">'+Object.entries(ShinkouProduction.STATES).map(([k,n])=>'<option value="'+k+'" '+((v.state||'unknown')===k?'selected':'')+'>'+n+'</option>').join('')+'</select></label>'+productionField('担当・依頼先','releaseTaskOwner',v.owner)+productionField('締切・予定日','releaseTaskDue',v.due,'date')+'<label class="quick-field">次にすること・メモ<textarea class="inp" id="releaseTaskMemo" rows="4">'+esc(v.memo||'')+'</textarea></label>';
 s3(p.custom||projTitle(p),def.label,h,[{t:'閉じる',c:'btn',f:()=>hide('sheet3')},{sp:1},{t:'保存',c:'btn pri',f:()=>{
  if(JSON.stringify(p.productionTasks?.[id])!==original){toast('記録が更新されました。開き直してください');return}
  const get=id=>document.getElementById(id).value;
  p.productionTasks||={};p.productionTasks[id]={state:get('releaseTaskState'),owner:get('releaseTaskOwner').trim(),due:get('releaseTaskDue'),memo:get('releaseTaskMemo'),updatedAt:Date.now()};
  p.mtime=Date.now();logAdd('作品の共通作業を更新: '+def.label);mark();hide('sheet3');refreshProductionReleases();toast('保存しました');
 }}]);
}

function productionOverview(list){
 const live=V.use==='live',mixed=V.use==='all',sorted=list.filter(s=>!productionIsLive(s)).map(s=>({s,r:productionReport(s)})).sort((a,b)=>Number(a.r.archive)-Number(b.r.archive)||(a.r.actions[0]?.score??1000)-(b.r.actions[0]?.score??1000));
 const songCards=sorted.map(({s,r})=>'<article class="viewer-song-card"><small>'+esc([s.artist||'アーティスト未登録',projTitle(projOf(s.projectId))].filter(Boolean).join(' · '))+'</small>'+productionCompactItem(s)+'</article>').join('');
 const grouped=(V.releaseView||'releases')==='releases';
 const cards=grouped?'<div class="release-list">'+productionReleaseContents(list)+'</div>':songCards;
 const toggle=live?'':'<div class="release-view-toggle" aria-label="原盤の表示単位"><button data-release-view="releases" aria-pressed="'+grouped+'">作品ごと</button><button data-release-view="songs" aria-pressed="'+(!grouped)+'">曲・仕事ごと</button></div>';
 const heading=live?'ライブ公演':mixed?'仕事の状態':grouped?'作品の進行':RO?'楽曲の状況':'曲・仕事の進行';
 return '<section class="song-overview production-overview"><div class="overview-heading"><h2>'+heading+'</h2>'+(live&&!(RO||VIEW_ONLY)?'<button class="show-add-button" data-show-new aria-label="公演を追加">＋</button>':'')+('<button class="completed-filter" data-show-completed aria-pressed="'+(V.fin!=='hide')+'">'+(V.fin!=='hide'?'完了も表示中':live?'完了した公演も見る':'完了も見る')+'</button>')+'</div>'+(live?'':'<p class="production-intro">'+('制作の状況と、次の作業。')+'</p>')+toggle+(live?'':(mixed&&cards?'<h3 class="production-section-title">原盤</h3>':'')+'<div class="snapshot-list">'+(cards||(!mixed?'<div class="production-empty"><b>表示する曲がありません</b><p>絞り込み条件を確認してください。</p></div>':''))+'</div>')+((live||mixed)?'<section class="production-live">'+productionLiveContents(list)+'</section>':'')+'</section>';
}
// 公演IDでまとめる。同名の公演や、原盤の「ライブ初披露」を混ぜない。
function productionShowGroups(list,matched=pool({includeCompleted:true})){
 const groups=new Map(),visible=new Set(list.map(s=>s.id)),scope=new Set(matched.map(s=>s.id));
 for(const p of S.projects.filter(isShow))groups.set(p.id,{id:p.id,p,items:[]});
 for(const s of S.songs.filter(productionIsLive)){
  const p=projOf(s.projectId),id=isShow(p)?p.id:'unassigned:'+String(s.artist||'');
  if(!groups.has(id))groups.set(id,{id,p:null,artist:s.artist||'',items:[]});
  groups.get(id).items.push({s,r:productionReport(s)});
 }
 return [...groups.values()].map(g=>{
  g.archive=g.items.length>0&&g.items.every(x=>x.r.archive);
  g.visible=g.items.filter(x=>visible.has(x.s.id)&&!x.r.archive&&V.fin!=='done').sort((a,b)=>(a.r.actions[0]?.score??1000)-(b.r.actions[0]?.score??1000)||(a.s.ord||0)-(b.s.ord||0));
  g.completed=g.items.filter(x=>scope.has(x.s.id)&&x.r.archive);
  g.deadline=g.items.flatMap(({s,r})=>r.nodes.filter(n=>!n.done&&!n.actionCoveredBy&&n.due.value).map(n=>({s,n}))).sort((a,b)=>a.n.due.value.localeCompare(b.n.due.value))[0];
  g.open=productionShowDate(g,'open');g.rehearsal=productionShowDate(g,'rehearsal');
  return g;
 }).filter(g=>{
  if(g.items.length)return g.visible.length>0||(g.completed.length>0&&(V.fin!=='hide'||!g.archive));
  const q=(V.q||'').trim().toLowerCase();
  return !!g.p&&(V.who||'all')==='all'&&(!V.dir||V.dir==='__all'||g.p.director===V.dir)&&(!q||[g.p.custom,g.p.artist,g.p.venue].join(' ').toLowerCase().includes(q));
 }).sort((a,b)=>Number(a.archive)-Number(b.archive)||(a.open.value||'9999').localeCompare(b.open.value||'9999')||(a.deadline?.n.due.value||'9999').localeCompare(b.deadline?.n.due.value||'9999'));
}
function productionShowDate(g,key){
 const parent=g.p?.[key==='open'?'release':key]||'',values=[...new Set(g.items.map(x=>x.s.dates?.[key]).filter(ShinkouProduction.validDate))].sort();
 if(parent)return {value:parent,kind:g.p.dateKinds?.[key]||'registered',different:values.some(v=>v!==parent)};
 if(values.length===1){const kinds=[...new Set(g.items.filter(x=>x.s.dates?.[key]===values[0]).map(x=>x.s.production?.dateKinds?.[key]||'registered'))];return {value:values[0],kind:kinds.length===1?kinds[0]:'registered',source:'制作物の日程'}}
 return {value:'',kind:'registered',different:values.length>1};
}
function productionBallText(b){
 if(b.text)return b.text;
 if(['requested','revision'].includes(b.state)&&(!b.who||b.who==='担当未確認'))return b.state==='revision'?'相手の修正待ち':'相手の対応待ち';
 if(b.state==='waiting')return '日程待ち'+(b.who&&b.who!=='担当未確認'?' · '+b.who:'');
 if(!b.who||b.who==='担当未確認')return '担当未確認';
 return b.who+(['requested','revision'].includes(b.state)?'の返答待ち':'が対応中');
}
function productionShowItem({s,r}){return productionCompactItem(s);}

function productionLiveContents(list){
 const groups=productionShowGroups(list);
 const header=V.use==='all'?'<div class="show-section-heading"><h3 class="production-section-title">ライブ公演</h3>'+(!(RO||VIEW_ONLY)?'<button class="production-more" data-show-new>＋ 公演を追加</button>':'')+'</div>':'';
 return header+((V.q||V.dir!=='__all'||V.who!=='all')?'<p class="show-filter-note">絞り込み中。日程は公演全体の情報です。</p>':'')+(groups.map(g=>{
  const title=g.p?projTitle(g.p):'公演未設定',state=g.archive?'準備完了':g.items.length?'準備中':'準備内容未登録';
  const date=(label,d)=>'<div><small>'+label+'</small><b>'+esc(d.different&&!d.value?'要確認':productionDate(d))+'</b><em>'+esc(d.different?'個別の日程あり':d.source||productionDateKind(d))+'</em></div>';
  const next=g.deadline,ball=g.visible.flatMap(x=>x.r.balls.map(b=>({s:x.s,b})))[0];
  return '<article class="show-card" data-show-card="'+esc(g.id)+'"><header><div><small>'+esc(g.p?.artist||g.artist||'アーティスト未登録')+'</small><h3>'+esc(title)+'</h3></div><span class="show-status '+(g.archive?'complete':'')+'">'+state+'</span></header>'+(g.p?.venue?'<p class="show-venue">'+esc(g.p.venue)+'</p>':'')+'<div class="show-dates">'+date('公演初日',g.open)+date('リハーサル',g.rehearsal)+'</div>'+(next?'<button class="show-deadline" data-brief-song="'+esc(next.s.id)+'"><span><small>次の締切</small><b>'+esc(songTitle(next.s))+' · '+esc(next.n.label)+'</b></span><strong>'+esc(productionDate(next.n.due))+'<small>'+productionDateKind(next.n.due)+'</small>'+(productionDueNote(next.n)?'<small class="production-due-note">'+esc(productionDueNote(next.n))+'</small>':'')+'</strong></button>':'')+(ball?'<p class="show-current-ball">'+esc(productionBallText(ball.b))+' · '+esc(songTitle(ball.s))+'</p>':'')+(g.p?.note?'<details class="state-project-evidence" data-state-fold="evidence:'+esc(g.id)+'"><summary>公演の記録・根拠・確認日時</summary>'+productionEvidenceHTML(g.p,{materials:[]},'projects')+'</details>':'')+'<details open class="show-preparation" data-show-fold="items:'+esc(g.id)+'"><summary>制作物の状況<span aria-hidden="true">⌄</span></summary><div class="show-items">'+g.visible.map(productionShowItem).join('')+'</div>'+(g.completed.length?'<details '+(V.q||V.fin==='done'?'open ':'')+'class="show-completed" data-show-completed-group="'+esc(g.id)+'" data-show-fold="completed:'+esc(g.id)+'"><summary>✓ 完了した制作物<span aria-hidden="true">⌄</span></summary>'+g.completed.map(productionShowItem).join('')+'</details>':'')+(!g.items.length?'<p class="hint">制作物の記録はまだありません。</p>':'')+(!g.p?'<p class="hint">公演との関連は未登録です。</p>':'')+(!(RO||VIEW_ONLY)&&g.p?'<footer><button class="production-more" data-show-edit="'+esc(g.p.id)+'">公演情報・日程</button><button class="production-more" data-show-add="'+esc(g.p.id)+'">＋ 制作物を追加</button></footer>':'')+'</details></article>';
 }).join('')||'<div class="production-empty"><b>表示する公演がありません</b><p>'+((V.q||V.dir!=='__all'||V.who!=='all')?'絞り込み条件を確認してください。':'登録された公演と制作物をここで確認できます。')+'</p></div>');
}
function refreshProductionShows(){
 const container=document.querySelector('.production-live');if(!container)return;
 const main=document.getElementById('main'),top=main.scrollTop,opened=new Set([...container.querySelectorAll('[data-show-fold][open],[data-state-fold][open]')].map(x=>x.dataset.showFold||x.dataset.stateFold));
 container.innerHTML=productionLiveContents(pool());
 container.querySelectorAll('[data-show-fold],[data-state-fold]').forEach(x=>x.open=opened.has(x.dataset.showFold||x.dataset.stateFold));
 wireProduction(container);wireBriefLinks(container);main.scrollTop=top;
}
function productionSaveShow(p,patch){
 if(RO||VIEW_ONLY)return false;
 const old={...p};Object.assign(p,patch);
 // 個別指定や確定・仮の日程を、公演の編集で書き換えない。
 for(const s of S.songs.filter(s=>s.projectId===p.id&&productionIsLive(s))){
  s.dates||={};
  for(const [field,key]of [['release','open'],['rehearsal','rehearsal']])if(old[field]!==p[field]&&(!s.dates[key]||(s.dates[key]===old[field]&&!(s.production?.dateKinds?.[key]&&s.production.dateKinds[key]!=='registered'))))s.dates[key]=p[field]||'';
 }
 return true;
}
function productionShowEditor(id){
 if(RO||VIEW_ONLY)return;const existing=id?projOf(id):null;if(id&&!existing)return;
 const p=existing||{id:uid(),mode:'live',kind:'ライブ',custom:'',artist:'',release:'',rehearsal:'',venue:'',note:'',director:V.dir!=='__all'?V.dir:''},initial=JSON.stringify(p);
 const fields=[['公演名','custom'],['アーティスト','artist'],['公演初日','release','date'],['リハーサル','rehearsal','date'],['会場','venue']];
 const h=fields.map(([label,k,type])=>productionField(label,'show_'+k,p[k],type)).join('')+'<label class="quick-field">メモ<textarea class="inp" id="show_note" rows="3">'+esc(p.note||'')+'</textarea></label><p class="hint">個別に変えた制作物の日程は保持します。</p>';
 s3('ライブ公演',existing?'公演情報・日程':'公演を追加',h,[{t:'キャンセル',c:'btn',f:()=>hide('sheet3')},{sp:1},{t:'保存',c:'btn pri',f:()=>{
  if(RO||VIEW_ONLY)return;if(existing&&(!S.projects.includes(p)||initial!==JSON.stringify(p)))return toast('公演が更新されています。開き直してください');
  const patch=Object.fromEntries(fields.map(([,k])=>[k,document.getElementById('show_'+k).value.trim()]));patch.note=document.getElementById('show_note').value.trim();
  if(!patch.custom)return toast('公演名を入力してください');if([patch.release,patch.rehearsal].some(d=>d&&!ShinkouProduction.validDate(d)))return toast('日付を確認してください');
  if(!productionSaveShow(p,patch))return;if(!existing)S.projects.push(p);mark();hide('sheet3');render();toast('公演を保存しました');
 }}]);
}
function productionShowAddItem(id){
 if(RO||VIEW_ONLY)return;const p=projOf(id);if(!p||!isShow(p))return;
 s3(projTitle(p),'制作物を追加','<label class="quick-field">準備するもの<select class="inp" id="show_item_type">'+LTYPES.map(t=>'<option value="'+esc(t)+'">'+esc(t)+'</option>').join('')+'</select></label>'+productionField('名前（必要な場合）','show_item_title','')+'<p class="hint">複数のSEなどは名前を付けて分けられます。</p>',[{t:'キャンセル',c:'btn',f:()=>hide('sheet3')},{sp:1},{t:'追加',c:'btn pri',f:()=>{
  if(RO||VIEW_ONLY||!S.projects.includes(p))return;const type=document.getElementById('show_item_type').value;if(!LTYPES.includes(type))return;
  const s=newSong({templateId:'tpl_show'});s.title=document.getElementById('show_item_title').value.trim()||type;s.ltype=type;s.stageList=showStages(type);s.projectId=p.id;s.artist=p.artist||'';s.director=p.director||'';s.dates.open=p.release||'';s.dates.rehearsal=p.rehearsal||'';s.dlFixed=true;
  S.songs.push(s);mark();hide('sheet3');render();openSong(s.id);
 }}]);
}
function wireProduction(root){
 root.querySelectorAll('[data-release-view]').forEach(b=>b.onclick=()=>{V.releaseView=b.dataset.releaseView;viewSave();render()});
 root.querySelectorAll('[data-release-task]').forEach(b=>b.onclick=()=>productionReleaseTaskEditor(b.dataset.releaseProject,b.dataset.releaseTask));
 root.querySelectorAll('[data-show-new]').forEach(b=>b.onclick=()=>productionShowEditor());
 root.querySelectorAll('[data-show-edit]').forEach(b=>b.onclick=()=>productionShowEditor(b.dataset.showEdit));
 root.querySelectorAll('[data-show-add]').forEach(b=>b.onclick=()=>productionShowAddItem(b.dataset.showAdd));
 root.querySelectorAll('[data-production-song]').forEach(b=>b.onclick=()=>{
   const s=S.songs.find(s=>s.id===b.dataset.productionSong);if(!s)return;
   const kind=b.dataset.productionKind,key=b.dataset.productionKey;
   if(RO||VIEW_ONLY){if(kind==='group')productionReadGroup(s,key);return}
   if(kind==='task')productionTaskEditor(s,key);else if(kind==='contact')workflowContact(s,key);else if(kind==='workflow')workflowHub(s);else if(kind==='folder')productionFolderSheet(s);else if(kind==='group'||kind==='all')productionTasksSheet(s,kind==='all'?'all':key);else if(kind==='dates')productionDatesSheet(s);else if(kind==='date')productionDateEditor(s,key);
 });
}
function productionAfterSave(s){mark();refreshCompletion(s);if(typeof refreshInvoiceOverview==='function')refreshInvoiceOverview()}
function productionReadGroup(s,id){
 const r=productionReport(s),g=r.groups.find(x=>x.id===id);if(!g)return;
 const nodes=productionGroupNodes(r,id),h='<p class="production-read-summary">'+esc(g.text)+'</p>'+nodes.map(n=>'<div class="viewer-task-record"><span class="viewer-task-mark">'+(n.done?'✓':n.state==='na'?'−':'○')+'</span><div><b>'+esc(n.label)+'</b><small>'+esc(n.state==='na'?'対象外':n.done?'完了':ShinkouProduction.STATES[n.state]||'未確認')+(n.owner?' · '+esc(n.owner):'')+(n.due?.value?' · '+esc(productionDate(n.due)+' '+productionDateKind(n.due)):'')+'</small>'+(n.memo?'<p>'+esc(n.memo)+'</p>':'')+'</div></div>').join('');
 s3(songTitle(s),g.label,h,[{sp:1},{t:'閉じる',c:'btn',f:()=>hide('sheet3')}]);
}

function productionTask(s,id){return ShinkouProduction.task(s,id,{today:D.today(),release:relOf(s)})}
function productionTaskRow(s,n){
 if(n.id==='invoice')return '<div class="production-task-row"><button type="button" class="production-task-name invoice-task" data-production-edit="invoice"><b>請求書</b><small>'+esc(n.invoice.title)+'</small></button><span aria-hidden="true">›</span></div>';
 const na=n.state==='na',done=n.state==='done'||na;
 const status=na?'対象外':n.bookingDerived?'日程登録済み · '+productionDate(n.due):n.actionCoveredBy?'依頼済みの記録あり · 関連する制作状況から判断':done?'完了'+(n.date?' · '+productionDate({value:n.date}):''):(ShinkouProduction.STATES[n.state]||'一部完了')+(n.owner?' · '+n.owner:'')+(n.due.value?' · '+productionDate(n.due)+' '+productionDateKind(n.due):'');
 const dueNote=productionDueNote(n);
 return '<div class="production-task-row'+(na?' not-applicable':'')+'"><button type="button" class="production-check '+(done?'complete':'')+'" aria-label="'+esc(n.label+(na?'（対象外）':done?'を未完了に戻す':'を完了にする'))+'" role="checkbox" aria-checked="'+(n.state==='partial'?'mixed':done)+'" data-production-check="'+esc(n.id)+'" '+(na?'disabled':'')+'><span aria-hidden="true">'+(done?'✓':na?'−':n.state==='partial'?'−':'')+'</span></button><button type="button" class="production-task-name" data-production-edit="'+esc(n.id)+'"><b>'+esc(n.label)+'</b><small>'+esc(status)+'<span class="production-due-note">'+esc(dueNote?' · '+dueNote:'')+'</span></small></button></div>';
}
function productionDueNote(n){
 if(n.done||n.actionCoveredBy||!Number.isFinite(n.left)||n.left>=0||!n.due?.value)return '';
 return '過去の'+(n.due.kind==='target'?'目安':n.due.kind==='tentative'?'仮日程':'登録期日')+'・現在の状況は要確認';
}
function productionToggleTask(s,id,redraw){
 if(id==='invoice'){invoiceSheet(s);return}
 if(RO||VIEW_ONLY||!S.songs.includes(s))return;const n=productionTask(s,id);if(!n||n.state==='na')return;
 if(n.derived&&!n.bookingDerived){toast('アレンジ最終完成から判断しています。項目名から記録を確認できます');return}
 const before=ShinkouCore.copy(s),state=n.done?'todo':'done';
 try{ShinkouProduction.apply(s,id,{state},D.today());n.keys.forEach(k=>setKidDone(s,k,state==='done'))}catch(e){toast(e.message);return}
 const diff=[];function walk(a,z,path){if(ShinkouCore.equal(a,z))return;if((a===undefined||a&&typeof a==='object'&&!Array.isArray(a))&&z&&typeof z==='object'&&!Array.isArray(z)){for(const k of new Set([...Object.keys(a||{}),...Object.keys(z)]))walk(a?.[k],z[k],path.concat(k))}else diff.push({path,before:ShinkouCore.copy(a),after:ShinkouCore.copy(z)})}walk(before,s,[]);
 logAdd(n.label+(state==='done'?'を完了: ':'を未完了へ: ')+songTitle(s));productionAfterSave(s);redraw?.();const revision=viewRevision;
 toast(n.label+(state==='done'?'を完了しました':'を未完了に戻しました'),{label:'元に戻す',run:()=>{
  if(RO||VIEW_ONLY)return;const current=S.songs.find(x=>x.id===s.id),get=(o,p)=>p.reduce((v,k)=>v?.[k],o);
  if(!current||diff.some(d=>!ShinkouCore.equal(get(current,d.path),d.after)))return toast('記録が更新されています。現在の状態を確認してください');
  for(const d of diff){let obj=current;for(const k of d.path.slice(0,-1))obj=obj[k];if(d.before===undefined)delete obj[d.path.at(-1)];else obj[d.path.at(-1)]=ShinkouCore.copy(d.before)}
  productionAfterSave(current);if(current===s&&viewRevision===revision&&document.getElementById('sheet3').classList.contains('on'))redraw?.();toast('元に戻しました');
 }});
}
function wireProductionTasks(s,body,back,redraw){
 body.querySelectorAll('[data-production-edit]').forEach(b=>b.onclick=()=>productionTaskEditor(s,b.dataset.productionEdit,back));
 body.querySelectorAll('[data-production-check]').forEach(b=>b.onclick=()=>productionToggleTask(s,b.dataset.productionCheck,redraw));
}
function productionGroupNodes(r,group){
 return ShinkouProduction.orderedNodes(r.nodes).filter(n=>n.group===group&&!n.shared);
}
function productionTasksSheet(s,group='all'){
 if(RO||VIEW_ONLY)return;const r=productionReport(s),groups=r.groups.filter(g=>group==='all'||g.id===group);
 let h=groups.map(g=>{const list=productionGroupNodes(r,g.id).filter(n=>n.state!=='na');return list.length?'<section class="production-task-section">'+(group==='all'?'<h3>'+esc(g.label)+'</h3>':'')+list.map(n=>productionTaskRow(s,n)).join('')+'</section>':''}).join('');
 const omitted=r.nodes.filter(n=>!n.shared&&n.state==='na'&&(group==='all'||n.group===group));
 if(!h)h='<p class="hint">この曲では対象の作業はありません。</p>';
 if(omitted.length)h+='<details class="production-omitted"><summary>対象外の作業</summary>'+omitted.map(n=>productionTaskRow(s,n)).join('')+'</details>';
 if(group==='instrument')h+='<label class="quick-field">楽器録音<select class="inp" id="productionInstruments" aria-label="楽器録音の必要性">'+[['unknown','必要か未確認'],['required','あり'],['none','なし']].map(([v,l])=>'<option value="'+v+'" '+((s.production?.instruments||'unknown')===v?'selected':'')+'>'+l+'</option>').join('')+'</select></label>';
 if(group==='chorus')h+='<label class="quick-field">コーラス<select class="inp" id="productionChorus" aria-label="コーラスの必要性"><option value="required">あり（通常）</option><option value="none" '+(s.production?.chorus==='none'?'selected':'')+'>なし</option></select></label><button class="production-more production-button" id="productionDeferChorus">コーラス関係をまとめて未定にする</button>';
 h+='<button class="production-more production-button" id="productionAddTask">＋ 作業を追加</button>';
 s3(songTitle(s),group==='all'?'作業・確認・提出':groups[0]?.label||'作業',h,[{sp:1},{t:'閉じる',c:'btn',f:()=>hide('sheet3')}]);
 const body=document.getElementById('s3Body');wireProductionTasks(s,body,group,()=>{const top=body.scrollTop;productionTasksSheet(s,group);body.scrollTop=top});
 for(const [element,field]of [['productionInstruments','instruments'],['productionChorus','chorus']]){const el=document.getElementById(element);if(el)el.onchange=()=>{if(RO||VIEW_ONLY||!S.songs.includes(s))return;s.production||={};s.production[field]=el.value;productionAfterSave(s);productionTasksSheet(s,group)}}
 document.getElementById('productionAddTask').onclick=()=>productionAddTask(s,group);
 const defer=document.getElementById('productionDeferChorus');if(defer)defer.onclick=async()=>{
  if(RO||VIEW_ONLY||!S.songs.includes(s))return;
  const before=ShinkouProduction.groupSnapshot(s,'chorus');
  if(!await ask('コーラスの未完了の予定日・締切・返事待ちを外します。完了済みの実績・クレジット・メモは残します。','未定にする'))return;
  if(RO||VIEW_ONLY||!S.songs.includes(s)||before!==ShinkouProduction.groupSnapshot(s,'chorus'))return toast('記録が更新されました。内容を確認してからやり直してください');
  ShinkouProduction.deferGroup(s,'chorus',D.today());logAdd('コーラス関係を未定に変更: '+songTitle(s));productionAfterSave(s);productionTasksSheet(s,group);
 };
}
function productionField(label,id,value,type='text'){return '<label class="quick-field">'+esc(label)+'<input class="inp" id="'+id+'" type="'+type+'" value="'+esc(value||'')+'"></label>'}
function productionTaskEditor(s,id,back='all'){
 if(id==='invoice'){invoiceSheet(s);return}
 if(RO||VIEW_ONLY)return;const r=productionReport(s),n=productionTask(s,id);if(!n)return;
 if(n.state==='na'){
  s3(songTitle(s),n.label,'<p class="hint">この曲では対象外です。保存した日程・メモ・完了記録は残っています。</p>',[{t:'戻る',c:'btn',f:()=>productionTasksSheet(s,back)},{sp:1},{t:'この曲でも使う',c:'btn pri',f:()=>{
   if(RO||VIEW_ONLY||!S.songs.includes(s))return;s.production||={};if(n.group==='instrument')s.production.instruments='required';if(n.group==='chorus')s.production.chorus='required';if(['teacher','rough','almost'].includes(id))s.production.choreography=true;
   ShinkouProduction.setIncluded(s,id,true);productionAfterSave(s);productionTasksSheet(s,back);
  }}]);return;
 }
 const field=productionField,schedule=n.keys.map(k=>(s.stageList||[]).find(x=>x.k===k&&isMulti(x))).filter(Boolean);
 let h='<label class="quick-field">状態<select class="inp" id="productionState" aria-label="状態">'+(n.state==='partial'?'<option value="partial" selected>一部完了</option>':'')+Object.entries(ShinkouProduction.STATES).map(([k,v])=>'<option value="'+k+'" '+(n.state===k?'selected':'')+'>'+v+'</option>').join('')+'</select></label>';
 if(n.derived)h+='<p class="hint">アレンジ最終完成の記録から、歌録り可能と判断しています。</p>';
 h+=field('いま対応する人','productionOwner',n.owner)+field('締切・予定日','productionDue',n.due.kind==='target'?'':n.due.value,'date')+'<label class="quick-field">日程の状態<select class="inp" id="productionDueKind" aria-label="日程の状態">'+[['registered','登録日（確定状況未確認）'],['tentative','仮'],['confirmed','確定']].map(([v,l])=>'<option value="'+v+'" '+(n.due.kind===v?'selected':'')+'>'+l+'</option>').join('')+'</select></label>';
 h+='<div id="workflowImpact"></div>';
 if(n.due.kind==='target'&&n.due.value)h+='<p class="hint">目安 '+esc(productionDate(n.due))+' · '+esc(n.due.source)+'</p>';
 if(n.done)h+=field('完了日','productionCompleted',n.date,'date');
 if(schedule.length)h+='<button class="btn" id="productionSchedule">日程・'+esc(whoPh(schedule[0]))+'を編集</button>';
 if(n.keys.length>1)h+='<section class="production-task-section production-parts"><h3>個別の作業</h3>'+n.keys.map(k=>productionTaskRow(s,productionTask(s,'stage:'+k))).join('')+'</section>';
 h+='<label class="quick-field">メモ<textarea class="inp" id="productionMemo" rows="3">'+esc(n.memo)+'</textarea></label>';
 h+='<details class="production-contact"><summary>連絡文を作る</summary>'+field('相手の名前','productionRecipient',n.recipient)+'<label class="quick-field">連絡手段<select class="inp" id="productionChannel" aria-label="連絡手段"><option value="">未設定</option><option value="email" '+(n.channel==='email'?'selected':'')+'>メール</option><option value="line" '+(n.channel==='line'?'selected':'')+'>LINE</option></select></label><button class="btn" id="productionDraft">入力を保存して下書きへ</button></details>';
 h+='<details class="production-contact"><summary>この作業について</summary>'+(n.blockers.length?'<p class="hint">先に確認：'+n.blockers.map(k=>esc(r.node[k].label)).join('、')+'</p>':'')+(n.stage?field('作業名','productionTaskLabel',(s.stageList||[]).find(x=>x.k===n.id.slice(6))?.n):'')+'<button class="btn" id="productionExclude">この曲では対象外にする</button><p class="hint">日程・メモ・完了記録は残り、一覧から戻せます。</p></details>';
 const snapshot=JSON.stringify({tasks:s.production?.tasks?.[id],stages:n.keys.map(k=>s.stages?.[k]),list:s.stageList});let stateChanged=false;
 const read=()=>{const v=id=>document.getElementById(id).value;return {...(stateChanged&&v('productionState')!=='partial'?{state:v('productionState')}:{}),owner:v('productionOwner').trim(),recipient:v('productionRecipient').trim(),channel:v('productionChannel'),due:v('productionDue'),dueKind:v('productionDueKind'),memo:v('productionMemo')}};
 const save=()=>{
  if(RO||VIEW_ONLY||!S.songs.includes(s))return false;if(snapshot!==JSON.stringify({tasks:s.production?.tasks?.[id],stages:n.keys.map(k=>s.stages?.[k]),list:s.stageList})){toast('記録が更新されました。開き直して確認してください');return false}
  const p=read(),original={owner:n.owner,recipient:n.recipient,channel:n.channel,due:n.due.kind==='target'?'':n.due.value,dueKind:n.due.kind==='target'?'registered':n.due.kind,memo:n.memo};for(const k of Object.keys(original))if(p[k]===original[k])delete p[k];const e=ShinkouProduction.validatePatch(p);if(e){toast(e);return false}
  try{ShinkouProduction.apply(s,id,p,D.today());if(p.state)n.keys.forEach(k=>setKidDone(s,k,!!s.stages?.[k]?.done))}catch(e){toast(e.message);return false}
  const completed=document.getElementById('productionCompleted');if(completed&&(!p.state||p.state==='done')&&completed.value!==n.date)s.production.tasks[id].completedAt=completed.value;
  const label=document.getElementById('productionTaskLabel');if(label?.value.trim()){const x=s.stageList.find(x=>x.k===id.slice(6));if(label.value.trim()!==x.n){x.n=label.value.trim();x.productionLabel=x.n}}
  logAdd(n.label+'を更新: '+songTitle(s));productionAfterSave(s);return true;
 };
 s3(songTitle(s),n.label,h,[{t:'戻る',c:'btn',f:()=>productionTasksSheet(s,back)},{sp:1},{t:'保存',c:'btn pri',f:()=>{if(save()){productionTasksSheet(s,back);toast('保存しました')}}}]);
 document.getElementById('productionState').onchange=e=>{stateChanged=true;if(e.target.value==='undecided')document.getElementById('productionDue').value=''};
 document.getElementById('productionDue').onchange=e=>{if(typeof workflowImpact==='function')workflowImpact(s,id,e.target.value,document.getElementById('workflowImpact'))};
 document.getElementById('productionDraft').onclick=()=>{if(save())productionDraftSheet(s,productionTask(s,id),back)};
 const sched=document.getElementById('productionSchedule');if(sched)sched.onclick=()=>{if(save())productionScheduleEditor(s,schedule[0].k,()=>productionTaskEditor(s,id,back))};
 document.getElementById('productionExclude').onclick=()=>{if(save()){ShinkouProduction.setIncluded(s,id,false);productionAfterSave(s);productionTasksSheet(s,back);toast('対象外にしました')}};
 // Save any parent edits before moving to an individual task.
 const body=document.getElementById('s3Body');body.querySelectorAll('[data-production-edit]').forEach(b=>b.onclick=()=>{if(save())productionTaskEditor(s,b.dataset.productionEdit,back)});
 body.querySelectorAll('[data-production-check]').forEach(b=>b.onclick=()=>{if(save())productionToggleTask(s,b.dataset.productionCheck,()=>productionTaskEditor(s,id,back))});
}
function productionAddTask(s,back){
 if(RO||VIEW_ONLY)return;const groups=productionReport(s).groups;
 s3(songTitle(s),'作業を追加',productionField('作業名','productionNewLabel','')+'<label class="quick-field">まとめる場所<select class="inp" id="productionNewGroup" aria-label="まとめる場所">'+groups.map(g=>'<option value="'+esc(g.id)+'" '+(g.id===back?'selected':'')+'>'+esc(g.label)+'</option>').join('')+'</select></label>',[{t:'戻る',c:'btn',f:()=>productionTasksSheet(s,back)},{sp:1},{t:'追加',c:'btn pri',f:()=>{
  if(RO||VIEW_ONLY||!S.songs.includes(s))return;const n=document.getElementById('productionNewLabel').value.trim();if(!n)return toast('作業名を入力してください');const group=document.getElementById('productionNewGroup').value,k='custom_'+uid();s.stageList.push({k,n,role:'me',gp:groups.find(g=>g.id===group)?.label||'作業',productionGroup:group});stg(s,k);productionAfterSave(s);productionTaskEditor(s,'stage:'+k,back);
 }}]);
}
function productionScheduleEditor(s,key,back=()=>hide('sheet3')){
 if(RO||VIEW_ONLY)return;const x=(s.stageList||[]).find(x=>x.k===key&&isMulti(x));if(!x)return toast('日程を登録する作業が見つかりません');
 const initial=JSON.stringify(s.stages?.[key]||{}),slots=ShinkouCore.copy(s.stages?.[key]?.slots||[]);let dateKind=s.production?.dateKinds?.[key]||'registered';
 const add=()=>({slotId:uid(),date:'',note:'',who:'',done:false});if(!slots.length)slots.push(add());
 const read=()=>{slots.forEach((v,i)=>{v.date=document.getElementById('scheduleDate'+i).value;v.who=document.getElementById('scheduleWho'+i).value.trim();v.note=document.getElementById('scheduleNote'+i).value.trim();v.swait=document.getElementById('scheduleWait'+i).checked});dateKind=document.getElementById('scheduleKind').value};
 const draw=()=>{
  const h=slots.map((v,i)=>'<section class="production-slot"><h3>日程 '+(i+1)+'</h3>'+productionField('日付','scheduleDate'+i,v.date,'date')+productionField(whoPh(x),'scheduleWho'+i,v.who)+productionField(isInstRec(x)?'パート':'補足','scheduleNote'+i,v.note)+'<label class="quick-check"><input type="checkbox" id="scheduleWait'+i+'" '+(v.swait?'checked':'')+'>返事待ち</label>'+(v.done?'<p class="hint">実施済みの記録あり</p>':'')+'</section>').join('')+'<button class="btn" id="scheduleAdd">＋ 日程を追加</button><label class="quick-field">日程の状態<select class="inp" id="scheduleKind" aria-label="日程の状態">'+[['registered','登録日（確定状況未確認）'],['tentative','仮'],['confirmed','確定']].map(([v,l])=>'<option value="'+v+'" '+(dateKind===v?'selected':'')+'>'+l+'</option>').join('')+'</select></label><p class="hint">日程を保存しても、録音・編集を完了にはしません。</p>';
  s3(songTitle(s),productionTask(s,'stage:'+key).label,h,[{t:'戻る',c:'btn',f:back},{sp:1},{t:'保存',c:'btn pri',f:()=>{
   if(RO||VIEW_ONLY||!S.songs.includes(s))return;if(initial!==JSON.stringify(s.stages?.[key]||{}))return toast('日程が更新されました。開き直してください');read();
   if(slots.some(v=>v.date&&!ShinkouProduction.validDate(v.date)))return toast('日付を確認してください');
   const old=s.stages?.[key]?.slots||[];if(key==='instrec')slots.forEach(v=>{if(!v.date&&!v.note&&!v.who&&old.some(o=>o.slotId===v.slotId&&(o.date||o.note||o.who)))v.note='パート未定'});
   stg(s,key).slots=slots.filter(v=>v.date||v.note||v.who||old.some(o=>o.slotId===v.slotId));s.production||={};s.production.dateKinds||={};s.production.dateKinds[key]=dateKind;
   if(stg(s,key).workState==='undecided'&&slots.some(v=>v.date&&!v.done))ShinkouProduction.apply(s,'stage:'+key,{state:'todo'},D.today());
   syncSlotAssign(s);syncSlotCredits(s);if(key==='instrec')syncInstKids(s);syncLists();productionAfterSave(s);back();toast('日程を保存しました');
  }}]);document.getElementById('scheduleAdd').onclick=()=>{read();slots.push(add());draw()};
 };draw();
}
function productionSongInfo(s){
 if(RO||VIEW_ONLY)return;const fields=['title','work','artist','director','projectId','sort','single','sortSet','mvEnabled','dropboxUrl'],initial=JSON.stringify(fields.map(k=>s[k]));
 const h=productionField('正式タイトル','songInfoTitle',s.title)+productionField('仮題・原題','songInfoWork',s.work)+productionField('アーティスト','songInfoArtist',s.artist)+'<label class="quick-field">案件<select class="inp" id="songInfoProject" aria-label="案件"><option value="">未設定</option>'+S.projects.map(p=>'<option value="'+esc(p.id)+'" '+(p.id===s.projectId?'selected':'')+'>'+esc(projTitle(p))+'</option>').join('')+'</select></label>'+productionField('担当ディレクター','songInfoDirector',s.director)+(s.use==='live'?'':'<label class="quick-field">曲の種類<select class="inp" id="songInfoSort" aria-label="曲の種類">'+SORTS.map(([v,l])=>'<option value="'+v+'" '+(sortOf(s)===v?'selected':'')+'>'+l+'</option>').join('')+'</select></label><label class="quick-check"><input type="checkbox" id="songInfoMV" '+(songHasMV(s)?'checked':'')+'>MVあり</label><p class="hint">アルバムリードなど、必要な曲だけMVありにできます。</p>');
 s3(songTitle(s),'曲の情報',h+productionField('曲のDropboxフォルダ','songInfoDropbox',s.dropboxUrl,'url'),[{t:'キャンセル',c:'btn',f:()=>hide('sheet3')},{sp:1},{t:'保存',c:'btn pri',f:()=>{
  if(RO||VIEW_ONLY||!S.songs.includes(s))return;if(initial!==JSON.stringify(fields.map(k=>s[k])))return toast('曲の情報が更新されました。開き直してください');
  let folder;try{folder=ShinkouProduction.dropboxURL(document.getElementById('songInfoDropbox').value)}catch(e){return toast(e.message)}
  s.dropboxUrl=folder;
  for(const [k,id]of [['title','songInfoTitle'],['work','songInfoWork'],['artist','songInfoArtist'],['director','songInfoDirector'],['projectId','songInfoProject']])s[k]=document.getElementById(id).value.trim();
  if(s.use!=='live'){s.sort=document.getElementById('songInfoSort').value;s.single=s.sort==='single';s.sortSet=true;s.mvEnabled=document.getElementById('songInfoMV').checked}
  mAdd('artist',s.artist);mAdd('director',s.director);syncLists();productionAfterSave(s);hide('sheet3');render();if(cur===s)drawSong();toast('保存しました');
 }}]);const sort=document.getElementById('songInfoSort');if(sort)sort.onchange=()=>document.getElementById('songInfoMV').checked=sort.value==='single';
}
function productionDraftSheet(s,n,back){
 if(RO||VIEW_ONLY)return;const draft=ShinkouProduction.draft(s,n,n.channel||'email'),initial=JSON.stringify(s.workflow||{});
 workflowDraft(s,draft,()=>productionTaskEditor(s,n.id,back),()=>{
  if(!wfGuard(s,initial))return false;
  WF.saveCommunication(s,{id:uid(),subject:n.label,person:n.recipient,channel:n.channel||'email',state:'waiting',due:n.due.kind==='target'?'':n.due.value,taskId:n.id,memo:n.memo});productionAfterSave(s);return true;
 },{channel:n.channel});
}
function productionFolderURL(s){try{return ShinkouProduction.dropboxURL(s.dropboxUrl)}catch{return ''}}
function productionFolderLink(s){const url=productionFolderURL(s);return url?'<a class="production-more folder-link" href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">曲のDropboxフォルダを開く ↗</a>':''}
function productionFolderControls(s){return '<div class="production-folder">'+(productionFolderLink(s)||productionButton(s,'folder','','production-more','Dropboxフォルダを登録'))+(productionFolderURL(s)?productionButton(s,'folder','','production-more','リンク編集'):'')+'</div>'}
function productionFolderSheet(s){
 if(RO||VIEW_ONLY)return;const initial=s.dropboxUrl;
 s3(songTitle(s),'Dropboxフォルダ',productionField('この曲のフォルダURL','productionFolderURL',s.dropboxUrl,'url')+'<p class="hint">Dropboxで曲のフォルダの「リンクをコピー」を押し、ここに貼り付けてください。曲の状況・請求書の画面から直接開けます。</p>'+productionFolderLink(s)+'<p class="hint">資料は「連絡・資料」から確認できます。共有権限はここでは変更しません。</p>',[{t:'キャンセル',c:'btn',f:()=>hide('sheet3')},{sp:1},{t:'保存',c:'btn pri',f:()=>{
  if(RO||VIEW_ONLY||!S.songs.includes(s))return;if(initial!==s.dropboxUrl)return toast('フォルダのリンクが更新されています。開き直してください');
  try{s.dropboxUrl=ShinkouProduction.dropboxURL(document.getElementById('productionFolderURL').value)}catch(e){return toast(e.message)}
  productionAfterSave(s);hide('sheet3');toast(s.dropboxUrl?'Dropboxフォルダを登録しました':'リンクを解除しました');
 }}]);
}
function productionInsertFolderButton(s,textareaId,bodyId){
 const url=productionFolderURL(s);if(!url)return;
 const b=document.createElement('button');b.className='production-more';b.type='button';b.textContent='曲フォルダのリンクを文面に入れる';
 b.onclick=()=>{const input=document.getElementById(textareaId);if(!input.value.includes(url))input.value+='\n\n制作資料\n'+url;toast('フォルダのリンクを文面に入れました')};document.getElementById(bodyId).appendChild(b);
}
function productionDatesSheet(s){
 const r=productionReport(s),rows=r.custom?[['open','公演初日'],['rehearsal','リハーサル'],['deliver','音源提出'],['live','ライブ披露']]:[['selection','曲確定'],['vocal','歌録り'],...(r.mv?[['teacher','先生へ歌割・ラフ提出'],['mv','MV撮影']]:[]),...(!s.projectId?[['lyricCheck','歌詞確認'],['credits','クレジット提出']]:[]),['master','マスタリング'],['release','発売'],['live','ライブ披露']];
 for(const key of Object.keys(ANCHORS)){if(['mastering','mv'].includes(key)||rows.some(([k])=>k===key)||!s.dates?.[key])continue;rows.push([key,ANCHORS[key]]);r.dates[key]={value:s.dates[key],kind:s.production?.dateKinds?.[key]||'registered'}}
 const h='<div class="production-schedule">'+rows.map(([k,l])=>'<button type="button" data-schedule-date="'+k+'"><span>'+l+'<small>'+esc(r.dates[k]?.source||'')+'</small></span><b>'+esc(productionDate(r.dates[k]))+'<small>'+productionDateKind(r.dates[k])+'</small></b></button>').join('')+'</div>'+(!r.custom?'<p class="hint">目安は発売日からの逆算です。日程を押して、予定日や確定・仮を記録できます。</p>':'')+(r.liveOnly?'<p class="hint">発売日が未定のため、ライブ披露に必要な音源と納期を相談して決めます。</p>':'');
 s3(songTitle(s),'日程の見通し',h,[{sp:1},{t:'閉じる',c:'btn',f:()=>hide('sheet3')}]);
 document.getElementById('s3Body').querySelectorAll('[data-schedule-date]').forEach(b=>b.onclick=()=>{if(RO||VIEW_ONLY)return;const key=b.dataset.scheduleDate;if(['selection','teacher','lyricCheck','credits'].includes(key))productionTaskEditor(s,key);else productionDateEditor(s,key)});
}
function productionDateEditor(s,key){
 if(RO||VIEW_ONLY)return;
 const report=productionReport(s);
 if(['vocal','master'].includes(key)&&report.node[key].state==='done'){
  const n=report.node[key],initial=n.date;
  s3(songTitle(s),n.label+'の完了日','<label class="quick-field">完了日<input class="inp" type="date" id="productionCompletedDate" value="'+esc(initial)+'"></label><p class="hint">予定日とは分けて、実際に終わった日を記録します。</p>',[{t:'キャンセル',c:'btn',f:()=>hide('sheet3')},{sp:1},{t:'保存',c:'btn pri',f:()=>{if(RO||VIEW_ONLY||!S.songs.includes(s))return;const latest=productionReport(s).node[key];if(latest.state!=='done'||latest.date!==initial)return toast('記録が更新されています。開き直してください');const value=document.getElementById('productionCompletedDate').value;if(value&&!ShinkouProduction.validDate(value))return toast('日付を確認してください');s.production||={};s.production.tasks||={};s.production.tasks[key]||={};s.production.tasks[key].completedAt=value;productionAfterSave(s);hide('sheet3');toast('完了日を保存しました')}}]);return;
 }
 if(key==='vocal'){productionScheduleEditor(s,'vo');return}
 const anchor=key==='master'?'mastering':key,label=ANCHORS[anchor]||anchor,kind=s.production?.dateKinds?.[anchor]||'registered';
 const initial=s.dates?.[anchor]||'';
 s3(songTitle(s),label,'<label class="quick-field">'+label+'<input type="date" class="inp" id="productionAnchor" value="'+esc(initial)+'"></label><label class="quick-field">日程の状態<select class="inp" id="productionAnchorKind" aria-label="日程の状態">'+[['registered','登録日（確定状況未確認）'],['tentative','仮'],['confirmed','確定']].map(([v,l])=>'<option value="'+v+'" '+(kind===v?'selected':'')+'>'+l+'</option>').join('')+'</select></label>'+(key==='release'&&!initial&&relOf(s)?'<p class="hint">案件の発売日 '+esc(relOf(s))+' を使用中。入力するとこの曲の日付を優先します。</p>':''),[{t:'キャンセル',c:'btn',f:()=>hide('sheet3')},{sp:1},{t:'保存',c:'btn pri',f:()=>{if(RO||VIEW_ONLY||!S.songs.includes(s))return;const d=document.getElementById('productionAnchor').value;if(d&&!ShinkouProduction.validDate(d))return toast('日付を確認してください');if(initial!==(s.dates?.[anchor]||'')||kind!==(s.production?.dateKinds?.[anchor]||'registered'))return toast('日程が更新されました。開き直してください');s.dates||={};s.dates[anchor]=d;s.production||={};s.production.dateKinds||={};s.production.dateKinds[anchor]=document.getElementById('productionAnchorKind').value;productionAfterSave(s);hide('sheet3');toast('保存しました')}}]);
}

