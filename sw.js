const CACHE='portal-livion-v1';
const SHELL=['./','./index.html','./offline.html','./portal-theme.css','./unified-nav.css','./livion-logo.svg','./claro-logo.svg','./msal-browser.min.js','./assets/icons/livion-64.png','./assets/icons/livion-180.png','./assets/icons/livion-192.png','./assets/icons/livion-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin)return;
  event.respondWith(fetch(request).then(response=>{
    if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy))}
    return response;
  }).catch(async()=>await caches.match(request)||await caches.match(request.mode==='navigate'?'./offline.html':'./')));
});
