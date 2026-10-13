/* Preserve the reader's place during background data refreshes. No saved data is changed. */
(function(root){
'use strict';
const scopes=['main','shBody','s2Body','s3Body','dirbar','useBar'];
const esc=value=>String(value).replace(/[\\"\n\r]/g,c=>'\\'+c);
function selector(el){
 if(!el||el.nodeType!==1)return '';
 if(el.id)return '[id="'+esc(el.id)+'"]';
 const attributes=['data-state-fold','data-show-fold','data-brief-song','data-song-tab','data-production-song','data-production-kind','data-production-key','data-u','data-d','data-release-view','data-show-completed','data-cm','data-song','data-stk','data-kind','data-dd','data-day','data-cal-nav','data-cal-today','data-ev'];
 const selected=attributes.filter(name=>el.hasAttribute(name));
 if(selected.length)return el.tagName.toLowerCase()+selected.map(name=>'['+name+'="'+esc(el.getAttribute(name))+'"]').join('');
 if(el.tagName==='SUMMARY'){const parent=selector(el.parentElement);if(parent)return parent+'>summary'}
 return '';
}
function locate(doc,ref){
 if(ref?.element?.isConnected)return ref.element;
 if(ref?.id)return doc.getElementById(ref.id);
 if(!ref?.selector)return null;
 const matches=(ref.scope?doc.getElementById(ref.scope):doc)?.querySelectorAll(ref.selector)||[];
 return matches.length===1?matches[0]:null;
}
function reference(el){const scope=scopes.find(id=>el.closest?.('[id="'+id+'"]'));return {element:el,id:el.id||'',selector:selector(el),scope:scope||''}}
function capture(doc=root.document){
 const scroll=scopes.map(id=>doc.getElementById(id)).filter(Boolean).map(el=>{
  const rect=el.getBoundingClientRect(),anchor=[...el.querySelectorAll('[data-brief-song]'),...el.querySelectorAll('[data-state-fold],[data-show-fold]')].find(x=>{const r=x.getBoundingClientRect();return r.bottom>rect.top&&r.top<rect.bottom});
  return {id:el.id,top:el.scrollTop,left:el.scrollLeft,anchor:anchor?reference(anchor):null,offset:anchor?anchor.getBoundingClientRect().top-rect.top:0};
 });
 const folds=scopes.flatMap(id=>[...(doc.getElementById(id)?.querySelectorAll('details')||[])].map(el=>({ref:reference(el),open:el.open}))).filter(x=>x.ref.selector);
 const active=doc.activeElement,focus=active&&active!==doc.body?{ref:reference(active)}:null;
 if(focus&&active.matches('input,textarea,select')&&active.type!=='password'&&!active.disabled&&!active.readOnly){
  focus.value=active.value;focus.checked=active.checked;
  if(typeof active.selectionStart==='number')Object.assign(focus,{start:active.selectionStart,end:active.selectionEnd,direction:active.selectionDirection});
 }
 return {scroll,folds,focus};
}
function restore(state,doc=root.document){
 if(!state)return;
 for(const row of state.folds){const el=locate(doc,row.ref);if(el)el.open=row.open}
 const focus=state.focus,active=locate(doc,focus?.ref);
 // Do not rewrite a still-connected field or dispatch its input/change handlers.
 if(active&&!active.closest('[inert]')&&!active.disabled){
  if(!focus.ref.element.isConnected&&Object.hasOwn(focus,'value')){active.value=focus.value;if(typeof focus.checked==='boolean')active.checked=focus.checked}
  if(doc.activeElement!==active)active.focus({preventScroll:true});
  if(typeof focus.start==='number'&&typeof active.setSelectionRange==='function')try{active.setSelectionRange(focus.start,focus.end,focus.direction)}catch{}
 }
 // Open folds before restoring positions, otherwise collapsed content clamps scrollTop.
 for(const row of state.scroll){const el=doc.getElementById(row.id);if(!el)continue;
  el.scrollTop=row.top;el.scrollLeft=row.left;
  const anchor=locate(doc,row.anchor);
  if(anchor&&el.contains(anchor))el.scrollTop+=anchor.getBoundingClientRect().top-el.getBoundingClientRect().top-row.offset;
 }
}
root.ShinkouViewState={capture,restore};
if(typeof module!=='undefined')module.exports=root.ShinkouViewState;
})(typeof globalThis!=='undefined'?globalThis:this);
