const BUILD='0.37-test.53';
const CACHE=`kmreg-test-shell-${BUILD}`;
const SHELL=[
  './','./index.html',
  `./shared-card-import.js?v=${BUILD}`,`./shared-config-bridge.js?v=${BUILD}`,`./shared-settings-ui.js?v=${BUILD}`,`./shared-diff-rights.js?v=${BUILD}`,`./location-polling.js?v=${BUILD}`,
  `./test-build-ui.js?v=${BUILD}`,`./sharing.js?v=${BUILD}`,`./sharing-private-ui.js?v=${BUILD}`,`./collaboration.js?v=${BUILD}`,`./shared-id-separation.js?v=${BUILD}`,`./offline-share-bridge.js?v=${BUILD}`,`./qr-action-direct.js?v=${BUILD}`,`./task-replace-finish.js?v=${BUILD}`,`./compact-stop-ui.js?v=${BUILD}`,`./period-switch-isolation.js?v=${BUILD}`,`./time/active-task-layout.js?v=${BUILD}`,`./shared-home-components.css?v=${BUILD}`,`./shared-home-components.js?v=${BUILD}`,`./shared-page-template.css?v=${BUILD}`,`./shared-shell-header.css?v=${BUILD}`,
  `./action-details-reset.js?v=${BUILD}`,'./swipe-policy.js?v=0.35.1-test.6','./swipe-ui.css?v=0.35.1-test.6','./cards.css?v=0.35.1-test.6','./log-code.js?v=0.35.1-test.6','./cards.js?v=0.35.1-test.6','./people.js?v=0.35.1-test.6','./location-actions.js?v=0.35.1-test.6','./location-actions.css?v=0.35.1-test.6','./contact-import.js?v=0.35.1-test.6','./people.css?v=0.35.1-test.6',
  './vendor/qrcode-2.0.4.js','./vendor/jsbarcode-3.12.1.min.js','./vendor/zxing-0.21.3.min.js','./log-json-v2.js?v=2.0.0','./log-ui.css?v=0.35.1-test.6','./removal-policy.js?v=0.35.1-test.6','./shell-backup-archive.js?v=0.35.1-test.6',`./shell-ui.js?v=${BUILD}`,'./shell-ui-stable.js?v=0.35.1-test.6','./shell-gestures.js?v=0.35.1-test.6','./shell-location-status.js?v=0.35.1-test.6','./shell-removal-policy.js?v=0.35.1-test.6','./shell-quick-actions.js?v=0.35.1-test.6','./shell-direct-actions.js?v=0.35.1-test.9',
  './id-converter.html','./manifest.webmanifest','./app-icon.svg','./config/modules.json','./time/filter-model.js?v=0.35.1-test.6','./time/app.js?v=0.35.1-test.6','./time/styles.css?v=0.35.1-test.6',`./time/home-layout.css?v=${BUILD}`,'./time/home-layout.js?v=0.35.1-test.6',`./time/home-top.css?v=${BUILD}`,'./time/home-top.js?v=0.35.1-test.6','./time/removal-policy-ui.js?v=0.35.1-test.6'
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

function networkFirst(req){
  return fetch(new Request(req,{cache:'reload'})).then(resp=>{
    const copy=resp.clone();
    caches.open(CACHE).then(cache=>cache.put(req,copy));
    return resp;
  }).catch(()=>caches.match(req));
}

async function withIndexBuild(response){
  if(!response||!response.ok)return response;
  let html=await response.text();
  const headers=new Headers(response.headers);
  headers.set('Content-Type','text/html; charset=utf-8');

  if(!html.includes('log-shell-booting')){
    html=html.replace('<html lang="nl">','<html lang="nl" class="log-shell-booting">');
    html=html.replace('</head>',`<style id="logShellBootStyle">html.log-shell-booting body{visibility:hidden}</style><script>setTimeout(()=>document.documentElement.classList.remove('log-shell-booting'),2500)<\/script></head>`);
  }
  if(!html.includes('data-log-shared-shell-header')){
    html=html.replace('</head>',`<link rel="stylesheet" href="./shared-shell-header.css?v=${BUILD}" data-log-shared-shell-header></head>`);
  }

  html=html.replace(/const APP_BUILD='[^']+';/,`const APP_BUILD='${BUILD}';`);
  html=html.replace(/\.\/time\/home-layout\.css\?v=[^"']+/g,`./time/home-layout.css?v=${BUILD}`);
  html=html.replace(/\.\/time\/home-top\.css\?v=[^"']+/g,`./time/home-top.css?v=${BUILD}`);

  html=html.replace("new Intl.DateTimeFormat('nl-NL',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(r.start)","new Intl.DateTimeFormat('nl-NL',{weekday:'long',day:'numeric',month:'long'}).format(r.start)");
  html=html.replace("function periodSubLabel(){const r=periodRange();if(periodMode==='day'||periodMode==='year')return'';if(periodMode==='all')return'Volledige historie';const end=addDays(r.end,-1),startText=new Intl.DateTimeFormat('nl-NL',{day:'numeric',month:'short'}).format(r.start),endText=new Intl.DateTimeFormat('nl-NL',{day:'numeric',month:'short',year:'numeric'}).format(end);return`${startText} – ${endText}`}","function periodSubLabel(){const r=periodRange();if(periodMode==='day'||periodMode==='year')return'';if(periodMode==='all')return'Volledige historie';const end=addDays(r.end,-1),startText=new Intl.DateTimeFormat('nl-NL',{day:'numeric',month:'short'}).format(r.start);if(periodMode==='week'){const endText=new Intl.DateTimeFormat('nl-NL',{day:'numeric',month:'short'}).format(end);return`${startText} – ${endText}`}const endText=new Intl.DateTimeFormat('nl-NL',{day:'numeric',month:'short',year:'numeric'}).format(end);return`${startText} – ${endText}`}");
  html=html.replace("periodMode==='week'?time(t.departureTime):shortDate(t.departureTime)+'<br>'+time(t.departureTime)","(periodMode==='day'||periodMode==='week')?time(t.departureTime):shortDate(t.departureTime)+'<br>'+time(t.departureTime)");
  html=html.replace("if(periodMode==='day')return`<div class=\"list\">${arr.map(tripRow).join('')}</div>`;","if(periodMode==='day')return`<div class=\"trip-group\"><div class=\"trip-group-title\">${esc(relativeDayLabel(periodRange().start))}</div><div class=\"list\">${arr.map(tripRow).join('')}</div></div>`;");

  if(!html.includes('window.LogModuleHost={')){
    const bridge=`window.LogModuleHost={\n  getMode(){return appMode;},\n  setMode(mode){\n    const next=mode==='time'?'time':'kilometers';\n    applyAppMode(next,false);\n  }\n};\napplyAppMode(appMode,false);`;
    if(html.includes('applyAppMode(appMode,false);'))html=html.replace('applyAppMode(appMode,false);',bridge);
  }

  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

async function withTimeAppBuild(response){
  if(!response||!response.ok)return response;
  let text=await response.text();
  const headers=new Headers(response.headers);
  headers.set('Content-Type','application/javascript; charset=utf-8');
  text=text.replace("function periodSubLabel() {\n  const { start, end } = periodBounds();\n  if (state.ui.periodMode === 'day' || state.ui.periodMode === 'year') return '';\n  if (state.ui.periodMode === 'all') return 'Volledige historie';\n  return `${new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short' }).format(start)} – ${new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }).format(end)}`;\n}","function periodSubLabel() {\n  const { start, end } = periodBounds();\n  if (state.ui.periodMode === 'day' || state.ui.periodMode === 'year') return '';\n  if (state.ui.periodMode === 'all') return 'Volledige historie';\n  const startText = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short' }).format(start);\n  if (state.ui.periodMode === 'week') {\n    const endText = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short' }).format(end);\n    return `${startText} – ${endText}`;\n  }\n  const endText = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }).format(end);\n  return `${startText} – ${endText}`;\n}");
  return new Response(text,{status:response.status,statusText:response.statusText,headers});
}

async function withShellBuild(response){
  if(!response||!response.ok)return response;
  const text=await response.text();
  const headers=new Headers(response.headers);
  headers.set('Content-Type','application/javascript; charset=utf-8');

  const legacyModeRouter=`  function originalIsTimeMode() {\n    return document.body.classList.contains('time-mode');\n  }\n\n  function ensureOriginalMode(mode) {\n    const wantTime = mode === 'time';\n    if (originalIsTimeMode() === wantTime) return;\n    const toggle = $('#appModeToggle');\n    if (toggle) toggle.click();\n  }`;
  const hostModeRouter=`  function originalIsTimeMode() {\n    return window.LogModuleHost?.getMode?.() === 'time' || document.body.classList.contains('time-mode');\n  }\n\n  function ensureOriginalMode(mode) {\n    if (window.LogModuleHost?.setMode) {\n      window.LogModuleHost.setMode(mode);\n      return;\n    }\n    const wantTime = mode === 'time';\n    const toggle = $('#appModeToggle');\n    if (originalIsTimeMode() !== wantTime && toggle) toggle.click();\n  }`;
  const routedText=text.includes(legacyModeRouter)?text.replace(legacyModeRouter,hostModeRouter):text;

  const sharedHomeLoader=`(()=>{if(!document.querySelector('script[data-log-active-task-layout]')){const s=document.createElement('script');s.src='./time/active-task-layout.js?v=${BUILD}';s.async=false;s.dataset.logActiveTaskLayout='1';document.head.appendChild(s);}if(!document.querySelector('script[data-log-period-switch-isolation]')){const s=document.createElement('script');s.src='./period-switch-isolation.js?v=${BUILD}';s.async=false;s.dataset.logPeriodSwitchIsolation='1';document.head.appendChild(s);}if(!document.querySelector('link[data-log-shared-home-components]')){const l=document.createElement('link');l.rel='stylesheet';l.href='./shared-home-components.css?v=${BUILD}';l.dataset.logSharedHomeComponents='1';document.head.appendChild(l);}if(!document.querySelector('link[data-log-shared-page-template-css]')){const l=document.createElement('link');l.rel='stylesheet';l.href='./shared-page-template.css?v=${BUILD}';l.dataset.logSharedPageTemplateCss='1';document.head.appendChild(l);}if(!document.querySelector('script[data-log-shared-home-components]')){const s=document.createElement('script');s.src='./shared-home-components.js?v=${BUILD}';s.async=false;s.dataset.logSharedHomeComponents='1';document.head.appendChild(s);}})();`;
  const reveal=`requestAnimationFrame(()=>{document.documentElement.classList.remove('log-shell-booting');window.dispatchEvent(new CustomEvent('log-shell-ready'));});`;
  return new Response(`window.LOG_TEST_BUILD='${BUILD}';\n${sharedHomeLoader}\n${routedText}\n${reveal}`,{status:response.status,statusText:response.statusText,headers});
}

function shellWithBuild(req){
  return fetch(new Request(req,{cache:'reload'}))
    .then(withShellBuild)
    .then(resp=>{const copy=resp.clone();caches.open(CACHE).then(cache=>cache.put(req,copy));return resp;})
    .catch(()=>caches.match(req));
}

function timeAppWithBuild(req){
  return fetch(new Request(req,{cache:'reload'}))
    .then(withTimeAppBuild)
    .then(resp=>{const copy=resp.clone();caches.open(CACHE).then(cache=>cache.put(req,copy));return resp;})
    .catch(()=>caches.match(req).then(withTimeAppBuild));
}

function indexWithBuild(){
  const indexReq=new Request(new URL('./index.html',self.registration.scope),{cache:'reload'});
  return fetch(indexReq)
    .then(withIndexBuild)
    .then(resp=>{const copy=resp.clone();caches.open(CACHE).then(cache=>cache.put('./index.html',copy));return resp;})
    .catch(()=>caches.match('./index.html').then(withIndexBuild));
}

self.addEventListener('fetch',event=>{
  const req=event.request,url=new URL(req.url);
  if(req.method!=='GET'||url.origin!==self.location.origin)return;
  if(url.pathname.endsWith('/import.html'))return;
  if(url.pathname.endsWith('/id-converter.html')){event.respondWith(caches.match('./id-converter.html').then(cached=>cached||fetch(req)));return;}
  if(url.pathname.endsWith('/shell-ui.js')){event.respondWith(shellWithBuild(req));return;}
  if(url.pathname.endsWith('/time/app.js')){event.respondWith(timeAppWithBuild(req));return;}
  if(['/shared-card-import.js','/shared-config-bridge.js','/shared-settings-ui.js','/shared-diff-rights.js','/location-polling.js','/test-build-ui.js','/sharing-private-ui.js','/collaboration.js','/shared-id-separation.js','/offline-share-bridge.js','/qr-action-direct.js','/task-replace-finish.js','/compact-stop-ui.js','/period-switch-isolation.js','/time/active-task-layout.js','/time/home-layout.css','/time/home-top.css','/shared-home-components.css','/shared-home-components.js','/shared-page-template.css','/shared-shell-header.css','/shell-ui-stable.js','/shell-direct-actions.js'].some(path=>url.pathname.endsWith(path))){event.respondWith(networkFirst(req));return;}
  if(url.pathname.endsWith('/config/modules.json')){event.respondWith(fetch(req).then(resp=>{if(!resp.ok)throw new Error('Menuconfiguratie niet beschikbaar');const copy=resp.clone();caches.open(CACHE).then(cache=>cache.put('./config/modules.json',copy));return resp;}).catch(()=>caches.match('./config/modules.json')));return;}
  if(req.mode==='navigate'){event.respondWith(indexWithBuild());return;}
  event.respondWith(caches.match(req).then(cached=>cached||fetch(req).then(resp=>{const copy=resp.clone();caches.open(CACHE).then(cache=>cache.put(req,copy));return resp;})));
});