const BUILD='0.37-test.35';
const CACHE=`kmreg-test-shell-${BUILD}`;
const SHELL=[
  './','./index.html',
  `./shared-card-import.js?v=${BUILD}`,`./shared-config-bridge.js?v=${BUILD}`,`./shared-settings-ui.js?v=${BUILD}`,`./shared-diff-rights.js?v=${BUILD}`,`./location-polling.js?v=${BUILD}`,
  `./test-build-ui.js?v=${BUILD}`,`./sharing.js?v=${BUILD}`,`./sharing-private-ui.js?v=${BUILD}`,`./collaboration.js?v=${BUILD}`,`./shared-id-separation.js?v=${BUILD}`,`./offline-share-bridge.js?v=${BUILD}`,`./qr-action-direct.js?v=${BUILD}`,`./task-replace-finish.js?v=${BUILD}`,`./compact-stop-ui.js?v=${BUILD}`,`./time/active-task-layout.js?v=${BUILD}`,`./shared-home-components.css?v=${BUILD}`,`./shared-home-components.js?v=${BUILD}`,
  `./action-details-reset.js?v=${BUILD}`,'./swipe-policy.js?v=0.35.1-test.6','./swipe-ui.css?v=0.35.1-test.6','./cards.css?v=0.35.1-test.6','./log-code.js?v=0.35.1-test.6','./cards.js?v=0.35.1-test.6','./people.js?v=0.35.1-test.6','./location-actions.js?v=0.35.1-test.6','./location-actions.css?v=0.35.1-test.6','./contact-import.js?v=0.35.1-test.6','./people.css?v=0.35.1-test.6',
  './vendor/qrcode-2.0.4.js','./vendor/jsbarcode-3.12.1.min.js','./vendor/zxing-0.21.3.min.js','./log-json-v2.js?v=2.0.0','./log-ui.css?v=0.35.1-test.6','./removal-policy.js?v=0.35.1-test.6','./shell-backup-archive.js?v=0.35.1-test.6',`./shell-ui.js?v=${BUILD}`,'./shell-ui-stable.js?v=0.35.1-test.6','./shell-gestures.js?v=0.35.1-test.6','./shell-location-status.js?v=0.35.1-test.6','./shell-removal-policy.js?v=0.35.1-test.6','./shell-quick-actions.js?v=0.35.1-test.6','./shell-direct-actions.js?v=0.35.1-test.9',
  './id-converter.html','./manifest.webmanifest','./app-icon.svg','./config/modules.json','./time/index.html','./time/filter-model.js?v=0.35.1-test.6','./time/app.js?v=0.35.1-test.6','./time/styles.css?v=0.35.1-test.6','./time/home-layout.css?v=0.35.1-test.6','./time/home-layout.js?v=0.35.1-test.6','./time/home-top.css?v=0.35.1-test.6','./time/home-top.js?v=0.35.1-test.6','./time/removal-policy-ui.js?v=0.35.1-test.6'
];

self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL.map(path=>new Request(path,{cache:'reload'})))).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('kmreg-test-shell-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()).then(()=>self.clients.matchAll({type:'window'})).then(clients=>Promise.all(clients.map(client=>client.navigate(client.url).catch(()=>null)))));});

function networkFirst(req){return fetch(new Request(req,{cache:'reload'})).then(resp=>{const copy=resp.clone();caches.open(CACHE).then(cache=>cache.put(req,copy));return resp;}).catch(()=>caches.match(req));}

async function withShellBuild(response){
  if(!response||!response.ok)return response;
  const text=await response.text();
  const headers=new Headers(response.headers);
  headers.set('Content-Type','application/javascript; charset=utf-8');
  const sharedHomeLoader=`(()=>{if(!document.querySelector('script[data-log-active-task-layout]')){const active=document.createElement('script');active.src='./time/active-task-layout.js?v=${BUILD}';active.async=false;active.dataset.logActiveTaskLayout='1';document.head.appendChild(active);}if(!document.querySelector('link[data-log-shared-home-components]')){const link=document.createElement('link');link.rel='stylesheet';link.href='./shared-home-components.css?v=${BUILD}';link.dataset.logSharedHomeComponents='1';document.head.appendChild(link);}if(document.querySelector('script[data-log-shared-home-components]'))return;const script=document.createElement('script');script.src='./shared-home-components.js?v=${BUILD}';script.async=false;script.dataset.logSharedHomeComponents='1';document.head.appendChild(script);})();`;
  return new Response(`window.LOG_TEST_BUILD='${BUILD}';\n${sharedHomeLoader}\n${text}`,{status:response.status,statusText:response.statusText,headers});
}

function shellWithBuild(req){
  return fetch(new Request(req,{cache:'reload'}))
    .then(withShellBuild)
    .then(resp=>{const copy=resp.clone();caches.open(CACHE).then(cache=>cache.put(req,copy));return resp;})
    .catch(()=>caches.match(req));
}

self.addEventListener('fetch',event=>{
  const req=event.request,url=new URL(req.url);
  if(req.method!=='GET'||url.origin!==self.location.origin)return;
  if(url.pathname.endsWith('/import.html'))return;
  if(url.pathname.endsWith('/id-converter.html')){event.respondWith(caches.match('./id-converter.html').then(cached=>cached||fetch(req)));return;}
  if(url.pathname.endsWith('/shell-ui.js')){event.respondWith(shellWithBuild(req));return;}
  if(['/shared-card-import.js','/shared-config-bridge.js','/shared-settings-ui.js','/shared-diff-rights.js','/location-polling.js','/test-build-ui.js','/sharing-private-ui.js','/collaboration.js','/shared-id-separation.js','/offline-share-bridge.js','/qr-action-direct.js','/task-replace-finish.js','/compact-stop-ui.js','/time/active-task-layout.js','/shared-home-components.css','/shared-home-components.js','/shell-ui-stable.js','/shell-direct-actions.js'].some(path=>url.pathname.endsWith(path))){event.respondWith(networkFirst(req));return;}
  if(url.pathname.endsWith('/config/modules.json')){event.respondWith(fetch(req).then(resp=>{if(!resp.ok)throw new Error('Menuconfiguratie niet beschikbaar');const copy=resp.clone();caches.open(CACHE).then(cache=>cache.put('./config/modules.json',copy));return resp;}).catch(()=>caches.match('./config/modules.json')));return;}
  if(req.mode==='navigate'&&url.pathname.startsWith(new URL('./time/',self.registration.scope).pathname)){event.respondWith(fetch(new Request(req,{cache:'reload'})).then(resp=>{const copy=resp.clone();caches.open(CACHE).then(cache=>cache.put('./time/index.html',copy));return resp;}).catch(()=>caches.match('./time/index.html')));return;}
  if(req.mode==='navigate'){event.respondWith(fetch(new Request(req,{cache:'reload'})).then(resp=>{const copy=resp.clone();caches.open(CACHE).then(cache=>cache.put('./index.html',copy));return resp;}).catch(()=>caches.match('./index.html')));return;}
  event.respondWith(caches.match(req).then(cached=>cached||fetch(req).then(resp=>{const copy=resp.clone();caches.open(CACHE).then(cache=>cache.put(req,copy));return resp;})));
});