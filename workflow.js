/* 外部情報を制作記録と分けて扱う。推測だけで完了・送付・予定確定にしない。 */
(function(root){
'use strict';
const norm=v=>String(v||'').normalize('NFKC').toLowerCase().replace(/[\s　「」『』!！?？・\/／_－—–-]/g,'');
const text=(v,max=4000)=>String(v??'').trim().slice(0,max);
const safeURL=value=>{if(!value)return '';try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:''}catch{return ''}};
const validDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(v||'')&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const kindNames={demo:'フルサイズの参考音源',lyrics:'歌詞',stems:'録音用ステム',split:'歌割',rough:'編集後ラフ',vocal:'編集済みの歌',chorus:'コーラス',instrument:'楽器素材',arrange:'最終アレンジ素材',mix:'最終ミックス',credits:'クレジット',invoice:'請求書',other:'その他'};
const sets={recording:{name:'歌録り前',kinds:['demo','lyrics','stems']},teacher:{name:'先生への送付',kinds:['split','rough']},mix:{name:'ミックス前',kinds:['vocal','chorus','instrument','arrange']},master:{name:'マスタリング前',kinds:['mix','lyrics','credits']}};
const list=(s,key)=>Array.isArray(s.workflow?.[key])?s.workflow[key]:[];
function upsert(s,key,item){s.workflow||={};s.workflow[key]||=[];const i=s.workflow[key].findIndex(x=>x.id===item.id);if(i<0)s.workflow[key].push(item);else s.workflow[key][i]=item;return item}
function match(songs,source){
 if(source.songId){const s=songs.find(x=>x.id===source.songId);return {songId:s?.id||'',candidates:s?[s.id]:[],reason:s?'曲ID一致':'曲IDが見つかりません'}}
 const title=norm(source.title||source.subject),artist=norm(source.artist),body=norm(source.subject||source.title||'');
 let found=songs.filter(s=>[s.title,s.work,...(s.workflow?.aliases||[])].some(v=>norm(v)&&norm(v)===title));
 if(artist)found=found.filter(s=>norm(s.artist)===artist);
 if(!found.length)found=songs.filter(s=>[s.title,s.work,...(s.workflow?.aliases||[])].some(v=>norm(v).length>=3&&body.includes(norm(v)))&&(!artist||norm(s.artist)===artist));
 return {songId:found.length===1?found[0].id:'',candidates:found.map(x=>x.id),reason:found.length===1?'曲名・登録した略称に一致':found.length?'複数の曲が候補です':'曲を選んでください'};
}
function materialKind(name){const n=String(name||'');for(const [re,k]of [[/請求|invoice/i,'invoice'],[/歌割|割り|split/i,'split'],[/credit|クレジット/i,'credits'],[/歌詞|lyric/i,'lyrics'],[/stem|ステム/i,'stems'],[/rough|ラフ/i,'rough'],[/chorus|cho.?edit|コーラス/i,'chorus'],[/vocal|vo.?edit|歌編集/i,'vocal'],[/mix|ミックス|TD/i,'mix'],[/demo|デモ/i,'demo']])if(re.test(n))return k;return 'other'}
function materialReport(s,set){
 const def=sets[set];if(!def)throw Error('用途を選んでください');
 const kinds=def.kinds.filter(k=>!(k==='chorus'&&s.production?.chorus==='none')&&!(k==='instrument'&&s.production?.instruments==='none'));
 return kinds.map(kind=>{const files=list(s,'materials').filter(x=>x.kind===kind&&!x.removed),approved=files.filter(x=>x.approved&&(!x.rev||x.approvedRev===x.rev)&&!x.deleted);return {kind,label:kindNames[kind],files,approved,ready:approved.length>0}});
}
function saveMaterial(s,value){
 if(!value.id||!Object.hasOwn(kindNames,value.kind)||!text(value.name,200))throw Error('資料名と種類を確認してください');
 const url=safeURL(value.url);if(value.url&&!url)throw Error('httpsの資料リンクを入力してください');
 const old=list(s,'materials').find(x=>x.id===value.id),changed=old&&(old.rev!==value.rev||old.url!==url||old.name!==value.name);
 const row={...old,...value,name:text(value.name,200),url,kind:value.kind,approved:changed?false:!!value.approved};
 if(row.approved)row.approvedRev=row.rev||'';
 if(changed&&old.approved)row.previousApproval={name:old.name,rev:old.rev||'',at:old.approvedAt||''};
 return upsert(s,'materials',row);
}
function materialBundle(s,set){const report=materialReport(s,set),files=report.flatMap(x=>x.approved);return {missing:report.filter(x=>!x.ready).map(x=>x.label),files,text:files.map(x=>kindNames[x.kind]+'：'+x.name+(x.url?'\n'+x.url:'')).join('\n\n')}}
function saveCommunication(s,value){
 if(!value.id||!['review','reply','waiting','done'].includes(value.state))throw Error('対応状況を選んでください');
 const url=safeURL(value.url);if(value.url&&!url)throw Error('元の連絡のURLを確認してください');
 if(value.due&&!validDate(value.due))throw Error('確認期限の日付を確認してください');
 if(!text(value.subject,240)&&!text(value.person,120))throw Error('用件か相手の名前を入力してください');
 if(value.email&&!validEmail(value.email))throw Error('メールアドレスを確認してください');
 const row={...list(s,'communications').find(x=>x.id===value.id),id:value.id,subject:text(value.subject,240),person:text(value.person,120),email:text(value.email,200),channel:['email','line','meeting'].includes(value.channel)?value.channel:'email',state:value.state,due:text(value.due,10),taskId:text(value.taskId,100),memo:text(value.memo),url,sourceId:text(value.sourceId,200),sourceModified:text(value.sourceModified,100),updatedAt:value.updatedAt||Date.now()};
 return upsert(s,'communications',row);
}
function communicationDraft(s,c){const title=s.title||s.work||'曲名未登録',who=c.person||'ご担当者';return {to:c.email||'',subject:(c.state==='waiting'?'進捗のご確認／':'ご相談／')+title,body:who+'さま\n\nお世話になっております。\n\n'+(s.artist?s.artist+' ':'')+'「'+title+'」について、'+(c.state==='waiting'?'ご相談している件の進捗を確認させてください。':'ご相談です。')+'\n'+(c.memo?'\n'+c.memo+'\n':'')+(c.due?'\n'+c.due+'までのご対応が可能か、あわせてお知らせいただけますでしょうか。\n':'')+'\nよろしくお願いいたします。'}}
function validEmail(v){return /^[^\s@,;<>\r\n]+@[^\s@,;<>\r\n]+\.[^\s@,;<>\r\n]+$/.test(v||'')}
function priorities(songs,reports,today){
 const out=[];for(const s of songs){const r=reports(s);if(r.archive)continue;
  for(const c of list(s,'communications').filter(c=>c.state!=='done'&&r.node[c.taskId]?.state!=='undecided')){const days=c.due?Math.round((Date.parse(c.due)-Date.parse(today))/864e5):null;out.push({songId:s.id,type:'communication',id:c.id,title:c.state==='reply'?'返信する：'+(c.person||c.subject):c.state==='waiting'?'返答を確認：'+(c.person||c.subject):'対応が必要か確認：'+c.subject,reason:c.due?'確認期限 '+c.due:c.state==='review'?'連絡内容を確認して、次に誰が動くか決めます':'連絡と次の日程を確認します',score:days===null?c.state==='reply'?0:75:days<0?-150+days:days})}
  for(const a of r.actions.slice(0,3))out.push({songId:s.id,type:'task',id:a.id,title:a.title,reason:a.reason,score:a.score});
  for(const i of list(s,'issues').filter(i=>!i.resolved&&i.action==='rerecord'))out.push({songId:s.id,type:'issue',id:i.id,title:'再録の段取りを確認',reason:i.memo||i.tags?.join('・')||'歌チェックからの申し送り',score:5});
 }
 return out.sort((a,b)=>a.score-b.score).filter((x,i,a)=>a.findIndex(y=>y.songId===x.songId&&y.type===x.type&&y.id===x.id)===i).slice(0,3);
}
function impact(s,taskId,newDate,report){
 const r=report(s),root=r.node[taskId];if(!root||!validDate(newDate))return [];
 const after=new Set(),visit=id=>{for(const n of r.nodes)if(n.deps?.includes(id)&&!after.has(n.id)){after.add(n.id);visit(n.id)}};visit(taskId);
 return r.nodes.filter(n=>after.has(n.id)&&!n.done).map(n=>({id:n.id,label:n.label,date:n.due?.value||'',kind:n.due?.kind||'',risk:!!n.due?.value&&n.due.value<=newDate,reason:n.due?.value&&n.due.value<=newDate?'前工程と同日以前のため、日程調整が必要です':'必要な作業時間と納期を確認してください'}));
}
function freeSlots(events,day,duration,start='10:00',end='21:00',now=Date.now()){
 if(!validDate(day)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(end)||!Number.isFinite(duration))throw Error('日付・作業時間を確認してください');
 const lo=Date.parse(day+'T'+start+':00+09:00'),hi=Date.parse(day+'T'+end+':00+09:00');if(!Number.isFinite(lo)||!Number.isFinite(hi)||hi<=lo||duration<15||duration>660)throw Error('日付・作業時間を確認してください');
 const busy=events.filter(e=>e.status!=='cancelled'&&e.transparency!=='transparent'&&!(e.attendees||[]).some(a=>a.self&&a.responseStatus==='declined')).map(e=>({start:Date.parse(e.start?.dateTime||(e.start?.date+'T00:00:00+09:00')),end:Date.parse(e.end?.dateTime||(e.end?.date+'T00:00:00+09:00'))})).filter(e=>Number.isFinite(e.start)&&Number.isFinite(e.end)&&e.end>lo&&e.start<hi).sort((a,b)=>a.start-b.start);
 let cursor=Math.max(lo,Math.ceil(now/9e5)*9e5);const out=[];
 for(const b of [...busy,{start:hi,end:hi}]){if(b.start-cursor>=duration*60000)out.push({start:new Date(cursor).toISOString(),end:new Date(cursor+duration*60000).toISOString()});cursor=Math.max(cursor,b.end);if(cursor>=hi)break}return out.slice(0,5);
}
function utacheck(data){
 const s=data?.state||data;if(!s||!Array.isArray(s.songs)||!Array.isArray(s.notes))throw Error('歌チェックの記録ファイルを選んでください');
 return s.songs.map(song=>({id:String(song.id),title:text(song.title||song.name,200),artist:text(song.artist||s.groups?.find(g=>g.id===song.groupId)?.name,120),notes:s.notes.filter(n=>n.songId===song.id).map(n=>({id:'utacheck:'+n.id,sourceId:String(n.id),memo:text(n.memo||n.hand?.text),tags:(n.tags||[]).map(x=>text(x,80)),members:(n.memberIds||[]).map(id=>text(s.members?.find(m=>m.id===id)?.name||id,100)),lineIdx:n.lineIdx,lineEnd:n.lineEnd||null,at:n.at,sourceModified:n.ts||0,action:'check',resolved:false}))})).filter(s=>s.notes.length);
}
function importIssues(s,source){for(const issue of source.notes){const old=list(s,'issues').find(x=>x.id===issue.id);if(!old||old.sourceModified!==issue.sourceModified||JSON.stringify([old.memo,old.tags,old.members])!==JSON.stringify([issue.memo,issue.tags,issue.members]))upsert(s,'issues',{...issue,...(old?{action:old.action,resolved:false}:{}),sourceSongId:source.id})}s.workflow||={};s.workflow.utacheckSongId=source.id}
const workKinds={vocal:'VoDB',edit:'EDIT',mix:'TD',chorusEdit:'Cho Edit',other:'ディレクター業務'};
function saveWork(s,value){
 if(!value.id||!Object.hasOwn(workKinds,value.kind)||!validDate(value.date)||!/^\d\d:\d\d$/.test(value.start)||!/^\d\d:\d\d$/.test(value.end)||value.end<=value.start)throw Error('実施日と開始・終了時刻を確認してください');
 const valid=t=>+t.slice(0,2)<24&&+t.slice(3)<60;if(!valid(value.start)||!valid(value.end))throw Error('時刻を確認してください');
 return upsert(s,'workLogs',{id:value.id,kind:value.kind,date:value.date,start:value.start,end:value.end,confirmed:!!value.confirmed,memo:text(value.memo,1000),person:text(value.person,120)});
}
function csv(songs,from,to){
 const quote=v=>'"'+String(v??'').replace(/^[=+\-@\t\r]/,"'$&").replaceAll('"','""')+'"';
 const rows=[['曲ID','正式タイトル','アーティスト','作業','実施日','開始','終了','担当','メモ']];
 for(const s of songs)for(const w of list(s,'workLogs').filter(x=>x.confirmed&&!x.removed&&x.kind!=='other'&&x.date>=from&&x.date<=to))rows.push([s.id,s.title||s.work||'',s.artist||'',workKinds[w.kind],w.date,w.start,w.end,w.person,w.memo]);
 return '\ufeff'+rows.map(r=>r.map(quote).join(',')).join('\r\n');
}
function weekly(songs,from,to){const rows=songs.flatMap(s=>list(s,'workLogs').filter(w=>w.confirmed&&!w.removed&&w.date>=from&&w.date<=to).map(w=>({s,w}))).sort((a,b)=>a.w.date.localeCompare(b.w.date)||a.w.start.localeCompare(b.w.start));return rows.length?rows.map(({s,w})=>w.date+' '+w.start+'–'+w.end+'\n'+[s.artist,s.title||s.work,workKinds[w.kind],w.memo].filter(Boolean).join('／')).join('\n\n'):'この期間の実施確認済みの記録はありません。'}
function progress(songs,report){return songs.map(s=>{const r=report(s);return [s.artist||'',s.title||s.work||'曲名未登録',r.audioComplete?'音源制作完了':r.groups.filter(g=>g.done).map(g=>g.label+'完了').join('・')||'状況確認中',...Object.entries(r.dates).filter(([k,d])=>['release','master','vocal','open'].includes(k)&&d.value).map(([k,d])=>({release:'発売',master:'マスタリング',vocal:'歌録り',open:'公演初日'}[k])+': '+d.value+'（'+({target:'目安',tentative:'仮',confirmed:'確定',completed:'完了',registered:'登録日'}[d.kind]||'登録日')+'）')].filter(Boolean).join('\n')}).join('\n\n')}
function catalog(songs){return {app:'shinkou',schema:'song-catalog-v1',songs:songs.map(s=>({id:s.id,title:s.title||'',workingTitle:s.work||'',artist:s.artist||'',aliases:s.workflow?.aliases||[],dropboxUrl:s.dropboxUrl||''}))}}
root.ShinkouWorkflow={norm,safeURL,validDate,kindNames,sets,list,upsert,match,materialKind,materialReport,saveMaterial,materialBundle,saveCommunication,communicationDraft,validEmail,priorities,impact,freeSlots,utacheck,importIssues,workKinds,saveWork,csv,weekly,progress,catalog};if(typeof module!=='undefined')module.exports=root.ShinkouWorkflow;
})(typeof globalThis!=='undefined'?globalThis:this);
