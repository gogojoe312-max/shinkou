'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const read=p=>fs.readFileSync(require('node:path').join(__dirname,'..',p),'utf8');
test('retired GAS handlers never touch calendar, properties, data or locks',()=>{
 const c={};vm.createContext(c);vm.runInContext(read('gas/calendar-sync.gs'),c);
 for(const name of ['syncShinkouCal','exportCalendar_'])assert.equal(c[name]().disabled,true);
 assert.equal(c.expCal_(),null);assert.equal(typeof c.sync,'function');
 assert.doesNotMatch(read('gas/calendar-sync.gs'),/CalendarApp\.createCalendar|createAllDayEvent|ev\.deleteEvent/);
});
test('legacy workflow entry points are harmless and original state is preserved',()=>{
 const state={songs:[{id:'s',workflow:{calendarEvents:[{id:'old'}]}}],settings:{connections:{eventCalendar:'existing'}}};
 const before=JSON.stringify(state),messages=[];const c={ShinkouWorkflow:{},ShinkouConnections:{},S:state,toast:x=>messages.push(x)};vm.createContext(c);vm.runInContext(read('workflow-ui.js'),c);
 c.workflowCalendar();c.workflowCalendarConfirm();assert.equal(messages.length,2);assert.equal(JSON.stringify(state),before);
 assert.doesNotMatch(read('workflow-ui.js'),/wfGoogleEvent|wfCalendarFind|WC\.createEvent|\['calendar','空き時間/);
});
test('connector refuses event creation before accessing credentials or network',async()=>{
 const c={};vm.createContext(c);vm.runInContext(read('connections.js'),c);await assert.rejects(c.ShinkouConnections.createEvent('old',{}),/廃止/);
});
test('ICS download entrance is removed and old handler does not download',()=>{
 const source=read('app.js'),messages=[];assert.doesNotMatch(source,/id="calOut"|on\("#calOut"/);
 const start=source.indexOf('function exportICS(){'),end=source.indexOf('\n\nfunction dlFile',start);const c={toast:x=>messages.push(x)};vm.createContext(c);vm.runInContext(source.slice(start,end),c);c.exportICS();assert.equal(messages.length,1);
 assert.match(source,/function agenda\(/);assert.match(source,/カレンダー（週・月）/);
});
test('HTML and service worker use the same new asset revision',()=>{
 const html=read('index.html'),sw=read('sw.js'),revision=sw.match(/const CACHE='shinkou-v5-([^']+)'/)[1];
 assert(revision);for(const p of [html,sw]){assert(p.includes('?v='+revision));assert.doesNotMatch(p,/20261002details2/)}
 assert([...html.matchAll(/(?:src|href)="[^"]+\?v=([^"]+)/g)].every(m=>m[1]===revision));
});
