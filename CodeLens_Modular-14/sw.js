const V='cl-v1';
const CORE=['./','./index.html','./config.js','./auth.js','./router.js','./editor.js','./playground.js','./chat.js','./settings.js','./main.js','./manifest.json'];
self.addEventListener('install',e=>e.waitUntil(caches.open(V).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;e.respondWith(caches.match(e.request).then(c=>{const n=fetch(e.request).then(r=>{if(r?.status===200&&r.type==='basic')caches.open(V).then(x=>x.put(e.request,r.clone()));return r;}).catch(()=>c);return c||n;}));});
