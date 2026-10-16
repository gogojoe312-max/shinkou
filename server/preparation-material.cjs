'use strict';
// Pure deterministic compilation. DOCX plain lyrics and explicit LIVE JSON
// only: no network, model calls, surname expansion or inferred setlist order.
const {createHash}=require('node:crypto');
const {unzipSync}=require('fflate');
const {XMLParser,XMLValidator}=require('fast-xml-parser');
const MAX_BYTES=5*1024*1024,MAX_XML_BYTES=2*1024*1024,MAX_LINES=5000;
const text=value=>typeof value==='string'?value:'';
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const norm=value=>text(value).normalize('NFKC').trim();
const hash=value=>createHash('sha256').update(value).digest('hex');
const identity=(kind,...values)=>'shinkou-'+kind+'-'+hash(JSON.stringify(values)).slice(0,32);
const fail=(reason,label)=>{throw Object.assign(Error(label),{reason});};
const safeText=value=>typeof value==='string'&&value.trim().length>0&&value.length<=2000&&!/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value);
const date=value=>/^\d{4}-\d{2}-\d{2}$/.test(text(value))&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
function only(value,required,optional=[]){
 if(!object(value)||required.some(key=>!Object.hasOwn(value,key))||Object.keys(value).some(key=>!required.includes(key)&&!optional.includes(key)))fail('invalid-material','資料の項目を確認してください。');
}
function materialBytes(material){
 let bytes;
 if(material.bytes instanceof Uint8Array)bytes=Buffer.from(material.bytes);
 else if(typeof material.content==='string'&&material.content.length<=Math.ceil(MAX_BYTES/3)*4&&/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(material.content))bytes=Buffer.from(material.content,'base64');
 else fail('missing-material','資料のファイル内容を確認できません。');
 if(!bytes.length||bytes.length>MAX_BYTES)fail('material-too-large','資料は5MB以下のファイルを登録してください。');
 return bytes;
}
function sourceOf(material,bytes){
 return {name:text(material.name||material.file?.name),sha256:hash(bytes),revision:text(material.rev||material.file?.rev)};
}
function unquote(value){
 const valueNorm=norm(value),pairs=[['「','」'],['『','』'],['"','"'],["'","'"]];
 for(const [start,end]of pairs)if(valueNorm.startsWith(start)&&valueNorm.endsWith(end))return norm(valueNorm.slice(start.length,-end.length));
 return valueNorm;
}
function docxParagraphs(bytes){
 const names=new Set();let entries,expanded=0;
 try{entries=unzipSync(bytes,{filter:entry=>{
  if(names.has(entry.name))fail('ambiguous-docx','Word資料に重複した内容があります。');names.add(entry.name);
  if(names.size>2000)fail('material-too-large','Word資料が複雑すぎるため、自動準備を止めました。');
  const selected=entry.name==='word/document.xml'||entry.name==='word/_rels/document.xml.rels'||/^word\/header\d+\.xml$/.test(entry.name);
  if(selected){expanded+=entry.originalSize;if(entry.originalSize>MAX_XML_BYTES||expanded>4*MAX_XML_BYTES)fail('material-too-large','Word本文が大きすぎるため、自動準備を止めました。');}
  return selected;
 }});}catch(error){if(error.reason)throw error;fail('invalid-docx','Word資料を読み取れません。DOCX形式を確認してください。');}
 if(!entries['word/document.xml']||entries['word/document.xml'].length>MAX_XML_BYTES)fail('invalid-docx','Word本文が見つかりません。');
 let xml;try{xml=new TextDecoder('utf-8',{fatal:true}).decode(entries['word/document.xml']);}catch{fail('invalid-docx','Word本文の文字コードを確認してください。');}
 if(/<!DOCTYPE|<!ENTITY/i.test(xml)||XMLValidator.validate(xml)!==true)fail('invalid-docx','Word本文の形式を確認してください。');
 // Layout, tracked changes and assignments must not silently become plain lyrics.
 if(/<(?:w:)?(?:tbl|tab|drawing|pict|txbxContent|ins|del|moveFrom|moveTo|fldChar|instrText|footnoteReference|endnoteReference|commentReference|vanish|numPr|altChunk|sym|ruby)(?:\s|\/?>)/.test(xml))
  fail('ambiguous-docx','表・歌割・変更履歴などを含むWord資料は、その対応を確認してから準備してください。');
 const parser=new XMLParser({preserveOrder:true,ignoreAttributes:false,trimValues:false,parseTagValue:false,parseAttributeValue:false,processEntities:true});
 const parsed=parser.parse(xml);
 const docs=parsed.filter(node=>Object.hasOwn(node,'w:document'));
 if(docs.length!==1||docs[0][':@']?.['@_xmlns:w']!=='http://schemas.openxmlformats.org/wordprocessingml/2006/main')fail('invalid-docx','標準のWord本文を確認できません。');
 const bodies=docs[0]['w:document'].filter(node=>Object.hasOwn(node,'w:body'));
 if(bodies.length!==1)fail('invalid-docx','Word本文を確認できません。');
 function paragraph(nodes,depth=0){
  if(depth>16)fail('ambiguous-docx','Word本文の構造を確認してください。');
  let out='';
  for(const node of nodes){const key=Object.keys(node).find(key=>key!==':@');
   if(['w:pPr','w:rPr','w:bookmarkStart','w:bookmarkEnd','w:proofErr'].includes(key))continue;
   if(key==='w:r')out+=paragraph(node[key],depth+1);
   else if(key==='w:t'){
    if(node[key].some(child=>Object.keys(child).some(name=>name!=='#text')))fail('ambiguous-docx','Word本文の文字列を確認してください。');
    out+=node[key].map(child=>text(child['#text'])).join('');
   }else if(key==='w:br'||key==='w:cr'){
    if(node[':@']?.['@_w:type']&&node[':@']['@_w:type']!=='textWrapping')fail('ambiguous-docx','改ページを含むWord資料の区切りを確認してください。');
    out+='\n';
   }else fail('ambiguous-docx','Word本文に自動で対応できない構造があります。');
  }
  return out;
 }
 function paragraphsOf(nodes){
  const paragraphs=[];
  for(const node of nodes){const key=Object.keys(node).find(key=>key!==':@');
   if(key==='w:sectPr')continue;
   if(key!=='w:p')fail('ambiguous-docx','Word本文に自動で対応できない構造があります。');
   paragraphs.push(paragraph(node[key]));if(paragraphs.length>MAX_LINES+50)fail('material-too-large','Word本文の行数が多すぎます。');
  }
  return paragraphs;
 }
 // Word can put the literal artist/title/credits in an attached header. Read
 // only headers referenced by this document, never unrelated ZIP entries.
 const headerIds=[];
 function scan(nodes,depth=0){
  if(depth>64)fail('ambiguous-docx','Word本文の構造を確認してください。');
  for(const node of nodes)for(const [key,value]of Object.entries(node)){
   if(key==='w:headerReference')headerIds.push(node[':@']?.['@_r:id']);
   if(Array.isArray(value))scan(value,depth+1);
  }
 }
 scan(docs[0]['w:document']);
 let header=[];
 if(headerIds.length){
  const relBytes=entries['word/_rels/document.xml.rels'];if(!relBytes)fail('invalid-docx','Wordの見出しを確認できません。');
  const relXML=new TextDecoder('utf-8',{fatal:true}).decode(relBytes);
  if(/<!DOCTYPE|<!ENTITY/i.test(relXML)||XMLValidator.validate(relXML)!==true)fail('invalid-docx','Wordの見出しを確認できません。');
  const relationships=parser.parse(relXML).find(node=>node.Relationships)?.Relationships||[];
  for(const id of new Set(headerIds)){
   const matches=relationships.filter(node=>node.Relationship&&node[':@']?.['@_Id']===id);
   if(matches.length!==1)fail('invalid-docx','Wordの見出しを確認できません。');
   const attrs=matches[0][':@'],path='word/'+attrs['@_Target'];
   if(attrs['@_Type']!=='http://schemas.openxmlformats.org/officeDocument/2006/relationships/header'||attrs['@_TargetMode']||!/^word\/header\d+\.xml$/.test(path)||!entries[path])fail('invalid-docx','Wordの見出しを確認できません。');
   const headerXML=new TextDecoder('utf-8',{fatal:true}).decode(entries[path]);
   if(/<!DOCTYPE|<!ENTITY/i.test(headerXML)||XMLValidator.validate(headerXML)!==true||/<w:(?:tbl|tab|drawing|pict|ins|del|fldChar|instrText|vanish|numPr)(?:\s|\/?>)/.test(headerXML))fail('ambiguous-docx','Wordの見出しの構造を確認してください。');
   const node=parser.parse(headerXML).find(node=>node['w:hdr']);
   if(!node||node[':@']?.['@_xmlns:w']!=='http://schemas.openxmlformats.org/wordprocessingml/2006/main')fail('invalid-docx','Wordの見出しを確認できません。');
   const next=paragraphsOf(node['w:hdr']);
   if(header.length&&JSON.stringify(header)!==JSON.stringify(next))fail('ambiguous-docx','ページごとに異なる見出しがあるため、資料を確認してください。');
   header=next;
  }
 }
 return [...header,...paragraphsOf(bodies[0]['w:body'])];
}
function parseDocx(bytes,target){
 if(!safeText(target.title))fail('missing-title','登録された曲名を確認してください。');
 const paragraphs=docxParagraphs(bytes),title=unquote(target.title),artist=norm(target.artist),credits=[];
 let start=0,matchedTitle=false;
 for(;start<paragraphs.length;start++){
  const value=norm(paragraphs[start]);if(!value)continue;
  const heading=value.replace(/^(?:曲名|タイトル|Title)\s*[:：]\s*/i,'');
  if(!matchedTitle&&(unquote(heading)===title||artist&&heading.startsWith(artist)&&unquote(heading.slice(artist.length))===title)){matchedTitle=true;continue;}
  if(artist&&norm(value.replace(/^(?:アーティスト|Artist)\s*[:：]\s*/i,''))===artist)continue;
  if(/^(?:作詞(?:[・／/](?:作曲|編曲))?|作曲|編曲|Lyrics?|Words?|Music|Composed by|Written by|Arranged by)\s*(?:[:：]\s*|\s+)\S/i.test(value)){credits.push(paragraphs[start].trim());continue;}
  break;
 }
 if(!matchedTitle)fail('title-unconfirmed','Word資料の曲名と登録された曲名を確認してください。');
 const lyrics=paragraphs.slice(start);while(lyrics.length&&!lyrics.at(-1).trim())lyrics.pop();
 if(!lyrics.length||lyrics.length>MAX_LINES||!lyrics.some(line=>line.trim()))fail('missing-lyrics','Word資料に歌詞本文が見つかりません。');
 if(lyrics.some(line=>/^\s*(?:[^\n:：]{1,60}[:：]|[【\[][^\n】\]]+[】\]])/.test(line)))fail('ambiguous-assignments','歌唱者や区間のラベルを含む本文は、対応を確認してから準備してください。');
 return {format:'docx',title:text(target.title).normalize('NFC').trim(),artist:text(target.artist),credit:credits.join('\n'),lines:lyrics.map(t=>({t,parts:[]}))};
}
// Explicit LIVE JSON's setlist order is authoritative. CSV/PDF/XLSX are deferred.
function parseSource(material,target={}){
 const bytes=materialBytes(material),source=sourceOf(material,bytes),name=source.name;
 if(/\.docx$/i.test(name))return {...parseDocx(bytes,target),source};
 if(/\.json$/i.test(name)){
  let document;try{document=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{fail('invalid-material','JSON資料の形式を確認してください。');}
  if(document?.app!=='shinkou-live-preparation'||document.version!==1)fail('unsupported-material','LIVEの明示的なセットリスト資料を登録してください。');
  return {format:'live-json',document,source};
 }
 fail('unsupported-material','DOCX歌詞、または明示的なLIVE JSON資料を登録してください。');
}
function operation(type,packet){return {id:identity('operation',type,hash(JSON.stringify(packet))),type,packet};}
function checkedSlots(target,songId){
 const slots=Array.isArray(target.slots)?target.slots:[];
 const minutes=value=>/^\d{2}:[0-5]\d$/.test(text(value))&&Number(value.slice(0,2))<24?Number(value.slice(0,2))*60+Number(value.slice(3)):NaN;
 const out=[];
 for(const row of slots){
  const at=minutes(row.start),end=minutes(row.end);
  if(row.songId!==songId||!date(row.date)||!target.dates.includes(row.date)||!safeText(row.person)||!Number.isInteger(at)||!Number.isInteger(end)||at>=end)
   fail('invalid-schedule','確定した歌唱者別の日付・開始時刻・終了時刻を確認してください。');
  if(out.some(other=>other.date===row.date&&Math.max(other.at,at)<Math.min(other.at+other.min,end)))fail('overlapping-schedule','歌唱者別の確定時間割が重複しています。');
  out.push({...row,at,min:end-at});
 }
 if(new Set(out.map(row=>row.date.slice(0,4))).size>1)fail('invalid-schedule','年をまたぐ時間割は年ごとに分けて確認してください。');
 return out;
}
function recordingPacket(target,parsed,songId){
 const slots=checkedSlots(target,songId),context=[target.id,songId],id=identity('rec-song',...context);
 const source={revision:parsed.source.revision,files:[{name:parsed.source.name,sha256:parsed.source.sha256}]};
 if(!slots.length)return operation('recording-song',{app:'utacheck-recording-song',version:1,group:{id:identity('unpublished'),name:'配信しない',nopub:true},
  song:{id,title:parsed.title,artist:parsed.artist,credit:parsed.credit,lines:parsed.lines},source});
 const group={id:identity('rec-group',...context),name:[parsed.artist,parsed.title,'REC',target.dates.join('・')].filter(Boolean).join(' '),nopub:true};
 const people=[...new Set(slots.map(row=>row.person))],members=people.map(name=>({id:identity('member',...context,name),name}));
 const songs=[{id,title:parsed.title,groupId:group.id,recArtist:parsed.artist,credit:parsed.credit,recSession:{id:identity('session',...context),label:target.dates.join('・')},
  roster:members.map(member=>member.id),blocks:{},lines:parsed.lines.map(line=>({...line,main:[],extra:[]}))}];
 const plan={year:Number(slots[0].date.slice(0,4)),timezone:'Asia/Tokyo',start:slots[0].start,source:'shinkou',slots:slots.map(row=>({
  id:identity('slot',...context,row.date,row.stageKey||'',row.slotId||'',row.start,row.end,row.person),songId:id,name:row.person,date:row.date,
  day:Number(row.date.slice(5,7))+'/'+Number(row.date.slice(8,10)),at:row.at,min:row.min,kind:'member',place:text(row.place)}))};
 return operation('recording-addition',{app:'utacheck-recording-addition',version:1,group,members,roster:people,songs,plan,source});
}
function livePacket(target,parsed){
 const input=parsed.document;
 only(input,['app','version','targetId','show','members','setlist']);only(input.show,['name','date'],['folder']);
 if(input.targetId!==target.id||!safeText(input.show.name)||!date(input.show.date)||!target.dates.includes(input.show.date)||!Array.isArray(input.members)||input.members.length>500
  ||!Array.isArray(input.setlist)||input.setlist.length!==target.songIds.length||!input.setlist.length||input.setlist.length>300)fail('invalid-live-setlist','公演日・曲ID・明示的な曲順を確認してください。');
 if(input.show.folder!==undefined&&typeof input.show.folder!=='string')fail('invalid-live-setlist','公演フォルダを確認してください。');
 const context=[target.id,input.show.date],memberMap=new Map();
 const members=input.members.map(member=>{
  only(member,['id','name']);if(!safeText(member.id)||!safeText(member.name)||memberMap.has(member.id))fail('invalid-live-setlist','歌唱者のIDと表示名を確認してください。');
  const id=identity('live-member',...context,member.id);memberMap.set(member.id,id);return{id,name:member.name};
 });
 const refs=value=>{if(!Array.isArray(value)||new Set(value).size!==value.length||value.some(id=>!memberMap.has(id)))fail('invalid-live-setlist','歌割の歌唱者IDを確認してください。');return value.map(id=>memberMap.get(id));};
 const used=new Set(),songs=input.setlist.map(song=>{
  only(song,['songId','title','roster','lines'],['credit','blocks']);
  if(!target.songIds.includes(song.songId)||used.has(song.songId)||!safeText(song.title)||!Array.isArray(song.lines)||!song.lines.length||song.lines.length>MAX_LINES)fail('invalid-live-setlist','曲ID・曲順・歌詞行を確認してください。');used.add(song.songId);
  const roster=refs(song.roster),checkRefs=value=>{const ids=refs(value);if(ids.some(id=>!roster.includes(id)))fail('invalid-live-setlist','歌割と曲の歌唱者一覧を確認してください。');return ids;};
  const lines=song.lines.map(line=>{
   only(line,['t','parts'],['sec','label','main','extra','cut','gap','cont','tag']);
   if(typeof line.t!=='string'||line.t.length>MAX_XML_BYTES)fail('invalid-live-setlist','歌詞行の形式を確認してください。');
   const out={t:line.t,parts:checkRefs(line.parts)};
   for(const key of ['main','extra'])if(Object.hasOwn(line,key))out[key]=checkRefs(line[key]);
   for(const key of ['sec','label','tag'])if(Object.hasOwn(line,key)){if(typeof line[key]!=='string')fail('invalid-live-setlist','歌詞ラベルを確認してください。');out[key]=line[key];}
   for(const key of ['cut','gap','cont'])if(Object.hasOwn(line,key)){if(typeof line[key]!=='boolean')fail('invalid-live-setlist','歌詞行の指定を確認してください。');out[key]=line[key];}
   return out;
  });
  const blocks={};if(song.blocks!==undefined){if(!object(song.blocks))fail('invalid-live-setlist','歌割ブロックを確認してください。');for(const [key,value]of Object.entries(song.blocks)){if(!key||['__proto__','constructor','prototype'].includes(key))fail('invalid-live-setlist','歌割ブロックを確認してください。');blocks[key]=checkRefs(value);}}
  if(song.credit!==undefined&&typeof song.credit!=='string')fail('invalid-live-setlist','クレジットを確認してください。');
  return{id:identity('live-song',...context,song.songId),title:song.title,roster,lines,blocks,credit:song.credit||''};
 });
 return operation('live-addition',{app:'utacheck-live-addition',version:1,group:{id:identity('live-group',...context),name:input.show.name,nopub:true},
  show:{id:identity('live-show',...context),...input.show},members,songs,source:{revision:parsed.source.revision,files:[{name:parsed.source.name,sha256:parsed.source.sha256}]}});
}
function compile(target,materials){
 const operations=[],pending=[],hold=(reason,label,material)=>pending.push({targetId:text(target?.id),reason,label,...(material?.materialId?{materialId:material.materialId}:{})});
 if(!object(target)||!safeText(target.id)||!['rec','live'].includes(target.kind)||!Array.isArray(target.songIds)||!target.songIds.length||new Set(target.songIds).size!==target.songIds.length
  ||target.songIds.some(id=>!safeText(id))||!Array.isArray(target.dates)||!target.dates.length||target.dates.some(value=>!date(value)))return {operations,pending:[{targetId:text(target?.id),reason:'invalid-target',label:'準備対象の曲と日付を確認してください。'}]};
 const relevant=(Array.isArray(materials)?materials:[]).filter(material=>object(material)&&target.songIds.includes(material.songId));
 if(target.kind==='rec'&&target.songIds.length!==1){hold('ambiguous-target','RECは曲ごとに準備対象を分けてください。');return{operations,pending};}
 const candidates=relevant.filter(material=>new RegExp(target.kind==='rec'?'\\.docx$':'\\.json$','i').test(text(material.name||material.file?.name)));
 if(candidates.length!==1){hold(candidates.length?'ambiguous-material':'missing-material',candidates.length?'使用する最新版の資料を1つに絞って登録してください。':target.kind==='rec'?'曲名付きのDOCX歌詞資料を登録してください。':'曲順・曲ID・歌割を明記したLIVE JSON資料を登録してください。');return{operations,pending};}
 const material=candidates[0];
 try{const parsed=parseSource(material,target);operations.push(target.kind==='rec'?recordingPacket(target,parsed,target.songIds[0]):livePacket(target,parsed));}
 catch(error){hold(error.reason||'invalid-material',error.reason?error.message:'資料の内容を確認できないため、準備を止めました。',material);}
 return{operations,pending};
}
module.exports={compile,parseSource,MAX_BYTES};
