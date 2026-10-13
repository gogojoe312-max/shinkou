'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),view=require('../view-state.js');
// A small DOM double tests restoration contracts. Real layout remains a browser QA check.
class Element{
 constructor(tag,attrs={},children=[]){this.nodeType=1;this.tagName=tag.toUpperCase();this.attrs=attrs;this.id=attrs.id||'';this.children=[];this.scrollTop=0;this.scrollLeft=0;this.open=false;this.top=0;this.height=300;this.value='';this.disabled=false;this.readOnly=false;this.focusCalls=0;this.type='text';for(const c of children)this.add(c)}
 add(c){c.parentElement=this;this.children.push(c);return c}
 replace(children){for(const c of this.children)c.parentElement=null;this.children=[];children.forEach(c=>this.add(c))}
 get isConnected(){return !!this.doc}
 get doc(){return this._doc||this.parentElement?.doc}
 getAttribute(k){return this.attrs[k]??null} hasAttribute(k){return Object.hasOwn(this.attrs,k)}
 matches(selector){return selector.split(',').some(s=>{s=s.trim();const tag=s.match(/^\w+/)?.[0];if(tag&&tag.toUpperCase()!==this.tagName)return false;const attrs=[...s.matchAll(/\[([^=\]]+)(?:="([^\"]*)")?\]/g)];return attrs.every(([,k,v])=>v===undefined?this.hasAttribute(k):this.getAttribute(k)===v)})}
 closest(s){for(let e=this;e;e=e.parentElement)if(e.matches(s))return e;return null}
 contains(el){for(let e=el;e;e=e.parentElement)if(e===this)return true;return false}
 all(){return this.children.flatMap(c=>[c,...c.all()])}
 querySelectorAll(s){if(s.includes('>')){const [p,child]=s.split('>');return this.all().filter(e=>e.matches(child)&&e.parentElement?.matches(p))}return this.all().filter(e=>e.matches(s))}
 querySelector(s){return this.querySelectorAll(s)[0]||null}
 getBoundingClientRect(){const top=this.top-(this.parentElement?.scrollTop||0);return {top,bottom:top+this.height,height:this.height}}
 focus(options){this.focusCalls++;this.focusOptions=options;this.doc.activeElement=this}
 setSelectionRange(start,end,direction){this.selectionStart=start;this.selectionEnd=end;this.selectionDirection=direction}
}
function fixture(){const body=new Element('body'),doc={body,activeElement:body,getElementById(id){return body.all().find(e=>e.id===id)||null},querySelector:s=>body.querySelector(s),querySelectorAll:s=>body.querySelectorAll(s)};body._doc=doc;const main=body.add(new Element('main',{id:'main'})),detail=body.add(new Element('div',{id:'shBody'}));return {doc,body,main,detail}}
const fold=(key,open)=>{const e=new Element('details',{'data-state-fold':key},[new Element('summary')]);e.open=open;return e};
test('refresh preserves scoped open/closed folds and scroll; new folds keep their defaults',()=>{
 const {doc,main,detail}=fixture();main.add(fold('shared',true));detail.add(fold('shared',false));main.scrollTop=140;detail.scrollTop=90;main.scrollLeft=6;const saved=view.capture(doc);
 const a=fold('shared',false),b=fold('shared',true),fresh=fold('fresh',true);main.replace([a,fresh]);detail.replace([b]);main.scrollTop=0;detail.scrollTop=0;view.restore(saved,doc);
 assert.equal(a.open,true);assert.equal(b.open,false);assert.equal(fresh.open,true);assert.equal(main.scrollTop,140);assert.equal(main.scrollLeft,6);assert.equal(detail.scrollTop,90);
});
test('recreated focused field keeps text, selection and focus without firing input events',()=>{
 const {doc,detail}=fixture(),old=detail.add(new Element('textarea',{id:'editor'}));old.value='draft fixture';old.setSelectionRange(2,6,'backward');doc.activeElement=old;const saved=view.capture(doc),next=new Element('textarea',{id:'editor'});detail.replace([next]);doc.activeElement=doc.body;view.restore(saved,doc);
 assert.equal(next.value,'draft fixture');assert.equal(doc.activeElement,next);assert.equal(next.selectionStart,2);assert.equal(next.selectionEnd,6);assert.deepEqual(next.focusOptions,{preventScroll:true});
});
test('still-connected search is not refocused and its current input is not overwritten',()=>{
 const {doc,body}=fixture(),search=body.add(new Element('input',{id:'q'}));search.value='before';doc.activeElement=search;const saved=view.capture(doc);search.value='after';view.restore(saved,doc);assert.equal(search.value,'after');assert.equal(search.focusCalls,0);
});
test('focus resolves a recreated summary by its parent fold inside the correct container',()=>{
 const {doc,main,detail}=fixture(),a=main.add(fold('shared',true)),b=detail.add(fold('shared',true));doc.activeElement=b.children[0];const saved=view.capture(doc),next=fold('shared',false);detail.replace([next]);doc.activeElement=doc.body;view.restore(saved,doc);assert.equal(doc.activeElement,next.children[0]);assert.equal(a.children[0].focusCalls,0);
});
test('an inert or removed focus target is never focused',()=>{
 const {doc,detail}=fixture(),old=detail.add(new Element('textarea',{id:'editor'}));doc.activeElement=old;const saved=view.capture(doc),next=new Element('textarea',{id:'editor'});detail.replace([next]);detail.attrs.inert='';doc.activeElement=doc.body;view.restore(saved,doc);assert.equal(next.focusCalls,0);detail.replace([]);view.restore(saved,doc);assert.equal(doc.activeElement,doc.body);
});
test('visible row remains anchored if preceding content grows',()=>{
 const {doc,main}=fixture(),row=main.add(new Element('button',{'data-brief-song':'fixture'}));row.top=150;row.height=60;main.scrollTop=120;const saved=view.capture(doc),next=new Element('button',{'data-brief-song':'fixture'});next.top=200;next.height=60;main.replace([next]);view.restore(saved,doc);assert.equal(main.scrollTop,170);
});
test('password values are not copied into the refresh snapshot',()=>{
 const {doc,detail}=fixture(),input=detail.add(new Element('input',{id:'password'}));input.type='password';input.value='fixture-only';doc.activeElement=input;assert(!Object.hasOwn(view.capture(doc).focus,'value'));
});

test('duplicate song buttons do not restore scroll or focus onto the wrong occurrence',()=>{
 const {doc,main}=fixture(),first=main.add(new Element('button',{'data-brief-song':'fixture'})),second=main.add(new Element('button',{'data-brief-song':'fixture'}));first.top=0;first.height=30;second.top=160;second.height=50;main.scrollTop=130;doc.activeElement=second;const saved=view.capture(doc);
 const a=new Element('button',{'data-brief-song':'fixture'}),b=new Element('button',{'data-brief-song':'fixture'});a.top=0;b.top=240;main.replace([a,b]);doc.activeElement=doc.body;view.restore(saved,doc);assert.equal(main.scrollTop,130);assert.equal(a.focusCalls,0);assert.equal(b.focusCalls,0);
});
test('stable view toggle focus survives replacement',()=>{
 const {doc,main}=fixture(),old=main.add(new Element('button',{'data-release-view':'songs'}));doc.activeElement=old;const saved=view.capture(doc),next=new Element('button',{'data-release-view':'songs'});main.replace([next]);doc.activeElement=doc.body;view.restore(saved,doc);assert.equal(doc.activeElement,next);
});
