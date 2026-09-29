'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),P=require('../production.js');
test('finishing work alone is not final approval; old completed songs stay completed',()=>{
 const list=P.expandWorkflow([{k:'demo'},{k:'arr'},{k:'td'},{k:'mas'}]),s={sort:'album',dates:{},credits:[],stageList:list,stages:{td:{done:true},mas:{done:true}}};
 let r=P.report(s);assert.equal(r.node.mix.done,false);assert.equal(r.audioComplete,false);
 s.stages.mixCheck={done:true};s.stages.masterCheck={done:true};r=P.report(s);assert(r.node.mix.done);assert(r.audioComplete);
 s.stageList=[{k:'td'},{k:'mas'}];assert(P.report(s).audioComplete);
});
test('booking can start early; required materials block recording; no SE template pollution',()=>{
 const list=P.expandWorkflow([{k:'demo'},{k:'arr'},{k:'vo'},{k:'vodb'},{k:'mas'}]);
 const r=P.report({sort:'album',stageList:list,stages:{},dates:{},credits:[]});
 assert.deepEqual(r.node['stage:masterBooking'].blockers,[]);
 assert(r.node.vocal.blockers.includes('stage:vocalReady'));
 assert.equal(P.expandWorkflow(list).length,list.length);
 assert.deepEqual(P.expandWorkflow([{k:'se'}]),[{k:'se'}]);
});
test('release groups isolate projects, include completed tracks and exclude live material',()=>{
 const songs=[{id:'a',title:'A',projectId:'p1',artist:'同じ',ord:2},{id:'b',title:'B',projectId:'p1',artist:'同じ',ord:1},{id:'c',title:'C',projectId:'p2',artist:'同じ'},{id:'l',projectId:'p1',live:true}];
 const projects=[{id:'p1',kind:'アルバム',tracklist:[{title:'A'},{title:'B'}]},{id:'p2',kind:'シングル'}];
 const ctx={ShinkouProduction:P,productionIsLive:s=>!!s.live,projOf:id=>projects.find(p=>p.id===id),isShow:()=>false,productionReport:s=>({audioComplete:s.id==='b',nodes:[]}),pool:()=>songs};
 vm.createContext(ctx);
 const src=fs.readFileSync(__dirname+'/../production-ui.js','utf8');
 vm.runInContext(src.slice(src.indexOf('function productionReleaseGroups'),src.indexOf('function productionReleaseContents')),ctx);
 const g=ctx.productionReleaseGroups([songs[0]],songs);
 assert.equal(g.length,1);assert.deepEqual(Array.from(g[0].items,x=>x.s.id),['a','b']);assert.equal(g[0].done,1);
});
