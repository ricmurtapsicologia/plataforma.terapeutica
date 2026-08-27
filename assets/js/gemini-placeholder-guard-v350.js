import {data,runtime,nowISO} from './state.js';
import {deleteRecord} from './database.js';
const VERSION='3.5.0';
const arr=v=>Array.isArray(v)?v.filter(Boolean):[];
let running=false;
function isPlaceholder(r){return r?.source?.type==='missing-record-placeholder'||String(r?.id||'').startsWith('missing_record_')||String(r?.text||'').trim()==='Não há prontuário.'}
async function purge(){if(running||runtime.locked||!runtime.key||!runtime.dataReady)return 0;running=true;try{const expected=new Set(arr(data.appointments).filter(a=>a?.geminiExpected===true).map(a=>a.id));const doomed=arr(data.records).filter(r=>isPlaceholder(r)&&expected.has(r?.appointmentId));if(!doomed.length)return 0;for(const r of doomed)await deleteRecord('records',r.id);const ids=new Set(doomed.map(r=>r.id));data.records=arr(data.records).filter(r=>!ids.has(r.id));document.dispatchEvent(new CustomEvent('rm:local-data-changed',{detail:{kind:'gemini-placeholder-guard-v350',count:doomed.length,at:nowISO()}}));window.__rmRender?.();return doomed.length}finally{running=false}}
function schedule(delay=0){setTimeout(()=>void purge().catch(error=>console.warn('Gemini placeholder guard:',error)),delay)}
document.addEventListener('rm:data-ready',()=>{schedule(950);schedule(1800)});document.addEventListener('rm:local-data-changed',event=>{if(String(event.detail?.kind||'')==='clinical-data-integrity-v340')schedule(40)});globalThis.__rmGeminiPlaceholderGuard={version:VERSION,purge};
