'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const P=require('../production.js');
const projects=[{id:'f',artist:'譜久村聖',kind:'シングル'},{id:'r',artist:'ロージークロニクル',kind:'シングル'},{id:'a',artist:'ロージークロニクル',kind:'アルバム'},{id:'l',artist:'ロージークロニクル',kind:'ライブ'}];
const songs=projects.flatMap(p=>[false,true].map((done,i)=>({id:p.id+i,title:p.id+'曲'+i,projectId:p.id,artist:p.artist,use:p.kind==='ライブ'?'live':'master',sort:'album',dates:{},credits:[],stageList:[{k:'mas',n:'マスタリング'}],stages:{mas:{done}},production:{tasks:{full:{state:'undecided'}}}})));
const select=(text,previous='')=>P.consultationTargets(songs,projects,text,'global','2026-09-29',previous);
test('artist abbreviations and single project choose all songs, including completed',()=>{
 assert.deepEqual(select('譜久村のシングル曲を全部工程完了させて').indices,[0,1]);
 assert.deepEqual(select('ロージー曲のシングルを全て完了に').indices,[2,3]);
});
test('multiple artists form a union, not a single-song ambiguity',()=>{
 const r=select('譜久村とロージー曲のシングル曲を全部工程完了させて');
 assert.deepEqual(r.indices,[0,1,2,3]);assert.equal(r.bulk,true);assert.equal(r.selected,-1);
});
test('new artist/kind replaces previous song, album and live excluded',()=>{
 assert.deepEqual(select('譜久村のシングル曲を全部完了に','r曲0の編集について').indices,[0,1]);
 assert.deepEqual(select('ロージーのアルバムを全部','f曲0について').indices,[4,5]);
});
test('kind exclusion is respected and reads do not change completion',()=>{
 const before=JSON.stringify(songs);
 assert.deepEqual(select('ロージーのシングル以外を全部').indices,[4,5,6,7]);
 assert.equal(JSON.stringify(songs),before);
});
