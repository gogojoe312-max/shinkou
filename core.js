/* 保存・同期・工程の共通ロジック。外部通信や画面操作を持たない。 */
(function(root){
  'use strict';
  const copy=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
  const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
  const safe=k=>!['__proto__','constructor','prototype'].includes(k);
  function merge(base,local,remote,path,conflicts,preferRemote){
    if(equal(local,remote))return copy(local);
    if(equal(local,base))return copy(remote);
    if(equal(remote,base))return copy(local);
    if(obj(local)&&obj(remote)&&(base===undefined||obj(base))){
      const out={};
      new Set([...Object.keys(base||{}),...Object.keys(local),...Object.keys(remote)]).forEach(k=>{
        if(!safe(k))return;
        if(k==='mtime'){out[k]=Math.max(local[k]||0,remote[k]||0);return}
        const v=merge(base&&base[k],local[k],remote[k],path.concat(k),conflicts,preferRemote);
        if(v!==undefined)out[k]=v;
      });return out;
    }
    if(Array.isArray(local)&&Array.isArray(remote)){
      const all=[...(base||[]),...local,...remote];
      const key=['id','slotId','k'].find(k=>all.length&&all.every(x=>obj(x)&&x[k]!==undefined));
      if(key){
        const bm=new Map((base||[]).map(x=>[x[key],x])),lm=new Map(local.map(x=>[x[key],x])),rm=new Map(remote.map(x=>[x[key],x]));
        const out=[];
        for(const id of new Set([...local.map(x=>x[key]),...remote.map(x=>x[key])])){
          const b=bm.get(id),l=lm.get(id),r=rm.get(id);
          const v=merge(b,l,r,path.concat(String(id)),conflicts,((r||{}).mtime||0)>((l||{}).mtime||0));
          if(v!==undefined)out.push(v);
        }return out;
      }
    }
    /* 同じ項目への変更は両方を控えに残す。削除と編集の競合は編集を保持する。 */
    conflicts.push({path:path.join(' / '),base:copy(base),local:copy(local),remote:copy(remote)});
    if(local===undefined)return copy(remote);
    if(remote===undefined)return copy(local);
    return copy(preferRemote?remote:local);
  }
  function mergeList(base,local,remote,conflicts){return merge(base||[],local||[],remote||[],[],conflicts||[],false)}
  function activeStages(song){
    let parentExcluded=false;
    return(song.stageList||[]).filter(x=>{
      if(x.d!==1)parentExcluded=!!(song.stages&&song.stages[x.k]&&song.stages[x.k].excluded);
      return !parentExcluded&&!(song.stages&&song.stages[x.k]&&song.stages[x.k].excluded);
    });
  }
  function ensureSlots(song,legacy,uuid){
    Object.entries(song.stages||{}).forEach(([key,o])=>{
      (o.slots||[]).forEach((v,i)=>{
        if(!v.slotId)v.slotId=legacy?'legacy:'+song.id+':'+key+':'+i:uuid();
        if(v.calRef===undefined)v.calRef=legacy?String(i):v.slotId;
      });
    });
  }
  // Scheduling is a capability, not a consequence of an AI-generated stage ID.
  // Only execution/booking labels qualify; sharing, approval and editing are distinct.
  function scheduleKind(x){
    const key={vo:'vocal',vodb:'vocal',revo:'revocal',revodb:'revocal',cho:'chorus',chodb:'chorus',instrec:'instrument',instdb:'instrument',tdes:'mix',td:'mix',mas:'master'}[x.k];
    if(key)return key;
    const n=String(x.n||'').normalize('NFKC').replace(/\s/g,'');
    if(/共有|版確認|受領|提出|素材|依頼|発注|編集|EDIT|試聴|最終OK|チェック/i.test(n))return '';
    if(/^(?:追加歌録り|ReVoDB)(?:の日程.*)?$/i.test(n))return 'revocal';
    if(/^(?:VoDB|歌録り|歌どり|歌の録り直し|ボーカル録音|ボーカルレコーディング)(?:の日程.*)?$/i.test(n))return 'vocal';
    if(/^(?:ChoDB|コーラス録音|コーラス収録)(?:の日程.*)?$/i.test(n))return 'chorus';
    if(/^(?:楽器DB|楽器録音|楽器収録)(?:の日程.*)?$/i.test(n))return 'instrument';
    if(/^(?:TD|ミックス|トラックダウン)(?:日程.*|の日程.*)?$/i.test(n))return 'mix';
    if(/^(?:マスタリング)(?:日程.*|の日程.*)?$/.test(n))return 'master';
    return '';
  }
  function isScheduledStage(x){return x.t==='multi'||!['vodb','revodb','chodb','instdb','td','mas'].includes(x.k)&&!!scheduleKind(x)}
  root.ShinkouCore={merge,mergeList,activeStages,ensureSlots,copy,equal,scheduleKind,isScheduledStage};
  if(typeof module!=='undefined')module.exports=root.ShinkouCore;
})(typeof globalThis!=='undefined'?globalThis:this);
