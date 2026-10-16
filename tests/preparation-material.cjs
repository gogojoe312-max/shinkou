'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {zipSync,strToU8}=require('fflate'),{compile,parseSource}=require('../server/preparation-material.cjs');
const escape=text=>text.replace(/[<>&"]/g,char=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[char]));
const p=text=>'<w:p><w:r><w:t xml:space="preserve">'+escape(text)+'</w:t></w:r></w:p>';
function docx(body,header){
 const namespace='xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
 const entries={'word/document.xml':strToU8('<w:document '+namespace+'><w:body>'+body+'<w:sectPr>'+(header?'<w:headerReference w:type="default" r:id="heading"/>':'')+'<w:cols w:num="2"/></w:sectPr></w:body></w:document>')};
 if(header){entries['word/header1.xml']=strToU8('<w:hdr '+namespace+'>'+header+'</w:hdr>');entries['word/_rels/document.xml.rels']=strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="heading" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/></Relationships>');}
 return Buffer.from(zipSync(entries));
}
const target=()=>({id:'rec:song-a',kind:'rec',title:'合成カフェの夜',artist:'合成アーティスト',songIds:['song-a'],dates:['2031-02-03'],slots:[]});
const material=bytes=>({songId:'song-a',materialId:'registered-source',name:'synthetic.docx',rev:'rev-1',bytes:bytes||docx([p('合成カフェの夜'),p('作詞：合成作家'),p('First synthetic line'),p(''),p('Second synthetic line')].join(''))});
const result=(t=target(),m=material())=>compile(t,[m]);
test('DOCX title and credits stay separate, runs/entities/breaks and blank paragraphs are retained',()=>{
 const bytes=docx(p('合成カフェの夜')+p('作詞：合成作家')+'<w:p><w:r><w:t>One &amp; </w:t></w:r><w:r><w:t>two</w:t><w:br/><w:t>three</w:t></w:r></w:p>'+p('')+p('  preserved spaces  '));
 const parsed=parseSource(material(bytes),target());
 assert.equal(parsed.title,'合成カフェの夜');assert.equal(parsed.credit,'作詞：合成作家');
 assert.deepEqual(parsed.lines,[{t:'One & two\nthree',parts:[]},{t:'',parts:[]},{t:'  preserved spaces  ',parts:[]}]);
 assert.equal(parsed.source.sha256,createHash('sha256').update(bytes).digest('hex'));
});
test('referenced Word header matches combined artist plus quoted title under Unicode normalization',()=>{
 const t={...target(),title:'合成ガール',artist:'合成グループ'};
 const header=p((t.artist+'「'+t.title+'」').normalize('NFD'))+p('作詞・作曲：合成作者 編曲：合成編曲者');
 const parsed=parseSource(material(docx(p('')+p('Only synthetic lyric'),header)),t);
 assert.equal(parsed.title,t.title);assert.equal(parsed.lines.length,1);assert.match(parsed.credit,/作詞・作曲/);
 assert.equal(parsed.lines[0].t,'Only synthetic lyric');
});
test('ambiguous tables, textboxes, tabs, hidden text and tracked revisions fail closed',()=>{
 for(const unsafe of ['<w:tbl/>','<w:txbxContent/>','<w:p><w:r><w:tab/></w:r></w:p>','<w:p><w:r><w:rPr><w:vanish/></w:rPr><w:t>hidden</w:t></w:r></w:p>','<w:ins/>','<w:del/>']){
  const out=result(target(),material(docx(p(target().title)+unsafe+p('Synthetic lyric'))));assert.equal(out.operations.length,0);assert.equal(out.pending[0].reason,'ambiguous-docx');
 }
});
test('unverified titles and possible singer labels are not silently included as lyrics',()=>{
 for(const [body,reason]of [[p('Different title')+p('Synthetic lyric'),'title-unconfirmed'],[p(target().title)+p('田中：Synthetic lyric'),'ambiguous-assignments'],[p(target().title)+p('【担当者】Synthetic lyric'),'ambiguous-assignments']]){
  const out=result(target(),material(docx(body)));assert.equal(out.operations.length,0);assert.equal(out.pending[0].reason,reason);
 }
});
test('external/missing header relationships and oversized XML are refused without parsing remote content',()=>{
 const base=docx(p('Synthetic lyric'),p(target().title)),{unzipSync}=require('fflate'),entries=unzipSync(base);
 entries['word/_rels/document.xml.rels']=strToU8('<Relationships><Relationship Id="heading" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="https://example.test/header.xml" TargetMode="External"/></Relationships>');
 const external=result(target(),material(Buffer.from(zipSync(entries))));assert.equal(external.operations.length,0);assert.equal(external.pending[0].reason,'invalid-docx');
 const large=docx(p(target().title)+p('x'.repeat(2*1024*1024)));assert.equal(result(target(),material(large)).pending[0].reason,'material-too-large');
});
test('lyrics-only packet creates no schedule, timing, bars or singer assignments',()=>{
 const out=result(),op=out.operations[0];assert.deepEqual(out.pending,[]);assert.equal(op.type,'recording-song');
 assert.equal(op.packet.app,'utacheck-recording-song');assert.equal(op.packet.group.name,'配信しない');assert.equal(op.packet.group.nopub,true);
 assert.deepEqual(Object.keys(op.packet.song),['id','title','artist','credit','lines']);
 assert(op.packet.song.lines.every(line=>Object.keys(line).join(',')==='t,parts'&&!line.parts.length));
 assert.equal(op.packet.plan,undefined);assert.equal(op.packet.members,undefined);
});
test('explicit REC slots use exact surnames/place and literal timing with empty lyric assignments',()=>{
 const t=target();t.slots=[{songId:'song-a',date:'2031-02-03',start:'10:00',end:'10:25',person:'田中',stageKey:'rec',slotId:'slot-a',place:'Synthetic studio'},
  {songId:'song-a',date:'2031-02-03',start:'10:25',end:'11:00',person:'田中 花',stageKey:'rec',slotId:'slot-a',place:'Synthetic studio'}];
 const out=result(t),packet=out.operations[0].packet;
 assert.equal(out.operations[0].type,'recording-addition');assert.deepEqual(packet.members.map(row=>row.name),['田中','田中 花']);
 assert.notEqual(packet.members[0].id,packet.members[1].id);assert.deepEqual(packet.roster,['田中','田中 花']);
 assert.deepEqual(packet.plan.slots.map(row=>[row.name,row.at,row.min,row.place]),[['田中',600,25,'Synthetic studio'],['田中 花',625,35,'Synthetic studio']]);
 assert(packet.songs[0].lines.every(row=>!row.parts.length&&!row.main.length&&!row.extra.length));
 assert.equal(packet.plan.timezone,'Asia/Tokyo');assert.equal(packet.plan.year,2031);
});
test('invalid, overlapping and cross-year explicit schedules never silently downgrade to lyrics-only',()=>{
 const base={songId:'song-a',date:'2031-02-03',start:'10:00',end:'11:00',person:'田中'};
 for(const slots of [[{...base,end:'09:00'}],[base,{...base,person:'Other'}],[{...base,songId:'other'}],[{...base,date:'2031-02-30'}],[base,{...base,date:'2032-02-03'}]]){
  const t={...target(),dates:['2031-02-03','2032-02-03'],slots};const out=result(t);assert.equal(out.operations.length,0);assert(out.pending[0].reason.includes('schedule'));
 }
});
test('same input is deterministic; revision changes operation identity but never the song identity',()=>{
 const t=target(),m=material(),before=JSON.stringify(t);const a=result(t,m),b=result(t,m);assert.deepEqual(a,b);
 const changed=result(t,{...m,rev:'rev-2'});assert.equal(a.operations[0].packet.song.id,changed.operations[0].packet.song.id);assert.notEqual(a.operations[0].id,changed.operations[0].id);assert.equal(JSON.stringify(t),before);
});
test('missing/unsupported/multiple registered sources are pending rather than guessed; unrelated songs ignored',()=>{
 assert.equal(compile(target(),[]).pending[0].reason,'missing-material');
 assert.equal(compile(target(),[{...material(),name:'lyrics.pdf'}]).pending[0].reason,'missing-material');
 assert.equal(compile(target(),[material(),{...material(),materialId:'second'}]).pending[0].reason,'ambiguous-material');
 assert.equal(compile(target(),[{...material(),songId:'different'}]).pending[0].reason,'missing-material');
 assert.equal(compile({...target(),needs:['フォルダ内の資料選択']},[material()]).operations.length,1);
});
test('existing downloader file/content shape produces the same bytes-based source digest',()=>{
 const m=material(),a=result(target(),m),b=result(target(),{songId:m.songId,materialId:m.materialId,file:{name:m.name,rev:m.rev,sha256:'wrong-upstream-digest'},content:m.bytes.toString('base64')});assert.deepEqual(a,b);
});
const liveTarget=()=>({id:'live:project:show-a',kind:'live',title:'Synthetic show',artist:'Synthetic artist',songIds:['song-a','song-b'],dates:['2031-02-03']});
function liveDocument(){return{app:'shinkou-live-preparation',version:1,targetId:liveTarget().id,show:{name:'Synthetic show',date:'2031-02-03',folder:'Private'},members:[{id:'person-a',name:'田中'}],setlist:[
 {songId:'song-b',title:'Second synthetic song',roster:['person-a'],credit:'Synthetic credit',lines:[{t:'B synthetic lyric',parts:['person-a'],main:['person-a'],extra:[],sec:'A'}],blocks:{A:['person-a']}},
 {songId:'song-a',title:'First synthetic song',roster:[],lines:[{t:'A synthetic lyric',parts:[]}]}]};}
const liveMaterial=document=>({songId:'song-a',materialId:'setlist',name:'explicit-live.json',rev:'r1',bytes:Buffer.from(JSON.stringify(document||liveDocument()))});
test('LIVE uses explicit setlist order and mappings rather than target task order',()=>{
 const out=compile(liveTarget(),[liveMaterial()]);assert.deepEqual(out.pending,[]);const packet=out.operations[0].packet;
 assert.equal(out.operations[0].type,'live-addition');assert.deepEqual(packet.songs.map(song=>song.title),['Second synthetic song','First synthetic song']);
 assert.equal(packet.group.nopub,true);assert.equal(packet.songs[0].lines[0].parts[0],packet.members[0].id);assert.deepEqual(packet.songs[0].blocks.A,[packet.members[0].id]);
 assert.equal(packet.show.date,'2031-02-03');assert.equal(packet.songs[1].lines[0].parts.length,0);
});
test('LIVE rejects wrong target/date, missing or duplicate songs and unbound singer references',()=>{
 for(const change of [d=>d.targetId='wrong',d=>d.show.date='2031-02-04',d=>d.setlist.pop(),d=>d.setlist[1].songId='song-b',d=>d.setlist[0].lines[0].parts=['unknown'],d=>d.setlist[0].roster=[],d=>d.show.src='private-secret']){
  const document=liveDocument();change(document);const out=compile(liveTarget(),[liveMaterial(document)]);assert.equal(out.operations.length,0);assert.equal(out.pending.length,1);
 }
});
test('LIVE schema does not accept an arbitrary JSON backup or infer mapping from song titles',()=>{
 const wrong={...liveDocument(),app:'utacheck'};assert.equal(compile(liveTarget(),[liveMaterial(wrong)]).operations.length,0);
 const renamed=liveDocument();renamed.setlist[0].songId=renamed.setlist[0].title;assert.equal(compile(liveTarget(),[liveMaterial(renamed)]).operations.length,0);
});
