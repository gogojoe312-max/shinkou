/* 曲ごとの進み具合、対応待ち、次の一手。AIを呼ばず記録から表示する。 */
function productionReport(s){return ShinkouProduction.report(s,{today:D.today(),release:relOf(s)})}
function productionDate(d){return d?.value?(d.value.slice(0,4)===D.today().slice(0,4)?D.md(d.value):d.value.replace(/-/g,'/')):'未定'}
function productionDateKind(d){return d?.value?({confirmed:'確定',tentative:'仮',target:'目安',registered:'登録日'}[d.kind]||'登録日'):''}
function productionButton(s,kind,key,cls,html){return '<button type="button" class="production-button '+cls+'" data-production-song="'+esc(s.id)+'" data-production-kind="'+kind+'" data-production-key="'+esc(key||'')+'">'+html+'</button>'}
function productionSnapshot(s){
 const r=productionReport(s),b=(kind,key,cls,html)=>productionButton(s,kind,key,cls,html);
 const progress='<div class="production-progress" aria-label="制作の進み具合">'+r.groups.filter(g=>g.id!=='delivery').map(g=>b('group',g.id,'production-phase '+(g.done?'complete':''),'<span class="phase-mark" aria-hidden="true">'+(g.done?'✓':'')+'</span><span><b>'+esc(g.label)+'</b><small>'+esc(g.text)+'</small></span><span class="phase-chevron" aria-hidden="true">›</span>')).join('')+'</div>';
 const finish=r.audioComplete?'音源制作は完了'+(r.admin.length?' · 確認・提出が残っています':''):r.node.mix.state==='done'?'ミックス済み · マスタリングへ':r.node.edit.state==='done'?'歌の編集済み · 仕上げの準備へ':r.node.vocal.state==='done'?'歌録り済み · 歌割・編集へ':r.node.recordable.done?'歌録りの準備を確認':r.node.selection.done?'曲が決定 · 制作を進めています':'制作状況を確認';
 let h='<div class="production-current">'+esc(finish)+'</div>'+progress;
 const ds=[['release','発売日'],['vocal','歌録り'],...(r.mv?[['mv','MV撮影']]:[]),['master','マスタリング'],...((r.dates.live.value||!r.dates.release.value)?[['live','ライブ披露']]:[])];
 const dateHTML='<div class="production-dates">'+ds.map(([key,label])=>b('date',key,'production-date','<small>'+label+'</small><strong>'+esc(productionDate(r.dates[key]))+'</strong><em class="date-'+r.dates[key].kind+'">'+productionDateKind(r.dates[key])+'</em>')).join('')+'</div>';
 if(!RO){
  h+='<div class="production-balls"><span class="production-caption">今のボール</span>'+(r.balls.length?r.balls.slice(0,2).map(x=>b('task',x.id,'production-ball','<b>'+esc(x.who)+'</b><span>'+esc(x.label)+'</span>')).join('')+(r.balls.length>2?b('all','','production-more','ほか '+(r.balls.length-2)+'件の対応待ち'):''):'<p>対応中の記録はまだありません。状況を伝えるか、作業をタップして記録できます。</p>')+'</div>';
  if(r.actions[0]){const a=r.actions[0];h+=b('task',a.id,'production-next','<small>次にすること</small><strong>'+esc(a.title)+' <span aria-hidden="true">›</span></strong><p>'+esc(a.reason)+'</p>')}
  h+=dateHTML;
  h+='<div class="production-admin">'+['lyricCheck','credits','invoice'].map(id=>{const n=r.node[id];return b('task',id,n.done?'complete':'','<span aria-hidden="true">'+(n.done?'✓':'○')+'</span> '+({lyricCheck:'歌詞確認',credits:'クレジット',invoice:'請求書'}[id])+(n.done?'済み':''))}).join('')+'</div>';
  h+='<div class="production-footer">'+b('all','','production-more','作業・提出をすべて見る')+b('dates','','production-more','日程の見通し')+'</div>';
 }
 if(RO)h+=dateHTML;
 return h;
}
function productionOverview(list){
 const sorted=list.map(s=>({s,r:productionReport(s)})).sort((a,b)=>Number(a.r.archive)-Number(b.r.archive)||(a.r.actions[0]?.score??1000)-(b.r.actions[0]?.score??1000));
 return '<section class="song-overview production-overview"><div class="overview-heading"><h2>'+(RO?'楽曲の状況':'進行中の曲')+'</h2>'+(!RO?'<button class="completed-filter" data-show-completed aria-pressed="'+(V.fin==='show')+'">'+(V.fin==='show'?'完了を含む':'完了した曲も見る')+'</button>':'')+'</div><p class="production-intro">'+(RO?'制作の進み具合と、主要な日程。':'進み具合、対応待ち、次の一手。')+'</p><div class="snapshot-list">'+(sorted.map(({s,r})=>'<article class="production-card"><button class="snapshot-title" data-brief-song="'+esc(s.id)+'"><small>'+esc(s.artist||'アーティスト未登録')+'</small><b>'+esc(songTitle(s))+'</b></button>'+songSnapshotHTML(s)+'</article>').join('')||'<div class="production-empty"><b>表示する曲がありません</b><p>絞り込み条件を確認するか、「＋」から曲を追加してください。</p></div>')+'</div></section>';
}
function wireProduction(root){
 root.querySelectorAll('[data-production-song]').forEach(b=>b.onclick=()=>{
   const s=S.songs.find(s=>s.id===b.dataset.productionSong);if(!s)return;
   const kind=b.dataset.productionKind,key=b.dataset.productionKey;
   if(RO){if(kind==='group')productionReadGroup(s,key);return}
   if(key.startsWith('legacy:')){productionLegacy(s,key.slice(7));return}
   if(kind==='task')productionTaskEditor(s,key);else if(kind==='group'||kind==='all')productionTasksSheet(s,kind==='all'?'all':key);else if(kind==='dates')productionDatesSheet(s);else if(kind==='date')productionDateEditor(s,key);
 });
}
function productionLegacy(s,key){if(RO)return;hide('sheet3');openSong(s.id);songTab='flow';flowDone=true;const x=stages(s).find(x=>x.k===key);if(x){gpOpen[x.gp]=true;stOpen=key}drawSong();if(key)document.querySelector('[data-srow="'+CSS.escape(key)+'"]')?.scrollIntoView({block:'nearest'})}
function productionAfterSave(s){mark();refreshCompletion(s)}
function productionReadGroup(s,id){const r=productionReport(s),g=r.groups.find(x=>x.id===id);if(!g)return;s3(songTitle(s),g.label,'<p class="production-read-summary">'+esc(g.text)+'</p>',[{sp:1},{t:'閉じる',c:'btn',f:()=>hide('sheet3')}])}
function productionTaskRow(s,n){return '<div class="production-task-row"><button class="production-check '+(n.done?'complete':'')+'" aria-label="'+esc(n.label+(n.done?'を未完了に戻す':'を完了にする'))+'" role="checkbox" aria-checked="'+n.done+'" data-production-check="'+n.id+'" '+(n.state==='na'?'disabled':'')+'><span aria-hidden="true">'+(n.done?'✓':'')+'</span></button><button class="production-task-name" data-production-edit="'+n.id+'"><b>'+esc(n.label)+'</b><small>'+esc((ShinkouProduction.STATES[n.state]||'一部完了')+(n.owner?' · '+n.owner:'')+(n.due.value?' · '+productionDate(n.due)+' '+productionDateKind(n.due):''))+'</small></button></div>'}
function productionTasksSheet(s,group='all'){
 if(RO)return;const r=productionReport(s),groups=r.groups.filter(g=>group==='all'||g.id===group);
 const h=groups.map(g=>'<section class="production-task-section"><h3>'+esc(g.label)+'</h3>'+r.nodes.filter(n=>n.group===g.id).map(n=>productionTaskRow(s,n)).join('')+'</section>').join('')+(group==='all'&&r.extra.length?'<section class="production-task-section"><h3>その他の登録済み作業</h3>'+r.extra.map(x=>'<button class="production-legacy-row" data-production-legacy="'+esc(x.k)+'"><span>'+esc(plainStage(x.n))+'</span><small>'+(s.stages?.[x.k]?.done?'完了':s.stages?.[x.k]?.st?'対応中':'記録を確認')+' ›</small></button>').join('')+'</section>':'')+(group==='instrument'?'<label class="quick-field">この曲の楽器録音<select class="inp" id="productionInstruments">'+[['unknown','必要か未確認'],['required','必要'],['none','不要']].map(([v,l])=>'<option value="'+v+'" '+((s.production?.instruments||'unknown')===v?'selected':'')+'>'+l+'</option>').join('')+'</select></label>':'')+(group==='chorus'?'<label class="quick-field">この曲のコーラス<select class="inp" id="productionChorus"><option value="required">あり（通常）</option><option value="none" '+(s.production?.chorus==='none'?'selected':'')+'>なし</option></select></label>':'');
 s3(songTitle(s),group==='all'?'作業・確認・提出':groups[0]?.label||'作業',h,[{sp:1},{t:'閉じる',c:'btn',f:()=>hide('sheet3')}]);
 const body=document.getElementById('s3Body');
 body.querySelectorAll('[data-production-edit]').forEach(b=>b.onclick=()=>productionTaskEditor(s,b.dataset.productionEdit,group));
 body.querySelectorAll('[data-production-check]').forEach(b=>b.onclick=()=>{
  if(RO||!S.songs.includes(s))return;const id=b.dataset.productionCheck,n=productionReport(s).node[id];
  if(n.derived)return productionTaskEditor(s,id,group);
  
  // 差分だけを戻す。メモや同期による別項目の変更を巻き戻さない。
  const before=ShinkouCore.copy(s),state=n.done?'todo':'done';
  try{ShinkouProduction.apply(s,id,{state},D.today());n.keys.forEach(k=>setKidDone(s,k,state==='done'))}catch(e){toast(e.message);return}
  const diff=[];function walk(a,z,path){if(ShinkouCore.equal(a,z))return;if((a===undefined||a&&typeof a==='object'&&!Array.isArray(a))&&z&&typeof z==='object'&&!Array.isArray(z)){for(const k of new Set([...Object.keys(a||{}),...Object.keys(z)]))walk(a?.[k],z[k],path.concat(k))}else diff.push({path,before:ShinkouCore.copy(a),after:ShinkouCore.copy(z)})}walk(before,s,[]);
  logAdd(n.label+(state==='done'?'を完了: ':'を未完了へ: ')+songTitle(s));productionAfterSave(s);productionTasksSheet(s,group);
  toast(n.label+(state==='done'?'を完了しました':'を未完了に戻しました'),{label:'元に戻す',run:()=>{if(RO)return;const current=S.songs.find(x=>x.id===s.id);const get=(o,p)=>p.reduce((v,k)=>v?.[k],o);if(!current||diff.some(d=>!ShinkouCore.equal(get(current,d.path),d.after)))return toast('記録が更新されています。現在の状態を確認してください');for(const d of diff){let obj=current;for(const k of d.path.slice(0,-1))obj=obj[k];if(d.before===undefined)delete obj[d.path.at(-1)];else obj[d.path.at(-1)]=ShinkouCore.copy(d.before)}productionAfterSave(current);if(document.getElementById('s3Body').querySelector('[data-production-check]'))productionTasksSheet(current,group);toast('元に戻しました')}});
 });
 for(const [element,field]of [['productionInstruments','instruments'],['productionChorus','chorus']]){const el=document.getElementById(element);if(el)el.onchange=()=>{if(RO||!S.songs.includes(s))return;s.production||={};s.production[field]=el.value;productionAfterSave(s);productionTasksSheet(s,group)}}
 body.querySelectorAll('[data-production-legacy]').forEach(b=>b.onclick=()=>productionLegacy(s,b.dataset.productionLegacy));
}
function productionTaskEditor(s,id,back='all'){
 if(RO)return;const r=productionReport(s),n=r.node[id];if(!n)return;
 const rec=s.production?.tasks?.[id]||{},field=(label,id,value,type='text')=>'<label class="quick-field">'+label+'<input class="inp" id="'+id+'" type="'+type+'" value="'+esc(value||'')+'"></label>';
 let h='<label class="quick-field">状態<select class="inp" id="productionState">'+Object.entries(ShinkouProduction.STATES).filter(([k])=>k!=='na'||!n.keys.length).map(([k,v])=>'<option value="'+k+'" '+(n.state===k?'selected':'')+'>'+v+'</option>').join('')+'</select></label>';
 if(n.state==='partial')h='<p class="hint">一部の作業は完了済みです。状態を変えなければ、個別の完了記録をそのまま保ちます。</p>'+h;
 if(n.derived)h+='<p class="hint">アレンジ最終完成の記録から、歌録り可能と判断しています。</p>';
 h+=field('いま対応する人（自分／相手の名前）','productionOwner',n.owner)+field('連絡先の相手の名前','productionRecipient',n.recipient);
 h+='<label class="quick-field">連絡手段<select class="inp" id="productionChannel"><option value="">未設定</option><option value="email" '+(n.channel==='email'?'selected':'')+'>メール</option><option value="line" '+(n.channel==='line'?'selected':'')+'>LINE</option></select></label>';
 h+=field('締切・予定日','productionDue',n.due.kind==='target'?'':n.due.value,'date')+'<label class="quick-field">日程の状態<select class="inp" id="productionDueKind">'+[['registered','登録日（確定状況未確認）'],['tentative','仮'],['confirmed','確定']].map(([v,l])=>'<option value="'+v+'" '+(n.due.kind===v?'selected':'')+'>'+l+'</option>').join('')+'</select></label>';
 if(n.due.kind==='target'&&n.due.value)h+='<p class="hint">逆算の目安 '+esc(productionDate(n.due))+' · '+esc(n.due.source)+'。予定日は別に入力できます。</p>';
 if(n.blockers.length)h+='<p class="production-caution">先に確認：'+n.blockers.map(k=>esc(r.node[k].label)).join('、')+'。過去の作業は自動で完了にしません。</p>';
 h+='<label class="quick-field">メモ<textarea class="inp" id="productionMemo" rows="3">'+esc(n.memo)+'</textarea></label><button class="btn" id="productionDraft">入力を保存して連絡文を作る</button><p class="hint">メール・LINEの下書きを作成します。送信や依頼済みへの変更は行いません。</p>';
 const snapshot=JSON.stringify({tasks:s.production?.tasks?.[id],stages:n.keys.map(k=>s.stages?.[k])});let stateChanged=false;
 const read=()=>{const v=id=>document.getElementById(id).value;return {...(stateChanged?{state:v('productionState')}:{}),owner:v('productionOwner').trim(),recipient:v('productionRecipient').trim(),channel:v('productionChannel'),due:v('productionDue'),dueKind:v('productionDueKind'),memo:v('productionMemo')}};
 const save=()=>{if(RO||!S.songs.includes(s))return false;if(snapshot!==JSON.stringify({tasks:s.production?.tasks?.[id],stages:n.keys.map(k=>s.stages?.[k])})){toast('記録が更新されました。開き直して確認してください');return false}const p=read(),e=ShinkouProduction.validatePatch(p);if(e){toast(e);return false}try{ShinkouProduction.apply(s,id,p,D.today());if(p.state)n.keys.forEach(k=>setKidDone(s,k,p.state==='done'))}catch(e){toast(e.message);return false}logAdd(n.label+'を更新: '+songTitle(s));productionAfterSave(s);return true};
 s3(songTitle(s),n.label,h,[{t:'戻る',c:'btn',f:()=>productionTasksSheet(s,back)},{sp:1},{t:'保存',c:'btn pri',f:()=>{if(save()){productionTasksSheet(s,back);toast('保存しました')}}}]);
 document.getElementById('productionState').onchange=()=>stateChanged=true;
 document.getElementById('productionDraft').onclick=()=>{if(save())productionDraftSheet(s,productionReport(s).node[id],back)};
}
function productionDraftSheet(s,n,back){
 if(RO)return;const kind=n.channel||'email',draft=ShinkouProduction.draft(s,n,kind);
 const text=()=>document.getElementById('productionDraftBody').value;
 s3(songTitle(s),'連絡文の下書き','<label class="quick-field">連絡手段<select class="inp" id="draftChannel"><option value="email" '+(kind==='email'?'selected':'')+'>メール</option><option value="line" '+(kind==='line'?'selected':'')+'>LINE</option></select></label><label class="quick-field">文面<textarea class="inp production-draft" id="productionDraftBody" rows="12">'+esc((kind==='email'?'件名：'+draft.subject+'\n\n':'')+draft.body)+'</textarea></label><p class="hint">宛先・添付資料・日程を確認してから、ご自身で送信してください。内容はここで編集できます。</p><p class="hint" id="draftCopyStatus" role="status"></p>',[{t:'戻る',c:'btn',f:()=>productionTaskEditor(s,n.id,back)},{sp:1},{t:'コピー',c:'btn pri',f:async()=>{try{await navigator.clipboard.writeText(text());document.getElementById('draftCopyStatus').textContent='コピーしました。メールやLINEに貼り付けられます。'}catch{const input=document.getElementById('productionDraftBody');input.focus();input.select();document.getElementById('draftCopyStatus').textContent='文面を選択しました。長押ししてコピーしてください。'}}}]);
 document.getElementById('draftChannel').onchange=e=>{const d=ShinkouProduction.draft(s,n,e.target.value);document.getElementById('productionDraftBody').value=(e.target.value==='email'?'件名：'+d.subject+'\n\n':'')+d.body};
}
function productionDatesSheet(s){
 const r=productionReport(s),rows=[['selection','曲確定'],['vocal','歌録り'],...(r.mv?[['teacher','先生へ歌割・ラフ提出'],['mv','MV撮影']]:[]),['lyricCheck','歌詞確認'],['credits','クレジット提出'],['master','マスタリング'],['release','発売'],['live','ライブ披露']];
 s3(songTitle(s),'日程の見通し','<div class="production-schedule">'+rows.map(([k,l])=>'<div><span>'+l+'<small>'+esc(r.dates[k]?.source||'')+'</small></span><b>'+esc(productionDate(r.dates[k]))+'<small>'+productionDateKind(r.dates[k])+'</small></b></div>').join('')+'</div><p class="hint">目安は発売日からの逆算です。確定した予定として保存しません。半月は15日で計算し、月末はその月の末日に揃えます。</p>'+(r.liveOnly?'<p class="production-caution">発売日が未定のため、ライブ披露に必要な音源と納期を相談して決めます。発売用の逆算は使用していません。</p>':''),[{sp:1},{t:'閉じる',c:'btn',f:()=>hide('sheet3')}]);
}
function productionDateEditor(s,key){
 if(RO)return;
 if(key==='vocal'){editSnapshot(s,'date','vo');return}
 const anchor=key==='master'?'mastering':key,label=ANCHORS[anchor]||anchor,kind=s.production?.dateKinds?.[anchor]||'registered';
 const initial=s.dates?.[anchor]||'';
 s3(songTitle(s),label,'<label class="quick-field">'+label+'<input type="date" class="inp" id="productionAnchor" value="'+esc(initial)+'"></label><label class="quick-field">日程の状態<select class="inp" id="productionAnchorKind">'+[['registered','登録日（確定状況未確認）'],['tentative','仮'],['confirmed','確定']].map(([v,l])=>'<option value="'+v+'" '+(kind===v?'selected':'')+'>'+l+'</option>').join('')+'</select></label>'+(key==='release'&&!initial&&relOf(s)?'<p class="hint">案件の発売日 '+esc(relOf(s))+' を使用中。入力するとこの曲の日付を優先します。</p>':''),[{t:'キャンセル',c:'btn',f:()=>hide('sheet3')},{sp:1},{t:'保存',c:'btn pri',f:()=>{if(RO||!S.songs.includes(s))return;const d=document.getElementById('productionAnchor').value;if(d&&!ShinkouProduction.validDate(d))return toast('日付を確認してください');if(initial!==(s.dates?.[anchor]||''))return toast('日程が更新されました。開き直してください');s.dates||={};s.dates[anchor]=d;s.production||={};s.production.dateKinds||={};s.production.dateKinds[anchor]=document.getElementById('productionAnchorKind').value;productionAfterSave(s);hide('sheet3');toast('保存しました')}}]);
}
