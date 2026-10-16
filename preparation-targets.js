/* 登録済みの日程・資料から準備対象を選ぶ。通信・保存・AI推測は行わない。 */
(function(root){
'use strict';
const core=root.ShinkouCore||(typeof module!=='undefined'?require('./core.js'):null);
const list=value=>Array.isArray(value)?value:[],str=value=>typeof value==='string'?value:'',unique=values=>[...new Set(values)];
function validDate(value){return /^\d{4}-\d{2}-\d{2}$/.test(str(value))&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;}
function tokyoToday(now=new Date()){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now));
 return ['year','month','day'].map(type=>parts.find(part=>part.type===type).value).join('-');
}
function addDays(date,days){const value=new Date(date+'T00:00:00Z');value.setUTCDate(value.getUTCDate()+days);return value.toISOString().slice(0,10);}
function folderURL(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&['www.dropbox.com','dropbox.com'].includes(u.hostname)&&/^\/(?:scl\/fo|sh)\/[^/]+\//.test(u.pathname);}catch{return false;}}
const fileId=value=>/^id:[A-Za-z0-9_-]{1,200}$/.test(str(value));
function sourcesOf(song){
 const out=[];
 for(const record of list(song.workflow?.materials)){
  const id=str(record.id).startsWith('dropbox:')?record.id.slice(8):'';
  if(record.removed||record.deleted||record.source!=='dropbox'||!fileId(id)||record.sourceFolder!==song.dropboxUrl||!folderURL(record.sourceFolder))continue;
  const path=str(record.path),parts=path.split('/');
  if(!path.startsWith('/')||path.includes('\\')||parts.slice(1).some(p=>!p||p==='.'||p==='..')||parts.at(-1)!==record.name)continue;
  out.push({kind:'file',songId:song.id,materialId:record.id,fileId:id,name:str(record.name),path,rev:str(record.rev)});
 }
 for(const record of list(song.production?.sourceFacts)){
  if(!record.removed&&!record.deleted&&record.id&&record.scope==='source-material'&&fileId(record.sourceId))out.push({kind:'file',songId:song.id,materialId:record.id,fileId:record.sourceId,name:str(record.name),rev:str(record.rev)});
 }
 if(folderURL(song.dropboxUrl))out.push({kind:'folder',songId:song.id,url:song.dropboxUrl});
 return out.filter((source,i)=>out.findIndex(other=>other.kind===source.kind&&other.materialId===source.materialId&&other.url===source.url)===i);
}
const isDone=value=>!!value?.done||value?.workState==='done'||value?.state==='done'||value?.kind==='completed';
const isExcluded=value=>!!value?.excluded||value?.workState==='na'||value?.state==='na';
function tentative(song,stage,slot){
 const saved=song.stages?.[stage.k]||{};
 return !!(slot.tentative||slot.prov||slot.swait||slot.kind==='tentative'||saved.prov||saved.st==='studio'||song.production?.dateKinds?.[stage.k]==='tentative'||song.production?.tasks?.['stage:'+stage.k]?.dueKind==='tentative');
}
function confirmed(song,stage,slot){return !tentative(song,stage,slot)&&(slot.kind==='confirmed'||song.production?.dateKinds?.[stage.k]==='confirmed'||song.production?.tasks?.['stage:'+stage.k]?.dueKind==='confirmed');}
// Only complete, explicit time ranges followed by a person label become draft rows.
// Surnames stay exactly as written. A studio in slot.who is never used as a singer.
function parseTimedSections(note){
 const normalized=str(note).replace(/[０-９：]/g,char=>String.fromCharCode(char.charCodeAt(0)-0xfee0)),out=[];
 const pattern=/(?<!\d)(?<!\d:)(\d{1,2}:[0-5]\d)\s*[–—−\-〜～~]\s*(\d{1,2}:[0-5]\d)\s+([^\n\r／/;；]+)/g;
 for(const match of normalized.matchAll(pattern)){
  const minutes=time=>{const [hour,minute]=time.split(':').map(Number);return hour<24?hour*60+minute:NaN;},start=minutes(match[1]),end=minutes(match[2]),person=match[3].trim();
  if(!Number.isFinite(start)||!Number.isFinite(end)||start>=end||!person||/[\d:：?？]/.test(person)||/未定|調整|候補|仮|休憩|休み|昼食|撤収|準備|スタジオ|studio/i.test(person))continue;
  const prefix=normalized.slice(Math.max(0,match.index-25),match.index);
  if(/(?:仮|候補|未定|調整中)[：:\s]*$/.test(prefix))continue;
  out.push({start:match[1].padStart(5,'0'),end:match[2].padStart(5,'0'),person});
 }
 return out.filter((row,i)=>out.findIndex(other=>JSON.stringify(other)===JSON.stringify(row))===i);
}
function select(state,{today=tokyoToday(),now,days=30}={}){
 if(now!==undefined)today=tokyoToday(now);
 if(!validDate(today)||!Number.isInteger(days)||days<1||days>366)throw Error('準備対象の日付範囲を確認してください。');
 const through=addDays(today,days-1),inWindow=date=>validDate(date)&&date>=today&&date<=through,targets=[],pending=[];
 const songs=list(state?.songs).filter(song=>song?.id&&!song.deleted&&!song.removed),projects=list(state?.projects);
 const base=(song,kind)=>({id:kind+':'+song.id,kind,projectId:str(song.projectId),artist:str(song.artist),title:str(song.title),dates:[],songIds:[song.id],sources:sourcesOf(song),needs:[]});
 const hold=(target,reason,label,extra={})=>pending.push({...target,reason,label,...extra});
 for(const song of songs){
  const definitions=list(song.stageList).filter(stage=>['vocal','revocal'].includes(core.scheduleKind(stage)));
  if(!definitions.length)continue;
  const active=new Set(core.activeStages(song).map(stage=>stage.k)),target={...base(song,'rec'),slots:[],dateSources:[]};let hasDate=false,held=false,unfinished=false;
  for(const stage of definitions){
   const saved=song.stages?.[stage.k]||{},excluded=isExcluded(song)||!active.has(stage.k)||isExcluded(saved),done=isDone(song)||isDone(saved);
   if(!excluded&&!done)unfinished=true;
   for(const slot of list(saved.slots)){
    if(validDate(slot.date))hasDate=true;
    if(!inWindow(slot.date))continue;
    const reason=excluded||isExcluded(slot)?'excluded':done||isDone(slot)?'done':tentative(song,stage,slot)?'tentative':'';
    if(reason){hold({...target,dates:[slot.date]},reason,{excluded:'対象外',done:'実施済み',tentative:'日程は仮・確認待ち'}[reason],{stageKey:stage.k,slotId:str(slot.slotId)});held=true;continue;}
    target.dates.push(slot.date);
    target.dateSources.push({songId:song.id,stageKey:stage.k,slotId:str(slot.slotId),date:slot.date,kind:confirmed(song,stage,slot)?'confirmed':'registered'});
    if(confirmed(song,stage,slot))for(const section of parseTimedSections(slot.note))target.slots.push({songId:song.id,date:slot.date,...section,place:str(slot.who),stageKey:stage.k,slotId:str(slot.slotId)});
   }
  }
  target.dates=unique(target.dates).sort();
  target.slots=target.slots.filter((row,i,rows)=>rows.findIndex(other=>other.date===row.date&&other.start===row.start&&other.end===row.end&&other.person===row.person)===i).sort((a,b)=>(a.date+a.start).localeCompare(b.date+b.start));
  if(target.dates.length){
   if(!target.sources.length)target.needs.push('Dropbox資料未登録');
   else if(!target.sources.some(source=>source.kind==='file'))target.needs.push('フォルダ内の資料選択');
   if(target.dates.some(date=>!target.slots.some(slot=>slot.date===date)))target.needs.push('歌唱者別の確定時間割');
   targets.push(target);
  }else if(unfinished&&!hasDate&&!held)hold(target,'undated','REC日程未定');
 }
 const groups=new Map();
 for(const song of songs.filter(song=>song.use==='live')){const key=song.projectId?'project:'+song.projectId:'song:'+song.id;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(song);}
 for(const [key,group] of groups){
  const project=projects.find(project=>project.id===group[0].projectId),explicit=group.some(song=>['open','rehearsal','live'].some(field=>str(song.dates?.[field])));
  const target={...base(group[0],'live'),id:'live:'+key,title:str(project?.custom||project?.title||project?.name)||group.map(song=>song.title).join('・'),artist:str(project?.artist)||group[0].artist,songIds:[],sources:[],dateSources:[]};let hasDate=false,held=false;
  for(const song of group){
   const events=['open','rehearsal','live'].map(field=>({field,date:song.dates?.[field]})).filter(event=>validDate(event.date));
   if(!explicit&&(project?.mode==='live'||['live','ライブ'].includes(project?.kind))&&validDate(project?.release))events.push({field:'project.release',date:project.release});
   if(events.length)hasDate=true;
   for(const event of events){
    if(!inWindow(event.date))continue;
    const dateKind=song.production?.dateKinds?.[event.field],reason=isExcluded(song)?'excluded':isDone(song)||dateKind==='completed'?'done':dateKind==='tentative'||song.tentative||project?.tentative?'tentative':'';
    if(reason){hold({...base(song,'live'),dates:[event.date]},reason,{excluded:'対象外',done:'制作完了',tentative:'日程は仮・確認待ち'}[reason]);held=true;continue;}
    target.songIds.push(song.id);target.dates.push(event.date);target.dateSources.push({songId:song.id,field:event.field,date:event.date});
   }
  }
  target.songIds=unique(target.songIds);target.dates=unique(target.dates).sort();target.sources=group.filter(song=>target.songIds.includes(song.id)).flatMap(sourcesOf);
  if(target.dates.length){if(!target.sources.length)target.needs.push('Dropbox資料未登録');else if(!target.sources.some(source=>source.kind==='file'))target.needs.push('フォルダ内の資料選択');targets.push(target);}
  else if(!hasDate&&!held)hold({...target,songIds:group.map(song=>song.id)},'undated','公演・リハ日程未定');
 }
 const order=(a,b)=>(a.dates[0]||'9999').localeCompare(b.dates[0]||'9999')||a.id.localeCompare(b.id);
 return {today,through,targets:targets.sort(order),pending:pending.sort(order)};
}
root.ShinkouPreparationTargets={select,tokyoToday,parseTimedSections,sourcesOf};
if(typeof module!=='undefined')module.exports=root.ShinkouPreparationTargets;
})(typeof globalThis!=='undefined'?globalThis:this);
