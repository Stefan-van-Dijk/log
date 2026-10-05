const BUILD='0.40.1';
const CACHE=`kmreg-shell-${BUILD}`;
const CORE=[
  './','./index.html','./manifest.webmanifest','./app-icon.svg',
  `./location-polling.js?v=${BUILD}`,`./build-ui.js?v=${BUILD}`,`./location-refresh-setting.js?v=${BUILD}`,
  `./shell-ui.js?v=${BUILD}`,`./people.js?v=${BUILD}`,`./cards.js?v=${BUILD}`,`./log-code.js?v=${BUILD}`,
  `./shared-page-template.css?v=${BUILD}`,`./shared-home-components.css?v=${BUILD}`,`./shared-shell-header.css?v=${BUILD}`,
  `./config/modules.json?v=${BUILD}`
];

self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    for(const path of CORE){
      try{const req=new Request(path,{cache:'reload'}),resp=await fetch(req);if(resp.ok)await cache.put(req,resp.clone());}catch(_){}
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(key=>(key.startsWith('kmreg-shell-')||key.startsWith('kmreg-test-shell-'))&&key!==CACHE).map(key=>caches.delete(key)));
    await self.clients.claim();
    const clients=await self.clients.matchAll({type:'window'});
    await Promise.all(clients.map(client=>client.navigate(client.url).catch(()=>null)));
  })());
});

async function transformResponse(response,transform){
  if(!response||!response.ok||!transform)return response;
  return transform(response);
}
async function networkFirst(req,transform=null){
  try{
    const response=await fetch(new Request(req,{cache:'reload'}));
    const result=await transformResponse(response,transform);
    const copy=result.clone();caches.open(CACHE).then(cache=>cache.put(req,copy)).catch(()=>{});
    return result;
  }catch(_){
    const cached=await caches.match(req);
    if(cached)return transformResponse(cached,transform);
    throw _;
  }
}

async function withIndexBuild(response){
  if(!response||!response.ok)return response;
  let html=await response.text();
  const headers=new Headers(response.headers);headers.set('Content-Type','text/html; charset=utf-8');
  if(!html.includes('log-shell-booting')){
    html=html.replace('<html lang="nl">','<html lang="nl" class="log-shell-booting">');
    html=html.replace('</head>',`<style id="logShellBootStyle">html.log-shell-booting body{visibility:hidden}</style><script>setTimeout(()=>document.documentElement.classList.remove('log-shell-booting'),2500)<\/script></head>`);
  }
  if(!html.includes('data-log-shared-shell-header'))html=html.replace('</head>',`<link rel="stylesheet" href="./shared-shell-header.css?v=${BUILD}" data-log-shared-shell-header></head>`);
  html=html.replace(/const APP_BUILD='[^']+';/,`const APP_BUILD='${BUILD}';`);
  html=html.replace(/\.\/location-polling\.js\?v=[^"']+/g,`./location-polling.js?v=${BUILD}`);
  html=html.replace(/\.\/time\/home-layout\.css\?v=[^"']+/g,`./time/home-layout.css?v=${BUILD}`);
  html=html.replace(/\.\/time\/home-top\.css\?v=[^"']+/g,`./time/home-top.css?v=${BUILD}`);
  html=html.replace(/\.\/shell-backup-archive\.js\?v=[^"']+/g,`./shell-backup-archive.js?v=${BUILD}`);
  html=html.replace(/\.\/people\.js\?v=[^"']+/g,`./people.js?v=${BUILD}`);
  html=html.replace('window.LOG_TEST_BUILD=APP_BUILD;','window.LOG_BUILD=APP_BUILD;window.LOG_TEST_BUILD=APP_BUILD;');
  html=html.replace("new Intl.DateTimeFormat('nl-NL',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(r.start)","new Intl.DateTimeFormat('nl-NL',{weekday:'long',day:'numeric',month:'long'}).format(r.start)");
  html=html.replace("function periodSubLabel(){const r=periodRange();if(periodMode==='day'||periodMode==='year')return'';if(periodMode==='all')return'Volledige historie';const end=addDays(r.end,-1),startText=new Intl.DateTimeFormat('nl-NL',{day:'numeric',month:'short'}).format(r.start),endText=new Intl.DateTimeFormat('nl-NL',{day:'numeric',month:'short',year:'numeric'}).format(end);return`${startText} – ${endText}`}","function periodSubLabel(){const r=periodRange();if(periodMode==='day'||periodMode==='year')return'';if(periodMode==='all')return'Volledige historie';const end=addDays(r.end,-1),startText=new Intl.DateTimeFormat('nl-NL',{day:'numeric',month:'short'}).format(r.start);if(periodMode==='week'){const endText=new Intl.DateTimeFormat('nl-NL',{day:'numeric',month:'short'}).format(end);return`${startText} – ${endText}`}const endText=new Intl.DateTimeFormat('nl-NL',{day:'numeric',month:'short',year:'numeric'}).format(end);return`${startText} – ${endText}`}");
  html=html.replace("periodMode==='week'?time(t.departureTime):shortDate(t.departureTime)+'<br>'+time(t.departureTime)","(periodMode==='day'||periodMode==='week')?time(t.departureTime):shortDate(t.departureTime)+'<br>'+time(t.departureTime)");
  html=html.replace("if(periodMode==='day')return`<div class=\"list\">${arr.map(tripRow).join('')}</div>`;","if(periodMode==='day')return`<div class=\"trip-group\"><div class=\"trip-group-title\">${esc(relativeDayLabel(periodRange().start))}</div><div class=\"list\">${arr.map(tripRow).join('')}</div></div>`;");
  if(!html.includes('window.LogModuleHost={')){
    const bridge=`window.LogModuleHost={\n  getMode(){return appMode;},\n  setMode(mode){const next=mode==='time'?'time':'kilometers';applyAppMode(next,false);}\n};\napplyAppMode(appMode,false);`;
    if(html.includes('applyAppMode(appMode,false);'))html=html.replace('applyAppMode(appMode,false);',bridge);
  }
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

async function withTimeAppBuild(response){
  if(!response||!response.ok)return response;
  let text=await response.text();const headers=new Headers(response.headers);headers.set('Content-Type','application/javascript; charset=utf-8');
  text=text.replace("function periodSubLabel() {\n  const { start, end } = periodBounds();\n  if (state.ui.periodMode === 'day' || state.ui.periodMode === 'year') return '';\n  if (state.ui.periodMode === 'all') return 'Volledige historie';\n  return `${new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short' }).format(start)} – ${new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }).format(end)}`;\n}","function periodSubLabel() {\n  const { start, end } = periodBounds();\n  if (state.ui.periodMode === 'day' || state.ui.periodMode === 'year') return '';\n  if (state.ui.periodMode === 'all') return 'Volledige historie';\n  const startText = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short' }).format(start);\n  if (state.ui.periodMode === 'week') {\n    const endText = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short' }).format(end);\n    return `${startText} – ${endText}`;\n  }\n  const endText = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }).format(end);\n  return `${startText} – ${endText}`;\n}");
  return new Response(text,{status:response.status,statusText:response.statusText,headers});
}

async function withShellBuild(response){
  if(!response||!response.ok)return response;
  const text=await response.text();const headers=new Headers(response.headers);headers.set('Content-Type','application/javascript; charset=utf-8');
  const legacy=`  function originalIsTimeMode() {\n    return document.body.classList.contains('time-mode');\n  }\n\n  function ensureOriginalMode(mode) {\n    const wantTime = mode === 'time';\n    if (originalIsTimeMode() === wantTime) return;\n    const toggle = $('#appModeToggle');\n    if (toggle) toggle.click();\n  }`;
  const routed=`  function originalIsTimeMode() {\n    return window.LogModuleHost?.getMode?.() === 'time' || document.body.classList.contains('time-mode');\n  }\n\n  function ensureOriginalMode(mode) {\n    if (window.LogModuleHost?.setMode) {window.LogModuleHost.setMode(mode);return;}\n    const wantTime = mode === 'time';\n    const toggle = $('#appModeToggle');\n    if (originalIsTimeMode() !== wantTime && toggle) toggle.click();\n  }`;
  const body=text.includes(legacy)?text.replace(legacy,routed):text;
  return new Response(`window.LOG_BUILD='${BUILD}';window.LOG_TEST_BUILD='${BUILD}';\n${body}`,{status:response.status,statusText:response.statusText,headers});
}

async function indexWithBuild(req){
  try{return await networkFirst(req,withIndexBuild);}catch(_){const fallback=await caches.match('./index.html');if(fallback)return withIndexBuild(fallback);throw _;}
}

self.addEventListener('fetch',event=>{
  const req=event.request,url=new URL(req.url);
  if(req.method!=='GET'||url.origin!==self.location.origin)return;
  if(req.mode==='navigate'){event.respondWith(indexWithBuild(req));return;}
  if(url.pathname.endsWith('/shell-ui.js')){event.respondWith(networkFirst(req,withShellBuild));return;}
  if(url.pathname.endsWith('/time/app.js')){event.respondWith(networkFirst(req,withTimeAppBuild));return;}
  event.respondWith(networkFirst(req));
});
