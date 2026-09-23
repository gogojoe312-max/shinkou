/* 相手別の受領確認から、小森さんへのメール作成までを同じ画面で扱う。 */
function invoiceReport(s){return ShinkouProduction.invoices.report(s)}
function invoiceGuard(s,before){
 if(RO||!S.songs.includes(s)){toast('閲覧専用、または曲が更新されています');return false}
 if(before!==ShinkouProduction.invoices.snapshot(s)){toast('請求書の記録が更新されています。開き直してください');return false}return true;
}
function invoiceChange(s,op,before,after){
 if(!invoiceGuard(s,before))return;
 try{ShinkouProduction.invoices.apply(s,op,D.today());productionAfterSave(s);after?.();return true}catch(e){toast(e.message);return false}
}
function invoiceSummary(s){
 const r=invoiceReport(s),brief=list=>list.slice(0,2).map(x=>x.name).join('、')+(list.length>2?' ほか'+(list.length-2)+'名':'');
 const detail=[r.missing.length?'未受領：'+brief(r.missing):'',r.ready.length?'送付待ち：'+brief(r.ready):'',r.unknown.length?'請求対象を確認：'+brief(r.unknown):''].filter(Boolean).join(' ／ ');
 return productionButton(s,'task','invoice','invoice-summary'+(r.done?' complete':''),'<span><b>請求書</b><small>'+esc(r.title)+'</small>'+(detail?'<small>'+esc(detail)+'</small>':'')+'</span><span aria-hidden="true">›</span>');
}
function invoiceRow(item){
 const state=item.required===false?'請求不要':item.required===null?'請求が必要か確認':item.sent?'小森さんへ送付済み'+(item.sentAt?' · '+D.md(item.sentAt):''):item.received?'受領済み・小森さんへ未送付':'未受領';
 return '<div class="invoice-row"><button class="production-check '+(item.received?'complete':'')+'" type="button" data-invoice-receive="'+esc(item.id)+'" aria-label="'+esc(item.name+(item.received?'の受領記録を確認':'の請求書を受領済みにする'))+'" '+(item.required===false?'disabled':'')+'><span aria-hidden="true">'+(item.received?'✓':item.required===false?'−':'')+'</span></button><button class="invoice-person" type="button" data-invoice-person="'+esc(item.id)+'"><b>'+esc(item.name)+'</b><small>'+esc(item.roles.join('・')||'内容未登録')+'</small><small class="'+(item.sent?'invoice-sent':'')+'">'+esc(state)+'</small></button></div>';
}
function invoiceSheet(s){
 if(RO)return;const r=invoiceReport(s),before=ShinkouProduction.invoices.snapshot(s);
 let h=productionFolderLink(s)+'<div class="invoice-status '+(r.done?'complete':'')+'"><b>'+esc(r.title)+'</b><p>'+esc(r.receivedComplete?(r.done?'受領・送付の記録を以下で確認できます。':'受領は完了です。小森さんへのメールを作成できます。'):'届いた相手の丸を押すと、受領済みになります。')+'</p></div>';
 const groups=[['未受領',r.missing],['請求が必要か確認',r.unknown],['小森さんへ送付待ち',r.ready],['送付済み',r.sent]];
 h+=groups.filter(([,items])=>items.length).map(([label,items])=>'<section class="invoice-section"><h3>'+label+'</h3>'+items.map(invoiceRow).join('')+'</section>').join('');
 if(!r.items.length)h+='<p class="hint">回収対象の請求先はありません。スタジオなどの請求があれば下から追加できます。</p>';
 h+='<p class="hint">作詞・作曲は請求書不要です。編曲・演奏などの請求書を確認します。</p>';
 const exempt=r.items.filter(x=>x.required===false);if(exempt.length)h+='<details class="production-omitted"><summary>請求不要の相手</summary>'+exempt.map(invoiceRow).join('')+'</details>';
 h+='<button class="production-more" id="invoiceAdd">＋ 請求先を追加</button>';
 if(!r.confirmed)h+='<div class="invoice-roster"><p class="hint">クレジットにない請求先も含め、漏れがないか確認してください。</p>'+(r.unknown.length?'<p class="hint">未確認の相手は名前を押して「必要／不要」を選んでください。</p>':'<button class="btn w" id="invoiceConfirm">'+(r.expected.length?'請求先はこれで全部':'この曲には請求書はありません')+'</button>')+'</div>';
 if(r.legacyDone&&!r.done)h+='<p class="hint">以前の一括完了の記録は残っています。相手ごとの受領・送付を確認してください。</p>';
 s3(songTitle(s),'請求書',h,[{t:'閉じる',c:'btn',f:()=>hide('sheet3')},...(r.ready.length?[{sp:1},{t:'小森さんへメール',c:'btn pri',f:()=>invoiceMailSheet(s,r.ready.map(x=>x.id))}]:[])]);
 const body=document.getElementById('s3Body'),redraw=()=>{const top=body.scrollTop;invoiceSheet(s);body.scrollTop=top};
 body.querySelectorAll('[data-invoice-receive]').forEach(b=>b.onclick=()=>{const item=r.items.find(x=>x.id===b.dataset.invoiceReceive);if(item.received)invoicePersonEditor(s,item.id);else invoiceChange(s,{id:item.id,action:'received'},before,()=>{redraw();toast(invoiceReport(s).receivedComplete?'全員分の請求書を受領しました':'受領済みにしました')})});
 body.querySelectorAll('[data-invoice-person]').forEach(b=>b.onclick=()=>invoicePersonEditor(s,b.dataset.invoicePerson));
 document.getElementById('invoiceAdd').onclick=()=>invoiceAddSheet(s);
 const confirm=document.getElementById('invoiceConfirm');if(confirm)confirm.onclick=()=>invoiceChange(s,{action:'confirm'},before,redraw);
}
function invoicePersonEditor(s,id){
 if(RO)return;const item=invoiceReport(s).items.find(x=>x.id===id);if(!item)return;
 const before=ShinkouProduction.invoices.snapshot(s),change=action=>invoiceChange(s,{id,action},before,()=>invoiceSheet(s));
 const status=item.sent?'小森さんへ送付済み':item.received?'受領済み・送付待ち':'未受領';
 const h='<p class="invoice-person-detail">'+esc(item.roles.join('・'))+'</p><p>'+status+'</p>'+(item.receivedAt?'<p class="hint">受領日 '+esc(item.receivedAt)+'</p>':'')+(item.sentAt?'<p class="hint">送付日 '+esc(item.sentAt)+'</p>':'')+'<div class="invoice-actions">'+(item.required!==true?'<button class="btn w" id="invoiceRequired">請求書が必要</button>':'')+(item.required!==false?'<button class="btn w" id="invoiceExempt">この相手の請求書は不要</button>':'')+(item.received?'<button class="btn w" id="invoiceReset">未受領に戻す</button>':'')+(item.sent?'<button class="btn w" id="invoiceUnsent">送付待ちに戻す</button>':'')+'</div>';
 s3(songTitle(s),item.name,h,[{t:'戻る',c:'btn',f:()=>invoiceSheet(s)},{sp:1},...(item.required!==false?[{t:item.sent?'閉じる':item.received?'小森さんへメール':'受領済みにする',c:'btn pri',f:()=>item.sent?invoiceSheet(s):item.received?invoiceMailSheet(s,[id]):change('received')}]:[])]);
 for(const [key,action]of [['invoiceRequired','required'],['invoiceExempt','exempt'],['invoiceReset','pending'],['invoiceUnsent','unsent']]){const b=document.getElementById(key);if(b)b.onclick=()=>change(action)}
}
function invoiceAddSheet(s){
 if(RO)return;const before=ShinkouProduction.invoices.snapshot(s);
 s3(songTitle(s),'請求先を追加',productionField('請求先の名前','invoiceName','')+productionField('内容（編曲・スタジオなど）','invoiceRole',''),[{t:'戻る',c:'btn',f:()=>invoiceSheet(s)},{sp:1},{t:'追加',c:'btn pri',f:()=>{
  if(!invoiceGuard(s,before))return;
  try{ShinkouProduction.invoices.add(s,document.getElementById('invoiceName').value,document.getElementById('invoiceRole').value,uid());productionAfterSave(s);invoiceSheet(s)}catch(e){toast(e.message)}
 }}]);document.getElementById('invoiceName').focus({preventScroll:true});
}
async function invoiceCopy(id,status){
 const el=document.getElementById(id),out=document.getElementById(status);if(!el||!out)return;try{await navigator.clipboard.writeText(el.value);if(out.isConnected)out.textContent='コピーしました'}catch{if(!el.isConnected||!out.isConnected)return;el.focus();el.select();out.textContent='選択した文面を長押ししてコピーしてください'}
}
function invoiceMailSheet(s,ids){
 if(RO)return;const before=ShinkouProduction.invoices.snapshot(s);let draft;
 try{draft=ShinkouProduction.invoices.draft(s,ids)}catch(e){toast(e.message);return}
 const items=invoiceReport(s).items.filter(x=>ids.includes(x.id));
 let h=productionFolderLink(s)+'<p class="hint">送付する請求書：'+items.map(x=>esc(x.name)).join('、')+'</p>'+
 productionField('小森さんのメールアドレス','invoiceDeskEmail',S.settings.invoiceDeskEmail||'','email')+'<p class="hint">アドレスは一度入力すると、この端末に保存されます。</p>'+
 productionField('件名','invoiceSubject',draft.subject)+'<button class="production-more" id="invoiceCopySubject">件名をコピー</button>'+
 '<label class="quick-field">本文<textarea class="inp production-draft" id="invoiceBody" rows="9">'+esc(draft.body)+'</textarea></label><button class="production-more" id="invoiceCopyBody">本文をコピー</button>'+
 '<div class="invoice-actions"><button class="btn w" id="invoiceOpenMail">メールを開く</button><button class="btn w" id="invoiceGmailDraft">Gmailに下書き保存</button><p class="hint">宛先・件名・本文を入れて開きます。請求書はメール画面で添付してください。</p>';
 if(navigator.share&&navigator.canShare)h+='<details class="production-contact"><summary>請求書ファイルを添えて共有</summary><label class="quick-field">請求書ファイル<input class="inp" id="invoiceFiles" type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,.docx,.doc"></label><button class="btn w" id="invoiceShare">選んだ請求書を共有</button><p class="hint">iPhoneの共有画面からメールを選べます。ファイルはアプリに保存されません。</p></details>';
 h+='</div><p class="hint">実際に送信した後で、下の「送付済みにする」を押してください。メールを開く・共有するだけでは完了になりません。</p><p class="hint" id="invoiceMailStatus" role="status"></p>';
 s3(songTitle(s),'小森さんへ請求書を送付',h,[{t:'戻る',c:'btn',f:()=>invoiceSheet(s)},{sp:1},{t:'送付済みにする',c:'btn pri',f:()=>{
  if(!invoiceGuard(s,before))return;
  // 全件を検証してから一括保存する。途中まで送付済みにはしない。
  const copy=ShinkouCore.copy(s);try{for(const id of ids)ShinkouProduction.invoices.apply(copy,{id,action:'sent'},D.today());s.credits=copy.credits;s.invoiceItems=copy.invoiceItems;productionAfterSave(s);invoiceSheet(s);toast(invoiceReport(s).done?'請求書の受領・送付が完了しました':'小森さんへの送付を記録しました')}catch(e){toast(e.message)}
 }}]);
 const statusElement=document.getElementById('invoiceMailStatus'),status=message=>{if(statusElement.isConnected)statusElement.textContent=message};
 const email=()=>document.getElementById('invoiceDeskEmail').value.trim();
 const saveAddress=()=>{const value=email();if(!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(value)){status('小森さんのメールアドレスを入力してください');document.getElementById('invoiceDeskEmail').focus({preventScroll:true});return false}S.settings.invoiceDeskEmail=value;mark();return true};
 document.getElementById('invoiceCopySubject').onclick=()=>invoiceCopy('invoiceSubject','invoiceMailStatus');
 document.getElementById('invoiceCopyBody').onclick=()=>invoiceCopy('invoiceBody','invoiceMailStatus');
 document.getElementById('invoiceOpenMail').onclick=()=>{if(!invoiceGuard(s,before)||!saveAddress())return;const subject=document.getElementById('invoiceSubject').value,body=document.getElementById('invoiceBody').value;location.href='mailto:'+encodeURIComponent(email())+'?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body);status('メールで請求書を添付して送信してください')};
 document.getElementById('invoiceGmailDraft').onclick=async e=>{
  if(!invoiceGuard(s,before)||!saveAddress())return;wfSetup();
  if(!WC.status().scopes.includes(WC.SCOPES.draft)||DEMO){workflowConnections(()=>invoiceMailSheet(s,ids));return}
  const b=e.currentTarget,draft={to:email(),subject:document.getElementById('invoiceSubject').value,body:document.getElementById('invoiceBody').value};b.disabled=true;status('Gmailに下書きを保存しています…');
  try{await WC.createDraft(draft);status('Gmailの下書きに保存しました。請求書を添付して送信してください。')}catch(e){status(e.message+'。Gmailの下書きにも保存されていないか確認してください。');if(b.isConnected)b.disabled=false}
 };
 const share=document.getElementById('invoiceShare');if(share)share.onclick=async()=>{
  if(!invoiceGuard(s,before))return;const files=[...document.getElementById('invoiceFiles').files];
  if(!files.length){status('共有する請求書ファイルを選んでください');return}
  if(!navigator.canShare({files})){status('このファイルは共有できません。「メールを開く」から添付してください');return}
  try{await navigator.share({files,title:document.getElementById('invoiceSubject').value,text:document.getElementById('invoiceBody').value});status('共有画面で送信できたことを確認してから、送付済みにしてください')}catch(e){if(e.name!=='AbortError')status('共有できませんでした。「メールを開く」から添付してください')}
 };
}
function invoiceOverviewRefresh(container){
 if(RO)return;const rows=S.songs.map(s=>({s,r:invoiceReport(s)})).filter(x=>x.r.items.length||x.s.invoiceTracking);
 const pending=rows.filter(x=>!x.r.done),done=rows.filter(x=>x.r.done);
 const list=items=>items.map(({s,r})=>'<button class="invoice-overview-row" data-invoice-song="'+esc(s.id)+'"><b>'+esc(songTitle(s))+'</b><small>'+esc(s.artist||'')+'</small><span>'+esc(r.title)+'</span>'+(r.missing.length?'<small>未受領：'+r.missing.map(x=>esc(x.name)).join('、')+'</small>':'')+'</button>').join('');
 container.innerHTML=list(pending)+(done.length?'<details class="production-omitted"><summary>完了した請求書</summary>'+list(done)+'</details>':'')+(!rows.length?'<p class="hint">請求先が未登録です。曲の「請求書」から確認・追加できます。</p>':'');
 container.querySelectorAll('[data-invoice-song]').forEach(b=>b.onclick=()=>{const s=S.songs.find(x=>x.id===b.dataset.invoiceSong);if(s)invoiceSheet(s)});
}

function invoiceOverview(){if(RO)return;s2('受領と小森さんへの送付','請求書','<div id="invoiceOverviewRows"></div>',[{sp:1},{t:'閉じる',c:'btn',f:()=>hide('sheet2')}]);invoiceOverviewRefresh(document.getElementById('invoiceOverviewRows'));}
