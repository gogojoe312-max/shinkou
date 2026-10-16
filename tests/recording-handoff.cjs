'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),P=require('../production.js');
const today='2030-06-10';
function fixture(){return {customWorkflow:true,stageList:[
 {k:'version_recording_plan',n:'収録の日程・スタジオ調整',productionGroup:'vocal'},
 {k:'version_recording',n:'必要な歌・コーラス・楽器の収録',productionGroup:'vocal'},
 {k:'version_edit',n:'必要な音源編集',productionGroup:'vocal'}
],stages:{version_recording_plan:{done:true},version_recording:{},version_edit:{}},production:{selfName:'高崎'},workflow:{communications:[]}};}
function overview(s){const before=JSON.stringify(s),r=P.report(s,{today}),o=P.overview(s,r);assert.equal(JSON.stringify(s),before);return o;}
test('unscheduled recording assigns scheduling to the director without completing recording',()=>{
 for(const state of ['unknown','todo','undecided']){const s=fixture();s.stages.version_recording.workState=state;const o=overview(s);assert.equal(o.handoffStatus,'レコーディング日程を組む');assert.equal(o.handoffOwner,'高崎');assert.equal(o.handoffSide,'me');assert.equal(o.next.title,o.handoffStatus);assert.equal(o.next.owner,'高崎');assert(!o.completed.some(n=>n.id==='stage:version_recording'));}
 const s=fixture();delete s.production.selfName;assert.equal(overview(s).handoffOwner,'自分');
});
test('tentative dates require finalization and do not instruct recording execution',()=>{
 for(const change of [{slot:{kind:'tentative'}},{slot:{swait:true}},{stage:{prov:true}},{stage:{st:'studio'}},{dateKinds:{version_recording_plan:'tentative'}}]){
  const s=fixture();s.stages.version_recording_plan={...change.stage,slots:[{date:'2030-06-20',...change.slot}]};if(change.dateKinds)s.production.dateKinds=change.dateKinds;
  const o=overview(s);assert.equal(o.handoffStatus,'収録の日程確定を進める');assert.equal(o.handoffOwner,'高崎');assert(!o.next.scheduled);assert(!o.completed.some(n=>n.id==='stage:version_recording'));
 }
});
test('confirmed and registered future recordings wait on the date without an unknown owner',()=>{
 for(const kind of ['confirmed','registered']){const s=fixture();s.stages.version_recording_plan.slots=[{date:'2030-06-20',kind}];const o=overview(s);assert.equal(o.handoffStatus,'収録予定日待ち');assert.equal(o.handoffOwner,'');assert.equal(o.handoffSide,'date');assert(o.next.scheduled);assert.equal(o.ownReady.length,0);assert(!o.completed.some(n=>n.id==='stage:version_recording'));}
});
test('elapsed recording dates ask for execution status, never new booking or completion',()=>{
 const s=fixture();s.stages.version_recording_plan.slots=[{date:'2030-06-01'}];const o=overview(s);assert.equal(o.next.title,'収録の実施状況を確認する');assert.equal(o.next.owner,'高崎');assert(!o.completed.some(n=>n.id==='stage:version_recording'));
});
test('recording requests, receipt and booking replies keep their explicit handoffs',()=>{
 for(const state of ['requested','revision','received','review']){const s=fixture();s.stages.version_recording={st:['requested','revision'].includes(state)?'req':'me',workState:state,asg:'制作担当'};const o=overview(s);assert.doesNotMatch(o.handoffStatus,/日程を組む|日程確定/);assert.equal(!!o.next.after,['requested','revision'].includes(state));}
 const s=fixture();s.stages.version_recording_plan.done=false;s.workflow.communications=[{id:'booking',taskId:'stage:version_recording_plan',state:'waiting',person:'スタジオ',summary:'空き日程の返答待ち'}];const o=overview(s);assert.equal(o.handoffStatus,'空き日程の返答待ち');assert(o.next.after);assert.equal(o.ownReady.length,0);
});
test('unscheduled recording remains a director action alongside another production wait',()=>{
 const s=fixture();s.stageList.unshift({k:'arrangement',n:'編曲制作',productionGroup:'arrange'});s.stages.arrangement={st:'req',asg:'編曲担当'};
 let o=overview(s);assert.equal(o.handoffOwner,'編曲担当');assert(o.ownReady.some(n=>n.label==='レコーディング日程を組む'&&n.owner==='高崎'));
 s.stages.version_recording_plan.slots=[{date:'2030-06-20',kind:'tentative'}];o=overview(s);assert(o.ownReady.some(n=>n.label==='収録の日程確定を進める'));
 s.stages.version_recording_plan.slots[0].kind='confirmed';assert.equal(overview(s).ownReady.length,0);
 s.stages.version_recording_plan.slots=[];s.stages.version_recording={st:'req',asg:'収録担当'};assert.equal(overview(s).ownReady.length,0);
});
test('chorus and instrument recording use the same scheduling rule while completed recording stays completed',()=>{
 for(const [k,name,label] of [['chorusRecording','コーラス録音','コーラス録音日程を組む'],['instrumentRecording','楽器録音','楽器録音日程を組む']]){
  const s=fixture();s.stageList=[{k,n:name,productionGroup:'vocal'},{k:'editing',n:'音源編集',productionGroup:'vocal'}];s.stages={[k]:{},editing:{}};let o=overview(s);assert.equal(o.handoffStatus,label);s.stages[k].done=true;o=overview(s);assert(!o.ownReady.some(n=>n.label===label));assert.notEqual(o.handoffStatus,label);
 }
});
