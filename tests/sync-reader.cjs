'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const app=fs.readFileSync(__dirname+'/../app.js','utf8'),ui=fs.readFileSync(__dirname+'/../ui.js','utf8');
const copy=x=>JSON.parse(JSON.stringify(x));
function harness(){
 const elements=new Map(),events=[];
 const element=id=>{if(!elements.has(id))elements.set(id,{id,style:{},open:false,classList:{on:false,contains(){return this.on},add(){this.on=true},remove(){this.on=false},toggle(){}},setAttribute(){},getAttribute(){return ''},addEventListener(){},querySelectorAll(){return []},querySelector(){return null}});return elements.get(id)};
 const c={crypto,TextEncoder,TextDecoder,URL,URLSearchParams,setTimeout(){},clearTimeout(){},setInterval(){},clearInterval(){},localStorage:{getItem(){return null},setItem(){}},location:{pathname:'/',search:'',protocol:'https:'},navigator:{onLine:true},document:{getElementById:element,querySelectorAll(){return []},querySelector(){return null},addEventListener(){},body:element('body')},window:{addEventListener(){}},ShinkouCore:require('../core.js'),ShinkouProduction:require('../production.js'),ShinkouSecurity:require('../security.js'),ShinkouServer:{enabled:false},ShinkouViewState:{capture(){events.push('capture');return {}},restore(){events.push('restore')}},events,config:{owner:'fixture',repo:'private-fixture',path:'data.json',branch:'main'},remote:null};
 vm.createContext(c);vm.runInContext(app.replace('const syCfg=', 'let syCfg=').replace('const syOk=', 'let syOk='),c);vm.runInContext(ui.slice(ui.indexOf('function payloadSignature('),ui.indexOf('function matchesWho(')),c);
 vm.runInContext(`globalThis.counts={migrate:0,render:0,draw:0,base:0};const realMigrate=migrate;migrate=x=>{counts.migrate++;return realMigrate(x)};syOk=()=>true;syCfg=()=>config;syDot=(s,m)=>{globalThis.lastSync={s,m}};flush=async()=>{};ghRead=async()=>({json:structuredClone(remote)});sbPut=async()=>{counts.base++};render=()=>{counts.render++;events.push('render')};head=()=>{};drawSong=()=>{counts.draw++;events.push('draw')};globalThis.getState=()=>S;globalThis.getSync=()=>SY;globalThis.setState=x=>{S=x};globalThis.load=x=>{S=migrate(x)};globalThis.current=id=>{cur=id?S.songs.find(x=>x.id===id):null};globalThis.currentId=()=>cur?.id||'';globalThis.blank=()=>BLANK();globalThis.setDay=day=>{D.today=()=>day};`,c);
 c.structuredClone=structuredClone;c.element=element;return c;
}
function fixture(c){const r=copy(c.blank());delete r.settings;r.songs=[{id:'song-a',title:'Fixture A',artist:'Fixture',templateId:'tpl_single',stageList:[{k:'demo',n:'デモ完成'}],stages:{demo:{done:false}},dates:{},credits:[{kind:'composer',name:'Fixture author'}]},{id:'song-b',title:'Fixture B',stageList:[],stages:{},dates:{},credits:[]}];return r}
function countReset(c){Object.keys(c.counts).forEach(k=>c.counts[k]=0);c.events.length=0}
test('unchanged legacy source does not migrate, save or redraw after its first successful read',async()=>{
 const c=harness();c.remote=fixture(c);c.load(c.remote);await c.syncReadOnly('start');countReset(c);
 c.remote.at=999;await c.syncReadOnly('poll');await c.syncReadOnly('focus');assert.deepEqual(copy(c.counts),{migrate:0,render:0,draw:0,base:0});assert.deepEqual(c.events,[]);
});
test('a real change updates once, keeps device settings and captures after async saving',async()=>{
 const c=harness();c.remote=fixture(c);c.load(c.remote);await c.syncReadOnly('start');c.getState().settings={localOnly:'device'};c.current('song-a');c.element('sheet').classList.on=true;countReset(c);
 c.remote.songs[0].title='Changed fixture';c.flush=async()=>{c.events.push('flush')};await c.syncReadOnly('poll');assert.equal(c.getState().songs[0].title,'Changed fixture');assert.equal(c.getState().settings.localOnly,'device');assert.equal(c.counts.render,1);assert.equal(c.counts.draw,1);assert.deepEqual(c.events,['flush','flush','capture','render','draw','restore']);
});
test('navigation during the last save wins and a closed song sheet stays closed',async()=>{
 const c=harness();c.remote=fixture(c);c.load(c.remote);await c.syncReadOnly('start');c.current('song-a');c.element('sheet').classList.on=true;c.remote.songs[0].title='Changed fixture';let flushes=0;
 c.flush=async()=>{if(++flushes===2){c.current('song-b');c.element('sheet').classList.on=false}};countReset(c);await c.syncReadOnly('poll');assert.equal(c.currentId(),'song-b');assert.equal(c.counts.draw,0);assert.equal(c.element('sheet').classList.on,false);
});
test('removing the open song closes it instead of redrawing an absent record',async()=>{
 const c=harness();c.remote=fixture(c);c.load(c.remote);await c.syncReadOnly('start');c.current('song-a');c.element('sheet').classList.on=true;c.remote.songs=c.remote.songs.filter(s=>s.id!=='song-a');countReset(c);await c.syncReadOnly('poll');assert.equal(c.currentId(),'');assert.equal(c.element('sheet').classList.on,false);assert.equal(c.counts.draw,0);
});
test('connection and local changes invalidate the unchanged-source cache',async()=>{
 const c=harness();c.remote=fixture(c);c.load(c.remote);await c.syncReadOnly('start');countReset(c);c.config.repo='other-fixture';await c.syncReadOnly('poll');assert.equal(c.counts.migrate,1);countReset(c);c.getState().songs[0].title='Local change';await c.syncReadOnly('poll');assert.equal(c.counts.migrate,1);assert.equal(c.getState().songs[0].title,'Fixture A');
});
test('failed migration preserves the visible state and successful signature',async()=>{
 const c=harness();c.remote=fixture(c);c.load(c.remote);await c.syncReadOnly('start');const state=c.getState(),signature=c.getSync().readRemoteSignature;c.remote.masters.artist=[1,2];countReset(c);await c.syncReadOnly('poll');assert.equal(c.getState(),state);assert.equal(c.getSync().readRemoteSignature,signature);assert.equal(c.counts.render,0);assert.equal(c.lastSync.s,'err');
});
test('object key order is irrelevant, array order remains a real update',async()=>{
 const c=harness();c.remote=fixture(c);c.load(c.remote);await c.syncReadOnly('start');countReset(c);c.remote=Object.fromEntries(Object.entries(c.remote).reverse());await c.syncReadOnly('poll');assert.equal(c.counts.migrate,0);c.remote.songs.reverse();await c.syncReadOnly('poll');assert.equal(c.counts.render,1);assert.equal(c.getState().songs[0].id,'song-b');
});
test('a source changed while the request was pending cannot apply the old response',async()=>{
 const c=harness();c.remote=fixture(c);c.load(c.remote);await c.syncReadOnly('start');const state=c.getState();countReset(c);c.ghRead=async()=>{c.config.repo='new-fixture';return {json:{...c.remote,songs:[]}}};await c.syncReadOnly('poll');assert.equal(c.getState(),state);assert.equal(c.counts.migrate,0);assert.equal(c.counts.render,0);
});

test('crossing midnight refreshes date-dependent views once without remigrating the source',async()=>{
 const c=harness();c.setDay('2026-01-01');c.remote=fixture(c);c.load(c.remote);await c.syncReadOnly('start');countReset(c);c.setDay('2026-01-02');await c.syncReadOnly('poll');assert.equal(c.counts.migrate,0);assert.equal(c.counts.render,1);assert.deepEqual(c.events,['capture','render','restore']);countReset(c);await c.syncReadOnly('poll');assert.equal(c.counts.render,0);
});
