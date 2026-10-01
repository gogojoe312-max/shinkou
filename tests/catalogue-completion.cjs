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
 assert.match(html,/Catalogue A<\/strong><span class="viewer-status complete">/);assert.match(html,/✓ 完了 1曲/);assert.match(html,/Unknown B<\/strong><\/span><span class="polished-state">制作状況未登録/);assert.match(html,/Rework D<\/strong><\/span><span class="polished-state">制作状況未登録/);assert.equal(JSON.stringify({p,songs}),before);
});
test('completed-only and search include standalone existing tracks',()=>{
 const p={id:'album',artist:'Example Artist',tracklist:[known('Catalogue A'),{title:'Unknown B'}]},c=ui([p],[],{fin:'done'});
 assert.match(c.productionReleaseContents([]),/Catalogue A/);assert.doesNotMatch(c.productionReleaseContents([]),/Unknown B/);
 c.V.q='Catalogue A';assert.match(c.productionReleaseContents([]),/Catalogue A/);
 c.V.q='no match';assert.doesNotMatch(c.productionReleaseContents([]),/Catalogue A/);
 c.V.q='';c.V.fin='hide';assert.doesNotMatch(c.productionReleaseContents([]),/Catalogue A/);
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
 const html=c.productionReleaseContents([]);assert.match(html,/✓ 完了 2曲/);assert.match(html,/Unknown A<\/strong><\/span><span class="polished-state">制作状況未登録/);
 p.note='04・05の既存曲は追加作業なしではない。';assert(p.tracklist.every(t=>!c.productionTrackComplete(t,p)));
 p.note='04・05の既存曲は追加作業なし。';p.tracklist[3].additionalProduction=true;p.tracklist[4].kind='version';assert(p.tracklist.every(t=>!c.productionTrackComplete(t,p)));
});
