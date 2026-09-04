const CACHE='portal-livion-v2';
const SHELL=['./','./index.html','./install-app.html','./offline.html','./portal-theme.css','./unified-nav.css','./livion-logo.svg','./claro-logo.svg','./msal-browser.min.js','./manifest.webmanifest','./manifest-rh.webmanifest','./manifest-fretes.webmanifest','./manifest-reparos-claro.webmanifest','./manifest-estoque.webmanifest','./manifest-despesas-reembolsos.webmanifest','./assets/icons/livion-64.png','./assets/icons/livion-180.png','./assets/icons/livion-192.png','./assets/icons/livion-512.png','./assets/app-icons/rh-64.png','./assets/app-icons/rh-180.png','./assets/app-icons/rh-192.png','./assets/app-icons/rh-512.png','./assets/app-icons/fretes-64.png','./assets/app-icons/fretes-180.png','./assets/app-icons/fretes-192.png','./assets/app-icons/fretes-512.png','./assets/app-icons/reparos-claro-64.png','./assets/app-icons/reparos-claro-180.png','./assets/app-icons/reparos-claro-192.png','./assets/app-icons/reparos-claro-512.png','./assets/app-icons/estoque-64.png','./assets/app-icons/estoque-180.png','./assets/app-icons/estoque-192.png','./assets/app-icons/estoque-512.png','./assets/app-icons/despesas-reembolsos-64.png','./assets/app-icons/despesas-reembolsos-180.png','./assets/app-icons/despesas-reembolsos-192.png','./assets/app-icons/despesas-reembolsos-512.png'];
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
