/* 曲ごとの進み具合、対応待ち、次の一手。AIを呼ばず記録から表示する。 */
function productionReport(s){return ShinkouProduction.report(s,{today:D.today(),release:relOf(s)})}
function productionDate(d){return d?.value?(d.value.slice(0,4)===D.today().slice(0,4)?D.md(d.value):d.value.replace(/-/g,'/')):d?.kind==='completed'?'日付未登録':'未定'}
function productionDateKind(d){return d?.kind==='completed'?'完了':d?.value?({confirmed:'確定',tentative:'仮',target:'目安',registered:'登録日'}[d.kind]||'登録日'):''}
function productionButton(s,kind,key,cls,html){return '<button type="button" class="production-button '+cls+'" data-production-song="'+esc(s.id)+'" data-production-kind="'+kind+'" data-production-key="'+esc(key||'')+'">'+html+'</button>'}
function productionSnapshot(s){
 const r=productionReport(s),b=(kind,key,cls,html)=>productionButton(s,kind,key,cls,html),contacts=(s.workflow?.communications||[]).filter(c=>c.state!=='done').map(c=>({id:c.id,kind:'contact',who:c.state==='waiting'?(c.person||'相手')+'の返答待ち':c.state==='reply'?'自分の返信待ち':'内容を確認',label:c.subject||c.person})),balls=[...contacts,...r.balls];
 const progress='<div class="production-progress" aria-label="制作の進み具合">'+r.groups.filter(g=>g.id!=='delivery').map(g=>b('group',g.id,'production-phase '+(g.done?'complete':''),'<span class="phase-mark" aria-hidden="true">'+(g.done?'✓':'')+'</span><span><b>'+esc(g.label)+'</b><small>'+esc(g.text)+'</small></span><span class="phase-chevron" aria-hidden="true">›</span>')).join('')+'</div>';
 const finish=r.custom?(r.archive?'制作完了':'制作状況を確認'):r.audioComplete?'音源制作は完了'+(!r.archive?' · 確認・提出が残っています':''):r.node.mix.state==='done'?'ミックス済み · マスタリングへ':r.node.edit.state==='done'?'歌の編集済み · 仕上げの準備へ':r.node.vocal.state==='done'?'歌録り済み · 歌割・編集へ':r.node.recordable.done?'歌録りの準備を確認':r.node.selection.done?'曲が決定 · 制作を進めています':'制作状況を確認';
 let h='<div class="production-current">'+esc(finish)+'</div>'+progress;
 const ds=r.custom?[['open','公演初日'],['rehearsal','リハーサル'],['deliver','音源提出']]:[['release','発売日'],['vocal','歌録り'],...(r.mv?[['mv','MV撮影']]:[]),['master','マスタリング'],...((r.dates.live.value||!r.dates.release.value)?[['live','ライブ披露']]:[])];
 const dateHTML='<div class="production-dates">'+ds.map(([key,label])=>b('date',key,'production-date','<small>'+label+'</small><strong>'+esc(productionDate(r.dates[key]))+'</strong><em class="date-'+r.dates[key].kind+'">'+productionDateKind(r.dates[key])+'</em>')).join('')+'</div>';
 if(!RO){
  h+='<div class="production-balls"><span class="production-caption">今のボール</span>'+(balls.length?balls.slice(0,2).map(x=>b(x.kind||'task',x.id,'production-ball','<b>'+esc(x.who)+'</b><span>'+esc(x.label)+'</span>')).join('')+(balls.length>2?b(contacts.length?'workflow':'all','','production-more','ほか '+(balls.length-2)+'件の対応待ち'):''):'<p>対応中の記録はまだありません。状況を伝えるか、作業をタップして記録できます。</p>')+'</div>';
  if(r.actions[0]){const a=r.actions[0];h+=b('task',a.id,'production-next','<small>次にすること</small><strong>'+esc(a.title)+' <span aria-hidden="true">›</span></strong><p>'+esc(a.reason)+'</p>')}
  h+=dateHTML;
  if(!r.custom)h+='<div class="production-admin">'+['lyricCheck','credits'].map(id=>{const n=r.node[id];return b('task',id,n.done?'complete':'','<span aria-hidden="true">'+(n.done?'✓':'○')+'</span> '+({lyricCheck:'歌詞確認',credits:'クレジット'}[id])+(n.done?'済み':''))}).join('')+'</div>';
  if(r.node.invoice&&typeof invoiceSummary==='function')h+=invoiceSummary(s);
  h+='<div class="production-footer">'+b('all','','production-more','作業・提出をすべて見る')+b('dates','','production-more','日程の見通し')+b('workflow','','production-more','連絡・資料')+'</div>';
 }
 if(RO)h+=dateHTML;
 return h;
}
function productionIsLive(s){return s.use==='live'||s.templateId==='tpl_show'||isShow(projOf(s.projectId))}
function productionOverview(list){
 const live=V.use==='live',mixed=V.use==='all',sorted=list.filter(s=>!productionIsLive(s)).map(s=>({s,r:productionReport(s)})).sort((a,b)=>Number(a.r.archive)-Number(b.r.archive)||(a.r.actions[0]?.score??1000)-(b.r.actions[0]?.score??1000));
 const cards=sorted.map(({s})=>'<article class="production-card"><button class="snapshot-title" data-brief-song="'+esc(s.id)+'"><small>'+esc(s.artist||'アーティスト未登録')+'</small><b>'+esc(songTitle(s))+'</b></button>'+songSnapshotHTML(s)+'</article>').join('');
 const today=typeof workflowToday==='function'?workflowToday(list):'';
 const heading=live?'ライブ公演':mixed?'制作の状況':RO?'楽曲の状況':'進行中の曲';
 return '<section class="song-overview production-overview"><div class="overview-heading"><h2>'+heading+'</h2>'+(live&&!RO?'<button class="show-add-button" data-show-new aria-label="公演を追加">＋</button>':'')+(!RO?'<button class="completed-filter" data-show-completed aria-pressed="'+(V.fin==='show')+'">'+(V.fin==='show'?'完了を含む':live?'完了した公演も見る':'完了した曲も見る')+'</button>':'')+'</div>'+(live?'':'<p class="production-intro">'+(RO?'制作の進み具合と、主要な日程。':'進み具合、対応待ち、次の一手。')+'</p>')+(!RO?'<button class="production-report-entry" data-production-report><span>状況を伝える・相談する</span><span aria-hidden="true">↑</span></button>':'')+today+(live?'':(mixed&&cards?'<h3 class="production-section-title">原盤</h3>':'')+'<div class="snapshot-list">'+(cards||(!mixed?'<div class="production-empty"><b>表示する曲がありません</b><p>絞り込み条件を確認してください。</p></div>':''))+'</div>')+((live||mixed)?'<section class="production-live">'+productionLiveContents(list)+'</section>':'')+'</section>';
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
  g.visible=g.items.filter(x=>visible.has(x.s.id)&&!x.r.archive).sort((a,b)=>(a.r.actions[0]?.score??1000)-(b.r.actions[0]?.score??1000)||(a.s.ord||0)-(b.s.ord||0));
  g.completed=g.items.filter(x=>scope.has(x.s.id)&&x.r.archive);
  g.deadline=g.items.flatMap(({s,r})=>r.nodes.filter(n=>!n.done&&!n.actionCoveredBy&&n.due.value).map(n=>({s,n}))).sort((a,b)=>a.n.due.value.localeCompare(b.n.due.value))[0];
  g.open=productionShowDate(g,'open');g.rehearsal=productionShowDate(g,'rehearsal');
  return g;
 }).filter(g=>{
  if(g.items.length)return g.visible.length>0||(g.completed.length>0&&(V.fin==='show'||!g.archive));
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
function productionShowItem({s,r}){
 const current=r.nodes.find(n=>!n.done&&['revision','requested','received','review','doing','waiting'].includes(n.state)),last=r.nodes.filter(n=>n.state==='done').at(-1),next=r.actions[0],n=next&&r.node[next.id];
 const status=r.archive?'準備完了':current?current.label+' · '+ShinkouProduction.STATES[current.state]:last?last.label+'まで完了':'状況未確認';
 const who=r.balls.map(productionBallText).filter((v,i,a)=>a.indexOf(v)===i).join(' / ');
 const detail=!r.archive&&n?'<small class="show-item-next">次：'+esc(next.title)+(n.due.value?' · <em class="'+(n.left<0?'late':'')+'">'+esc(productionDate(n.due))+' '+productionDateKind(n.due)+'</em>':'')+'</small>':'';
 return '<button class="show-item'+(r.archive?' complete':'')+'" data-brief-song="'+esc(s.id)+'"><span><b>'+esc(songTitle(s))+'</b><small class="show-item-status">'+(r.archive?'✓ ':'')+esc(status)+'</small>'+(!RO&&who?'<small class="show-item-who">'+esc(who)+'</small>':'')+detail+'</span><span class="show-item-chevron" aria-hidden="true">›</span></button>';
}
function productionLiveContents(list){
 const groups=productionShowGroups(list);
 const header=V.use==='all'?'<div class="show-section-heading"><h3 class="production-section-title">ライブ公演</h3>'+(!RO?'<button class="production-more" data-show-new>＋ 公演を追加</button>':'')+'</div>':'';
 return header+((V.q||V.dir!=='__all'||V.who!=='all')?'<p class="show-filter-note">絞り込み中。日程は公演全体の情報です。</p>':'')+(groups.map(g=>{
  const title=g.p?projTitle(g.p):'公演未設定',state=g.archive?'準備完了':g.items.length?'準備中':'準備内容未登録';
  const date=(label,d)=>'<div><small>'+label+'</small><b>'+esc(d.different&&!d.value?'要確認':productionDate(d))+'</b><em>'+esc(d.different?'個別の日程あり':d.source||productionDateKind(d))+'</em></div>';
  const next=g.deadline,ball=g.visible.flatMap(x=>x.r.balls.map(b=>({s:x.s,b})))[0];
  return '<article class="show-card" data-show-card="'+esc(g.id)+'"><header><div><small>'+esc(g.p?.artist||g.artist||'アーティスト未登録')+'</small><h3>'+esc(title)+'</h3></div><span class="show-status '+(g.archive?'complete':'')+'">'+state+'</span></header>'+(g.p?.venue?'<p class="show-venue">'+esc(g.p.venue)+'</p>':'')+'<div class="show-dates">'+date('公演初日',g.open)+date('リハーサル',g.rehearsal)+'</div>'+(next?'<button class="show-deadline" data-brief-song="'+esc(next.s.id)+'"><span><small>次の締切</small><b>'+esc(songTitle(next.s))+' · '+esc(next.n.label)+'</b></span><strong class="'+(next.n.left<0?'late':'')+'">'+esc(productionDate(next.n.due))+'<small>'+productionDateKind(next.n.due)+'</small></strong></button>':'')+(!RO&&ball?'<p class="show-current-ball">'+esc(productionBallText(ball.b))+' · '+esc(songTitle(ball.s))+'</p>':'')+'<details class="show-preparation" data-show-fold="items:'+esc(g.id)+'"><summary>制作物・完了分を見る<span aria-hidden="true">⌄</span></summary><div class="show-items">'+g.visible.map(productionShowItem).join('')+'</div>'+(g.completed.length?'<details class="show-completed" data-show-completed-group="'+esc(g.id)+'" data-show-fold="completed:'+esc(g.id)+'"><summary>完了した制作物を見る<span aria-hidden="true">⌄</span></summary>'+g.completed.map(productionShowItem).join('')+'</details>':'')+(!g.items.length?'<p class="hint">SE・歌割・カラオケなど、この公演で準備するものを追加できます。</p>':'')+(!g.p?'<p class="hint">制作物を開き、「情報を編集」から公演を設定できます。</p>':'')+(!RO&&g.p?'<footer><button class="production-more" data-show-edit="'+esc(g.p.id)+'">公演情報・日程</button><button class="production-more" data-show-add="'+esc(g.p.id)+'">＋ 制作物を追加</button></footer>':'')+'</details></article>';
 }).join('')||'<div class="production-empty"><b>表示する公演がありません</b><p>'+((V.q||V.dir!=='__all'||V.who!=='all')?'絞り込み条件を確認してください。':'公演を追加すると、制作物と日程をまとめて確認できます。')+'</p></div>');
}
function refreshProductionShows(){
 const container=document.querySelector('.production-live');if(!container)return;
 const main=document.getElementById('main'),top=main.scrollTop,opened=new Set([...container.querySelectorAll('[data-show-fold][open]')].map(x=>x.dataset.showFold));
 container.innerHTML=productionLiveContents(pool());
 container.querySelectorAll('[data-show-fold]').forEach(x=>x.open=opened.has(x.dataset.showFold));
 wireProduction(container);wireBriefLinks(container);main.scrollTop=top;
}
function productionSaveShow(p,patch){
 if(RO)return false;
 const old={...p};Object.assign(p,patch);
 // 個別指定や確定・仮の日程を、公演の編集で書き換えない。
 for(const s of S.songs.filter(s=>s.projectId===p.id&&productionIsLive(s))){
  s.dates||={};
  for(const [field,key]of [['release','open'],['rehearsal','rehearsal']])if(old[field]!==p[field]&&(!s.dates[key]||(s.dates[key]===old[field]&&!(s.production?.dateKinds?.[key]&&s.production.dateKinds[key]!=='registered'))))s.dates[key]=p[field]||'';
 }
 return true;
}
function productionShowEditor(id){
 if(RO)return;const existing=id?projOf(id):null;if(id&&!existing)return;
 const p=existing||{id:uid(),mode:'live',kind:'ライブ',custom:'',artist:'',release:'',rehearsal:'',venue:'',note:'',director:V.dir!=='__all'?V.dir:''},initial=JSON.stringify(p);
 const fields=[['公演名','custom'],['アーティスト','artist'],['公演初日','release','date'],['リハーサル','rehearsal','date'],['会場','venue']];
 const h=fields.map(([label,k,type])=>productionField(label,'show_'+k,p[k],type)).join('')+'<label class="quick-field">メモ<textarea class="inp" id="show_note" rows="3">'+esc(p.note||'')+'</textarea></label><p class="hint">個別に変えた制作物の日程は保持します。</p>';
 s3('ライブ公演',existing?'公演情報・日程':'公演を追加',h,[{t:'キャンセル',c:'btn',f:()=>hide('sheet3')},{sp:1},{t:'保存',c:'btn pri',f:()=>{
  if(RO)return;if(existing&&(!S.projects.includes(p)||initial!==JSON.stringify(p)))return toast('公演が更新されています。開き直してください');
  const patch=Object.fromEntries(fields.map(([,k])=>[k,document.getElementById('show_'+k).value.trim()]));patch.note=document.getElementById('show_note').value.trim();
  if(!patch.custom)return toast('公演名を入力してください');if([patch.release,patch.rehearsal].some(d=>d&&!ShinkouProduction.validDate(d)))return toast('日付を確認してください');
  if(!productionSaveShow(p,patch))return;if(!existing)S.projects.push(p);mark();hide('sheet3');render();toast('公演を保存しました');
 }}]);
}
function productionShowAddItem(id){
 if(RO)return;const p=projOf(id);if(!p||!isShow(p))return;
 s3(projTitle(p),'制作物を追加','<label class="quick-field">準備するもの<select class="inp" id="show_item_type">'+LTYPES.map(t=>'<option value="'+esc(t)+'">'+esc(t)+'</option>').join('')+'</select></label>'+productionField('名前（必要な場合）','show_item_title','')+'<p class="hint">複数のSEなどは名前を付けて分けられます。</p>',[{t:'キャンセル',c:'btn',f:()=>hide('sheet3')},{sp:1},{t:'追加',c:'btn pri',f:()=>{
  if(RO||!S.projects.includes(p))return;const type=document.getElementById('show_item_type').value;if(!LTYPES.includes(type))return;
  const s=newSong({templateId:'tpl_show'});s.title=document.getElementById('show_item_title').value.trim()||type;s.ltype=type;s.stageList=showStages(type);s.projectId=p.id;s.artist=p.artist||'';s.director=p.director||'';s.dates.open=p.release||'';s.dates.rehearsal=p.rehearsal||'';s.dlFixed=true;
  S.songs.push(s);mark();hide('sheet3');render();openSong(s.id);
 }}]);
}
function wireProduction(root){
 if(typeof wireWorkflow==='function')wireWorkflow(root);
 root.querySelectorAll('[data-show-new]').forEach(b=>b.onclick=()=>productionShowEditor());
 root.querySelectorAll('[data-show-edit]').forEach(b=>b.onclick=()=>productionShowEditor(b.dataset.showEdit));
 root.querySelectorAll('[data-show-add]').forEach(b=>b.onclick=()=>productionShowAddItem(b.dataset.showAdd));
 root.querySelectorAll('[data-production-report]').forEach(b=>b.onclick=()=>{if(RO)return;cur=null;plannerSheet()});
 root.querySelectorAll('[data-production-song]').forEach(b=>b.onclick=()=>{
   const s=S.songs.find(s=>s.id===b.dataset.productionSong);if(!s)return;
   const kind=b.dataset.productionKind,key=b.dataset.productionKey;
   if(RO){if(kind==='group')productionReadGroup(s,key);return}
   if(kind==='task')productionTaskEditor(s,key);else if(kind==='contact')workflowContact(s,key);else if(kind==='workflow')workflowHub(s);else if(kind==='folder')productionFolderSheet(s);else if(kind==='group'||kind==='all')productionTasksSheet(s,kind==='all'?'all':key);else if(kind==='dates')productionDatesSheet(s);else if(kind==='date')productionDateEditor(s,key);
 });
}
function productionAfterSave(s){mark();refreshCompletion(s);if(typeof refreshWorkflow==='function')refreshWorkflow()}
function productionReadGroup(s,id){const r=productionReport(s),g=r.groups.find(x=>x.id===id);if(!g)return;s3(songTitle(s),g.label,'<p class="production-read-summary">'+esc(g.text)+'</p>',[{sp:1},{t:'閉じる',c:'btn',f:()=>hide('sheet3')}])}
function productionTask(s,id){return ShinkouProduction.task(s,id,{today:D.today(),release:relOf(s)})}
function productionTaskRow(s,n){
 if(n.id==='invoice')return '<div class="production-task-row"><button type="button" class="production-task-name invoice-task" data-production-edit="invoice"><b>請求書</b><small>'+esc(n.invoice.title)+'</small></button><span aria-hidden="true">›</span></div>';
 const done=n.state==='done',na=n.state==='na';
 const status=n.actionCoveredBy?'依頼済みの記録あり · 関連する制作状況から判断':done?'完了'+(n.date?' · '+productionDate({value:n.date}):''):(ShinkouProduction.STATES[n.state]||'一部完了')+(n.owner?' · '+n.owner:'')+(n.due.value?' · '+productionDate(n.due)+' '+productionDateKind(n.due):'');
 const late=!n.done&&!n.actionCoveredBy&&n.left!==null&&n.left<0?' · '+(-n.left)+'日超過':'';
 return '<div class="production-task-row'+(na?' not-applicable':'')+'"><button type="button" class="production-check '+(done?'complete':'')+'" aria-label="'+esc(n.label+(done?'を未完了に戻す':'を完了にする'))+'" role="checkbox" aria-checked="'+(n.state==='partial'?'mixed':done)+'" data-production-check="'+esc(n.id)+'" '+(na?'disabled':'')+'><span aria-hidden="true">'+(done?'✓':na?'−':n.state==='partial'?'−':'')+'</span></button><button type="button" class="production-task-name" data-production-edit="'+esc(n.id)+'"><b>'+esc(n.label)+'</b><small>'+esc(status)+'<em>'+esc(late)+'</em></small></button></div>';
}
function productionToggleTask(s,id,redraw){
 if(id==='invoice'){invoiceSheet(s);return}
 if(RO||!S.songs.includes(s))return;const n=productionTask(s,id);if(!n||n.state==='na')return;
 if(n.derived){toast('アレンジ最終完成から判断しています。項目名から記録を確認できます');return}
 const before=ShinkouCore.copy(s),state=n.done?'todo':'done';
 try{ShinkouProduction.apply(s,id,{state},D.today());n.keys.forEach(k=>setKidDone(s,k,state==='done'))}catch(e){toast(e.message);return}
 const diff=[];function walk(a,z,path){if(ShinkouCore.equal(a,z))return;if((a===undefined||a&&typeof a==='object'&&!Array.isArray(a))&&z&&typeof z==='object'&&!Array.isArray(z)){for(const k of new Set([...Object.keys(a||{}),...Object.keys(z)]))walk(a?.[k],z[k],path.concat(k))}else diff.push({path,before:ShinkouCore.copy(a),after:ShinkouCore.copy(z)})}walk(before,s,[]);
 logAdd(n.label+(state==='done'?'を完了: ':'を未完了へ: ')+songTitle(s));productionAfterSave(s);redraw?.();const revision=aiViewRevision;
 toast(n.label+(state==='done'?'を完了しました':'を未完了に戻しました'),{label:'元に戻す',run:()=>{
  if(RO)return;const current=S.songs.find(x=>x.id===s.id),get=(o,p)=>p.reduce((v,k)=>v?.[k],o);
  if(!current||diff.some(d=>!ShinkouCore.equal(get(current,d.path),d.after)))return toast('記録が更新されています。現在の状態を確認してください');
  for(const d of diff){let obj=current;for(const k of d.path.slice(0,-1))obj=obj[k];if(d.before===undefined)delete obj[d.path.at(-1)];else obj[d.path.at(-1)]=ShinkouCore.copy(d.before)}
  productionAfterSave(current);if(current===s&&aiViewRevision===revision&&document.getElementById('sheet3').classList.contains('on'))redraw?.();toast('元に戻しました');
 }});
}
function wireProductionTasks(s,body,back,redraw){
 body.querySelectorAll('[data-production-edit]').forEach(b=>b.onclick=()=>productionTaskEditor(s,b.dataset.productionEdit,back));
 body.querySelectorAll('[data-production-check]').forEach(b=>b.onclick=()=>productionToggleTask(s,b.dataset.productionCheck,redraw));
}
function productionGroupNodes(r,group){
 const order={plan:['theme','order','stage:sdemo','lyricOrder','lyrics','guide','demo','selection'],arrange:['full','recordable','stage:stemO','stems','stage:stemM','arrange'],vocal:['vocalBooking','vocal','split','stage:voes','edit','stage:revo','stage:revodb','stage:revoes','stage:revoR','stage:revoT','stage:revoP'],chorus:['chorusRequest','stage:cho','chorus','stage:choes'],instrument:['stage:instrec','instrument'],finish:['stage:paraO','stage:paraR','stage:paraM','stage:paraS','mixBooking','materials','stage:livemix','mix','master']};
 const ids=order[group]||[],rank=n=>ids.includes(n.id)?ids.indexOf(n.id):999;
 return r.nodes.filter(n=>n.group===group).sort((a,b)=>rank(a)-rank(b));
}
function productionTasksSheet(s,group='all'){
 if(RO)return;const r=productionReport(s),groups=r.groups.filter(g=>group==='all'||g.id===group);
 let h=groups.map(g=>{const list=productionGroupNodes(r,g.id).filter(n=>n.state!=='na');return list.length?'<section class="production-task-section">'+(group==='all'?'<h3>'+esc(g.label)+'</h3>':'')+list.map(n=>productionTaskRow(s,n)).join('')+'</section>':''}).join('');
 const omitted=r.nodes.filter(n=>n.state==='na'&&(group==='all'||n.group===group));
 if(!h)h='<p class="hint">この曲では対象の作業はありません。</p>';
 if(omitted.length)h+='<details class="production-omitted"><summary>対象外の作業</summary>'+omitted.map(n=>productionTaskRow(s,n)).join('')+'</details>';
 if(group==='instrument')h+='<label class="quick-field">楽器録音<select class="inp" id="productionInstruments" aria-label="楽器録音の必要性">'+[['unknown','必要か未確認'],['required','あり'],['none','なし']].map(([v,l])=>'<option value="'+v+'" '+((s.production?.instruments||'unknown')===v?'selected':'')+'>'+l+'</option>').join('')+'</select></label>';
 if(group==='chorus')h+='<label class="quick-field">コーラス<select class="inp" id="productionChorus" aria-label="コーラスの必要性"><option value="required">あり（通常）</option><option value="none" '+(s.production?.chorus==='none'?'selected':'')+'>なし</option></select></label><button class="production-more production-button" id="productionDeferChorus">コーラス関係をまとめて未定にする</button>';
 h+='<button class="production-more production-button" id="productionAddTask">＋ 作業を追加</button>';
 s3(songTitle(s),group==='all'?'作業・確認・提出':groups[0]?.label||'作業',h,[{sp:1},{t:'閉じる',c:'btn',f:()=>hide('sheet3')}]);
 const body=document.getElementById('s3Body');wireProductionTasks(s,body,group,()=>{const top=body.scrollTop;productionTasksSheet(s,group);body.scrollTop=top});
 for(const [element,field]of [['productionInstruments','instruments'],['productionChorus','chorus']]){const el=document.getElementById(element);if(el)el.onchange=()=>{if(RO||!S.songs.includes(s))return;s.production||={};s.production[field]=el.value;productionAfterSave(s);productionTasksSheet(s,group)}}
 document.getElementById('productionAddTask').onclick=()=>productionAddTask(s,group);
 const defer=document.getElementById('productionDeferChorus');if(defer)defer.onclick=()=>aiPreview({ops:[{t:'production_defer',s:S.songs.indexOf(s),group:'chorus'}],ans:'コーラスの未完了の予定日・締切・返事待ちを外し、今日の確認から除きます。',note:'完了済みの実績・クレジット・メモは残します。'},[],'コーラス関係をまとめて未定にする',s.id);
}
function productionField(label,id,value,type='text'){return '<label class="quick-field">'+esc(label)+'<input class="inp" id="'+id+'" type="'+type+'" value="'+esc(value||'')+'"></label>'}
function productionTaskEditor(s,id,back='all'){
 if(id==='invoice'){invoiceSheet(s);return}
 if(RO)return;const r=productionReport(s),n=productionTask(s,id);if(!n)return;
 if(n.state==='na'){
  s3(songTitle(s),n.label,'<p class="hint">この曲では対象外です。保存した日程・メモ・完了記録は残っています。</p>',[{t:'戻る',c:'btn',f:()=>productionTasksSheet(s,back)},{sp:1},{t:'この曲でも使う',c:'btn pri',f:()=>{
   if(RO||!S.songs.includes(s))return;s.production||={};if(n.group==='instrument')s.production.instruments='required';if(n.group==='chorus')s.production.chorus='required';if(['teacher','rough','almost'].includes(id))s.production.choreography=true;
   ShinkouProduction.setIncluded(s,id,true);productionAfterSave(s);productionTasksSheet(s,back);
  }}]);return;
 }
 const field=productionField,schedule=n.keys.map(k=>(s.stageList||[]).find(x=>x.k===k&&isMulti(x))).filter(Boolean);
 let h='<label class="quick-field">状態<select class="inp" id="productionState" aria-label="状態">'+(n.state==='partial'?'<option value="partial" selected>一部完了</option>':'')+Object.entries(ShinkouProduction.STATES).filter(([k])=>k!=='na').map(([k,v])=>'<option value="'+k+'" '+(n.state===k?'selected':'')+'>'+v+'</option>').join('')+'</select></label>';
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
  if(RO||!S.songs.includes(s))return false;if(snapshot!==JSON.stringify({tasks:s.production?.tasks?.[id],stages:n.keys.map(k=>s.stages?.[k]),list:s.stageList})){toast('記録が更新されました。開き直して確認してください');return false}
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
 if(RO)return;const groups=productionReport(s).groups;
 s3(songTitle(s),'作業を追加',productionField('作業名','productionNewLabel','')+'<label class="quick-field">まとめる場所<select class="inp" id="productionNewGroup" aria-label="まとめる場所">'+groups.map(g=>'<option value="'+esc(g.id)+'" '+(g.id===back?'selected':'')+'>'+esc(g.label)+'</option>').join('')+'</select></label>',[{t:'戻る',c:'btn',f:()=>productionTasksSheet(s,back)},{sp:1},{t:'追加',c:'btn pri',f:()=>{
  if(RO||!S.songs.includes(s))return;const n=document.getElementById('productionNewLabel').value.trim();if(!n)return toast('作業名を入力してください');const group=document.getElementById('productionNewGroup').value,k='custom_'+uid();s.stageList.push({k,n,role:'me',gp:groups.find(g=>g.id===group)?.label||'作業',productionGroup:group});stg(s,k);productionAfterSave(s);productionTaskEditor(s,'stage:'+k,back);
 }}]);
}
function productionScheduleEditor(s,key,back=()=>hide('sheet3')){
 if(RO)return;const x=(s.stageList||[]).find(x=>x.k===key&&isMulti(x));if(!x)return toast('日程を登録する作業が見つかりません');
 const initial=JSON.stringify(s.stages?.[key]||{}),slots=ShinkouCore.copy(s.stages?.[key]?.slots||[]);let dateKind=s.production?.dateKinds?.[key]||'registered';
 const add=()=>({slotId:uid(),date:'',note:'',who:'',done:false});if(!slots.length)slots.push(add());
 const read=()=>{slots.forEach((v,i)=>{v.date=document.getElementById('scheduleDate'+i).value;v.who=document.getElementById('scheduleWho'+i).value.trim();v.note=document.getElementById('scheduleNote'+i).value.trim();v.swait=document.getElementById('scheduleWait'+i).checked});dateKind=document.getElementById('scheduleKind').value};
 const draw=()=>{
  const h=slots.map((v,i)=>'<section class="production-slot"><h3>日程 '+(i+1)+'</h3>'+productionField('日付','scheduleDate'+i,v.date,'date')+productionField(whoPh(x),'scheduleWho'+i,v.who)+productionField(isInstRec(x)?'パート':'補足','scheduleNote'+i,v.note)+'<label class="quick-check"><input type="checkbox" id="scheduleWait'+i+'" '+(v.swait?'checked':'')+'>返事待ち</label>'+(v.done?'<p class="hint">実施済みの記録あり</p>':'')+'</section>').join('')+'<button class="btn" id="scheduleAdd">＋ 日程を追加</button><label class="quick-field">日程の状態<select class="inp" id="scheduleKind" aria-label="日程の状態">'+[['registered','登録日（確定状況未確認）'],['tentative','仮'],['confirmed','確定']].map(([v,l])=>'<option value="'+v+'" '+(dateKind===v?'selected':'')+'>'+l+'</option>').join('')+'</select></label><p class="hint">日程を保存しても、録音・編集を完了にはしません。</p>';
  s3(songTitle(s),productionTask(s,'stage:'+key).label,h,[{t:'戻る',c:'btn',f:back},{sp:1},{t:'保存',c:'btn pri',f:()=>{
   if(RO||!S.songs.includes(s))return;if(initial!==JSON.stringify(s.stages?.[key]||{}))return toast('日程が更新されました。開き直してください');read();
   if(slots.some(v=>v.date&&!ShinkouProduction.validDate(v.date)))return toast('日付を確認してください');
   const old=s.stages?.[key]?.slots||[];if(key==='instrec')slots.forEach(v=>{if(!v.date&&!v.note&&!v.who&&old.some(o=>o.slotId===v.slotId&&(o.date||o.note||o.who)))v.note='パート未定'});
   stg(s,key).slots=slots.filter(v=>v.date||v.note||v.who||old.some(o=>o.slotId===v.slotId));s.production||={};s.production.dateKinds||={};s.production.dateKinds[key]=dateKind;
   if(stg(s,key).workState==='undecided'&&slots.some(v=>v.date&&!v.done))ShinkouProduction.apply(s,'stage:'+key,{state:'todo'},D.today());
   syncSlotAssign(s);syncSlotCredits(s);if(key==='instrec')syncInstKids(s);syncLists();productionAfterSave(s);back();toast('日程を保存しました');
  }}]);document.getElementById('scheduleAdd').onclick=()=>{read();slots.push(add());draw()};
 };draw();
}
function productionSongInfo(s){
 if(RO)return;const fields=['title','work','artist','director','projectId','sort','single','sortSet','mvEnabled','dropboxUrl'],initial=JSON.stringify(fields.map(k=>s[k]));
 const h=productionField('正式タイトル','songInfoTitle',s.title)+productionField('仮題・原題','songInfoWork',s.work)+productionField('アーティスト','songInfoArtist',s.artist)+'<label class="quick-field">案件<select class="inp" id="songInfoProject" aria-label="案件"><option value="">未設定</option>'+S.projects.map(p=>'<option value="'+esc(p.id)+'" '+(p.id===s.projectId?'selected':'')+'>'+esc(projTitle(p))+'</option>').join('')+'</select></label>'+productionField('担当ディレクター','songInfoDirector',s.director)+(s.use==='live'?'':'<label class="quick-field">曲の種類<select class="inp" id="songInfoSort" aria-label="曲の種類">'+SORTS.map(([v,l])=>'<option value="'+v+'" '+(sortOf(s)===v?'selected':'')+'>'+l+'</option>').join('')+'</select></label><label class="quick-check"><input type="checkbox" id="songInfoMV" '+(songHasMV(s)?'checked':'')+'>MVあり</label><p class="hint">アルバムリードなど、必要な曲だけMVありにできます。</p>');
 s3(songTitle(s),'曲の情報',h+productionField('曲のDropboxフォルダ','songInfoDropbox',s.dropboxUrl,'url'),[{t:'キャンセル',c:'btn',f:()=>hide('sheet3')},{sp:1},{t:'保存',c:'btn pri',f:()=>{
  if(RO||!S.songs.includes(s))return;if(initial!==JSON.stringify(fields.map(k=>s[k])))return toast('曲の情報が更新されました。開き直してください');
  let folder;try{folder=ShinkouProduction.dropboxURL(document.getElementById('songInfoDropbox').value)}catch(e){return toast(e.message)}
  s.dropboxUrl=folder;
  for(const [k,id]of [['title','songInfoTitle'],['work','songInfoWork'],['artist','songInfoArtist'],['director','songInfoDirector'],['projectId','songInfoProject']])s[k]=document.getElementById(id).value.trim();
  if(s.use!=='live'){s.sort=document.getElementById('songInfoSort').value;s.single=s.sort==='single';s.sortSet=true;s.mvEnabled=document.getElementById('songInfoMV').checked}
  mAdd('artist',s.artist);mAdd('director',s.director);syncLists();productionAfterSave(s);hide('sheet3');render();if(cur===s)drawSong();toast('保存しました');
 }}]);const sort=document.getElementById('songInfoSort');if(sort)sort.onchange=()=>document.getElementById('songInfoMV').checked=sort.value==='single';
}
function productionDraftSheet(s,n,back){
 if(RO)return;const draft=ShinkouProduction.draft(s,n,n.channel||'email'),initial=JSON.stringify(s.workflow||{});
 workflowDraft(s,draft,()=>productionTaskEditor(s,n.id,back),()=>{
  if(!wfGuard(s,initial))return false;
  WF.saveCommunication(s,{id:uid(),subject:n.label,person:n.recipient,channel:n.channel||'email',state:'waiting',due:n.due.kind==='target'?'':n.due.value,taskId:n.id,memo:n.memo});productionAfterSave(s);return true;
 },{channel:n.channel});
}
function productionFolderURL(s){try{return ShinkouProduction.dropboxURL(s.dropboxUrl)}catch{return ''}}
function productionFolderLink(s){const url=productionFolderURL(s);return url?'<a class="production-more folder-link" href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">曲のDropboxフォルダを開く ↗</a>':''}
function productionFolderControls(s){return '<div class="production-folder">'+(productionFolderLink(s)||productionButton(s,'folder','','production-more','Dropboxフォルダを登録'))+(productionFolderURL(s)?productionButton(s,'folder','','production-more','リンク編集'):'')+'</div>'}
function productionFolderSheet(s){
 if(RO)return;const initial=s.dropboxUrl;
 s3(songTitle(s),'Dropboxフォルダ',productionField('この曲のフォルダURL','productionFolderURL',s.dropboxUrl,'url')+'<p class="hint">Dropboxで曲のフォルダの「リンクをコピー」を押し、ここに貼り付けてください。曲の状況・請求書の画面から直接開けます。</p>'+productionFolderLink(s)+'<p class="hint">資料は「連絡・資料」から確認できます。共有権限はここでは変更しません。</p>',[{t:'キャンセル',c:'btn',f:()=>hide('sheet3')},{sp:1},{t:'保存',c:'btn pri',f:()=>{
  if(RO||!S.songs.includes(s))return;if(initial!==s.dropboxUrl)return toast('フォルダのリンクが更新されています。開き直してください');
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
 const r=productionReport(s),rows=r.custom?[['open','公演初日'],['rehearsal','リハーサル'],['deliver','音源提出'],['live','ライブ披露']]:[['selection','曲確定'],['vocal','歌録り'],...(r.mv?[['teacher','先生へ歌割・ラフ提出'],['mv','MV撮影']]:[]),['lyricCheck','歌詞確認'],['credits','クレジット提出'],['master','マスタリング'],['release','発売'],['live','ライブ披露']];
 for(const key of Object.keys(ANCHORS)){if(['mastering','mv'].includes(key)||rows.some(([k])=>k===key)||!s.dates?.[key])continue;rows.push([key,ANCHORS[key]]);r.dates[key]={value:s.dates[key],kind:s.production?.dateKinds?.[key]||'registered'}}
 const h='<div class="production-schedule">'+rows.map(([k,l])=>'<button type="button" data-schedule-date="'+k+'"><span>'+l+'<small>'+esc(r.dates[k]?.source||'')+'</small></span><b>'+esc(productionDate(r.dates[k]))+'<small>'+productionDateKind(r.dates[k])+'</small></b></button>').join('')+'</div>'+(!r.custom?'<p class="hint">目安は発売日からの逆算です。日程を押して、予定日や確定・仮を記録できます。</p>':'')+(r.liveOnly?'<p class="hint">発売日が未定のため、ライブ披露に必要な音源と納期を相談して決めます。</p>':'');
 s3(songTitle(s),'日程の見通し',h,[{sp:1},{t:'閉じる',c:'btn',f:()=>hide('sheet3')}]);
 document.getElementById('s3Body').querySelectorAll('[data-schedule-date]').forEach(b=>b.onclick=()=>{if(RO)return;const key=b.dataset.scheduleDate;if(['selection','teacher','lyricCheck','credits'].includes(key))productionTaskEditor(s,key);else productionDateEditor(s,key)});
}
function productionDateEditor(s,key){
 if(RO)return;
 const report=productionReport(s);
 if(['vocal','master'].includes(key)&&report.node[key].state==='done'){
  const n=report.node[key],initial=n.date;
  s3(songTitle(s),n.label+'の完了日','<label class="quick-field">完了日<input class="inp" type="date" id="productionCompletedDate" value="'+esc(initial)+'"></label><p class="hint">予定日とは分けて、実際に終わった日を記録します。</p>',[{t:'キャンセル',c:'btn',f:()=>hide('sheet3')},{sp:1},{t:'保存',c:'btn pri',f:()=>{if(RO||!S.songs.includes(s))return;const latest=productionReport(s).node[key];if(latest.state!=='done'||latest.date!==initial)return toast('記録が更新されています。開き直してください');const value=document.getElementById('productionCompletedDate').value;if(value&&!ShinkouProduction.validDate(value))return toast('日付を確認してください');s.production||={};s.production.tasks||={};s.production.tasks[key]||={};s.production.tasks[key].completedAt=value;productionAfterSave(s);hide('sheet3');toast('完了日を保存しました')}}]);return;
 }
 if(key==='vocal'){productionScheduleEditor(s,'vo');return}
 const anchor=key==='master'?'mastering':key,label=ANCHORS[anchor]||anchor,kind=s.production?.dateKinds?.[anchor]||'registered';
 const initial=s.dates?.[anchor]||'';
 s3(songTitle(s),label,'<label class="quick-field">'+label+'<input type="date" class="inp" id="productionAnchor" value="'+esc(initial)+'"></label><label class="quick-field">日程の状態<select class="inp" id="productionAnchorKind" aria-label="日程の状態">'+[['registered','登録日（確定状況未確認）'],['tentative','仮'],['confirmed','確定']].map(([v,l])=>'<option value="'+v+'" '+(kind===v?'selected':'')+'>'+l+'</option>').join('')+'</select></label>'+(key==='release'&&!initial&&relOf(s)?'<p class="hint">案件の発売日 '+esc(relOf(s))+' を使用中。入力するとこの曲の日付を優先します。</p>':''),[{t:'キャンセル',c:'btn',f:()=>hide('sheet3')},{sp:1},{t:'保存',c:'btn pri',f:()=>{if(RO||!S.songs.includes(s))return;const d=document.getElementById('productionAnchor').value;if(d&&!ShinkouProduction.validDate(d))return toast('日付を確認してください');if(initial!==(s.dates?.[anchor]||'')||kind!==(s.production?.dateKinds?.[anchor]||'registered'))return toast('日程が更新されました。開き直してください');s.dates||={};s.dates[anchor]=d;s.production||={};s.production.dateKinds||={};s.production.dateKinds[anchor]=document.getElementById('productionAnchorKind').value;productionAfterSave(s);hide('sheet3');toast('保存しました')}}]);
}
