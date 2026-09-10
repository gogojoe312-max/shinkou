/* 同じ版のHTML・ロジック・スタイルをオフライン用に保持する。 */
const CACHE='shinkou-v5-20260910g';
const ASSETS=['./','./index.html','./core.js?v=20260910g','./app.js?v=20260910g','./ui.js?v=20260910g','./ui.css?v=20260910g'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('shinkou-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const req=event.request,url=new URL(req.url);
  if(req.method!=='GET'||url.origin!==self.location.origin||!url.href.startsWith(self.registration.scope))return;
  event.respondWith(fetch(req).then(response=>{
    if(!response.ok)throw new Error('HTTP '+response.status);
    const clone=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(req,clone)));
    return response;
  }).catch(async()=>{
    const cache=await caches.open(CACHE),saved=await cache.match(req);if(saved)return saved;
    if(req.mode==='navigate')return (await cache.match('./index.html'))||Response.error();
    return Response.error();
  }));
});
