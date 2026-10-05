(function(){
  'use strict';

  const GROUP_ID='kmShellSharedDataSettingsGroup';
  const PANEL_ID='kmShellSharedCardSettings';
  let queued=false;

  function sharedGroup(content){
    let group=content.querySelector('#'+GROUP_ID);
    if(group)return group;
    group=document.createElement('section');
    group.id=GROUP_ID;
    group.className='km-shell-settings-group';
    group.setAttribute('aria-labelledby','kmShellSharedDataSettingsTitle');
    group.innerHTML='<header class="km-shell-settings-group-head"><h2 id="kmShellSharedDataSettingsTitle">Gedeelde gegevens</h2><p>Instellingen voor gegevens die uit een gedeelde bron komen.</p></header>';
    const registration=content.querySelector('#kmShellRegistrationSettingsTitle')?.closest('.km-shell-settings-group');
    if(registration)registration.insertAdjacentElement('beforebegin',group);
    else content.appendChild(group);
    return group;
  }

  function generalize(){
    queued=false;
    const content=document.querySelector('#kmShellSettingsContent');
    if(!content||content.dataset.mode!=='general')return;
    const panel=content.querySelector('#'+PANEL_ID);
    if(!panel)return;

    const group=sharedGroup(content);
    if(panel.parentElement!==group)group.appendChild(panel);

    if(panel.hasAttribute('data-settings-target'))panel.removeAttribute('data-settings-target');
    if(panel.hidden)panel.hidden=false;
    if(panel.style.display)panel.style.display='';

    const title=panel.querySelector('.km-shell-settings-accordion-title strong');
    const subtitle=panel.querySelector('.km-shell-settings-accordion-title small');
    const label=panel.querySelector('label[for="kmSharedCardUpdateMode"]');
    const hint=panel.querySelector('[data-shared-update-mode]')?.closest('.form-group')?.querySelector('.hint');
    const status=panel.querySelector('[data-shared-update-status]');

    if(title&&title.textContent!=='Updates')title.textContent='Updates';
    if(subtitle&&subtitle.textContent!=='Kaarten, locaties, thema’s en acties')subtitle.textContent='Kaarten, locaties, thema’s en acties';
    if(label&&label.textContent!=='Controleren op wijzigingen')label.textContent='Controleren op wijzigingen';
    if(hint&&hint.textContent!=='Log controleert of gedeelde gegevens zijn gewijzigd. Wijzigingen worden nooit zonder jouw keuze overgenomen.')hint.textContent='Log controleert of gedeelde gegevens zijn gewijzigd. Wijzigingen worden nooit zonder jouw keuze overgenomen.';
    if(status&&status.textContent.includes('gedeelde kaarten'))status.textContent=status.textContent.replace(/gedeelde kaarten/g,'gedeelde gegevens');
  }

  function queue(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(generalize);
  }

  function init(){
    queue();
    const observer=new MutationObserver(queue);
    observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','style','data-settings-target']});
    window.addEventListener('log-shell-view-refresh',queue);
    window.addEventListener('log-shared-card-update-state',queue);
    window.addEventListener('pageshow',queue);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
