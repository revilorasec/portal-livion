const CACHE='portal-livion-v63-directory';
const SHELL=['./','./index.html','./offline.html','./portal-theme.css?v=6','./unified-nav.css?v=2','./livion-logo.svg','./msal-browser.min.js','./manifest.webmanifest','./claro-logo.svg','./assets/client-logos/vtal.png','./assets/client-logos/nokia.svg'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin)return;
  const forceFresh=request.mode==='navigate'||/\.(?:html?|js|css)$/i.test(url.pathname);
  const networkRequest=forceFresh?new Request(request,{cache:'no-store'}):request;
  event.respondWith(fetch(networkRequest).then(response=>{
    if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy))}
    return response;
  }).catch(async()=>await caches.match(request)||await caches.match(request.mode==='navigate'?'./offline.html':'./')));
});
