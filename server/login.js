(async()=>{'use strict';const message=document.getElementById('message');try{
 if(!window.ShinkouServerConfig?.ready){message.textContent='接続の準備中です。制作データは公開されていません。';return}
 const existing=await fetch('/api/session',{credentials:'same-origin'});if(existing.ok){location.replace('/');return}
 const r=await fetch('/api/auth/challenge',{credentials:'same-origin'});if(!r.ok)throw Error('ログインの準備ができませんでした。');const {nonce}=await r.json();
 const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;await new Promise((resolve,reject)=>{script.onload=resolve;script.onerror=reject;document.head.append(script)});
 google.accounts.id.initialize({client_id:ShinkouServerConfig.clientId,nonce,auto_select:false,callback:async({credential})=>{message.textContent='本人確認をしています…';try{const response=await fetch('/api/auth/login',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({credential})});const value=await response.json();if(!response.ok)throw Error(value.error);location.replace('/')}catch(e){message.textContent=e.message+' 画面を読み直してお試しください。'}}});
 google.accounts.id.renderButton(document.getElementById('googleLogin'),{type:'standard',theme:'filled_black',size:'large',text:'signin_with',locale:'ja',width:320});message.textContent='';
 }catch{message.textContent='ログイン画面を読み込めませんでした。接続を確認して画面を読み直してください。'}})();
