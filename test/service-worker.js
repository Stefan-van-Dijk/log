const CACHE='kmreg-test-shell-0.31.10-test.121';
const SHELL=[
  './',
  './index.html',
  './swipe-policy.js?v=0.31.10-test.121',
  './swipe-ui.css?v=0.31.10-test.121',
  './cards.css?v=0.31.10-test.121',
  './log-code.js?v=0.31.10-test.121',
  './cards.js?v=0.31.10-test.121',
  './vendor/qrcode-2.0.4.js',
  './vendor/jsbarcode-3.12.1.min.js',
  './vendor/zxing-0.21.3.min.js',
  './log-json-v2.js?v=2.0.0',
  './log-ui.css?v=0.31.10-test.121',
  './removal-policy.js?v=0.31.10-test.121',
  './shell-backup-archive.js?v=0.31.10-test.121',
  './shell-ui.js?v=0.31.10-test.121',
  './shell-ui-stable.js?v=0.31.10-test.121',
  './shell-gestures.js?v=0.31.10-test.121',
  './shell-location-status.js?v=0.31.10-test.121',
  './shell-removal-policy.js?v=0.31.10-test.121',
  './shell-quick-actions.js?v=0.31.10-test.121',
  './shell-direct-actions.js?v=0.31.10-test.121',
  './id-converter.html',
  './manifest.webmanifest',
  './app-icon.svg',
  './config/modules.json',
  './time/index.html',
  './time/filter-model.js?v=0.31.10-test.121',
  './time/app.js?v=0.31.10-test.121',
  './time/styles.css?v=0.31.10-test.121',
  './time/home-layout.css?v=0.31.10-test.121',
  './time/home-layout.js?v=0.31.10-test.121',
  './time/home-top.css?v=0.31.10-test.121',
  './time/home-top.js?v=0.31.10-test.121',
  './time/removal-policy-ui.js?v=0.31.10-test.121'
];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL.map(path=>new Request(path,{cache:'reload'})))).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key.startsWith('kmreg-test-shell-')&&key!==CACHE).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
      .then(()=>self.clients.matchAll({type:'window'}))
      .then(clients=>Promise.all(clients.map(client=>client.navigate(client.url).catch(()=>null))))
  );
});

self.addEventListener('fetch',event=>{
  const req=event.request,url=new URL(req.url);
  if(req.method!=='GET'||url.origin!==self.location.origin)return;
  if(url.pathname.endsWith('/import.html'))return;
  if(url.pathname.endsWith('/id-converter.html')){
    event.respondWith(caches.match('./id-converter.html').then(cached=>cached||fetch(req)));
    return;
  }
  if(url.pathname.endsWith('/shell-ui-stable.js')){
    event.respondWith(
      fetch(new Request(req,{cache:'reload'}))
        .then(resp=>{
          const copy=resp.clone();
          caches.open(CACHE).then(cache=>cache.put(req,copy));
          return resp;
        })
        .catch(()=>caches.match(req))
    );
    return;
  }
  if(url.pathname.endsWith('/config/modules.json')){
    event.respondWith(
      fetch(req)
        .then(resp=>{
          if(!resp.ok)throw new Error('Menuconfiguratie niet beschikbaar');
          const copy=resp.clone();
          caches.open(CACHE).then(cache=>cache.put('./config/modules.json',copy));
          return resp;
        })
        .catch(()=>caches.match('./config/modules.json'))
    );
    return;
  }
  if(req.mode==='navigate'&&url.pathname.startsWith(new URL('./time/',self.registration.scope).pathname)){
    event.respondWith(
      fetch(new Request(req,{cache:'reload'}))
        .then(resp=>{
          const copy=resp.clone();
          caches.open(CACHE).then(cache=>cache.put('./time/index.html',copy));
          return resp;
        })
        .catch(()=>caches.match('./time/index.html'))
    );
    return;
  }
  if(req.mode==='navigate'){
    event.respondWith(
      fetch(new Request(req,{cache:'reload'}))
        .then(resp=>{
          const copy=resp.clone();
          caches.open(CACHE).then(cache=>cache.put('./index.html',copy));
          return resp;
        })
        .catch(()=>caches.match('./index.html'))
    );
    return;
  }
  event.respondWith(caches.match(req).then(cached=>cached||fetch(req).then(resp=>{
    const copy=resp.clone();
    caches.open(CACHE).then(cache=>cache.put(req,copy));
    return resp;
  })));
});
