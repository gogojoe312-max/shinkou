'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const P=require('../production.js'),C=require('../core.js'),today='2026-09-30';
const titles=['ちはやぶる（new ver.）','Super Duper Sugar Power（new ver.）','今日を胸に飾って'];
function fixture(){return {projects:[{id:'album',artist:'OCHA NORMA',kind:'アルバム'}],songs:titles.map((title,i)=>({id:'song-'+i,title,artist:'OCHA NORMA',projectId:'album',use:'master',sort:'album',customWorkflow:true,dates:{},credits:[],stageList:[{k:'prep',n:'歌詞・仮歌の共有／キー・構成・音源の版確認',productionGroup:'vocal'},{k:'booking',n:'歌録りの日程・スタジオ調整',productionGroup:'vocal'},{k:'record',n:'歌の録り直し',productionGroup:'vocal'},{k:'edit',n:'VoEDIT',productionGroup:'vocal'},{k:'mixing',n:'ミックス',productionGroup:'finish'}],stages:Object.fromEntries(['prep','booking','record','edit','mixing'].map(k=>[k,{done:false,workState:'todo',slots:[]}]))}))};}
const request='ちはやぶる、Super Duper、今日を胸に飾ってのVoDBは10/8.9にやります';
const intent=(text=request,f=fixture())=>P.scheduleIntent(text,f.songs,f.projects,today);
test('screenshot: all three names and both dates resolve to existing custom recording stages',()=>{
 const f=fixture(),before=JSON.stringify(f),r=intent(request,f);
 assert.deepEqual(r.indices,[0,1,2]);assert.deepEqual(r.dates,['2026-10-08','2026-10-09']);assert.equal(r.ops.length,6);
 assert(r.ops.every(op=>op.st==='record'&&op.t==='slot_add'));assert.equal(JSON.stringify(f),before);
});
test('mixed full names, English short names and versionless titles are all included in AI details',()=>{
 const f=fixture();assert.deepEqual(P.consultationTargets(f.songs,f.projects,request,'global',today).indices,[0,1,2]);
});
test('explicit completed different song is not silently dropped from multiple named tracks',()=>{
 const f=fixture();f.songs[0].stageList.forEach(x=>f.songs[0].stages[x.k].done=true);
 assert.deepEqual(P.consultationTargets(f.songs,f.projects,request,'global',today).indices,[0,1,2]);
 assert.equal(intent(request,f),null); // Reopening completed recording needs AI confirmation.
});
test('unknown or ambiguous names never produce a partial local operation list',()=>{
 assert.equal(intent('ちはやぶる、未登録曲のVoDBは10/8にやります'),null);
 const f=fixture();f.songs.push({...structuredClone(f.songs[1]),id:'other',title:'Super Duper Other'});
 assert.equal(intent(request,f),null);
 const selection=P.consultationTargets(f.songs,f.projects,'Super DuperのVoDBを確認','global',today);
 assert.equal(selection.ambiguous,true);assert.equal(selection.bulk,false);
});
test('questions, negation, tentative and different-per-song dates stay with AI',()=>{
 for(const text of ['ちはやぶるのVoDBは10/8ですか？','ちはやぶるのVoDBは10/8にやりません','ちはやぶるのVoDBは10/8予定かも','ちはやぶるのVoDBは10/8に仮で登録して','ちはやぶるのVoDBは10/8、Super Duperは10/9にやります'])assert.equal(intent(text),null,text);
});
test('shared Japanese dates and fully specified dates work; invalid calendar dates are rejected',()=>{
 for(const dates of ['10月8日・9日','10/8、10/9','2026/10/8・2026/10/9'])assert.deepEqual(intent(`ちはやぶるのVoDBは${dates}にやります`).dates,['2026-10-08','2026-10-09']);
 assert.equal(intent('ちはやぶるのVoDBは2026/2/30にやります'),null);
});
test('standard workflows retain their booking/execution distinction',()=>{
 const f=fixture();f.songs[0].customWorkflow=false;f.songs[0].stageList=[{k:'vo',n:'VoDBスケジュール',t:'multi'},{k:'vodb',n:'VoDB'}];f.songs[0].stages={vo:{slots:[]},vodb:{done:false}};
 assert.equal(intent('ちはやぶるのVoDBは10/8にやります',f).ops[0].st,'vo');
 assert.equal(C.isScheduledStage(f.songs[0].stageList[1]),false);
});
test('share/approval and editing labels are never mistaken for recording',()=>{
 for(const n of ['歌録り用アレンジの受領・確認','歌詞・仮歌の共有／キー・構成・音源の版確認','コーラス音源・編集の確認','VoEDIT','ミックスの試聴・最終OK'])assert.equal(C.scheduleKind({k:'custom',n}),'',n);
 assert.equal(C.isScheduledStage({k:'custom',n:'歌の録り直し'}),true);
});
const source=fs.readFileSync(require.resolve('../app.js'),'utf8');
function app(f=fixture()){
 let serial=0;const c={S:f,cur:null,RO:false,ShinkouCore:C,ShinkouProduction:P,D:{today:()=>today,md:d=>d.slice(5).replace('-','/')},stages:C.activeStages,isMulti:C.isScheduledStage,stg:(s,k)=>s.stages[k]||(s.stages[k]={slots:[]}),songTitle:s=>s.title,nfc:x=>x,uid:()=>`test-slot-${++serial}`,ANCHORS:{release:'発売日'}};
 vm.createContext(c);
 for(const [a,b]of [['async function aiCall(','/* opの対象'],['function aiResolve(','const AI_STLBL='],['function aiSummary(','/* プレビューで直せる'],['function aiApply(','let AIPV='],['function aiApplyBatch(','function aiPreview(']])vm.runInContext(source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a))),c);
 return c;
}
test('actual application: local interpretation, preview, saved dates, repeat input and booking completion',async()=>{
 const c=app(),r=await c.aiCall(request,'global'),rows=r.out.ops.map(c.aiResolve);
 assert(rows.every(x=>x.ok));assert.match(c.aiSummary(rows[0]),/10\/08/);
 assert.equal(c.aiApplyBatch(rows),6);
 for(const s of c.S.songs){
   assert.deepEqual(s.stages.record.slots.map(x=>x.date),['2026-10-08','2026-10-09']);
   assert(s.stages.record.slots.every(x=>x.slotId&&!x.done));assert.equal(s.stages.record.done,false);
   const report=P.report(s,{today});assert.equal(report.node['stage:booking'].done,true);assert.equal(report.node['stage:record'].done,false);
 }
 c.aiApplyBatch(r.out.ops.map(c.aiResolve));assert.equal(c.S.songs[0].stages.record.slots.length,2);
});
test('invalid dates and ambiguous slot updates fail validation before any write',()=>{
 const c=app(),s=c.S.songs[0];
 assert.equal(c.aiResolve({t:'slot_add',s:0,st:'record',date:'2026-02-30'}).ok,false);
 s.stages.record.slots=[{slotId:'a',date:'2026-10-08',who:'A'},{slotId:'b',date:'2026-10-08',who:'B'}];
 assert.equal(c.aiResolve({t:'slot_upd',s:0,st:'record',match:{date:'2026-10-08'},set:{date:'2026-10-09'}}).ok,false);
 assert.equal(c.aiResolve({t:'slot_upd',s:0,st:'record',match:{slotId:'a'},set:{date:'2026-10-09'}}).ok,true);
});
test('stale slot update rolls the entire batch back and preserves pending changes',()=>{
 const c=app();c.S.songs[0].stages.record.slots=[{slotId:'old',date:'2026-10-08',who:''}];
 const add=c.aiResolve({t:'slot_add',s:1,st:'record',date:'2026-10-09'}),upd=c.aiResolve({t:'slot_upd',s:0,st:'record',match:{slotId:'old'},set:{date:'2026-10-09'}});
 c.S.songs[0].stages.record.slots[0].date='2026-10-10';const before=JSON.stringify(c.S);
 assert.throws(()=>c.aiApplyBatch([add,upd]),/更新/);assert.equal(JSON.stringify(c.S),before);
});
test('stable song IDs survive song order changes while AI is answering',()=>{
 const c=app(),out={ops:[{t:'slot_add',s:0,st:'record',date:'2026-10-08'}]},context={targeting:{},songs:[{i:0,id:'song-0'}]};
 c.aiBindTargets(out,context);c.S.songs.reverse();const r=c.aiResolve(out.ops[0]);assert.equal(r.song.id,'song-0');
 c.S.songs=c.S.songs.filter(s=>s.id!=='song-0');assert.equal(c.aiResolve(out.ops[0]).ok,false);
});
test('read-only and excluded stages cannot be scheduled',()=>{
 const c=app(),op={t:'slot_add',s:0,st:'record',date:'2026-10-08'},row=c.aiResolve(op);c.RO=true;assert.throws(()=>c.aiApplyBatch([row]),/閲覧/);
 c.RO=false;c.S.songs[0].stages.record.excluded=true;assert.equal(c.aiResolve(op).ok,false);
});
test('VoEDIT and other English editing labels wait for recording, then become actionable',()=>{
 for(const label of ['VoEDIT','Vo Edit','EDIT','ChoEDIT','エディット']){
  const s=fixture().songs[0];s.stageList.find(x=>x.k==='edit').n=label;
  s.stages.record.slots=[{date:'2026-10-08',done:false},{date:'2026-10-09',done:false}];
  let r=P.report(s,{today});assert(r.node['stage:edit'].blockers.includes('stage:record'),label);assert(!r.actions.some(a=>a.id==='stage:edit'),label);
  s.stages.prep.done=true;s.stages.record.done=true;
  r=P.report(s,{today});assert(r.actions.some(a=>a.id==='stage:edit'),label);
 }
});
function releaseUI(s){
 const r=P.report(s,{today}),c={ShinkouCore:C,ShinkouProduction:P,D:{today:()=>today},productionDate:d=>d.value.slice(5).replace('-','/'),songTitle:s=>s.title,esc:x=>String(x||''),productionBallText:()=>'',productionReleaseGroups:()=>[{p:null,artist:s.artist,items:[{s,r}],done:0}]};
 vm.createContext(c);const ui=fs.readFileSync(require.resolve('../production-ui.js'),'utf8');vm.runInContext(ui.slice(ui.indexOf('function productionUpcomingVocal('),ui.indexOf('function refreshProductionReleases(')),c);return c;
}
test('release row shows recording wait with both dates, never VoEDIT or a recording deadline',()=>{
 const s=fixture().songs[0];s.stages.record.slots=[{date:'2026-10-08',done:false},{date:'2026-10-09',done:false}];
 s.stages.prep.done=true;
 const c=releaseUI(s),html=c.productionReleaseContents([s]);
 assert.match(html,/歌録り待ち/);assert.match(html,/VoDB 10\/08・10\/09/);assert.doesNotMatch(html,/VoEDIT|締切 10\/08/);
});
test('scheduled recording cannot hide unfinished recording preparation',()=>{
 const s=fixture().songs[0];s.stages.record.slots=[{date:'2026-10-08',done:false}];
 const c=releaseUI(s),html=c.productionReleaseContents([s]);
 assert.match(html,/歌録り準備が未完了/);assert.match(html,/VoDB 10\/08/);assert.doesNotMatch(html,/歌録り待ち/);
});
test('finished, excluded and unscheduled recordings do not display a future recording wait',()=>{
 const s=fixture().songs[0];let c=releaseUI(s);assert.equal(c.productionUpcomingVocal(s,P.report(s,{today})),null);
 s.stages.record.slots=[{date:'2026-10-08',done:false}];s.stages.record.done=true;c=releaseUI(s);assert.equal(c.productionUpcomingVocal(s,P.report(s,{today})),null);
 s.stages.record.done=false;s.stages.record.excluded=true;c=releaseUI(s);assert.equal(c.productionUpcomingVocal(s,P.report(s,{today})),null);
});
