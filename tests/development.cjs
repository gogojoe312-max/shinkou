'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const P=require('../production.js');
const app=fs.readFileSync(__dirname+'/../app.js','utf8'),ctx={};vm.createContext(ctx);
vm.runInContext(app.slice(app.indexOf('function demoDevelopmentStages('),app.indexOf('function newSong(')),ctx);
const basic=[{k:'demo',n:'デモ完成'},{k:'meeting',n:'曲確認'},{k:'full',n:'曲・歌詞のフルサイズ化'},{k:'recordable',n:'アレンジを詰める（歌録り用）'},{k:'arr',n:'アレンジ'},{k:'stemO',n:'ステム 発注'},{k:'stemR',n:'ステム 受領'}];
function song(){return {sort:'album',dates:{},credits:[],stageList:ctx.demoDevelopmentStages(basic),stages:{demo:{done:true},meeting:{done:true}}};}
test('song and lyric commissions each have request, revisions and receipt/approval stages',()=>{
 const s=song();assert.equal(s.stageList.filter(x=>x.k.startsWith('fullMusic')).length,3);assert.equal(s.stageList.filter(x=>x.k.startsWith('fullLyrics')).length,3);
 assert.equal(ctx.demoDevelopmentStages(s.stageList).length,s.stageList.length);
 assert.equal(ctx.demoDevelopmentStages([{k:'se',n:'SE'}]).length,1);
});
test('request and receipt cannot complete full-size approval',()=>{
 const s=song();P.apply(s,'stage:fullMusicRequest',{state:'requested',owner:'作曲担当'},'2026-09-29');
 let r=P.report(s);assert.equal(r.node['stage:fullMusicRequest'].wait,true);assert.equal(r.node.full.done,false);
 P.apply(s,'stage:fullMusicCheck',{state:'received'},'2026-09-29');
 r=P.report(s);assert.equal(r.node['stage:fullMusicCheck'].done,false);
 assert(r.node.full.blockers.includes('stage:fullMusicCheck'));assert(r.node.full.blockers.includes('stage:fullLyricsCheck'));
 P.apply(s,'stage:fullMusicCheck',{state:'done'},'2026-09-29');
 assert(P.report(s).node.full.blockers.includes('stage:fullLyricsCheck'));
});
test('arrangement refinement requires a commission and full material, stems follow approval',()=>{
 const r=P.report(song());assert(r.node['stage:arrangeWork'].blockers.includes('stage:arrangeRequest'));
 assert(r.node['stage:arrangeWork'].blockers.includes('full'));assert(r.node.recordable.blockers.includes('stage:arrangeWork'));
 assert(r.node['stage:stemO'].blockers.includes('recordable'));assert(r.node.stems.blockers.includes('stage:stemO'));
});
test('existing completion and special workflows are not reopened',()=>{
 const s={sort:'album',dates:{},credits:[],stageList:basic.filter(x=>!['full','recordable'].includes(x.k)),stages:{arr:{done:true}},production:{tasks:{full:{state:'done'}}}};
 const r=P.report(s);assert(r.node.full.done);assert(r.node.recordable.done);assert(!r.node['stage:fullMusicRequest']);
});
