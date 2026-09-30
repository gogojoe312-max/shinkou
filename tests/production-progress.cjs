'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const P=require('../production.js'),C=require('../core.js'),today='2026-09-30';
function song(){
 const names={vo:'VoDBスケジュール',vodb:'VoDB',cho:'ChoDBスケジュール',chodb:'ChoDB',choed:'ChoEDIT',instdb:'楽器DB'};
 const keys=[...new Set([...P.defs.flatMap(d=>d.keys),'cho','mixBrief'])];
 const s={id:'song',title:'確認曲',artist:'確認用',sort:'album',use:'master',dates:{},credits:[],stageList:keys.map(k=>({k,n:names[k]||k,gp:k.startsWith('cho')?'ChoDB':'',t:['vo','cho','tdes'].includes(k)?'multi':''})),stages:Object.fromEntries(keys.map(k=>[k,{done:true,slots:[]}])),production:{tasks:Object.fromEntries(P.defs.filter(d=>!d.keys.length).map(d=>[d.id,{state:'done'}]))}};
 for(const k of ['td','mas','mixCheck','masterCheck','mixBrief'])s.stages[k].done=false;
 return s;
}
function deferredChorus(){const s=song();for(const k of ['cho','chodb','choed'])Object.assign(s.stages[k],{done:false,workState:'undecided'});s.production.tasks.chorusRequest.state='undecided';return s;}
function arrangement(){const s=song();for(const k of ['recordable','vodb','rhythm','tsunagi','pitch','arr'])s.stages[k].done=false;s.stages.vo.slots=[{date:'2026-11-04',done:false},{date:'2026-11-05',done:false}];return s;}
const report=s=>P.report(s,{today});
function ui(s){
 const r=report(s),c={ShinkouCore:C,ShinkouProduction:P,D:{today:()=>today},RO:true,productionReport:()=>r,productionDate:d=>d.value?.slice(5).replace('-','/')||'未定',productionDateKind:()=>'',songTitle:s=>s.title,esc:x=>String(x||''),productionBallText:()=>'',productionReleaseGroups:()=>[{p:null,artist:s.artist,items:[{s,r}],done:0}]};
 vm.createContext(c);const src=fs.readFileSync(require.resolve('../production-ui.js'),'utf8');
 for(const [a,b] of [['function productionButton(','function productionIsLive('],['function productionUpcomingVocal(','function refreshProductionReleases(']])vm.runInContext(src.slice(src.indexOf(a),src.indexOf(b)),c);
 return c;
}
test('deferred unrecorded chorus stays visible after vocal editing and an old materials check',()=>{
 const s=deferredChorus(),before=JSON.stringify(s),r=report(s),c=ui(s);
 assert.equal(r.progress.state,'コーラス未収録');assert.match(r.progress.detail,/日程未定/);
 assert(r.progress.remaining.some(n=>n.id==='chorus'&&n.state==='undecided'));
 assert(r.node.mix.blockers.includes('chorus'));assert(r.node['stage:mixBrief'].blockers.includes('chorus'));
 assert(!r.actions.some(a=>['mix','stage:mixBrief'].includes(a.id)));
 assert.match(c.productionReleaseContents([s]),/コーラス未収録/);assert.match(c.productionSnapshot(s),/コーラス未収録/);
 assert.doesNotMatch(c.productionReleaseContents([s]),/編集済み|全素材と要望を共有/);
 assert.equal(JSON.stringify(s),before);
});
test('booked vocal dates do not conceal unfinished arrangement in either view',()=>{
 const s=arrangement(),r=report(s),c=ui(s);
 assert.equal(r.progress.state,'VoDB用アレンジ未完了');assert(r.node.vocal.blockers.includes('recordable'));
 for(const html of [c.productionReleaseContents([s]),c.productionSnapshot(s)]){assert.match(html,/VoDB用アレンジ未完了/);assert.doesNotMatch(html,/歌録り待ち/);}
 assert.match(c.productionReleaseContents([s]),/VoDB 11\/04・11\/05/);
});
test('completing the missing arrangement advances to recording while retaining the dates',()=>{
 const s=arrangement();s.stages.recordable.done=true;
 const r=report(s);assert.equal(r.progress.state,'歌録り待ち');assert.equal(r.progress.schedules[0].dates.length,2);
 s.stages.vodb.done=true;assert.equal(report(s).progress.state,'歌の編集未完了');assert.equal(report(s).progress.schedules.length,0);
});
test('recorded chorus with outstanding editing is never labelled unrecorded',()=>{
 const s=deferredChorus();s.stages.chodb.done=true;s.stages.cho.slots=[{date:'2026-10-08',done:false}];
 const r=report(s);assert.equal(r.progress.state,'コーラス編集未完了');assert.equal(r.progress.schedules.length,0);
});
test('explicitly unnecessary chorus does not block finishing',()=>{
 const s=deferredChorus();s.production.chorus='none';const r=report(s);
 assert(!r.progress.remaining.some(n=>n.id==='chorus'));assert(!r.node.mix.blockers.includes('chorus'));assert.notEqual(r.progress.state,'コーラス未収録');
});
test('assistant receives the same remaining work and prerequisites as the visible summary',()=>{
 const s=deferredChorus(),c={ShinkouProduction:P,ShinkouCore:C,S:{songs:[s],projects:[],masters:{},assistantRules:[]},D:{today:()=>today},songTitle:s=>s.title,projTitle:p=>p.custom,isShow:()=>false,sortOf:()=>'',songHasMV:()=>false,stages:C.activeStages,stg:(s,k)=>s.stages[k],isMulti:C.isScheduledStage,ANCHOR_KEYS:[],rulesForSong:()=>[]};
 vm.createContext(c);const src=fs.readFileSync(require.resolve('../app.js'),'utf8');vm.runInContext(src.slice(src.indexOf('function aiCtx('),src.indexOf('const AI_SYS=')),c);
 const out=c.aiCtx('song','状況を確認').songs[0];
 assert.equal(out.current_progress.state,'コーラス未収録');assert(out.incomplete_tasks.includes('chorus'));
 assert(!out.candidate_tasks.includes('stage:mixBrief'));assert(out.task_catalog.find(n=>n.id==='mix').blockers.includes('chorus'));
});
