'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const P=require('../preparation-targets.js'),C=require('../core.js'),today='2026-10-16';
const folder='https://www.dropbox.com/scl/fo/folder/key?rlkey=test&dl=0';
function song(id='song'){return {id,title:'曲 '+id,artist:'同じアーティスト',projectId:'album',use:'master',dates:{release:'2026-10-20'},stageList:[{k:'vo',n:'VoDB日程',t:'multi'},{k:'vodb',n:'VoDB'},{k:'edit',n:'VoEDIT'},{k:'td',n:'TD'}],stages:{vo:{slots:[]},vodb:{},edit:{},td:{}}};}
function live(id,projectId,dates={}){return {...song(id),projectId,use:'live',dates,stageList:[{k:'make',n:'作成'}],stages:{make:{}}};}
const select=(songs,projects=[])=>P.select({songs,projects},{today});
test('Tokyo calendar day and inclusive 30-day window exclude past and day 31',()=>{
 assert.equal(P.tokyoToday('2026-10-15T15:00:00Z'),today);assert.equal(P.tokyoToday('2026-10-15T14:59:59Z'),'2026-10-15');
 const s=song();s.stages.vo.slots=['2026-10-15',today,'2026-11-14','2026-11-15','2026-02-30'].map(date=>({date}));
 const r=select([s]);assert.equal(r.through,'2026-11-14');assert.deepEqual(r.targets[0].dates,[today,'2026-11-14']);
 assert.equal(P.select({songs:[s]},{now:'2026-10-15T15:00:00Z'}).today,today);assert.throws(()=>P.select({}, {today:'2026-02-30'}));
});
test('only actual vocal/revocal slots qualify; EDIT, TD, release and deadlines never become REC dates',()=>{
 const s=song();s.stages.vo={date:today,dl:today};s.stages.edit.slots=[{date:today}];s.stages.td.slots=[{date:today}];
 let r=select([s]);assert.equal(r.targets.length,0);assert.equal(r.pending[0].label,'REC日程未定');
 s.stageList.push({k:'custom',n:'歌の録り直し'},{k:'extra',n:'追加歌録り'});s.stages.custom={slots:[{date:'2026-10-20'}]};s.stages.extra={slots:[{date:today}]};
 r=select([s]);assert.deepEqual(r.targets[0].dates,[today,'2026-10-20']);
});
test('duplicate booking/execution and duplicated calendar entries yield one target/date and preserve stable references',()=>{
 const s=song();s.stages.vo.slots=[{slotId:'booking1',date:today},{slotId:'booking2',date:today}];s.stages.vodb.slots=[{slotId:'recording',date:today}];
 const r=select([s]);assert.equal(r.targets.length,1);assert.deepEqual(r.targets[0].dates,[today]);assert.deepEqual(r.targets[0].dateSources.map(x=>x.slotId),['booking1','booking2','recording']);
});
test('done, excluded parent/child, waiting and tentative records never enter ready targets',()=>{
 const variants=[s=>s.stages.vo.done=true,s=>s.stages.vo.excluded=true,s=>s.stages.vo.slots[0].done=true,s=>s.stages.vo.slots[0].swait=true,s=>s.stages.vo.slots[0].kind='tentative',s=>s.stages.vo.prov=true,s=>s.stages.vo.st='studio',s=>s.production={dateKinds:{vo:'tentative'}}];
 for(const alter of variants){const s=song();s.stages.vo.slots=[{date:today}];alter(s);const r=select([s]);assert.equal(r.targets.length,0);assert.equal(r.pending.length,1);assert(r.pending[0].label);}
 const s=song();s.stageList=[{k:'parent',n:'グループ',d:0},{k:'vo',n:'VoDB',d:1}];s.stages.parent={excluded:true};s.stages.vo.slots=[{date:today}];assert.equal(select([s]).targets.length,0);
});
test('LIVE groups exact project IDs, uses explicit song dates and ignores conflicting project release',()=>{
 const a=live('a','p',{open:'2026-11-02'}),b=live('b','p',{rehearsal:'2026-10-31'}),c=live('c','other',{live:'2026-11-03'});
 const r=select([a,b,c],[{id:'p',kind:'ライブ',custom:'公演',release:'2026-11-08'},{id:'other',kind:'ライブ',custom:'同じグループ別公演'}]);
 assert.equal(r.targets.length,2);assert.deepEqual(r.targets[0].dates,['2026-10-31','2026-11-02']);assert.deepEqual(r.targets[0].songIds,['a','b']);assert.deepEqual(r.targets[1].songIds,['c']);
 const old=live('old','tour',{open:'2026-09-01'});assert.equal(select([old],[{id:'tour',kind:'ライブ',release:'2026-11-01'}]).targets.length,0);
 const master=song('master');master.dates.live=today;assert.equal(select([master]).targets.length,0);
});
test('only explicit live projects can supply a missing show date; deadlines and invalid dates stay pending',()=>{
 const s=live('s','p',{deliver:today});let r=select([s],[{id:'p',kind:'ライブ',release:'2026-11-02'}]);assert.deepEqual(r.targets[0].dates,['2026-11-02']);assert.equal(r.targets[0].dateSources[0].field,'project.release');
 for(const p of [{id:'p',kind:'アルバム',release:today},{id:'p',kind:'ライブ',release:'2026-09-01'},{id:'p',kind:'ライブ'}])assert.equal(select([s],[p]).targets.length,0);
 s.dates.open='2026-02-30';assert.equal(select([s],[{id:'p',kind:'ライブ',release:today}]).targets.length,0);
 s.dates.open=today;s.production={dateKinds:{open:'tentative'}};r=select([s]);assert.equal(r.targets.length,0);assert.equal(r.pending[0].reason,'tentative');
 s.production={};s.stages.make.done=true;assert.equal(select([s]).targets.length,1); // Finished production does not finish the future performance.
 s.production={dateKinds:{open:'completed'}};assert.equal(select([s]).targets.length,0);
});
test('source references stay bound to saved exact file registrations and the song Dropbox folder',()=>{
 const s=song();s.dropboxUrl=folder;s.stages.vo.slots=[{date:today}];s.workflow={materials:[{id:'dropbox:id:fileA',source:'dropbox',name:'歌詞.docx',path:'/資料/歌詞.docx',sourceFolder:folder,rev:'rev1'},{id:'dropbox:id:other',source:'dropbox',name:'歌詞.docx',path:'/歌詞.docx',sourceFolder:folder+'x'},{id:'dropbox:id:badPath',source:'dropbox',name:'歌詞.docx',path:'/../歌詞.docx',sourceFolder:folder}]};
 s.production={sourceFacts:[{id:'fact',scope:'source-material',sourceId:'id:fileB',sourceUrl:'https://unrelated.example/file'},{id:'removed',scope:'source-material',sourceId:'id:gone',removed:true},{id:'schedule',scope:'schedule',sourceId:'id:calendar'},{id:'urlOnly',scope:'source-material',sourceUrl:'https://www.dropbox.com/file'}]};
 const sources=select([s]).targets[0].sources;assert.deepEqual(sources.map(x=>x.materialId||x.url),['dropbox:id:fileA','fact',folder]);assert.equal(sources[0].rev,'rev1');assert.equal(sources[1].fileId,'id:fileB');assert(sources.every(x=>x.songId===s.id));assert(!JSON.stringify(sources).includes('unrelated'));
});
test('confirmed explicit time sections retain surnames and exact times without studio inference',()=>{
 const s=song(),note='10/16連絡済み（JST）：11:00–12:30 甲田／12:30–14:00 乙村／14:00–15:30 丙田／15:30–17:00 丁馬';
 s.stages.vo.slots=[{slotId:'source',date:today,kind:'confirmed',who:'音楽スタジオ',note}];s.stages.vodb.slots=[{slotId:'duplicate',date:today,kind:'confirmed',note}];
 const t=select([s]).targets[0];assert.equal(t.slots.length,4);assert.deepEqual(t.slots[0],{songId:'song',date:today,start:'11:00',end:'12:30',person:'甲田',place:'音楽スタジオ',stageKey:'vo',slotId:'source'});assert(!t.needs.includes('歌唱者別の確定時間割'));
 delete s.stages.vo.slots[0].kind;delete s.stages.vodb.slots[0].kind;assert.deepEqual(select([s]).targets[0].slots,[]);
 s.production={dateKinds:{vo:'confirmed'}};assert.equal(select([s]).targets[0].slots.length,4);
});
test('missing, reversed, invalid or tentative time/person fragments are never invented',()=>{
 for(const note of ['11:00 甲田','11:00– 甲田','25:00–26:00 甲田','12:00–11:00 甲田','11:00–12:00','11:00–12:00 未定','仮：11:00–12:00 甲田','11:00–12:00 休憩','11:00–12:00 甲田?','111:00–12:00 甲田'])assert.deepEqual(P.parseTimedSections(note),[],note);
 assert.deepEqual(P.parseTimedSections('９：００～１０：３０ 甲田'),[{start:'09:00',end:'10:30',person:'甲田'}]);
});
test('sorting, repeatability and browser entrypoint preserve all input records',()=>{
 const a=song('a'),b=song('b');a.stages.vo.slots=[{date:'2026-10-25'}];b.stages.vo.slots=[{date:today}];const state={songs:[a,b]},before=JSON.stringify(state),result=P.select(state,{today});
 assert.deepEqual(result.targets.map(x=>x.id),['rec:b','rec:a']);assert.equal(JSON.stringify(state),before);assert.deepEqual(P.select(state,{today}),result);
 const c={ShinkouCore:C,URL,Intl,Date};vm.createContext(c);vm.runInContext(fs.readFileSync(require.resolve('../preparation-targets.js'),'utf8'),c);assert.equal(JSON.stringify(c.ShinkouPreparationTargets.select(state,{today})),JSON.stringify(result));
});
