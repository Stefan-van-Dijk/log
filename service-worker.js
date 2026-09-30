const CACHE='kmreg-shell-0.37-sharing18';
const SHELL=[
  './','./index.html',
  './shared-card-import.js?v=0.37-sharing18','./shared-config-bridge.js?v=0.37-sharing18','./shared-settings-ui.js?v=0.36','./shared-diff-rights.js?v=0.37-sharing18','./shared-update-compact.js?v=0.36','./location-polling.js?v=0.36',
  './build-ui.js?v=0.36','./sharing.js?v=0.37-sharing18','./sharing-private-ui.js?v=0.37-sharing18','./collaboration.js?v=0.37-sharing18','./shared-id-separation.js?v=0.37-sharing18','./offline-share-bridge.js?v=0.37-sharing18','./live-sharing-bootstrap.js?v=0.37-sharing18',
  './action-details-reset.js?v=0.36','./swipe-policy.js?v=0.36','./swipe-ui.css?v=0.36','./cards.css?v=0.36','./log-code.js?v=0.36','./cards.js?v=0.36','./people.js?v=0.36','./location-actions.js?v=0.36','./location-actions.css?v=0.36','./contact-import.js?v=0.36','./people.css?v=0.36',
  './vendor/qrcode-2.0.4.js','./vendor/jsbarcode-3.12.1.min.js','./vendor/zxing-0.21.3.min.js','./log-json-v2.js?v=2.0.0','./log-ui.css?v=0.36','./removal-policy.js?v=0.36','./shell-backup-archive.js?v=0.36','./shell-ui.js?v=0.36','./shell-ui-stable.js?v=0.36','./shell-gestures.js?v=0.36','./shell-location-status.js?v=0.36','./shell-removal-policy.js?v=0.36','./shell-quick-actions.js?v=0.36','./shell-direct-actions.js?v=0.37-sharing18',
  './id-converter.html','./manifest.webmanifest','./app-icon.svg','./config/modules.json','./time/index.html','./time/filter-model.js?v=0.36','./time/app.js?v=0.36','./time/styles.css?v=0.36','./time/home-layout.css?v=0.36','./time/home-layout.js?v=0.36','./time/home-top.css?v=0.36','./time/home-top.js?v=0.36','./time/removal-policy-ui.js?v=0.36'
];

const NETWORK_FIRST_SCRIPTS=new Set([
  'shared-card-import.js','shared-config-bridge.js','shared-settings-ui.js','shared-diff-rights.js','shared-update-compact.js','location-polling.js','build-ui.js','sharing.js','sharing-private-ui.js','collaboration.js','shared-id-separation.js','offline-share-bridge.js','live-sharing-bootstrap.js','action-details-reset.js','cards.js','log-code.js','location-actions.js','shell-direct-actions.js','shell-gestures.js','app.js'
]);
const LIVE_STORAGE_PATCH_FILES=new Set(['shared-card-import.js','shared-config-bridge.js','sharing.js','collaboration.js','shared-id-separation.js','shared-diff-rights.js']);
const BOOTSTRAP_TAG='<script src="./live-sharing-bootstrap.js?v=0.37-sharing18"></script>';

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL.map(path=>new Request(path,{cache:'reload'})))).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key.startsWith('kmreg-shell-')&&key!==CACHE).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
      .then(()=>self.clients.matchAll({type:'window'}))
      .then(clients=>Promise.all(clients.filter(client=>!new URL(client.url).pathname.startsWith(new URL('./test/',self.registration.scope).pathname)).map(client=>client.navigate(client.url).catch(()=>null))))
  );
});

async function transformScript(response,filename){
  if(!LIVE_STORAGE_PATCH_FILES.has(filename)||!response.ok)return response;
  const headers=new Headers(response.headers);headers.delete('content-length');
  const text=(await response.text())
    .replaceAll('kmreg-test-v4-data','kmreg-v4-data')
    .replaceAll('urenregistratie.test.pwa.v1','urenregistratie.pwa.v1');
  return new Response(text,{status:response.status,statusText:response.statusText,headers});
}

async function networkFirst(req,filename=''){
  try{
    const response=await fetch(new Request(req,{cache:'reload'}));
    const transformed=await transformScript(response,filename);
    const copy=transformed.clone();caches.open(CACHE).then(cache=>cache.put(req,copy));
    return transformed;
  }catch(_){return caches.match(req);}
}

async function liveNavigation(req){
  try{
    const response=await fetch(new Request(req,{cache:'reload'}));
    if(!response.ok)return response;
    const headers=new Headers(response.headers);headers.delete('content-length');
    let text=await response.text();
    if(!text.includes('live-sharing-bootstrap.js'))text=text.replace('</body>',`${BOOTSTRAP_TAG}\n</body>`);
    const transformed=new Response(text,{status:response.status,statusText:response.statusText,headers});
    const copy=transformed.clone();caches.open(CACHE).then(cache=>cache.put('./index.html',copy));
    return transformed;
  }catch(_){return caches.match('./index.html');}
}

self.addEventListener('fetch',event=>{
  const req=event.request,url=new URL(req.url);
  if(req.method!=='GET'||url.origin!==self.location.origin)return;
  if(url.pathname.startsWith(new URL('./test/',self.registration.scope).pathname))return;
  if(url.pathname.endsWith('/import.html'))return;

  const filename=url.pathname.split('/').pop();
  const isTimeApp=url.pathname.endsWith('/time/app.js');
  if(NETWORK_FIRST_SCRIPTS.has(filename)&&(filename!=='app.js'||isTimeApp)){
    event.respondWith(networkFirst(req,filename));return;
  }
  if(url.pathname.endsWith('/id-converter.html')){
    event.respondWith(caches.match('./id-converter.html').then(cached=>cached||fetch(req)));return;
  }
  if(url.pathname.endsWith('/shell-ui-stable.js')){
    event.respondWith(networkFirst(req,filename));return;
  }
  if(url.pathname.endsWith('/config/modules.json')){
    event.respondWith(fetch(req).then(resp=>{if(!resp.ok)throw new Error('Menuconfiguratie niet beschikbaar');const copy=resp.clone();caches.open(CACHE).then(cache=>cache.put('./config/modules.json',copy));return resp;}).catch(()=>caches.match('./config/modules.json')));return;
  }
  if(req.mode==='navigate'&&url.pathname.startsWith(new URL('./time/',self.registration.scope).pathname)){
    event.respondWith(fetch(new Request(req,{cache:'reload'})).then(resp=>{const copy=resp.clone();caches.open(CACHE).then(cache=>cache.put('./time/index.html',copy));return resp;}).catch(()=>caches.match('./time/index.html')));return;
  }
  if(req.mode==='navigate'){
    event.respondWith(liveNavigation(req));return;
  }
  event.respondWith(caches.match(req).then(cached=>cached||fetch(req).then(resp=>{const copy=resp.clone();caches.open(CACHE).then(cache=>cache.put(req,copy));return resp;})));
});
