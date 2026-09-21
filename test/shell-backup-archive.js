(function(){
  'use strict';

  const BUILD='0.31.10-test.92';
  const ARCHIVE_KEY='log-archive-v1';
  const RECOVERY_FIELD='_log_archive_v1';
  const originalBuild=window.buildCompleteRegistrationExport;
  const originalRestore=window.restoreKilometerPayload;

  if(typeof originalBuild!=='function'||typeof originalRestore!=='function'){
    console.error('Archief-back-up kon niet aan de bestaande herstelroute worden gekoppeld.');
    return;
  }

  function clone(value){
    if(value==null)return value;
    try{return structuredClone(value);}catch(_){}
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeArchive(value){
    return {
      version:Number(value?.version)||1,
      records:Array.isArray(value?.records)?value.records.map(clone):[]
    };
  }

  function readArchive(){
    try{return normalizeArchive(JSON.parse(localStorage.getItem(ARCHIVE_KEY)||'{}'));}
    catch(_){return normalizeArchive(null);}
  }

  function notifyArchiveChange(oldValue,newValue){
    try{
      window.dispatchEvent(new StorageEvent('storage',{
        key:ARCHIVE_KEY,
        oldValue,
        newValue,
        storageArea:localStorage,
        url:location.href
      }));
    }catch(_){
      const event=new Event('storage');
      try{Object.defineProperty(event,'key',{value:ARCHIVE_KEY});}catch(__){}
      window.dispatchEvent(event);
    }
    window.dispatchEvent(new CustomEvent('log-archive-restored',{detail:{build:BUILD}}));
  }

  function writeArchive(value){
    const archive=normalizeArchive(value);
    const oldValue=localStorage.getItem(ARCHIVE_KEY);
    const newValue=JSON.stringify(archive);
    localStorage.setItem(ARCHIVE_KEY,newValue);
    notifyArchiveChange(oldValue,newValue);
    return archive;
  }

  window.buildCompleteRegistrationExport=function(lastBackupAt){
    const bundle=originalBuild(lastBackupAt);
    const archive=readArchive();
    const source=bundle?.recovery?.sources?.kilometerregistratie;
    if(source?.data&&typeof source.data==='object'){
      source.data[RECOVERY_FIELD]=archive;
    }
    if(bundle?.counts&&typeof bundle.counts==='object'){
      bundle.counts.archived_items=archive.records.length;
    }
    return bundle;
  };

  window.restoreKilometerPayload=async function(payload){
    const hasArchive=Boolean(payload&&typeof payload==='object'&&Object.prototype.hasOwnProperty.call(payload,RECOVERY_FIELD));
    const archive=hasArchive?normalizeArchive(payload[RECOVERY_FIELD]):null;
    await originalRestore(payload);
    if(hasArchive)writeArchive(archive);
  };
})();
