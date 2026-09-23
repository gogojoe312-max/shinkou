/* 請求書の受領とデスク送付。読み取り・文面生成では記録を変更しない。 */
(function(root){
'use strict';
const names={lyricist:'作詞',composer:'作曲',arranger:'編曲'};
const clean=v=>String(v||'').normalize('NFC').trim();
const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
function rows(s){return [...(s.credits||[]).map(c=>({key:'credit:'+c.id,c})),...(s.invoiceItems||[]).map(c=>({key:'extra:'+c.id,c}))].filter(x=>clean(x.c.name))}
function roles(c){return [...(c.roles||[]).map(r=>names[r]||r),...(c.parts||[]),c.role||''].filter(Boolean)}
function writingRole(role){return clean(role).split(/[・･、,／/+＋&＆\s]+/).every(r=>/^(作詞(?:料|費)?|作曲(?:料|費)?|作詞作曲|lyricist|composer|songwriter|lyrics|composition)$/i.test(r))}
function writingOnly(c){const r=roles(c);return r.length>0&&r.every(writingRole)}
function required(c){if(typeof c.invoiceRequired==='boolean')return c.invoiceRequired;return c.g==='invoice'||(c.roles||[]).includes('arranger')||c.g==='mus'&&(!(c.parts||[]).length||c.parts.some(p=>p!=='Mastering Engineer'))?true:null}
// 旧確認に作詞・作曲が含まれていても、実際の請求先に変更がなければ確認を維持する。
function confirmedRoster(saved,roster,excluded){
 if(saved===roster)return true;
 try{
  const entries=JSON.parse(saved);if(!Array.isArray(entries))return false;
  const normalized=entries.flatMap(([id,name,roleList,need,sources])=>{
   if(!Array.isArray(roleList)||!Array.isArray(sources))throw Error('invalid roster');
   if(roleList.length&&roleList.every(writingRole))return [];
   const kept=sources.filter(key=>!excluded.has(key));if(!kept.length)return [];
   return [[kept[0],name,roleList.filter(r=>!writingRole(r)).sort(),need,kept]];
  });
  return JSON.stringify(normalized)===roster;
 }catch{return false}
}
function report(s){
 const groups=new Map(),excluded=new Set();
 for(const row of rows(s)){if(writingOnly(row.c)){excluded.add(row.key);continue}const name=clean(row.c.name);if(!groups.has(name))groups.set(name,[]);groups.get(name).push(row)}
 const items=[...groups].map(([name,rs])=>{
  rs.sort((a,b)=>a.key.localeCompare(b.key));
  const applicable=rs.filter(x=>required(x.c)===true),need=applicable.length?true:rs.every(x=>required(x.c)===false)?false:null;
  const got=applicable.length>0&&applicable.every(x=>!!x.c.inv),sent=got&&applicable.every(x=>date(x.c.invoiceSentAt));
  const invoiceRoles=[...new Set(rs.flatMap(x=>roles(x.c)).filter(r=>!writingRole(r)))];
  return {id:rs[0].key,name,roles:invoiceRoles,required:need,received:got,sent,receivedAt:got?applicable.map(x=>x.c.invDate).filter(date).sort().at(-1)||'':'',sentAt:sent?applicable.map(x=>x.c.invoiceSentAt).sort().at(-1):'',sources:rs.map(x=>x.key)};
 }).sort((a,b)=>a.name.localeCompare(b.name,'ja'));
 // 対象者・役割の変更で再確認を促す。受領日や送付日だけの変更では無効にしない。
 const roster=JSON.stringify(items.map(x=>[x.id,x.name,x.roles.slice().sort(),x.required,x.sources]));
 const confirmed=confirmedRoster(s.invoiceTracking?.roster,roster,excluded);
 const expected=items.filter(x=>x.required===true),unknown=items.filter(x=>x.required===null),missing=expected.filter(x=>!x.received),ready=expected.filter(x=>x.received&&!x.sent),sent=expected.filter(x=>x.sent);
 const receivedComplete=confirmed&&!unknown.length&&!missing.length,done=receivedComplete&&!ready.length;
 const title=done?(expected.length?'小森さんへ送付完了':'請求書なし'):missing.length?'未受領があります':unknown.length?'請求対象を確認':!confirmed?'請求先の漏れを確認':'全員分を受領・小森さんへ送付待ち';
 return {items,expected,unknown,missing,ready,sent,roster,confirmed,receivedComplete,done,title,legacyDone:s.production?.tasks?.invoice?.state==='done'};
}
function snapshot(s){return JSON.stringify({credits:s.credits,items:s.invoiceItems,tracking:s.invoiceTracking})}
function operationSnapshot(s,op){const r=report(s);return op.action==='confirm'?r.roster:JSON.stringify(r.items.find(x=>x.id===op.id))}
const actions={received:'受領済みにする',pending:'未受領に戻す',sent:'小森さんへ送付済みにする',unsent:'小森さんへの送付待ちに戻す',required:'請求対象にする',exempt:'請求不要にする',confirm:'請求先の確認を完了する'};
function validate(s,op){
 if(!op||!Object.hasOwn(actions,op.action))return '請求書の操作を確認してください';
 if(op.date!==undefined&&(!date(op.date)||!['received','sent'].includes(op.action)))return '日付を確認してください';
 const r=report(s);if(op.action==='confirm')return r.unknown.length?'請求対象が未確認の相手を確認してください':'';
 const item=r.items.find(x=>x.id===op.id);if(!item)return '請求先が見つかりません';
 if(op.action==='sent'&&!item.received)return '受領していない請求書は送付済みにできません';
 if(['sent','unsent'].includes(op.action)&&item.required!==true)return '請求対象を確認してください';
 if(op.action==='sent'&&op.date&&item.receivedAt&&op.date<item.receivedAt)return '送付日は受領日以降にしてください';
 return '';
}
function apply(s,op,today){
 const error=validate(s,op);if(error)throw Error(error);
 if(!date(today))throw Error('日付を確認してください');
 const r=report(s),when=op.date||today;
 if(op.action==='confirm'){s.invoiceTracking||={};s.invoiceTracking.roster=r.roster;return s}
 const item=r.items.find(x=>x.id===op.id),target=rows(s).filter(x=>item.sources.includes(x.key));
 if(op.action==='sent'&&item.receivedAt&&when<item.receivedAt)throw Error('送付日は受領日以降にしてください');
 for(const {c} of target){
  if(op.action==='required'||op.action==='exempt')c.invoiceRequired=op.action==='required';
  if(op.action==='received'){c.invoiceRequired=true;if(!c.inv){c.invDate=when;c.invoiceSentAt=''}else if(op.date){c.invDate=when;if(c.invoiceSentAt&&c.invoiceSentAt<when)c.invoiceSentAt=''}c.inv=true}
  if(op.action==='pending'){c.inv=false;c.invDate='';c.invoiceSentAt=''}
  if(op.action==='sent'&&required(c)===true)c.invoiceSentAt=c.invoiceSentAt||when;
  if(op.action==='unsent')c.invoiceSentAt='';
 }
 return s;
}
function add(s,name,role,id){
 name=clean(name);role=clean(role);if(!name||name.length>120||role.length>120)throw Error('請求先の名前・内容を確認してください');
 if(writingOnly({role}))throw Error('作詞・作曲は請求書不要のため、回収対象には追加しません');
 if(report(s).items.some(x=>x.name===name))throw Error('同じ名前の請求先が登録されています');
 if(!id||(s.invoiceItems||[]).some(x=>x.id===id))throw Error('請求先の識別子を確認してください');
 s.invoiceItems||=[];s.invoiceItems.push({id,g:'invoice',name,role,invoiceRequired:true,inv:false,invDate:'',invoiceSentAt:''});
}
function draft(s,ids){
 const r=report(s),selected=ids.map(id=>r.items.find(x=>x.id===id));
 if(!selected.length||selected.some(x=>!x||!x.received||x.sent||!x.required)||new Set(ids).size!==ids.length)throw Error('受領済み・未送付の請求書を選んでください');
 const title=clean(s.title||s.work)||'曲名未登録',artist=clean(s.artist),work=(artist?artist+' ':'')+'「'+title+'」';
 return {subject:'請求書送付／'+work,body:'小森さま\n\nお疲れ様です。\n\n'+work+'の下記請求書をお送りします。\n\n'+selected.map(x=>'・'+x.name+(x.roles.length?'（'+x.roles.join('・')+'）':'')).join('\n')+'\n\nご確認のほど、よろしくお願いいたします。'};
}
function context(s){const r=report(s);return {roster_confirmed:r.confirmed,received_complete:r.receivedComplete,delivery_complete:r.done,items:r.items.map(x=>({id:x.id,name:x.name,roles:x.roles,required:x.required,state:x.sent?'sent':x.received?'received':'pending',...(x.receivedAt?{received_at:x.receivedAt}:{}),...(x.sentAt?{sent_at:x.sentAt}:{})}))}}
const api={report,snapshot,operationSnapshot,validate,apply,add,draft,context,actions};root.ShinkouInvoices=api;
if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
