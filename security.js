/* Shared validation and encrypted-storage helpers. No credentials leave this module. */
(function(root){'use strict';
const dangerous=new Set(['__proto__','constructor','prototype']);
const secret=/^(?:token|key|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|secret|authorization)$/i;
function clean(value,removeSecrets=false,depth=0){
 if(depth>80)throw Error('データの階層が深すぎます');
 if(Array.isArray(value))return value.map(v=>clean(v,removeSecrets,depth+1));
 if(value&&typeof value==='object'){const out={};for(const [k,v]of Object.entries(value)){if(dangerous.has(k))continue;out[k]=removeSecrets&&secret.test(k)?'':clean(v,removeSecrets,depth+1)}return out}return value;
}
function portable(state){const copy=clean(state);if(copy.settings)copy.settings=clean(copy.settings,true);return copy}
function imported(state,settings){const copy=portable(state);copy.settings={...copy.settings};
 // Imports never silently replace this device's connections or destination.
 for(const k of ['gh','sync','connections','security','calUrl']){delete copy.settings[k];if(settings&&k in settings)copy.settings[k]=clean(settings[k])}
 copy.settings.ai={...copy.settings.ai,key:settings?.ai?.key||''};return copy;
}
const sensitiveRecord=k=>['state','state_prev','syncbase'].includes(k)||/^(bk:|bkd:)/.test(k);
const b64=bytes=>{let s='';for(const b of new Uint8Array(bytes))s+=String.fromCharCode(b);return btoa(s)};
const unb64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function keyFor(pin,salt,iterations=600000){
 const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(pin),'PBKDF2',false,['deriveKey']);
 return crypto.subtle.deriveKey({name:'PBKDF2',salt:unb64(salt),iterations,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
async function pack(value,key,salt,iterations=600000){const iv=crypto.getRandomValues(new Uint8Array(12));return {enc:1,salt,iterations,iv:b64(iv),data:b64(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(JSON.stringify(value))))}}
async function unpack(rec,key){return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(rec.iv)},key,unb64(rec.data))))}
async function planRekey(entries,{pin='',newPin='',currentKey=null,currentSalt='',currentIterations=250000}){
 const salt=newPin?b64(crypto.getRandomValues(new Uint8Array(16))):'',iterations=600000,newKey=newPin?await keyFor(newPin,salt,iterations):null;
 const keys=new Map();if(currentKey)keys.set(currentSalt+':'+currentIterations,currentKey);
 const result=[];
 for(const [id,rec]of entries){if(!sensitiveRecord(String(id)))continue;let value=rec;
  if(rec?.enc){const fingerprint=rec.salt+':'+(rec.iterations||250000);let key=keys.get(fingerprint);if(!key){key=await keyFor(pin,rec.salt,rec.iterations||250000);keys.set(fingerprint,key)}
   try{value=await unpack(rec,key)}catch{throw Error('以前のパスコードで保護されたバックアップがあります。データは変更していません。')}}
  result.push([id,newKey?await pack(value,newKey,salt,iterations):value]);
 }
 return {entries:result,key:newKey,salt,iterations};
}
function validState(value){const s=clean(value);if(!s||!Array.isArray(s.songs)||!Array.isArray(s.projects)||s.songs.length>10000||s.projects.length>10000)throw Error('進行データの形式を確認してください');
 for(const list of [s.songs,s.projects,s.templates||[]]){const ids=new Set();for(const item of list){if(!item||typeof item.id!=='string'||!item.id||item.id.length>200||ids.has(item.id))throw Error('識別情報が不正または重複しています');ids.add(item.id)}}return s;
}
function repoConfig(c){if(!/^[A-Za-z0-9_-]+$/.test(c.owner||'')||!/^[A-Za-z0-9_.-]+$/.test(c.repo||'')||!c.path||c.path.startsWith('/')||c.path.split('/').some(x=>!x||x==='.'||x==='..')||/[?#\\\x00-\x1f]/.test(c.path))throw Error('同期先の設定を確認してください');return c}
root.ShinkouSecurity={clean,portable,imported,sensitiveRecord,b64,keyFor,pack,unpack,planRekey,validState,repoConfig};if(typeof module!=='undefined')module.exports=root.ShinkouSecurity;
})(typeof globalThis!=='undefined'?globalThis:this);
