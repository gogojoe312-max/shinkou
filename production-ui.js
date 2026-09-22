/* 曲ごとの進み具合、対応待ち、次の一手。AIを呼ばず記録から表示する。 */
function productionReport(s){return ShinkouProduction.report(s,{today:D.today(),release:relOf(s)})}
function productionDate(d){return d?.value?(d.value.slice(0,4)===D.today().slice(0,4)?D.md(d.value):d.value.replace(/-/g,'/')):d?.kind==='completed'?'日付未登録':'未定'}
function productionDateKind(d){return d?.kind==='completed'?'完了':d?.value?({confirmed:'確定',tentative:'仮',target:'目安',registered:'登録日'}[d.kind]||'登録日'):''}
function productionButton(s,kind,key,cls,html){return '<button type="button" class="production-button '+cls+'" data-production-song="'+esc(s.id)+'" data-production-kind="'+kind+'" data-production-key="'+esc(key||'')+'">'+html+'</button>'}
function productionSnapshot(s){
 const r=productionReport(s),b=(kind,key,cls,html)=>productionButton(s,kind,key,cls,html);
 const progress='<div class="production-progress" aria-label="制作の進み具合">'+r.groups.filter(g=>g.id!=='delivery').map(g=>b('group',g.id,'production-phase '+(g.done?'complete':''),'<span class="phase-mark" aria-hidden="true">'+(g.done?'✓':'')+'</span><span><b>'+esc(g.label)+'</b><small>'+esc(g.text)+'</small></span><span class="phase-chevron" aria-hidden="true">›</span>')).join('')+'</div>';
 const finish=r.custom?(r.archive?'制作完了':'制作状況を確認'):r.audioComplete?'音源制作は完了'+(r.admin.length?' · 確認・提出が残っています':''):r.node.mix.state==='done'?'ミックス済み · マスタリングへ':r.node.edit.state==='done'?'歌の編集済み · 仕上げの準備へ':r.node.vocal.state==='done'?'歌録り済み · 歌割・編集へ':r.node.recordable.done?'歌録りの準備を確認':r.node.selection.done?'曲が決定 · 制作を進めています':'制作状況を確認';
 let h='<div class="production-current">'+esc(finish)+'</div>'+progress;
 const ds=r.custom?[['open','公演初日'],['rehearsal','リハーサル'],['deliver','音源提出']]:[['release','発売日'],['vocal','歌録り'],...(r.mv?[['mv','MV撮影']]:[]),['master','マスタリング'],...((r.dates.live.value||!r.dates.release.value)?[['live','ライブ披露']]:[])];
 const dateHTML='<div class="production-dates">'+ds.map(([key,label])=>b('date',key,'production-date','<small>'+label+'</small><strong>'+esc(productionDate(r.dates[key]))+'</strong><em class="date-'+r.dates[key].kind+'">'+productionDateKind(r.dates[key])+'</em>')).join('')+'</div>';
 if(!RO){
  h+='<div class="production-balls"><span class="production-caption">今のボール</span>'+(r.balls.length?r.balls.slice(0,2).map(x=>b('task',x.id,'production-ball','<b>'+esc(x.who)+'</b><span>'+esc(x.label)+'</span>')).join('')+(r.balls.length>2?b('all','','production-more','ほか '+(r.balls.length-2)+'件の対応待ち'):''):'<p>対応中の記録はまだありません。状況を伝えるか、作業をタップして記録できます。</p>')+'</div>';
  if(r.actions[0]){const a=r.actions[0];h+=b('task',a.id,'production-next','<small>次にすること</small><strong>'+esc(a.title)+' <span aria-hidden="true">›</span></strong><p>'+esc(a.reason)+'</p>')}
  h+=dateHTML;
  if(!r.custom)h+='<div class="production-admin">'+['lyricCheck','credits','invoice'].map(id=>{const n=r.node[id];return b('task',id,n.done?'complete':'','<span aria-hidden="true">'+(n.done?'✓':'○')+'</span> '+({lyricCheck:'歌詞確認',credits:'クレジット',invoice:'請求書'}[id])+(n.done?'済み':''))}).join('')+'</div>';
  h+='<div class="production-footer">'+b('all','','production-more','作業・提出をすべて見る')+b('dates','','production-more','日程の見通し')+'</div>';
 }
 if(RO)h+=dateHTML;
 return h;
}
function productionOverview(list){
 const sorted=list.map(s=>({s,r:productionReport(s)})).sort((a,b)=>Number(a.r.archive)-Number(b.r.archive)||(a.r.actions[0]?.score??1000)-(b.r.actions[0]?.score??1000));
 return '<section class="song-overview production-overview"><div class="overview-heading"><h2>'+(RO?'楽曲の状況':'進行中の曲')+'</h2>'+(!RO?'<button class="completed-filter" data-show-completed aria-pressed="'+(V.fin==='show')+'">'+(V.fin==='show'?'完了を含む':'完了した曲も見る')+'</button>':'')+'</div><p class="production-intro">'+(RO?'制作の進み具合と、主要な日程。':'進み具合、対応待ち、次の一手。')+'</p>'+(!RO?'<button class="production-report-entry" data-production-report><span>状況を伝える・相談する</span><span aria-hidden="true">↑</span></button>':'')+'<div class="snapshot-list">'+(sorted.map(({s,r})=>'<article class="production-card"><button class="snapshot-title" data-brief-song="'+esc(s.id)+'"><small>'+esc(s.artist||'アーティスト未登録')+'</small><b>'+esc(songTitle(s))+'</b></button>'+songSnapshotHTML(s)+'</article>').join('')||'<div class="production-empty"><b>表示する曲がありません</b><p>絞り込み条件を確認するか、「＋」から曲を追加してください。</p></div>')+'</div></section>';
}
function wireProduction(root){
 root.querySelectorAll('[data-production-report]').forEach(b=>b.onclick=()=>{if(RO)return;cur=null;plannerSheet()});
 root.querySelectorAll('[data-production-song]').forEach(b=>b.onclick=()=>{
   const s=S.songs.find(s=>s.id===b.dataset.productionSong);if(!s)return;
   const kind=b.dataset.productionKind,key=b.dataset.productionKey;
   if(RO){if(kind==='group')productionReadGroup(s,key);return}
   if(kind==='task')productionTaskEditor(s,key);else if(kind==='group'||kind==='all')productionTasksSheet(s,kind==='all'?'all':key);else if(kind==='dates')productionDatesSheet(s);else if(kind==='date')productionDateEditor(s,key);
 });
}
function productionAfterSave(s){mark();refreshCompletion(s)}
function productionReadGroup(s,id){const r=productionReport(s),g=r.groups.find(x=>x.id===id);if(!g)return;s3(songTitle(s),g.label,'<p class="production-read-summary">'+esc(g.text)+'</p>',[{sp:1},{t:'閉じる',c:'btn',f:()=>hide('sheet3')}])}
function productionTask(s,id){return ShinkouProduction.task(s,id,{today:D.today(),release:relOf(s)})}
function productionTaskRow(s,n){
 const done=n.state==='done',na=n.state==='na';
 const status=done?'完了'+(n.date?' · '+productionDate({value:n.date}):''):(ShinkouProduction.STATES[n.state]||'一部完了')+(n.owner?' · '+n.owner:'')+(n.due.value?' · '+productionDate(n.due)+' '+productionDateKind(n.due):'');
 const late=!n.done&&n.left!==null&&n.left<0?' · '+(-n.left)+'日超過':'';
 return '<div class="production-task-row'+(na?' not-applicable':'')+'"><button type="button" class="production-check '+(done?'complete':'')+'" aria-label="'+esc(n.label+(done?'を未完了に戻す':'を完了にする'))+'" role="checkbox" aria-checked="'+(n.state==='partial'?'mixed':done)+'" data-production-check="'+esc(n.id)+'" '+(na?'disabled':'')+'><span aria-hidden="true">'+(done?'✓':na?'−':n.state==='partial'?'−':'')+'</span></button><button type="button" class="production-task-name" data-production-edit="'+esc(n.id)+'"><b>'+esc(n.label)+'</b><small>'+esc(status)+'<em>'+esc(late)+'</em></small></button></div>';
}
function productionToggleTask(s,id,redraw){
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
 if(group==='chorus')h+='<label class="quick-field">コーラス<select class="inp" id="productionChorus" aria-label="コーラスの必要性"><option value="required">あり（通常）</option><option value="none" '+(s.production?.chorus==='none'?'selected':'')+'>なし</option></select></label>';
 h+='<button class="production-more production-button" id="productionAddTask">＋ 作業を追加</button>';
 s3(songTitle(s),group==='all'?'作業・確認・提出':groups[0]?.label||'作業',h,[{sp:1},{t:'閉じる',c:'btn',f:()=>hide('sheet3')}]);
 const body=document.getElementById('s3Body');wireProductionTasks(s,body,group,()=>{const top=body.scrollTop;productionTasksSheet(s,group);body.scrollTop=top});
 for(const [element,field]of [['productionInstruments','instruments'],['productionChorus','chorus']]){const el=document.getElementById(element);if(el)el.onchange=()=>{if(RO||!S.songs.includes(s))return;s.production||={};s.production[field]=el.value;productionAfterSave(s);productionTasksSheet(s,group)}}
 document.getElementById('productionAddTask').onclick=()=>productionAddTask(s,group);
}
function productionField(label,id,value,type='text'){return '<label class="quick-field">'+esc(label)+'<input class="inp" id="'+id+'" type="'+type+'" value="'+esc(value||'')+'"></label>'}
function productionTaskEditor(s,id,back='all'){
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
 document.getElementById('productionState').onchange=()=>stateChanged=true;
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
   syncSlotAssign(s);syncSlotCredits(s);if(key==='instrec')syncInstKids(s);syncLists();productionAfterSave(s);back();toast('日程を保存しました');
  }}]);document.getElementById('scheduleAdd').onclick=()=>{read();slots.push(add());draw()};
 };draw();
}
function productionSongInfo(s){
 if(RO)return;const fields=['title','work','artist','director','projectId','sort','single','sortSet','mvEnabled'],initial=JSON.stringify(fields.map(k=>s[k]));
 const h=productionField('正式タイトル','songInfoTitle',s.title)+productionField('仮題・原題','songInfoWork',s.work)+productionField('アーティスト','songInfoArtist',s.artist)+'<label class="quick-field">案件<select class="inp" id="songInfoProject" aria-label="案件"><option value="">未設定</option>'+S.projects.map(p=>'<option value="'+esc(p.id)+'" '+(p.id===s.projectId?'selected':'')+'>'+esc(projTitle(p))+'</option>').join('')+'</select></label>'+productionField('担当ディレクター','songInfoDirector',s.director)+(s.use==='live'?'':'<label class="quick-field">曲の種類<select class="inp" id="songInfoSort" aria-label="曲の種類">'+SORTS.map(([v,l])=>'<option value="'+v+'" '+(sortOf(s)===v?'selected':'')+'>'+l+'</option>').join('')+'</select></label><label class="quick-check"><input type="checkbox" id="songInfoMV" '+(songHasMV(s)?'checked':'')+'>MVあり</label><p class="hint">アルバムリードなど、必要な曲だけMVありにできます。</p>');
 s3(songTitle(s),'曲の情報',h,[{t:'キャンセル',c:'btn',f:()=>hide('sheet3')},{sp:1},{t:'保存',c:'btn pri',f:()=>{
  if(RO||!S.songs.includes(s))return;if(initial!==JSON.stringify(fields.map(k=>s[k])))return toast('曲の情報が更新されました。開き直してください');
  for(const [k,id]of [['title','songInfoTitle'],['work','songInfoWork'],['artist','songInfoArtist'],['director','songInfoDirector'],['projectId','songInfoProject']])s[k]=document.getElementById(id).value.trim();
  if(s.use!=='live'){s.sort=document.getElementById('songInfoSort').value;s.single=s.sort==='single';s.sortSet=true;s.mvEnabled=document.getElementById('songInfoMV').checked}
  mAdd('artist',s.artist);mAdd('director',s.director);syncLists();productionAfterSave(s);hide('sheet3');render();if(cur===s)drawSong();toast('保存しました');
 }}]);const sort=document.getElementById('songInfoSort');if(sort)sort.onchange=()=>document.getElementById('songInfoMV').checked=sort.value==='single';
}
function productionDraftSheet(s,n,back){
 if(RO)return;const kind=n.channel||'email',draft=ShinkouProduction.draft(s,n,kind);
 const text=()=>document.getElementById('productionDraftBody').value;
 s3(songTitle(s),'連絡文の下書き','<label class="quick-field">連絡手段<select class="inp" id="draftChannel" aria-label="連絡手段"><option value="email" '+(kind==='email'?'selected':'')+'>メール</option><option value="line" '+(kind==='line'?'selected':'')+'>LINE</option></select></label><label class="quick-field">文面<textarea class="inp production-draft" id="productionDraftBody" aria-label="文面" rows="12">'+esc((kind==='email'?'件名：'+draft.subject+'\n\n':'')+draft.body)+'</textarea></label><p class="hint">宛先・添付資料・日程を確認してから、ご自身で送信してください。内容はここで編集できます。</p><p class="hint" id="draftCopyStatus" role="status"></p>',[{t:'戻る',c:'btn',f:()=>productionTaskEditor(s,n.id,back)},{sp:1},{t:'コピー',c:'btn pri',f:async()=>{try{await navigator.clipboard.writeText(text());document.getElementById('draftCopyStatus').textContent='コピーしました。メールやLINEに貼り付けられます。'}catch{const input=document.getElementById('productionDraftBody');input.focus();input.select();document.getElementById('draftCopyStatus').textContent='文面を選択しました。長押ししてコピーしてください。'}}}]);
 document.getElementById('draftChannel').onchange=e=>{const d=ShinkouProduction.draft(s,n,e.target.value);document.getElementById('productionDraftBody').value=(e.target.value==='email'?'件名：'+d.subject+'\n\n':'')+d.body};
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
