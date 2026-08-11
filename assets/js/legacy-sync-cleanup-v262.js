import {data,runtime} from './state.js';
import {deleteRecord} from './database.js';
import {performSync} from './secure-sync-v260.js';

const BASELINE_STORAGE='rm.sync.drive.baseline.v260';
const DIRTY_STORAGE='rm.sync.drive.dirty.v260';
const LEGACY_RX=/^meet_(?:name_)?sync_state_v18\d+$/i;
let running=false;

const parseJson=value=>{try{return JSON.parse(value)}catch{return null}};
function baseline(){return parseJson(localStorage.getItem(BASELINE_STORAGE)||'{}')||{}}
function legacyIds(){
  const ids=new Set((Array.isArray(data.settings)?data.settings:[]).map(x=>x?.id).filter(id=>LEGACY_RX.test(String(id||''))));
  for(const key of Object.keys(baseline())){
    if(!key.startsWith('settings:'))continue;
    const id=key.slice('settings:'.length);
    if(LEGACY_RX.test(id))ids.add(id);
  }
  return [...ids];
}
async function cleanup(){
  if(running||runtime.locked||!runtime.key||!runtime.dataReady)return;
  const ids=legacyIds();if(!ids.length)return;
  running=true;
  try{
    const base=baseline();
    for(const id of ids){delete base[`settings:${id}`];await deleteRecord('settings',id)}
    localStorage.setItem(BASELINE_STORAGE,JSON.stringify(base));
    localStorage.setItem(DIRTY_STORAGE,'1');
    data.settings=(Array.isArray(data.settings)?data.settings:[]).filter(x=>!ids.includes(x?.id));
    document.dispatchEvent(new CustomEvent('rm:legacy-sync-cleaned',{detail:{count:ids.length,provider:'google-drive-appdata'}}));
    setTimeout(()=>void performSync({manual:true}),350);
  }catch(err){console.warn('Não foi possível limpar estado legado de sincronização',err)}finally{running=false}
}
document.addEventListener('rm:data-ready',()=>setTimeout(()=>void cleanup(),450));
document.addEventListener('rm:sync-status',e=>{if(e.detail?.provider==='google-drive-appdata'&&e.detail?.status==='conflict')setTimeout(()=>void cleanup(),180)});
