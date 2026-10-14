'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const P=require('../production.js');
const today='2030-06-10';
const report=s=>P.report(s,{today});
const rows=(s,r=report(s))=>P.stageProgress(s,r).groups.flatMap(g=>g.rows);
function remake(){
 return {id:'example-song',customWorkflow:true,mvEnabled:false,stageList:[
  {k:'recording',n:'歌の録り直し',productionGroup:'vocal'},
  {k:'editing',n:'VoEDIT',productionGroup:'vocal'},
  {k:'unused',n:'コーラス収録',productionGroup:'chorus'}
 ],stages:{recording:{done:true,date:'2030-06-01'},editing:{workState:'todo',slots:[{slotId:'example-slot',date:'2030-06-14',kind:'tentative'}]},unused:{excluded:true}},production:{tasks:Object.fromEntries(P.defs.map(d=>[d.id,{excluded:true}]))},dates:{},workflow:{communications:[]}};
}
function normal(){
 return {id:'normal-example',mvEnabled:false,stageList:[
  {k:'vodb',n:'歌録り',gp:'VoDB'},
  {k:'voes',n:'VoEDIT日程',gp:'VoDB'},
  {k:'rhythm',n:'タイミング編集',gp:'VoDB'},
  {k:'tsunagi',n:'つなぎ編集',gp:'VoDB'},
  {k:'pitch',n:'音程編集',gp:'VoDB'}
 ],stages:{vodb:{done:true,date:'2030-06-01'},voes:{slots:[{slotId:'edit-slot',date:'2030-06-14',kind:'confirmed'}]},rhythm:{done:true,date:'2030-06-02'},tsunagi:{st:'me',asg:'編集担当'},pitch:{workState:'todo'}},production:{},dates:{}};
}
function uiContext(s,extra={}){
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const context=vm.createContext({ShinkouProduction:P,URL,Date,RO:true,VIEW_ONLY:false,S:{songs:[s],log:[]},D:{today:()=>today,md:d=>d.slice(5).replace('-','/'),addD:P.days},esc,relOf:()=>'',songTitle:()=> 'Example',...extra});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../production-ui.js'),'utf8'),context);
 return context;
}

test('custom workflow shows actual completed recording and scheduled editing in order',()=>{
 const s=remake(),before=JSON.stringify(s),r=report(s),vocal=P.stageProgress(s,r).groups.find(g=>g.id==='vocal');
 assert.deepEqual(vocal.rows.map(n=>n.id),['stage:recording','stage:editing']);
 assert.equal(vocal.rows[0].status,'完了');
 assert.equal(vocal.rows[1].status,'作業予定あり');
 assert.equal(vocal.rows[1].done,false);
 assert.ok(vocal.rows[1].dates.some(d=>d.date==='2030-06-14'&&d.kind==='tentative'));
 assert.match(vocal.rows[1].action,/VoEDITを実施する/);
 assert.equal(vocal.completed,1);
 assert.equal(vocal.pending,1);
 assert.equal(JSON.stringify(s),before);
});

test('excluded stages stay outside completed rows and counts',()=>{
 const s=remake(),flow=P.stageProgress(s,report(s));
 assert.ok(!flow.groups.some(g=>g.id==='chorus'));
 assert.ok(flow.excluded.some(n=>n.id==='stage:unused'));
 assert.ok(!rows(s).some(n=>n.id==='stage:unused'));
});

test('standard edit preserves completed substeps, pending substeps and booking date',()=>{
 const s=normal(),r=report(s),edit=rows(s,r).find(n=>n.id==='edit');
 assert.deepEqual(edit.parts.map(p=>[p.id,p.state]),[['stage:rhythm','done'],['stage:tsunagi','doing'],['stage:pitch','todo']]);
 assert.equal(edit.done,false);
 assert.equal(edit.parts[1].status,'編集担当が作業中');
 assert.ok(edit.dates.some(d=>d.date==='2030-06-14'&&d.type==='work'&&d.kind==='confirmed'));
 const booking=rows(s,r).find(n=>n.id==='stage:voes');
 assert.equal(booking.bookingDerived,true);
 assert.equal(booking.status,'日程登録済み');
 assert.equal(r.node.edit.done,false);
});

test('reply takes current attention without erasing revision or source ownership',()=>{
 const s=remake();s.stages.editing={st:'req',workState:'revision',asg:'制作担当',memo:'過去の相談記録'};
 s.workflow.communications=[{id:'reply-record',taskId:'stage:editing',state:'reply',person:'制作担当',subject:'修正方針の確認',updatedAt:20}];
 const before=JSON.stringify(s),r=report(s),o=P.overview(s,r),row=rows(s,r).find(n=>n.id==='stage:editing');
 assert.equal(r.node['stage:editing'].state,'revision');
 assert.equal(r.node['stage:editing'].owner,'制作担当');
 assert.match(o.headline,/本人回答待ち/);
 assert.equal(o.next.owner,'自分');
 assert.match(o.next.title,/修正方針の確認.*回答する/);
 assert.equal(o.next.after,undefined);
 assert.equal(row.productionStatus,'修正待ち');
 assert.equal(row.status,'本人回答待ち');
 assert.equal(r.actions[0].communicationId,'reply-record');
 assert.equal(JSON.stringify(s),before);
});

test('review attention is executable even with unfinished production prerequisites',()=>{
 const s=remake();s.stages.recording.done=false;s.stages.editing={st:'req',workState:'revision'};
 s.workflow.communications=[{id:'review-record',taskId:'stage:editing',state:'review',subject:'資料確認',updatedAt:30}];
 const r=report(s);assert.ok(r.node['stage:editing'].blockers.length);
 assert.equal(r.actions[0].id,'stage:editing');
 assert.match(P.overview(s,r).headline,/本人確認待ち/);
 assert.equal(r.node['stage:editing'].state,'revision');
});

test('done and unrelated communications never override revision',()=>{
 const s=remake();s.stages.editing={st:'req',workState:'revision'};
 s.workflow.communications=[{id:'finished',taskId:'stage:editing',state:'done',updatedAt:40},{id:'unrelated',taskId:'missing',state:'reply',updatedAt:50}];
 const r=report(s);assert.equal(P.communicationAction(r.node['stage:editing']),null);
 assert.doesNotMatch(P.overview(s,r).headline,/本人回答待ち/);
 assert.equal(r.node['stage:editing'].state,'revision');
});

test('communication on a grouped child stage remains tied to its production task',()=>{
 const s=normal();s.stages.pitch={st:'req',workState:'revision',asg:'編集担当'};
 s.workflow={communications:[{id:'child-reply',taskId:'stage:pitch',state:'reply',subject:'音程の判断',updatedAt:10}]};
 const r=report(s);assert.equal(r.node.edit.state,'revision');
 assert.equal(P.overview(s,r).next.communicationId,'child-reply');
});

test('freeform notes never infer task completion, ownership or future dates',()=>{
 const s=remake();s.note='録音も編集も完了。翌週に提出。';s.stages.editing={memo:'担当が最終OKと書いた気がする'};
 const before=JSON.stringify(s),r=report(s),row=rows(s,r).find(n=>n.id==='stage:editing');
 assert.equal(row.state,'unknown');assert.equal(row.done,false);assert.equal(row.owner,'');assert.deepEqual(row.dates,[]);
 assert.equal(JSON.stringify(s),before);
});

test('past dates and targets remain distinct from confirmed work',()=>{
 const s=remake();s.stages.editing={workState:'todo',dl:'2030-06-03',slots:[{slotId:'old-slot',date:'2030-06-02'}]};
 const row=rows(s).find(n=>n.id==='stage:editing');
 assert.equal(row.done,false);assert.ok(row.dates.every(d=>d.kind==='registered'&&d.past));
 assert.ok(row.dates.some(d=>d.type==='due'));assert.ok(row.dates.some(d=>d.type==='work'));
});

test('main workflow is immediately visible while notes are collapsed and escaped',()=>{
 const s=remake();s.note='SONG_NOTE_ONLY';s.stages.editing.memo='<script>HISTORY_ONLY</script>';
 const ui=uiContext(s),html=ui.productionSnapshot(s);
 assert.match(html,/<section class="stage-progress"/);
 assert.match(html,/歌の録り直し/);assert.match(html,/VoEDIT/);assert.match(html,/作業予定あり/);
 assert.ok(html.indexOf('stage-progress')<html.indexOf('key-dates'));
 assert.doesNotMatch(html,/SONG_NOTE_ONLY/);
 assert.match(html,/<details class="stage-record-history"[^>]*><summary>過去の記録・メモ<\/summary>/);
 assert.match(html,/&lt;script&gt;HISTORY_ONLY&lt;\/script&gt;/);
 assert.doesNotMatch(html,/<script>HISTORY_ONLY/);
 assert.doesNotMatch(html,/<details[^>]*open[^>]*class="stage-record-history"/);
});

test('viewer restricted data never exposes historical notes',()=>{
 const s=remake();s.viewerRestricted=true;s.stages.editing.memo='PRIVATE_HISTORY';
 s.workflow.communications=[{id:'private-contact',taskId:'stage:editing',state:'reply',person:'PRIVATE_PERSON',subject:'PRIVATE_SUBJECT'}];
 const html=uiContext(s).productionSnapshot(s);assert.doesNotMatch(html,/PRIVATE_HISTORY/);
 assert.doesNotMatch(html,/PRIVATE_PERSON|PRIVATE_SUBJECT/);
 assert.equal(report(s).node['stage:editing'].communication,undefined);
 assert.deepEqual(rows(s).find(n=>n.id==='stage:editing').history,[]);
});

test('calendar reference identifiers never imply a confirmed date',()=>{
 const s=remake();s.stages.editing.slots=[{slotId:'linked-slot',calRef:'calendar-reference',date:'2030-06-14'}];
 let r=report(s),o=P.overview(s,r),row=rows(s,r).find(n=>n.id==='stage:editing');
 assert.ok(o.schedules.find(n=>n.id==='stage:editing').dates.every(d=>d.kind==='registered'));
 assert.ok(row.dates.every(d=>d.kind==='registered'));
 s.production.dateKinds={editing:'confirmed'};
 r=report(s);o=P.overview(s,r);row=rows(s,r).find(n=>n.id==='stage:editing');
 assert.ok(o.schedules.find(n=>n.id==='stage:editing').dates.every(d=>d.kind==='confirmed'));
 assert.ok(row.dates.every(d=>d.kind==='confirmed'));
});

test('project notes remain accessible only in their own collapsed history',()=>{
 const s=remake(),ui=uiContext(s),project={id:'example-project',note:'PROJECT_HISTORY_ONLY'};
 const html=ui.productionEvidenceHTML(project,{materials:[]},'projects');
 assert.match(html,/<details class="stage-record-history"[^>]*><summary>作品・公演のメモ<\/summary><p>PROJECT_HISTORY_ONLY<\/p><\/details>/);
 assert.doesNotMatch(ui.productionEvidenceHTML(project,{materials:[]},'songs'),/PROJECT_HISTORY_ONLY/);
});

test('reply attention appears once above the live workflow and keeps production revision',()=>{
 const s={id:'live-example',use:'live',stageList:[{k:'build',n:'音源制作',gp:'制作'}],stages:{build:{st:'req',workState:'revision',asg:'制作担当'}},dates:{},workflow:{communications:[{id:'live-reply',taskId:'stage:build',state:'reply',person:'制作担当',subject:'修正案の判断'}]}};
 const ui=uiContext(s),html=ui.productionSnapshot(s);
 const own=html.slice(html.indexOf('polished-action'),html.indexOf('stage-progress'));
 assert.match(own,/修正案の判断.*回答する/);assert.match(html,/制作記録：修正待ち/);
 assert.equal(report(s).node['stage:build'].state,'revision');
});

test('undecided stage never revives an unfinished old date in workflow rows',()=>{
 const s=remake();s.stages.editing={workState:'undecided',slots:[{slotId:'old',date:'2030-06-14'}]};
 const row=rows(s).find(n=>n.id==='stage:editing');
 assert.equal(row.status,'日程未定');assert.deepEqual(row.dates,[]);
});

test('excluded editor checkbox is disabled and unchecked',()=>{
 const s=remake(),ui=uiContext(s),n=report(s).node['stage:unused'];
 const html=ui.productionTaskRow(s,n);
 assert.match(html,/aria-checked="false"/);assert.match(html,/disabled/);assert.doesNotMatch(html,/production-check complete/);
});

test('read-only group refresh updates only a matching open sheet without reopening',()=>{
 const s=remake(),marker={dataset:{productionReadSong:s.id,productionReadGroup:'vocal'}};
 const body={dataset:{...marker.dataset},innerHTML:'old',querySelector:()=>marker};
 let open=true,reopened=0;
 const ui=uiContext(s,{document:{getElementById:id=>id==='sheet3'?{classList:{contains:()=>open}}:id==='s3Body'?body:null},s3:()=>{reopened++;}});
 assert.equal(ui.refreshProductionReadGroup(),true);assert.match(body.innerHTML,/VoEDIT/);assert.equal(reopened,0);
 body.innerHTML='unchanged';body.querySelector=()=>null;
 assert.equal(ui.refreshProductionReadGroup(),false);assert.equal(body.innerHTML,'unchanged');
 body.querySelector=()=>marker;open=false;
 assert.equal(ui.refreshProductionReadGroup(),false);assert.equal(body.innerHTML,'unchanged');
});

