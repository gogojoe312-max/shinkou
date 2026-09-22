/* 制作の見通し。記録の読み取り・目安の計算は通信も保存も行わない。 */
(function(root){
'use strict';
const STATES={unknown:'未確認',todo:'これから',doing:'作業中',requested:'依頼済み・相手待ち',received:'受領・確認前',review:'確認中',revision:'修正待ち',waiting:'日程待ち',done:'完了',na:'対象外'};
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
 ['credits','クレジットをデスクへ提出','delivery',[],[]],['invoice','請求書をデスクへ送付','delivery',[],[]]
].map(([id,label,group,keys,deps])=>({id,label,group,keys,deps}));
const byId=Object.fromEntries(defs.map(d=>[d.id,d]));
const validDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d+'T00:00:00Z'))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
const stamp=d=>Date.parse(d+'T00:00:00Z');
function days(d,n){return validDate(d)?new Date(stamp(d)+n*864e5).toISOString().slice(0,10):''}
function months(d,n){if(!validDate(d))return '';const x=new Date(stamp(d)),day=x.getUTCDate();x.setUTCDate(1);x.setUTCMonth(x.getUTCMonth()+n);const last=new Date(Date.UTC(x.getUTCFullYear(),x.getUTCMonth()+1,0)).getUTCDate();x.setUTCDate(Math.min(day,last));return x.toISOString().slice(0,10)}
function active(s){let excluded=false;return(s.stageList||[]).filter(x=>{if(x.d!==1)excluded=!!s.stages?.[x.k]?.excluded;return !excluded&&!s.stages?.[x.k]?.excluded})}
function keysFor(s,d){const L=active(s),out=[];for(const key of d.keys){const i=L.findIndex(x=>x.k===key);if(i<0)continue;if(L[i+1]?.d===1){for(let j=i+1;j<L.length&&L[j].d===1;j++)out.push(L[j].k)}else out.push(key)}return [...new Set(out)]}
function aggregate(states){if(!states.length)return 'unknown';if(states.every(s=>s==='done'||s==='na'))return states.every(s=>s==='na')?'na':'done';for(const state of ['revision','review','received','requested','doing','waiting','todo'])if(states.includes(state))return state;return states.includes('done')?'partial':'unknown'}
function stageState(o){if(o.done)return 'done';if(o.excluded)return 'na';if(o.st==='req')return ['revision'].includes(o.workState)?o.workState:'requested';if(o.st==='me')return ['received','review'].includes(o.workState)?o.workState:'doing';if(o.st==='wait'||o.st==='studio')return 'waiting';if(o.workState&&!['done','na','requested','revision','doing','review','received'].includes(o.workState))return o.workState;return o.prov?'review':'unknown'}
function report(s,opt={}){
 const today=opt.today||new Date().toISOString().slice(0,10),p=s.production||{},tasks=p.tasks||{},kind=s.sort||(s.single===false?'album':'single');
 const mv=typeof s.mvEnabled==='boolean'?s.mvEnabled:!!s.dates?.mv||kind==='single';
 const applicable=s.templateId!=='tpl_show'&&s.use!=='live';
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
 const nodes=defs.map(d=>{
   const rec=tasks[d.id]||{},keys=keysFor(s,d),gs=keys.map(k=>s.stages?.[k]||{});
   let state=keys.length?aggregate(gs.map(stageState)):(STATES[rec.state]?rec.state:'unknown');
   const excluded=d.keys.length&&!keys.length&&d.keys.some(k=>(s.stageList||[]).some(x=>x.k===k));
   if(excluded)state='na';
   let applicability='required';
   if(d.id==='instrument'){
     const signal=['instdb','instrec'].some(k=>{const g=s.stages?.[k]||{};return g.done||g.st||g.dl||g.slots?.some(v=>v.date||v.who)});
     applicability=p.instruments==='none'?'none':p.instruments==='required'||signal?'required':'unknown';
     if(applicability==='none')state='na';
   }
   if(['rough','teacher','almost'].includes(d.id)&&!mv&&p.choreography!==true)state='na';
   if(p.chorus==='none'&&['chorusRequest','chorus'].includes(d.id))state='na';
   const dl=gs.map(g=>g.dl).filter(validDate).sort()[0];
   const due=dl?date(dl,rec.dueKind||'registered'):rec.due?date(rec.due,rec.dueKind||'registered'):dates[d.id]||date('');
   const asg=rec.owner||gs.find(g=>g.asg)?.asg||'';
   const wait=['requested','revision'].includes(state),me=gs.some(g=>g.st==='me');
   const owner=rec.owner!==undefined?rec.owner:me?'自分':asg;
   return {...d,keys,state,applicability,due,owner,wait,channel:rec.channel||'',recipient:rec.recipient||asg,memo:rec.memo||gs.find(g=>g.memo)?.memo||'',date:rec.completedAt||gs.map(g=>g.date).filter(validDate).sort().at(-1)||'',done:state==='done'||state==='na',derived:false};
 });
 const node=Object.fromEntries(nodes.map(n=>[n.id,n]));
 // 最終完成から用途別の到達点は読めるが、原記録には書き込まない。
 if(node.arrange.state==='done')for(const id of ['recordable','almost'])if(node[id].state==='unknown'){Object.assign(node[id],{state:'done',done:true,derived:true})}
 for(const n of nodes){n.blockers=n.deps.filter(k=>!node[k].done);n.left=n.due.value?Math.round((stamp(n.due.value)-stamp(today))/864e5):null}
 const groups=GROUPS.map(([id,label])=>{
   const list=nodes.filter(n=>n.group===id),state=aggregate(list.map(n=>n.state));
   let text=STATES[state]||'一部完了';
   if(id==='plan')text=node.selection.state==='done'?'曲確定':node.demo.state==='done'?'デモ完成・曲確定へ':text;
   if(id==='vocal')text=node.edit.done?'編集済み'+(!node.split.done?'・歌割確認':''):node.vocal.done?'録音済み・編集'+(node.edit.state==='doing'?'中':'へ'):text;
   if(id==='arrange')text=node.arrange.state==='done'?'最終完成':node.recordable.done?'歌録り可能':text;
   if(id==='finish')text=node.master.state==='done'?'マスタリング済み':node.mix.state==='done'?'ミックス済み':text;
   if(id==='instrument'&&node.instrument.applicability==='unknown')text='必要か確認';
   const done=id==='plan'?node.selection.state==='done':id==='vocal'?node.edit.done&&node.split.done:id==='arrange'?node.arrange.state==='done':id==='finish'?node.master.state==='done':list.every(n=>n.done);
   return {id,label,state,text,done};
 });
 const sequence=['selection','recordable','vocal','edit','chorus','mix','master'];
 let frontier=0;sequence.forEach((id,i)=>{if(node[id].state==='done')frontier=i+1});
 const level={theme:0,order:0,lyricOrder:0,lyrics:0,guide:0,demo:0,selection:0,full:1,recordable:1,stems:1,arrange:3,vocalBooking:1,vocal:2,split:3,edit:3,chorusRequest:4,chorus:4,instrument:3,almost:3,rough:3,teacher:3,mixBooking:1,materials:5,mix:5,master:6,lyricCheck:4,credits:4,invoice:6};
 const pending=nodes.filter(n=>!n.done);
 function score(n){let v=(n.left===null?100:Math.max(-120,n.left))+(n.due.kind==='target'?8:0);if(n.left!==null&&n.left<0)v-=120;if(n.state==='unknown')v+=10;if(n.blockers.length)v+=20;if(['vocalBooking','mixBooking'].includes(n.id))v-=20;return v}
 const actions=pending.filter(n=>n.state!=='unknown'||(level[n.id]>=Math.max(0,frontier-1)&&level[n.id]<=Math.max(1,frontier))||n.left!==null&&n.left<=14);
 if(node.master.state==='done')for(const n of pending.filter(n=>['lyricCheck','credits','invoice'].includes(n.id)))if(!actions.includes(n))actions.push(n);
 for(const a of actions.slice())if(a.left!==null&&a.left<=21)for(const id of a.blockers)if(!actions.includes(node[id]))actions.push(node[id]);
 const urgency=new Map();
 for(const a of actions)if(a.left!==null&&a.left<=21){const visit=(id,depth)=>{const n=node[id];if(!n||n.done||depth>8)return;if(n.state!=='unknown'||level[id]>=Math.max(0,frontier-1)){const scoreFor=score(a)-depth;const old=urgency.get(id);if(!old||scoreFor<old.score)urgency.set(id,{score:scoreFor,reason:a.label+'（'+a.due.value+' '+(a.due.kind==='target'?'目安':'登録日')+'）の前に必要です'});if(!actions.includes(n))actions.push(n);for(const k of n.blockers)visit(k,depth+1)}};for(const id of a.blockers)visit(id,1)}
 const ranked=actions.map(n=>{
   let title=n.wait?n.label+'の返答を確認':n.state==='unknown'?n.label+'の状況を確認':n.label;
   let reason=n.left!==null&&n.left<0?(n.due.kind==='target'?'目安を':'登録日を')+(-n.left)+'日過ぎています':n.left!==null&&n.left<=14?(n.due.kind==='target'?'目安まで':'予定まで')+n.left+'日':n.id==='mixBooking'?'素材待ちの間に日程を確保できます':n.id==='vocalBooking'?'先に日程とスタジオを確保します':n.wait?'依頼済みのため返答・納期を確認します':'次の制作を進めるために確認します';
   if(n.blockers.length)reason+='。先に '+n.blockers.map(k=>node[k].label).join('・')+' を確認';
   const inherited=urgency.get(n.id);if(inherited&&inherited.score<score(n))reason=inherited.reason+(n.blockers.length?'。未確認の前提：'+n.blockers.map(k=>node[k].label).join('・'):'');
   return {id:n.id,title,reason,score:Math.min(score(n),inherited?.score??Infinity)};
 }).sort((a,b)=>a.score-b.score||nodes.indexOf(node[a.id])-nodes.indexOf(node[b.id]));
 const balls=pending.filter(n=>n.wait||['doing','review','received','waiting'].includes(n.state)).map(n=>({id:n.id,label:n.label,who:n.state==='waiting'?'日程待ち':n.wait?(n.owner||'相手未登録')+'の対応待ち':n.owner||'担当未確認',state:n.state}));
 const extra=active(s).filter(x=>!nodes.some(n=>n.keys.includes(x.k))&&!defs.some(d=>d.keys.includes(x.k))).filter((x,i,L)=>!L[i+1]||L[i+1].d!==1);
 const unfinishedExtra=extra.filter(x=>!s.stages?.[x.k]?.done);
 for(const x of unfinishedExtra){const g=s.stages?.[x.k]||{},state=stageState(g);if(g.st||g.dl){const id='legacy:'+x.k;ranked.push({id,title:x.n+'の状況を確認',reason:g.dl?'登録済みの期限 '+g.dl:'追加の作業記録に対応待ちがあります',score:g.dl?Math.round((stamp(g.dl)-stamp(today))/864e5)-60:50});if(g.st)balls.push({id,label:x.n,who:g.st==='me'?'自分':g.asg?g.asg+'の対応待ち':'担当未確認',state})}}
 ranked.sort((a,b)=>a.score-b.score);
 const admin=nodes.filter(n=>['lyricCheck','credits','invoice'].includes(n.id)&&!n.done);
 const gaps=pending.filter(n=>n.state==='unknown'&&level[n.id]<Math.max(0,frontier-1));
 const audioComplete=node.master.state==='done';
 const archive=audioComplete&&!admin.length&&!pending.some(n=>n.state!=='unknown')&&!unfinishedExtra.some(x=>{const g=s.stages?.[x.k]||{};return g.st||g.dl});
 return {applicable,nodes,node,groups,dates,mv,audioComplete,archive,actions:ranked,balls,gaps,extra,admin,liveOnly:!validDate(release)&&validDate(live),today};
}
function validatePatch(patch){
 if(!patch||typeof patch!=='object'||Array.isArray(patch))return '変更内容が不正です';
 const allowed=['state','owner','recipient','channel','due','dueKind','memo'];
 for(const [k,v]of Object.entries(patch)){
  if(!allowed.includes(k))return '未対応の項目です';if(typeof v!=='string')return '文字列で指定してください';
  if(k==='state'&&!STATES[v])return '状態が不正です';
  if(k==='channel'&&!['','email','line'].includes(v))return '連絡手段が不正です';
  if(k==='due'&&v&&!validDate(v))return '日付を確認してください';
  if(k==='dueKind'&&!['registered','confirmed','tentative'].includes(v))return '目安は確定日として保存できません';
  if(v.length>4000)return '入力が長すぎます';
 }return '';
}
function apply(s,id,patch,today){
 const d=byId[id];if(!d)throw Error('作業が見つかりません');const error=validatePatch(patch);if(error)throw Error(error);
 const keys=keysFor(s,d),allKeys=(s.stageList||[]).map(x=>x.k);
 if(d.keys.some(k=>allKeys.includes(k))&&!keys.length)throw Error('対象外の作業です。作業記録で対象を確認してください');
 if(patch.state==='na'&&keys.length)throw Error('既存の作業は作業記録から対象外にしてください');
 s.production||={};s.production.tasks||={};const rec=s.production.tasks[id]||={};
 for(const [k,v]of Object.entries(patch))if(k!=='state'||!keys.length)rec[k]=v;
 if(patch.state){
   if(patch.state==='na'&&keys.length)throw Error('既存の作業は作業記録から対象外にしてください');
   if(!keys.length){if(patch.state==='done')rec.completedAt=rec.completedAt||today;else rec.completedAt=''}
   for(const k of keys){s.stages||={};const g=s.stages[k]||={};if(patch.state==='done'){if(!g.done)g.date=today;g.done=true;g.st='';g.prov=false}
    else{if(g.done)g.date='';g.done=false;g.prov=false;g.st=['requested','revision'].includes(patch.state)?'req':['doing','review','received'].includes(patch.state)?'me':patch.state==='waiting'?'wait':'';if(g.st==='req')g.req=g.req||today}
    g.workState=patch.state;
   }
 }
 for(const k of keys){const g=s.stages[k]||={};if(patch.owner!==undefined)g.asg=patch.owner;if(patch.due!==undefined)g.dl=patch.due;if(patch.memo!==undefined)g.memo=patch.memo}
 return s;
}
function draft(s,n,channel){
 const title=s.title||s.work||'曲名未登録',artist=s.artist?'（'+s.artist+'）':'';
 const who=n.recipient||n.owner||'ご担当者';
 const date=n.due.value?(n.due.value.replace(/-/g,'/')+(n.due.kind==='tentative'?'（仮）を候補に、ご対応可能でしょうか。':n.due.kind==='target'?'を目安に日程をご相談したいです。':'までの日程でご相談できますでしょうか。')):'日程もあわせてご相談させてください。';
 const action=n.wait?'ご相談している「'+n.label+'」の進捗と、対応可能な日程を教えていただけますでしょうか。':'「'+n.label+'」についてご相談です。';
 const body=channel==='line'?who+'さん\nお疲れさまです。'+title+artist+'の'+action+'\n'+date+'\nよろしくお願いします。':who+' 様\n\nお世話になっております。\n'+title+artist+'の'+action+'\n'+date+'\n\nご確認のほど、よろしくお願いいたします。';
 return {subject:title+'｜'+n.label,body};
}
root.ShinkouProduction={STATES,GROUPS,defs,byId,validDate,days,months,report,keysFor,validatePatch,apply,draft};
if(typeof module!=='undefined')module.exports=root.ShinkouProduction;
})(typeof globalThis!=='undefined'?globalThis:this);
