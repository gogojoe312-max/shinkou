/* 制作の見通し。記録の読み取り・目安の計算は通信も保存も行わない。 */
(function(root){
'use strict';
const invoices=root.ShinkouInvoices||(typeof module!=='undefined'?require('./invoices.js'):null);
const STATES={unknown:'未確認',undecided:'未定',todo:'これから',doing:'作業中',requested:'依頼済み・相手待ち',received:'受領・確認前',review:'確認中',revision:'修正待ち',waiting:'日程待ち',done:'完了',na:'対象外'};
const GROUPS=[['plan','企画・デモ'],['arrange','アレンジ'],['vocal','歌録り・編集'],['chorus','コーラス'],['instrument','楽器'],['finish','仕上げ'],['delivery','確認・提出']];
const defs=[
 ['theme','曲のテーマ','plan',[],[]],['order','曲発注','plan',['gather'],['theme']],
 ['lyricOrder','歌詞発注','plan',[],['theme']],['lyrics','歌詞制作','plan',['lyric'],['lyricOrder']],
 ['guide','仮歌','plan',['kario'],['lyrics']],['demo','デモ完成','plan',['demo'],['guide']],
 ['selection','曲の確定','plan',['meeting','pick'],['demo']],
 ['full','フルサイズ化','arrange',[],['selection']],['recordable','歌録り用アレンジ','arrange',[],['full']],
 ['stems','ステム受領','arrange',['stemR'],['recordable']],['arrange','アレンジ最終完成','arrange',['arr'],['selection']],
 ['vocalBooking','歌録りの日程・スタジオ確保','vocal',['vo'],['selection']],
 ['vocal','歌録り','vocal',['vodb'],['full','recordable','stems','vocalBooking']],
 ['split','歌割','vocal',['warigo'],['vocal']],['edit','歌の編集','vocal',['rhythm','tsunagi','pitch'],['vocal']],
 ['chorusRequest','コーラス依頼','chorus',[],['edit']],['chorus','コーラス録音・編集','chorus',['chodb','choed'],['chorusRequest']],
 ['instrument','楽器録音','instrument',['instdb'],['recordable']],
 ['almost','アレンジほぼ完成','delivery',[],['recordable']],['rough','編集後ラフミックス','delivery',['rough'],['edit','almost']],
 ['teacher','先生へ歌割・ラフ提出','delivery',[],['split','rough']],
 ['mixBooking','ミックス日程確保','finish',['tdes'],['selection']],
 ['materials','全素材が揃ったか確認','finish',[],['arrange','edit','chorus','instrument']],
 ['mix','ミックス','finish',['td'],['materials','mixBooking']],['master','マスタリング','finish',['mas'],['mix']],
 ['lyricCheck','歌詞の音・文字・表記確認','delivery',[],['vocal']],
 ['credits','クレジットをデスクへ提出','delivery',[],[]],['invoice','請求書の受領・小森さんへ送付','delivery',[],[]]
].map(([id,label,group,keys,deps])=>({id,label,group,keys,deps}));
const byId=Object.fromEntries(defs.map(d=>[d.id,d]));
const validDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d+'T00:00:00Z'))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
const stamp=d=>Date.parse(d+'T00:00:00Z');
function days(d,n){return validDate(d)?new Date(stamp(d)+n*864e5).toISOString().slice(0,10):''}
function months(d,n){if(!validDate(d))return '';const x=new Date(stamp(d)),day=x.getUTCDate();x.setUTCDate(1);x.setUTCMonth(x.getUTCMonth()+n);const last=new Date(Date.UTC(x.getUTCFullYear(),x.getUTCMonth()+1,0)).getUTCDate();x.setUTCDate(Math.min(day,last));return x.toISOString().slice(0,10)}
function active(s){let excluded=false;return(s.stageList||[]).filter(x=>{if(x.d!==1)excluded=!!s.stages?.[x.k]?.excluded;return !excluded&&!s.stages?.[x.k]?.excluded})}
function keysFor(s,d){const L=active(s),out=[];for(const key of d.keys){const i=L.findIndex(x=>x.k===key);if(i<0)continue;if(L[i+1]?.d===1){for(let j=i+1;j<L.length&&L[j].d===1;j++)out.push(L[j].k)}else out.push(key)}return [...new Set(out)]}
function aggregate(states){if(!states.length)return 'unknown';if(states.every(s=>s==='done'||s==='na'))return states.every(s=>s==='na')?'na':'done';for(const state of ['revision','review','received','requested','doing','waiting','todo','undecided'])if(states.includes(state))return state;return states.includes('done')?'partial':'unknown'}
function stageState(o){if(o.done)return 'done';if(o.excluded)return 'na';if(o.st==='req')return ['revision'].includes(o.workState)?o.workState:'requested';if(o.st==='me')return ['received','review'].includes(o.workState)?o.workState:'doing';if(o.st==='wait'||o.st==='studio')return 'waiting';if(o.workState&&!['done','na','requested','revision','doing','review','received'].includes(o.workState))return o.workState;return o.prov?'review':'unknown'}
// All saved tasks use the same checklist. Stage IDs keep old records addressable.
const stageLabels={sdemo:'音デモ',stemO:'ステムの依頼',stemM:'ステムの取りまとめ',voes:'歌の編集日程',cho:'コーラスの日程確保',choes:'コーラス編集日程',instrec:'楽器録音の日程確保',revo:'追加歌録りの日程確保',revodb:'追加歌録り',revoes:'追加歌録りの編集日程',revoR:'追加歌録りのタイミング編集',revoT:'追加歌録りのつなぎ編集',revoP:'追加歌録りの音程編集',paraO:'パラデータの依頼',paraR:'パラデータの受領',paraM:'パラデータの取りまとめ',paraS:'パラデータの送付'};
const isShow=s=>s.templateId==='tpl_show'||s.use==='live';
function stageDefinition(s,x){
 const group=isShow(s)?'custom:'+(x.gp||'作業'):(GROUPS.some(g=>g[0]===x.productionGroup)?x.productionGroup:'')||(/^stem/.test(x.k)?'arrange':/^revo/.test(x.k)?'vocal':({'デモ制作':'plan','アレンジ':'arrange','VoDB':'vocal','ChoDB':'chorus','楽器DB':'instrument','ReVoDB':'vocal','仕上げ':'finish'}[x.gp]||'delivery'));
 return {id:'stage:'+x.k,label:x.productionLabel||stageLabels[x.k]||x.n||'作業',group,keys:[x.k],deps:[],stage:true};
}
function resolve(s,id){if(typeof id!=='string')return null;if(Object.hasOwn(byId,id))return byId[id];if(!id.startsWith('stage:'))return null;const x=(s.stageList||[]).find(x=>x.k===id.slice(6));return x?stageDefinition(s,x):null}
function definitions(s){
 const base=isShow(s)?[]:defs,L=s.stageList||[],covered=new Set(base.flatMap(d=>d.keys));
 for(let i=0;i<L.length;i++)if(covered.has(L[i].k))for(let j=i+1;j<L.length&&L[j].d===1;j++)covered.add(L[j].k);
 return base.concat(L.filter((x,i)=>!covered.has(x.k)&&L[i+1]?.d!==1).map(x=>stageDefinition(s,x)));
}
function stageNode(s,d,today){
 const rec=s.production?.tasks?.[d.id]||{},keys=keysFor(s,d),gs=keys.map(k=>s.stages?.[k]||{}),state=keys.length?aggregate(gs.map(stageState)):'na';
 const slots=gs.flatMap(g=>g.slots||[]).filter(v=>validDate(v.date));
 const scheduled=slots.filter(v=>!v.done).map(v=>v.date).sort()[0]||'';
 const value=gs.map(g=>g.dl).filter(validDate).sort()[0]||rec.due||scheduled;
 const due={value:state!=='undecided'&&validDate(value)?value:'',kind:rec.dueKind||'registered',source:''};
 const owner=rec.owner!==undefined?rec.owner:gs.find(g=>g.asg)?.asg||(gs.some(g=>g.st==='me')?'自分':'');
 return {...d,keys,state,done:state==='done'||state==='na',excluded:!keys.length,applicability:'required',due,owner,wait:['requested','revision'].includes(state),recipient:rec.recipient||(owner==='自分'?'':owner),channel:rec.channel||'',memo:rec.memo||gs.find(g=>g.memo)?.memo||'',date:rec.completedAt!==undefined?rec.completedAt:gs.map(g=>g.date).filter(validDate).sort().at(-1)||'',derived:false,blockers:[],left:due.value?Math.round((stamp(due.value)-stamp(today))/864e5):null};
}
function task(s,id,opt={}){const n=report(s,opt).node[id];if(n)return n;const d=resolve(s,id);return d?.stage?stageNode(s,d,opt.today||new Date().toISOString().slice(0,10)):null}
function groupIds(s,group){
 if(!GROUPS.some(([id])=>id===group))throw Error('作業のまとまりを確認してください');
 return [...new Set([...definitions(s).filter(d=>d.group===group&&d.id!=='invoice').map(d=>d.id),...(s.stageList||[]).filter(x=>stageDefinition(s,x).group===group).map(x=>'stage:'+x.k)])];
}
function groupSnapshot(s,group){const ids=groupIds(s,group),keys=[...new Set(ids.flatMap(id=>resolve(s,id).keys))];return JSON.stringify({list:s.stageList,tasks:ids.map(id=>[id,s.production?.tasks?.[id]]),stages:keys.map(k=>[k,s.stages?.[k]]),dateKinds:s.production?.dateKinds})}
function deferGroup(s,group,today){
 // Keep performed work and stable slot IDs; clear every unfinished record in this group.
 const ids=groupIds(s,group),targets=ids.filter(id=>{const n=task(s,id,{today});return n&&!n.done});
 for(const id of targets)apply(s,id,{state:'undecided'},today);
 return s;
}
function deferredIntent(text,songs,scope='global'){
 const norm=v=>String(v||'').normalize('NFKC').replace(/[\s「」『』“”"]/g,'');
 const input=norm(text),mentions=songs.map((s,i)=>({s,i,title:norm(s.title||s.work)})).filter(x=>x.title&&input.startsWith(x.title));
 const candidates=mentions.length?mentions:scope==='global'?[]:songs.map((s,i)=>({s,i,title:''})).filter(x=>x.s.id===scope);
 if(candidates.length!==1)return null;const target=candidates[0];if(scope!=='global'&&target.s.id!==scope)return null;
 const body=input.slice(target.title.length).replace(/^の/,'');
 if(!/^コーラス(?:関係|関連|全体)?(?:は|を)?(?:ひとまず|とりあえず|いったん|一旦|今は)?(?:全部|すべて|全て|まとめて)(?:は|を)?(?:ひとまず|とりあえず|いったん|一旦)?未定(?:にして(?:おいて)?(?:ください|下さい|ほしい)?|に戻して(?:ください|下さい|ほしい)?|に戻す)?[。！!]*$/.test(body))return null;
 return {t:'production_defer',s:target.i,group:'chorus'};
}
// Resolve against current work, retaining the original song indices used by AI operations.
function consultationTargets(songs,projects,text='',scope='global',today,previousText=''){
 const norm=v=>String(v||'').normalize('NFKC').toLowerCase().replace(/[\s「」『』“”"']/g,'');
 const input=norm(text),prior=norm(previousText),history=/(履歴|過去|以前の|完了済|終了済|終わった(?:方|ほう|曲|工程)|再開|やり直|両方|全曲|完了分も)/.test(input);
 const aliases={'ochanorma':['ocha','オチャノーマ'],'ロージークロニクル':['ロージー']};
 const rows=songs.map((s,i)=>{const p=projects.find(p=>p.id===s.projectId),r=report(s,{today,release:p?.release}),artist=s.artist||p?.artist||'',names=[artist,...(aliases[norm(artist)]||[]),p?.custom].map(norm).filter(v=>v.length>=2);
   const work=r.nodes.filter(n=>!['invoice','lyricCheck','credits'].includes(n.id));
   const complete=r.custom?work.length>0&&work.every(n=>n.done):r.audioComplete;
   return {i,s,r,complete,title:norm(s.title||s.work),qualified:names.some(n=>input.includes(n)),previousQualified:names.some(n=>prior.includes(n))};
 });
 const focus=rows.find(x=>x.s.id===scope);
 if(scope!=='global')return {indices:focus?[focus.i]:[],selected:focus?.i??-1,reason:'open_song',history,rows};
 const freshMentions=rows.filter(x=>x.title.length>=2&&input.includes(x.title));
 const titleInput=freshMentions.length?input:prior,mentions=freshMentions.length?freshMentions:rows.filter(x=>x.title.length>=2&&prior.includes(x.title));
 // A longer title contains a shorter one, but does not name a second song.
 const named=mentions.filter(x=>mentions.filter(y=>y.title!==x.title&&y.title.includes(x.title)).reduce((rest,y)=>rest.replaceAll(y.title,''),titleInput).includes(x.title));
 const freshQualified=rows.filter(x=>x.qualified),qualified=freshQualified.length?freshQualified:freshMentions.length?[]:rows.filter(x=>x.previousQualified),explicit=qualified.length>0,qualifiedIds=new Set(qualified.map(x=>x.i));
 let candidates=named.length?named:explicit?qualified:rows;
 if(named.length&&explicit){const same=candidates.filter(x=>qualifiedIds.has(x.i));if(same.length)candidates=same;else return {indices:[...new Set([...named,...qualified].map(x=>x.i))],selected:-1,reason:'mixed_reference',history,rows};}
 const taskAliases={invoice:['請求書'],credits:['クレジット'],lyricCheck:['歌詞確認']};
 const labels=[...new Set(candidates.flatMap(x=>x.r.nodes.filter(n=>[n.label,...(taskAliases[n.id]||[])].some(label=>{const name=norm(label);return name.length>=2&&input.includes(name)&&!named.some(x=>x.title.includes(name));})).map(n=>n.label)))];
 const taskLabels=labels.filter(label=>!labels.some(other=>other!==label&&norm(other).includes(norm(label))));
 const pending=x=>taskLabels.length?x.r.nodes.some(n=>taskLabels.includes(n.label)&&!n.done&&n.state!=='undecided'):!x.complete;
 if(!history){const current=candidates.filter(pending);
   // An explicit artist/project can refer back to completed work. Otherwise one current
   // match wins over any number of completed namesakes, even with invoices outstanding.
   if(!named.length&&!explicit&&!taskLabels.length)candidates=candidates.filter(x=>!x.r.archive);
   else if(current.length)candidates=current;
   else if(!named.length&&!explicit)candidates=candidates.filter(x=>!x.r.archive);
 }
 const selected=(named.length||explicit||taskLabels.length)&&candidates.length===1?candidates[0].i:-1;
 return {indices:candidates.map(x=>x.i),selected,reason:selected>=0?(explicit?'named_context':history?'history':'current_work'):named.length?'multiple_matches':'current_overview',history,rows};
}
// Read related records together without changing saved completion checks or dates.
function interpretFlow(s,nodes){
 const byKey=k=>nodes.find(n=>n.keys.includes(k)),byTask=id=>nodes.find(n=>n.id===id),live=isShow(s);
 for(const n of nodes){
  const contacts=(s.workflow?.communications||[]).filter(c=>c.taskId===n.id&&c.state!=='done').sort((a,b)=>(Number(b.updatedAt)||0)-(Number(a.updatedAt)||0));
  const c=contacts[0];
  if(c&&['unknown','todo'].includes(n.state)&&['waiting','reply','review'].includes(c.state)){
   n.state=c.state==='waiting'?'requested':c.state==='reply'?'doing':'review';n.wait=c.state==='waiting';
   n.owner=c.state==='reply'||c.state==='review'?'自分':c.person||n.owner;n.recipient=c.person||n.recipient;n.communicationId=c.id;
  }
 }
 const pairs=live?[[byKey('order'),byKey('build')||byKey('rec2')]]:[[byKey('stemO'),byTask('stems')],[byKey('paraO'),byKey('paraR')],[byTask('lyricOrder'),byTask('lyrics')],[byTask('chorusRequest'),byTask('chorus')]];
 for(const [order,work]of pairs)if(order&&work&&!order.done&&!order.wait&&['requested','revision','received','review','done'].includes(work.state))order.actionCoveredBy=work.id;
 if(live){
  const deps={build:['order'],rec2:['order'],lrec:['lrecS'],lrecE:['lrec'],td2:['build','make','rec2','lrec','lrecE'],deliv2:['td2','build','make','rec2','lrec']};
  for(const n of nodes)n.deps=[...new Set(n.keys.flatMap(k=>deps[k]||[]).map(byKey).filter(x=>x&&x!==n).map(x=>x.id))];
 }
}
function ball(n){
 const owner=n.owner||n.recipient||'',other=owner&&owner!=='自分'?owner:'相手';
 const who=n.wait?other+(n.state==='revision'?'の修正待ち':'の対応待ち'):n.state==='waiting'?'日程待ち':owner||(['received','review'].includes(n.state)?'自分の確認待ち':'担当未確認');
 return {id:n.id,label:n.label,who,text:who,owner,state:n.state};
}
function nextAction(n){
 let title=n.state==='unknown'?n.label+'の状況を確認':n.state==='received'||n.state==='review'?n.label+'の内容を確認':n.state==='waiting'?n.label+'の日程を確認':n.label;
 let reason=n.due.value?'予定 '+n.due.value:'状況と次の日程を確認します';
 if(n.wait){
  const overdue=n.left!==null&&n.left<=0,soon=n.left!==null&&n.left<=3;
  title=n.label+(n.state==='revision'?'の修正状況を確認':overdue?'の納期を確認':soon?'の進捗を確認':n.due.value?'の返答・納品を待つ':'の返答・納期を確認');
  reason=(n.state==='revision'?'修正依頼済み':'依頼済み')+'・相手待ちです。'+(n.due.value?(overdue?'予定 '+n.due.value+' に対する進捗と納期を確認します':'予定 '+n.due.value+'。'+(soon?'納品見込みを確認します':'返答・納品が届いたら内容を確認します')):'返答と納期を確認します');
 }else if(n.left!==null&&n.left<0)reason='登録日 '+n.due.value+' を'+(-n.left)+'日過ぎています';
 return {id:n.id,title,reason,score:n.left??100};
}
function workflowPending(s){return (s.workflow?.communications||[]).some(c=>c.state!=='done')||(s.workflow?.issues||[]).some(i=>!i.resolved)}
function showReport(s,today){
 const nodes=definitions(s).map(d=>stageNode(s,d,today));
 if(invoices.report(s).items.length||s.invoiceTracking)nodes.push(invoiceNode(s,{...byId.invoice,keys:[],group:'custom:請求書',due:{value:'',kind:'registered'},blockers:[],left:null}));
 interpretFlow(s,nodes);
 const node=Object.fromEntries(nodes.map(n=>[n.id,n]));
 for(const n of nodes)n.blockers=n.deps.filter(id=>!node[id].done&&!node[id].actionCoveredBy);
 const groups=[...new Set(nodes.map(n=>n.group))].map(id=>{const list=nodes.filter(n=>n.group===id&&!n.actionCoveredBy),state=aggregate(list.map(n=>n.state));return {id,label:id.slice(7),state,text:STATES[state]||'一部完了',done:list.every(n=>n.done)}});
 const pending=nodes.filter(n=>!n.done&&!n.actionCoveredBy),actions=pending.filter(n=>n.state!=='undecided'&&(!n.blockers.length||!['unknown','todo'].includes(n.state))).map(nextAction).sort((a,b)=>a.score-b.score);
 const dates=Object.fromEntries(['open','rehearsal','deliver','live'].map(k=>[k,{value:s.dates?.[k]||'',kind:s.production?.dateKinds?.[k]||'registered',source:''}]));
 return {applicable:true,custom:true,nodes,node,groups,dates,mv:false,audioComplete:nodes.length>0&&!pending.length,archive:nodes.length>0&&!pending.length&&!workflowPending(s),actions,balls:pending.filter(n=>n.wait||['doing','review','received','waiting'].includes(n.state)).map(ball),gaps:[],extra:[],admin:[],today};
}
// Exclusion keeps records. Restoring a child also restores its parent container.
function setIncluded(s,id,included){
 if(id==='invoice')throw Error('請求書の画面で、相手ごとの必要・不要を確認してください');
 const d=resolve(s,id);if(!d)throw Error('作業が見つかりません');
 const L=s.stageList||[],keys=[];
 for(const key of d.keys){const i=L.findIndex(x=>x.k===key);if(i<0)continue;keys.push(key);for(let j=i+1;j<L.length&&L[j].d===1;j++)keys.push(L[j].k);if(included&&L[i].d===1){let j=i-1;while(j>=0&&L[j].d===1)j--;if(j>=0)keys.push(L[j].k)}}
 if(keys.length){s.stages||={};for(const k of keys){s.stages[k]||={};s.stages[k].excluded=!included}}
 else{s.production||={};s.production.tasks||={};const rec=s.production.tasks[id]||={};rec.excluded=!included;if(included&&rec.state==='na')rec.state='unknown'}
}
function report(s,opt={}){
 const today=opt.today||new Date().toISOString().slice(0,10),p=s.production||{},tasks=p.tasks||{},kind=s.sort||(s.single===false?'album':'single');
 const mv=typeof s.mvEnabled==='boolean'?s.mvEnabled:!!s.dates?.mv||kind==='single';
 if(isShow(s))return showReport(s,today);
 const applicable=true;
 const release=s.dates?.release||opt.release||'',live=s.dates?.live||'';
 const date=(value,kind='registered',source='')=>({value:validDate(value)?value:'',kind,source});
 const dk=k=>p.dateKinds?.[k]||'registered';
 const mvDate=s.dates?.mv?date(s.dates.mv,dk('mv')):date(mv?days(months(release,-1),-15):'','target','発売の1か月半前');
 const masterValue=s.dates?.mastering||s.stages?.mas?.dl||tasks.master?.due;
 const masterDate=masterValue?date(masterValue,s.dates?.mastering?dk('mastering'):tasks.master?.dueKind||'registered'):date(months(release,-1),'target','発売の1か月前');
 const dates={release:date(release,dk('release')),live:date(live,dk('live')),mv:mvDate,master:masterDate,selection:date(months(release,-4),'target','発売の4か月前')};
 const slotDates=(s.stages?.vo?.slots||[]).filter(x=>validDate(x.date)).map(x=>x.date).sort();
 const nextSlot=slotDates.find(d=>d>=today)||slotDates.at(-1);
 dates.vocal=nextSlot?date(nextSlot,dk('vo')):date(days(months(release,-2),-15),'target','発売の2か月半前');
 dates.teacher=date(days(mvDate.value,-21),'target','MV撮影の3週間前');
 dates.lyricCheck=date(days(masterDate.value,-7),'target','マスタリングの1週間前');dates.credits=dates.lyricCheck;
 const nodes=definitions(s).map(d=>{
   if(d.stage){const n=stageNode(s,d,today);if(n.group==='chorus'&&p.chorus==='none'||n.group==='instrument'&&p.instruments==='none'){n.state='na';n.done=true}return n;}
   const rec=tasks[d.id]||{},keys=keysFor(s,d),gs=keys.map(k=>s.stages?.[k]||{});
   let state=keys.length?aggregate(gs.map(stageState)):(Object.hasOwn(STATES,rec.state)?rec.state:'unknown');
   const excluded=!!rec.excluded||d.keys.length&&!keys.length&&d.keys.some(k=>(s.stageList||[]).some(x=>x.k===k));
   if(excluded)state='na';
   let applicability='required';
   if(d.id==='instrument'){
     const signal=['instdb','instrec'].some(k=>{const g=s.stages?.[k]||{};return g.done||g.st||g.dl||g.slots?.some(v=>v.date||v.who)});
     applicability=p.instruments==='none'?'none':p.instruments==='required'||signal?'required':'unknown';
     if(applicability==='none')state='na';
   }
   if(['rough','teacher','almost'].includes(d.id)&&!mv&&p.choreography!==true)state='na';
   if(p.chorus==='none'&&['chorusRequest','chorus'].includes(d.id))state='na';
   const dl=gs.map(g=>g.dl).filter(validDate).sort()[0]||gs.flatMap(g=>g.slots||[]).filter(v=>!v.done&&validDate(v.date)).map(v=>v.date).sort()[0];
   const due=state==='undecided'?date(''):dl?date(dl,rec.dueKind||p.dateKinds?.[d.keys[0]]||'registered'):rec.due?date(rec.due,rec.dueKind||'registered'):dates[d.id]||date('');
   const asg=rec.owner||gs.find(g=>g.asg)?.asg||'';
   const wait=['requested','revision'].includes(state),me=gs.some(g=>g.st==='me');
   const owner=rec.owner!==undefined?rec.owner:asg||(me?'自分':'');
   return {...d,keys,state,excluded,applicability,due,owner,wait,channel:rec.channel||'',recipient:rec.recipient||(asg==='自分'?'':asg),memo:rec.memo||gs.find(g=>g.memo)?.memo||'',date:rec.completedAt!==undefined?rec.completedAt:gs.map(g=>g.date).filter(validDate).sort().at(-1)||'',done:state==='done'||state==='na',derived:false};
 });
 Object.assign(nodes.find(n=>n.id==='invoice'),invoiceNode(s,nodes.find(n=>n.id==='invoice')));
 interpretFlow(s,nodes);
 const node=Object.fromEntries(nodes.map(n=>[n.id,n]));
 // 最終完成から用途別の到達点は読めるが、原記録には書き込まない。
 if(node.arrange.state==='done')for(const id of ['recordable','almost'])if(node[id].state==='unknown'){Object.assign(node[id],{state:'done',done:true,derived:true})}
 for(const id of ['vocal','master'])if(node[id].state==='done')dates[id]=date(node[id].date,'completed','完了記録');
 for(const n of nodes){n.blockers=n.deps.filter(k=>!node[k].done&&!node[k].actionCoveredBy);n.left=n.due.value?Math.round((stamp(n.due.value)-stamp(today))/864e5):null}
 const groups=GROUPS.map(([id,label])=>{
   const list=nodes.filter(n=>n.group===id&&!n.actionCoveredBy),state=aggregate(list.map(n=>n.state));
   let text=STATES[state]||'一部完了';
   if(id==='plan')text=node.selection.state==='done'?'曲確定':node.demo.state==='done'?'デモ完成・曲確定へ':text;
   if(id==='vocal')text=node.edit.done?'編集済み'+(!node.split.done?'・歌割確認':''):node.vocal.done?'録音済み・編集'+(node.edit.state==='doing'?'中':'へ'):text;
   if(id==='arrange')text=node.arrange.state==='done'?'最終完成':node.recordable.done?'歌録り可能':text;
   if(id==='finish')text=node.master.state==='done'?'マスタリング済み':node.mix.state==='done'?'ミックス済み':text;
   if(id==='instrument'&&node.instrument.applicability==='unknown')text='必要か確認';
   let done=id==='plan'?node.selection.state==='done':id==='vocal'?node.edit.done&&node.split.done:id==='arrange'?node.arrange.state==='done':id==='finish'?node.master.state==='done':list.every(n=>n.done);
   if(done&&list.some(n=>n.stage&&!n.done&&(n.state!=='unknown'||n.due.value))){done=false;text+=' · 残りを確認'}
   return {id,label,state,text,done};
 });
 const sequence=['selection','recordable','vocal','edit','chorus','mix','master'];
 let frontier=0;sequence.forEach((id,i)=>{if(node[id].state==='done')frontier=i+1});
 const level={theme:0,order:0,lyricOrder:0,lyrics:0,guide:0,demo:0,selection:0,full:1,recordable:1,stems:1,arrange:3,vocalBooking:1,vocal:2,split:3,edit:3,chorusRequest:4,chorus:4,instrument:3,almost:3,rough:3,teacher:3,mixBooking:1,materials:5,mix:5,master:6,lyricCheck:4,credits:4,invoice:6};
 const pending=nodes.filter(n=>!n.done&&!n.actionCoveredBy);
 function score(n){let v=(n.left===null?100:Math.max(-120,n.left))+(n.due.kind==='target'?8:0);if(n.left!==null&&n.left<0)v-=120;if(n.state==='unknown')v+=10;if(n.blockers.length)v+=20;if(['vocalBooking','mixBooking'].includes(n.id))v-=20;return v}
 const actions=pending.filter(n=>n.state!=='undecided'&&(n.stage||n.state!=='unknown'||(level[n.id]>=Math.max(0,frontier-1)&&level[n.id]<=Math.max(1,frontier))||n.left!==null&&n.left<=14));
 if(node.master.state==='done')for(const n of pending.filter(n=>['lyricCheck','credits','invoice'].includes(n.id)))if(!actions.includes(n))actions.push(n);
 for(const a of actions.slice())if(a.left!==null&&a.left<=21)for(const id of a.blockers)if(node[id].state!=='undecided'&&!actions.includes(node[id]))actions.push(node[id]);
 const urgency=new Map();
 for(const a of actions)if(a.left!==null&&a.left<=21){const visit=(id,depth)=>{const n=node[id];if(!n||n.done||n.state==='undecided'||n.actionCoveredBy||depth>8)return;if(n.state!=='unknown'||level[id]>=Math.max(0,frontier-1)){const scoreFor=score(a)-depth;const old=urgency.get(id);if(!old||scoreFor<old.score)urgency.set(id,{score:scoreFor,reason:a.label+'（'+a.due.value+' '+(a.due.kind==='target'?'目安':'登録日')+'）の前に必要です'});if(!actions.includes(n))actions.push(n);for(const k of n.blockers)visit(k,depth+1)}};for(const id of a.blockers)visit(id,1)}
 const ranked=actions.map(n=>{
   let title=nextAction(n).title;
   let reason=n.left!==null&&n.left<0?(n.due.kind==='target'?'目安を':'登録日を')+(-n.left)+'日過ぎています':n.left!==null&&n.left<=14?n.left===0?(n.due.kind==='target'?'今日が目安です':'今日が登録された期限です'):(n.due.kind==='target'?'目安まで':'予定まで')+n.left+'日':n.id==='mixBooking'?'素材待ちの間に日程を確保できます':n.id==='vocalBooking'?'先に日程とスタジオを確保します':n.wait?'依頼済みのため返答・納期を確認します':'次の制作を進めるために確認します';
   if(n.wait)reason=nextAction(n).reason;
   if(n.blockers.length)reason+='。先に '+n.blockers.map(k=>node[k].label).join('・')+' を確認';
   if(n.id==='invoice'){const inv=n.invoice;title=inv.missing.length?'未受領の請求書を確認':inv.unknown.length||!inv.confirmed?'請求先の漏れを確認':'小森さんへ請求書を送付';reason=inv.missing.length?inv.missing.map(x=>x.name).join('、')+' から未受領です':inv.unknown.length?inv.unknown.map(x=>x.name).join('、')+' の請求が必要か確認します':!inv.confirmed?'請求先が揃っているか確認してください':inv.ready.map(x=>x.name).join('、')+' の請求書を受領済みです'}
   const inherited=urgency.get(n.id);if(inherited&&inherited.score<score(n))reason=(n.wait?nextAction(n).reason+'。':'')+inherited.reason+(n.blockers.length?'。未確認の前提：'+n.blockers.map(k=>node[k].label).join('・'):'');
   return {id:n.id,title,reason,score:Math.min(score(n),inherited?.score??Infinity)};
 }).sort((a,b)=>a.score-b.score||nodes.indexOf(node[a.id])-nodes.indexOf(node[b.id]));
 const balls=pending.filter(n=>n.wait||['doing','review','received','waiting'].includes(n.state)).map(ball);
 if(node.invoice.invoice.missing.length)balls.push({id:'invoice',label:'請求書が未受領',who:node.invoice.invoice.missing.map(x=>x.name).join('、'),state:'todo'});

 const alerts=[];
 if(validDate(live)&&dates.vocal.value&&dates.vocal.kind!=='completed'&&live<dates.vocal.value){alerts.push({id:'vocalBooking',title:'ライブ披露に必要な音源と日程を確認',reason:'ライブ披露 '+live+' が歌録り '+dates.vocal.value+' より先です。必要な音源と納期を決めて前倒しを相談します',score:-20})}
 if(dates.master.value&&dates.master.kind!=='completed'&&dates.vocal.value&&dates.vocal.kind!=='completed'&&dates.master.value<dates.vocal.value){alerts.push({id:'vocalBooking',title:'歌録りとマスタリングの日程を見直す',reason:'歌録り '+dates.vocal.value+' がマスタリング '+dates.master.value+' より後になっています',score:-20})}
 if(validDate(release)&&dates.master.value&&dates.master.kind!=='completed'&&dates.master.value>release){alerts.push({id:'master',title:'発売に間に合うマスタリング日を相談',reason:'登録したマスタリング日が発売日より後になっています',score:-20})}
 ranked.unshift(...alerts);
 const admin=nodes.filter(n=>['lyricCheck','credits','invoice'].includes(n.id)&&!n.done);
 const gaps=pending.filter(n=>n.state==='unknown'&&level[n.id]<Math.max(0,frontier-1));
 const audioComplete=node.master.state==='done';
 const archive=audioComplete&&!admin.length&&!workflowPending(s)&&!pending.some(n=>n.state!=='unknown'||n.stage&&n.due.value);
 return {applicable,nodes,node,groups,dates,mv,audioComplete,archive,actions:ranked,balls,gaps,admin,liveOnly:!validDate(release)&&validDate(live),today};
}
function invoiceNode(s,n){
 const r=invoices.report(s),state=r.done?'done':r.ready.length?'received':r.missing.length?'todo':'unknown';
 return {...n,state,done:r.done,excluded:false,derived:true,wait:false,owner:r.ready.length?'自分':'',recipient:'小森',channel:'email',invoice:r,date:r.done?r.sent.map(x=>x.sentAt).sort().at(-1)||'':'',memo:r.title};
}
function validatePatch(patch){
 if(!patch||typeof patch!=='object'||Array.isArray(patch))return '変更内容が不正です';
 if(patch.state==='undecided'&&patch.due)return '未定に戻すときは予定日を同時に指定できません';
 const allowed=['state','owner','recipient','channel','due','dueKind','memo'];
 for(const [k,v]of Object.entries(patch)){
  if(!allowed.includes(k))return '未対応の項目です';if(typeof v!=='string')return '文字列で指定してください';
  if(k==='state'&&!Object.hasOwn(STATES,v))return '状態が不正です';
  if(k==='channel'&&!['','email','line'].includes(v))return '連絡手段が不正です';
  if(k==='due'&&v&&!validDate(v))return '日付を確認してください';
  if(k==='dueKind'&&!['registered','confirmed','tentative'].includes(v))return '目安は確定日として保存できません';
  if(v.length>4000)return '入力が長すぎます';
 }return '';
}
function apply(s,id,patch,today){
 const d=resolve(s,id);if(!d)throw Error('作業が見つかりません');const error=validatePatch(patch);if(error)throw Error(error);
 if(patch.state==='undecided'&&task(s,id,{today})?.done)throw Error('完了済みの実績は未定に戻しません');
 if(id==='invoice'&&Object.hasOwn(patch,'state'))throw Error('請求書は相手ごとの受領・送付記録から自動で判定します');
 const keys=keysFor(s,d),completeGroup=keys.length>0&&keys.every(k=>s.stages?.[k]?.done),allKeys=(s.stageList||[]).map(x=>x.k);
 if(d.keys.some(k=>allKeys.includes(k))&&!keys.length)throw Error('対象外の作業です。一覧から対象に戻してください');
 if(patch.state==='na'&&keys.length)throw Error('一覧の「対象外にする」を使ってください');
 s.production||={};s.production.tasks||={};const rec=s.production.tasks[id]||={};
 if(patch.due&&patch.state===undefined&&task(s,id,{today})?.state==='undecided')patch={...patch,state:'todo'};
 if(patch.state==='undecided'){
   Object.assign(rec,{due:'',dueKind:'registered',completedAt:'',state:'undecided'});
   s.production.dateKinds||={};
   // A multi-stage parent and its child records can each retain an independent deadline.
   for(const k of [...new Set([...d.keys,...keys])]){const g=s.stages?.[k];if(!g||g.done)continue;
     Object.assign(g,{dl:'',date:'',st:'',req:'',ret:'',prov:false,workState:'undecided'});
     for(const slot of g.slots||[])if(!slot.done)Object.assign(slot,{date:'',swait:false,swaitAt:'',mtime:Date.now()});
     s.production.dateKinds[k]='registered';
   }
 }
 for(const [k,v]of Object.entries(patch))if(k!=='state'||!keys.length)rec[k]=v;
 if(patch.state){
   if(keys.length&&patch.state!=='na')delete rec.completedAt;
   if(!keys.length){if(patch.state==='done')rec.completedAt=rec.completedAt||today;else rec.completedAt=''}
   for(const k of keys){s.stages||={};const g=s.stages[k]||={};if(patch.state!=='done'&&g.done&&(!completeGroup||patch.state==='undecided'))continue;if(patch.state==='done'){if(!g.done)g.date=today;g.done=true;g.st='';g.prov=false}
    else{if(g.done)g.date='';g.done=false;g.prov=false;g.st=['requested','revision'].includes(patch.state)?'req':['doing','review','received'].includes(patch.state)?'me':patch.state==='waiting'?'wait':'';if(g.st==='req')g.req=g.req||today}
    g.workState=patch.state;
   }
 }
 for(const k of keys){const g=s.stages[k]||={};if(patch.owner!==undefined)g.asg=patch.owner;if(patch.due!==undefined)g.dl=patch.due;if(patch.memo!==undefined)g.memo=patch.memo}
 return s;
}
function draft(s,n,channel){
 const title=s.title||s.work||'曲名未登録',artist=s.artist?'（'+s.artist+'）':'';
 const who=n.recipient||(n.owner==='自分'?'':n.owner)||'ご担当者';
 const date=n.due.value?(n.due.value.replace(/-/g,'/')+(n.due.kind==='tentative'?'（仮）を候補に、ご対応可能でしょうか。':n.due.kind==='target'?'を目安に日程をご相談したいです。':'までの日程でご相談できますでしょうか。')):'日程もあわせてご相談させてください。';
 const action=n.wait?'ご相談している「'+n.label+'」の進捗と、対応可能な日程を教えていただけますでしょうか。':'「'+n.label+'」についてご相談です。';
 const body=channel==='line'?who+'さん\nお疲れさまです。'+title+artist+'の'+action+'\n'+date+'\nよろしくお願いします。':who+' 様\n\nお世話になっております。\n'+title+artist+'の'+action+'\n'+date+'\n\nご確認のほど、よろしくお願いいたします。';
 return {subject:title+'｜'+n.label,body};
}
function dropboxURL(value){
 if(!String(value||'').trim())return '';
 try{const u=new URL(String(value).trim());if(u.protocol!=='https:'||!['dropbox.com','www.dropbox.com','db.tt'].includes(u.hostname)||u.username||u.password||u.port)throw Error();return u.href}catch{throw Error('Dropboxの共有リンク（https://www.dropbox.com/…）を入力してください')}
}
root.ShinkouProduction={STATES,GROUPS,defs,byId,validDate,days,months,report,keysFor,resolve,task,setIncluded,validatePatch,apply,draft,invoices,dropboxURL,groupIds,groupSnapshot,deferGroup,deferredIntent,consultationTargets};
if(typeof module!=='undefined')module.exports=root.ShinkouProduction;
})(typeof globalThis!=='undefined'?globalThis:this);
