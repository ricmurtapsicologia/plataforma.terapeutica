const VERSION='3.0.0';
const LEGACY_GITHUB_KEYS=['rm.sync.githubToken.v1','rm.sync.baseline.v2','rm.sync.remoteRevision','rm.sync.dirty'];
const LEGACY_GITHUB_SESSION_KEYS=['rm.sync.githubToken.handoff'];
const DRIVE_BASELINE='rm.sync.drive.baseline.v260';
const LEGACY_SETTING_RX=/^meet_(?:name_)?sync_state_v18\d+$/i;
let legacySyncLoaded=false;

function parseJson(value){try{return JSON.parse(value)}catch{return null}}
function hasLegacySyncState(){
  if(LEGACY_GITHUB_KEYS.some(key=>localStorage.getItem(key)!==null))return true;
  if(LEGACY_GITHUB_SESSION_KEYS.some(key=>sessionStorage.getItem(key)!==null))return true;
  const baseline=parseJson(localStorage.getItem(DRIVE_BASELINE)||'{}')||{};
  if(Object.keys(baseline).some(key=>key.startsWith('settings:')&&LEGACY_SETTING_RX.test(key.slice('settings:'.length))))return true;
  const settings=globalThis.__rmDataSettings||null;
  if(Array.isArray(settings)&&settings.some(row=>LEGACY_SETTING_RX.test(String(row?.id||''))))return true;
  return false;
}

async function loadLegacySyncCleanup({force=false}={}){
  if(legacySyncLoaded||(!force&&!hasLegacySyncState()))return false;
  legacySyncLoaded=true;
  try{
    await import('./legacy-sync-cleanup-v262.js');
    document.dispatchEvent(new CustomEvent('rm:migration-router',{detail:{version:VERSION,migration:'legacy-sync-v262',status:'loaded',reason:force?'sync-conflict':'legacy-state'}}));
    return true;
  }catch(error){
    legacySyncLoaded=false;
    console.warn('MigrationRouter: limpeza de sync legado indisponível.',error);
    return false;
  }
}

function exposeSettings(){
  try{
    // O runtime clínico mantém os dados em um singleton de state.js. Este import é
    // feito apenas quando os dados estão prontos, para não aumentar o caminho crítico.
    return import('./state.js').then(({data})=>{globalThis.__rmDataSettings=Array.isArray(data.settings)?data.settings:[];return true});
  }catch{return Promise.resolve(false)}
}

document.addEventListener('rm:data-ready',()=>setTimeout(()=>void exposeSettings().then(()=>loadLegacySyncCleanup()),120));
document.addEventListener('rm:sync-status',event=>{if(event.detail?.status==='conflict')setTimeout(()=>void loadLegacySyncCleanup({force:true}),80)});
void loadLegacySyncCleanup();
