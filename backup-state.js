(()=>{
'use strict';
// Only this app's namespace is portable. Never export unrelated origin storage.
const CORE=['kmreg-test-v4-data','urenregistratie.test.pwa.v1','registratie-test-identiteiten-v1'];
const excluded=new Set(['kmreg-test-geocode-cache-v1','log-test-menu-document-v6','log-test-pending-vehicle-start-v1']);
const owned=key=>CORE.includes(key)||/^(log-test-|kmreg-test-)[a-zA-Z0-9_.:-]+$/.test(key)&&!excluded.has(key);
const extra=key=>owned(key)&&!CORE.includes(key);
const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
let busy=false;
function logicalKey(actual){
  const route=window.__logProductionKeyFor;if(!route)return actual;
  for(const key of CORE)if(route(key)===actual)return key;
  // Serialize logical names so a backup remains portable across live/test namespaces.
  if(actual.startsWith('log-')&&!actual.startsWith('log-test-'))return `log-test-${actual.slice(4)}`;
  if(actual.startsWith('kmreg-')&&!actual.startsWith('kmreg-test-'))return `kmreg-test-${actual.slice(6)}`;
  if(actual.startsWith('registratie-')&&!actual.startsWith('registratie-test-'))return `registratie-test-${actual.slice(12)}`;
  return actual;
}
function snapshot(){
  const values=new Map(),route=window.__logProductionKeyFor;
  for(const actual of Object.keys(localStorage)){
    const key=logicalKey(actual);
    if(owned(key)&&(!route||route(key)===actual))values.set(key,localStorage.getItem(key));
  }
  return values;
}
function attach(bundle){
  if(!object(bundle?.recovery?.sources))throw Error('De export mist herstelgegevens.');
  bundle.recovery.sources.app_local={format:'log.local-storage.v1',data:{version:1,entries:[...snapshot()].filter(([key])=>extra(key)).map(([key,value])=>({key,value}))}};
  bundle.counts=bundle.counts||{};
  bundle.counts.local_collections=bundle.recovery.sources.app_local.data.entries.length;
  bundle.recovery.notice='Bevat persoonlijke gegevens en toegangssleutels. Bewaar dit bestand privé. Online rechten kunnen sinds de export gewijzigd zijn.';
  return bundle;
}
function plan(bundle){
  const sources=bundle?.recovery?.sources||bundle?.source_data;
  if(bundle?.export_kind!=='complete_backup'||!['log.v2','registratie-model.v1'].includes(bundle?.schema)||!object(sources))throw Error('Dit is geen complete Log-back-up.');
  const payload=name=>object(sources[name])&&'data' in sources[name]?sources[name].data:sources[name];
  const km=payload('kilometerregistratie'),time=payload('tijdsregistratie');
  if(!object(km)||!object(km.settings)||!['locations','trips','events'].every(key=>Array.isArray(km[key]))||(km.trackPoints!=null&&!Array.isArray(km.trackPoints))||!object(time))throw Error('De back-up mist geldige kilometer- of tijdgegevens.');
  const writes=new Map();
  for(const [name,key] of [['tijdsregistratie',CORE[1]],['identiteiten',CORE[2]],['identity_sync','log-test-identity-sync-v2']]){
    if(!Object.prototype.hasOwnProperty.call(sources,name))continue;
    if(sources[name]?.present===false)writes.set(key,null);
    else {const value=payload(name);if(!object(value))throw Error(`Ongeldige herstelbron: ${name}.`);writes.set(key,JSON.stringify(value));}
  }
  const local=sources.app_local;
  if(local!==undefined){
    if(local.format!=='log.local-storage.v1'||local.data?.version!==1||!Array.isArray(local.data.entries))throw Error('Onbekend formaat voor aanvullende herstelgegevens.');
    const entries=new Map();
    for(const entry of local.data.entries){
      if(!object(entry)||typeof entry.key!=='string'||!extra(entry.key)||typeof entry.value!=='string'||entries.has(entry.key))throw Error('De aanvullende herstelgegevens bevatten een ongeldige of dubbele opslagnaam.');
      entries.set(entry.key,entry.value);
    }
    // New backups describe a complete namespace, old backups leave absent stores alone.
    for(const key of snapshot().keys())if(extra(key))writes.set(key,null);
    for(const [key,value] of entries)writes.set(key,value);
    // Online backups update this explicit source after building the local snapshot.
    if(sources.identity_sync)writes.set('log-test-identity-sync-v2',JSON.stringify(payload('identity_sync')));
  }
  if(Object.prototype.hasOwnProperty.call(km,'_log_archive_v1')&&!writes.has('log-test-archive-v1')){
    const archive=km._log_archive_v1;if(!object(archive)||!Array.isArray(archive.records))throw Error('Ongeldig archief in de back-up.');
    writes.set('log-test-archive-v1',JSON.stringify(archive));
  }
  return {km,writes,hasAdditional:local!==undefined};
}
function write(key,value){if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value);}
async function restore(bundle,host){
  if(busy)throw Error('Een herstelactie is al bezig.');
  const prepared=plan(bundle); // Validate everything before the first write.
  const previous=snapshot(),previousKm=host.readKilometers();
  busy=true;
  try{
    host.suspend();
    for(const [key,value] of prepared.writes)write(key,value);
    await host.writeKilometers(prepared.km);
  }catch(error){
    try{
      // Free newly imported values first; this also makes rollback work after quota errors.
      for(const key of snapshot().keys())localStorage.removeItem(key);
      for(const [key,value] of previous)write(key,value);
      await host.rollbackKilometers(previousKm);
    }catch(rollbackError){
      console.error('Herstel en terugzetten mislukt',rollbackError);
      throw Error('Herstel is mislukt en kon niet volledig worden teruggezet. Sluit Log niet; bewaar je oorspronkelijke back-up.');
    }
    throw Error(`Herstel niet uitgevoerd; je vorige gegevens zijn teruggezet. ${error.message||''}`);
  }finally{busy=false;host.resume();}
  // Notify only after all collections and GPS data have committed.
  for(const [key] of prepared.writes)window.dispatchEvent(new StorageEvent('storage',{key,storageArea:localStorage,url:location.href}));
  for(const name of ['log-time-state-change','log-km-state-change','log-archive-restored','log-vehicles-change','log-identity-sync-change','log-person-connections-change','log-collaboration-v2-change','log-backup-restored'])window.dispatchEvent(new CustomEvent(name,{detail:{reason:'backup-restored',source:'backup'}}));
  return prepared;
}
window.LogBackupState={attach,plan,restore,isBusy:()=>busy};
})();
