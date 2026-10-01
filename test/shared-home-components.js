(function(){
  'use strict';

  const VERSION='1.1.0';

  function mark(node,...classes){
    if(!node)return null;
    for(const name of classes)if(name)node.classList.add(name);
    return node;
  }

  function escapeText(value){
    return String(value??'').replace(/[&<>"']/g,char=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'
    })[char]);
  }

  function slot(node,name,...legacyClasses){
    if(!node)return null;
    mark(node,`log-top-${name}`,...legacyClasses);
    node.dataset.logTopSlot=name;
    return node;
  }

  function direct(block,selector){
    return block?.querySelector(`:scope>${selector}`)||null;
  }

  function ensureIdleIdentity(block,selectors=[]){
    if(!block)return null;
    let identity=direct(block,'.log-top-identity');
    if(identity)return identity;

    const nodes=selectors.map(selector=>direct(block,selector)).filter(Boolean);
    if(!nodes.length)return null;

    identity=document.createElement('div');
    identity.className='log-top-identity';
    identity.dataset.logTopSlot='identity';
    const first=nodes[0];
    block.insertBefore(identity,first);
    nodes.forEach(node=>identity.appendChild(node));
    return identity;
  }

  function bindBlock(config={}){
    const block=config.block;
    if(!block)return null;

    const module=String(config.module||'generic');
    const variant=String(config.variant||'idle');
    mark(block,'log-top-block','log-template-action');
    block.dataset.logTopModule=module;
    block.dataset.logTopVariant=variant;
    block.dataset.logTemplateState=variant==='idle'||variant==='preparing'?'idle':'active';

    const frame=slot(config.frame,'frame','log-active-primary');
    const identity=slot(config.identity,'identity','log-active-details');
    const side=slot(config.side,'side','log-active-side');
    const primaryAction=slot(config.primaryAction,'primary-action','log-primary-action');
    const secondaryActions=slot(config.secondaryActions,'secondary-actions','log-secondary-actions');

    slot(config.kicker,'kicker');
    slot(config.title,'title');
    slot(config.subtitle,'subtitle');
    slot(config.meta,'meta');
    slot(config.status,'status');
    slot(config.primaryValue,'primary-value');
    slot(config.icon,'icon');

    return {block,frame,identity,side,primaryAction,secondaryActions};
  }

  /*
    Rendercontract voor nieuwe modules. Bestaande modules worden hieronder met
    bindBlock op exact hetzelfde slotmodel aangesloten.
  */
  function render(config={}){
    const module=escapeText(config.module||'generic');
    const variant=escapeText(config.variant||'idle');
    const kicker=config.kicker?`<div class="log-top-kicker" data-log-top-slot="kicker">${escapeText(config.kicker)}</div>`:'';
    const icon=config.iconHtml?`<span class="log-top-icon" data-log-top-slot="icon" aria-hidden="true">${config.iconHtml}</span>`:'';
    const title=config.title?`<h2 class="log-top-title" data-log-top-slot="title">${escapeText(config.title)}</h2>`:'';
    const subtitle=config.subtitle?`<p class="log-top-subtitle" data-log-top-slot="subtitle">${escapeText(config.subtitle)}</p>`:'';
    const primaryValue=config.primaryValue?`<div class="log-top-primary-value" data-log-top-slot="primary-value">${escapeText(config.primaryValue)}</div>`:'';
    const status=config.status?`<span class="log-top-status" data-log-top-slot="status"><span class="dot"></span>${escapeText(config.status)}</span>`:'';
    const meta=Array.isArray(config.meta)&&config.meta.length?`<div class="log-top-meta" data-log-top-slot="meta">${status}${config.meta.map(item=>`<span>${escapeText(item)}</span>`).join('')}</div>`:status?`<div class="log-top-meta" data-log-top-slot="meta">${status}</div>`:'';
    const identity=`<div class="log-top-identity" data-log-top-slot="identity">${icon}${kicker}${title}${subtitle}${meta}${primaryValue}</div>`;
    const side=config.sideHtml?`<div class="log-top-side" data-log-top-slot="side">${config.sideHtml}</div>`:'';
    const body=side?`<div class="log-top-frame" data-log-top-slot="frame">${identity}${side}</div>`:identity;
    const primary=config.primaryActionHtml?`<div class="log-top-primary-action-host" data-log-top-slot="primary-action">${config.primaryActionHtml}</div>`:'';
    const secondary=config.secondaryActionsHtml?`<div class="log-top-secondary-actions" data-log-top-slot="secondary-actions">${config.secondaryActionsHtml}</div>`:'';
    return `<section class="log-top-block log-template-action" data-log-top-module="${module}" data-log-top-variant="${variant}" data-log-template-state="${variant==='idle'||variant==='preparing'?'idle':'active'}">${body}${primary}${secondary}</section>`;
  }

  function markTemplateRoot(root){
    if(root)root.classList.add('log-home-template-root');
  }

  function markPrimaryList(root,title){
    if(!root)return;
    const section=[...root.querySelectorAll(':scope>.section')].find(item=>String(item.querySelector(':scope>.section-title h2,:scope>.section-title h3')?.textContent||'').trim()===title);
    if(!section)return;
    mark(section,'log-template-list','log-list-section');
    mark(section.querySelector(':scope>.section-title'),'log-section-head');
  }

  function ensurePeriodControl(period){
    const center=period?.querySelector('.period-center');
    if(!center)return;

    let line=center.querySelector(':scope>.period-title-line');
    const strong=line?.querySelector(':scope>strong')||center.querySelector(':scope>strong');
    if(!strong)return;

    if(!line){
      line=document.createElement('div');
      line.className='period-title-line';
      center.insertBefore(line,strong);
      line.appendChild(strong);
    }
    mark(line,'log-period-title-line');

    let button=line.querySelector(':scope>.period-scale-button,:scope>.log-period-scale-button');
    if(!button){
      button=document.createElement('button');
      button.type='button';
      button.className='period-scale-button log-period-scale-button';
      button.textContent='⌄';
      line.appendChild(button);
    }else{
      mark(button,'period-scale-button','log-period-scale-button');
    }
    button.setAttribute('aria-label','Periodegrootte kiezen');
    button.setAttribute('title','Periodegrootte kiezen');
    if(!String(button.textContent||'').trim())button.textContent='⌄';
  }

  function markPeriod(root,kind){
    if(!root)return;
    const period=kind==='ride'
      ?root.querySelector('#periodNavigator.period-navigator')
      :root.querySelector(':scope>.period-overview,:scope>.period-nav');
    if(!period)return;
    mark(period,'log-period','log-template-period');
    period.dataset.logPeriodKind=kind;
    ensurePeriodControl(period);
    const summary=kind==='ride'?period.querySelector(':scope>.summary'):period.querySelector(':scope>.period-summary');
    if(summary){
      mark(summary,'log-summary');
      summary.dataset.logSummaryKind=kind;
    }
  }

  function markRide(){
    const root=document.getElementById('app');
    if(!root)return;
    markTemplateRoot(root);

    const block=root.querySelector(':scope>.hero');
    if(block){
      const active=block.classList.contains('active-hero');
      const preparing=block.classList.contains('arrival-preparing')||block.classList.contains('start-preparing');
      if(active){
        const identity=block.querySelector('.active-details');
        bindBlock({
          block,
          module:'rides',
          variant:preparing?'preparing':'active',
          frame:block.querySelector('.active-primary'),
          identity,
          kicker:identity?.querySelector('.kicker'),
          title:identity?.querySelector('.active-route'),
          meta:identity?.querySelector('.active-meta'),
          status:identity?.querySelector('.status'),
          side:block.querySelector('.detour-panel'),
          primaryAction:block.querySelector('.arrival-main'),
          secondaryActions:block.querySelector('.ride-tools')
        });
      }else{
        const identity=ensureIdleIdentity(block,['.kicker','.home-odometer','p']);
        bindBlock({
          block,
          module:'rides',
          variant:preparing?'preparing':'idle',
          identity,
          kicker:identity?.querySelector('.kicker'),
          title:identity?.querySelector('.home-odometer,h2'),
          subtitle:identity?.querySelector('p'),
          primaryAction:direct(block,'.btn:last-child')
        });
      }
    }

    markPeriod(root,'ride');
    markPrimaryList(root,'Recente ritten');
  }

  function markTime(){
    const root=document.getElementById('main');
    if(!root)return;
    markTemplateRoot(root);

    const block=root.querySelector(':scope>.suggestion,:scope>.active-card');
    if(block){
      const active=block.classList.contains('active-card');
      const pending=block.classList.contains('time-pending-zone');
      const preparing=block.classList.contains('context-preparing');
      if(active){
        const frame=block.querySelector('.time-active-primary');
        const identity=block.querySelector('.time-active-details');
        if(frame&&identity){
          bindBlock({
            block,
            module:'time',
            variant:pending?'pending':preparing?'preparing':'active',
            frame,
            identity,
            kicker:identity.querySelector('.kicker'),
            title:identity.querySelector(':scope>h2,.home-action-title'),
            subtitle:identity.querySelector('.suggestion-sub,.home-action-subtitle'),
            meta:identity.querySelector('.active-meta,.home-action-meta'),
            status:identity.querySelector('.status'),
            primaryValue:identity.querySelector('#timerClock,.timer-clock'),
            side:block.querySelector('.time-note-panel,.time-summary-panel'),
            primaryAction:block.querySelector('#stopTimer,#finishPending'),
            secondaryActions:block.querySelector('.time-active-tools')
          });
        }
      }else{
        const identity=ensureIdleIdentity(block,['.kicker','.home-action-title','.home-action-subtitle','.home-action-meta']);
        bindBlock({
          block,
          module:'time',
          variant:preparing?'preparing':'idle',
          identity,
          kicker:identity?.querySelector('.kicker'),
          title:identity?.querySelector('.home-action-title,h2'),
          subtitle:identity?.querySelector('.home-action-subtitle,p'),
          meta:identity?.querySelector('.home-action-meta'),
          primaryAction:block.querySelector('#registerTaskInline,.home-action-button')
        });
      }
    }

    markPeriod(root,'time');
    markPrimaryList(root,'Registraties');
  }

  let queued=false;
  function sync(){
    queued=false;
    markRide();
    markTime();
  }

  function queueSync(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(sync);
  }

  function adopt(config){
    return bindBlock(config);
  }

  window.LogTopBlock=Object.freeze({
    version:VERSION,
    render,
    adopt,
    sync:queueSync,
    slots:Object.freeze(['frame','identity','icon','kicker','title','subtitle','meta','status','primary-value','side','primary-action','secondary-actions'])
  });

  function init(){
    sync();
    const observer=new MutationObserver(queueSync);
    observer.observe(document.body,{childList:true,subtree:true});
    for(const eventName of ['pageshow','log-shell-view-refresh','log-time-state-change','log-km-state-change'])window.addEventListener(eventName,queueSync);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
