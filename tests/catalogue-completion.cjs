'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function ui(projects,songs=[],overrides={}){
 const c={S:{projects,songs,log:[]},V:{q:'',who:'all',dir:'__all',use:'master',fin:'show',...overrides},isShow:p=>p?.mode==='live',projOf:id=>projects.find(p=>p.id===id),productionReport:s=>({archive:!!s.complete,audioComplete:!!s.complete,nodes:[]}),esc:s=>String(s||''),productionCompactItem:s=>'<div data-song="'+s.id+'">'+s.title+' '+(s.complete?'完了':'進行中')+'</div>',productionDateKind:()=>'',productionEvidenceHTML:()=>'',ShinkouProduction:{RELEASE_TASKS:[]}};
 c.pool=()=>songs.filter(s=>c.V.fin!=='done'||s.complete);
 vm.createContext(c);const source=fs.readFileSync(__dirname+'/../production-ui.js','utf8');vm.runInContext(source.slice(source.indexOf('function productionIsLive('),source.indexOf('function refreshProductionReleases(')),c);return c;
}
const known=title=>({title,kind:'existing',additionalProduction:false});
test('explicit existing recordings are complete without invented work stages',()=>{
 const p={id:'album',tracklist:[known('Catalogue A'),{title:'Unknown B'},{title:'New C',kind:'new',additionalProduction:false},{title:'Rework D',kind:'existing',additionalProduction:true}]},songs=[{id:'s',title:'New C',projectId:'album'}],before=JSON.stringify({p,songs}),c=ui([p],songs);
 const html=c.productionReleaseContents(songs);
 assert.match(html,/Catalogue A<\/strong><span class="viewer-status complete">/);assert.match(html,/✓ 完了 1</);assert.match(html,/Unknown B<\/strong><\/span><span class="polished-state">制作状況未登録/);assert.match(html,/Rework D<\/strong><\/span><span class="polished-state">制作状況未登録/);assert.equal(JSON.stringify({p,songs}),before);
});
test('completed-only and search include standalone existing tracks',()=>{
 const p={id:'album',artist:'Example Artist',tracklist:[known('Catalogue A'),{title:'Unknown B'}]},c=ui([p],[],{fin:'done'});
 assert.match(c.productionReleaseContents([]),/Catalogue A/);assert.doesNotMatch(c.productionReleaseContents([]),/Unknown B/);
 c.V.q='Catalogue A';assert.match(c.productionReleaseContents([]),/Catalogue A/);
 c.V.q='no match';assert.doesNotMatch(c.productionReleaseContents([]),/Catalogue A/);
 c.V.q='';c.V.fin='hide';assert.match(c.productionReleaseContents([]),/Catalogue A/);
});
test('project-local pending work and new versions never inherit catalogue completion',()=>{
 const p={id:'album',tracklist:[known('Same title'),{title:'New version',kind:'version',additionalProduction:false}]},songs=[{id:'s',title:'Same title',projectId:'album'}],c=ui([p],songs,{fin:'done'});
 assert.equal(c.productionTrackComplete(p.tracklist[0],p),false);assert.equal(c.productionTrackComplete(p.tracklist[1],p),false);assert.doesNotMatch(c.productionReleaseContents([]),/Same title/);
});
test('an existing recording in another project does not need duplicate song records',()=>{
 const p={id:'album',tracklist:[{...known('Catalogue A'),songId:'single-track'}]},songs=[{id:'single-track',title:'Catalogue A',projectId:'single'}],c=ui([p],songs);
 assert.match(c.productionReleaseContents([]),/Catalogue A<\/strong><span class="viewer-status complete">/);assert.equal(songs.length,1);
});

test('legacy note declarations apply only to their explicit track numbers',()=>{
 const p={id:'album',note:'04・05の既存曲は追加作業なし。\n発売日未定。',tracklist:[{title:'Unknown A'},{title:'New B',kind:'new'},{title:'Unknown C'},{title:'Catalogue D'},{title:'Catalogue E'}]},c=ui([p],[]);
 assert.deepEqual(p.tracklist.map(t=>c.productionTrackComplete(t,p)),[false,false,false,true,true]);
 const html=c.productionReleaseContents([]);assert.match(html,/✓ 完了 2</);assert.match(html,/Unknown A<\/strong><\/span><span class="polished-state">制作状況未登録/);
 p.note='04・05の既存曲は追加作業なしではない。';assert(p.tracklist.every(t=>!c.productionTrackComplete(t,p)));
 p.note='04・05の既存曲は追加作業なし。';p.tracklist[3].additionalProduction=true;p.tracklist[4].kind='version';assert(p.tracklist.every(t=>!c.productionTrackComplete(t,p)));
});

test('hide completed retains all tracks of an unfinished work in track order',()=>{
 const p={id:'album',tracklist:[known('First'),{title:'Second'},known('Third'),{title:'Fourth'}]},songs=[{id:'2',title:'Second',projectId:'album',complete:true},{id:'4',title:'Fourth',projectId:'album'}],c=ui([p],songs,{fin:'hide'}),before=JSON.stringify({p,songs});
 const html=c.productionReleaseContents([songs[1]]);
 assert(html.indexOf('First')<html.indexOf('Second'));assert(html.indexOf('Second')<html.indexOf('Third'));assert(html.indexOf('Third')<html.indexOf('Fourth'));
 assert.match(html,/Second 完了/);assert.match(html,/First<\/strong><span class="viewer-status complete">/);assert.doesNotMatch(html,/class="polished-completed"/);
 c.V.fin='show';assert.match(c.productionReleaseContents(songs),/First/);c.V.fin='hide';assert.equal(c.productionReleaseContents([songs[1]]),html);assert.equal(JSON.stringify({p,songs}),before);
});
test('only wholly completed works disappear; unknown tracks and common work remain',()=>{
 const p={id:'album',tracklist:[known('First')]},c=ui([p],[],{fin:'hide'});
 assert.doesNotMatch(c.productionReleaseContents([]),/First/);c.V.fin='show';assert.match(c.productionReleaseContents([]),/First/);c.V.fin='hide';
 p.tracklist.push({title:'Unknown'});assert.match(c.productionReleaseContents([]),/First/);assert.match(c.productionReleaseContents([]),/制作状況未登録/);p.tracklist.pop();
 c.ShinkouProduction.RELEASE_TASKS=[{id:'credits',label:'Credits'}];c.ShinkouProduction.STATES={};c.ShinkouProduction.releaseTask=()=>({state:'unknown'});assert.match(c.productionReleaseContents([]),/First/);
 c.ShinkouProduction.releaseTask=()=>({state:'todo'});assert.match(c.productionReleaseContents([]),/First/);
 c.ShinkouProduction.releaseTask=()=>({state:'done'});assert.doesNotMatch(c.productionReleaseContents([]),/First/);
});
test('search never mistakes a completed matching subset for a completed work',()=>{
 const p={id:'album',tracklist:[known('Match'),{title:'Pending'}]},c=ui([p],[],{fin:'hide',q:'Match'});
 assert.match(c.productionReleaseContents([]),/Match/);assert.doesNotMatch(c.productionReleaseContents([]),/Pending/);
});
test('registered completed tracks remain visible when only common work is pending',()=>{
 const p={id:'single'},songs=[{id:'s',title:'Done track',projectId:'single',complete:true}],c=ui([p],songs,{fin:'hide'});
 c.ShinkouProduction.RELEASE_TASKS=[{id:'credits',label:'Credits'}];c.ShinkouProduction.STATES={};c.ShinkouProduction.releaseTask=()=>({state:'unknown'});
 assert.match(c.productionReleaseContents([]),/Done track 完了/);c.ShinkouProduction.releaseTask=()=>({state:'done'});assert.doesNotMatch(c.productionReleaseContents([]),/Done track/);
});
