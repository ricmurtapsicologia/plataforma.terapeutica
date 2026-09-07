(()=>{
'use strict';
const VERSION='2.2.0';
const CONFIG='https://ricmurtapsicologia.github.io/plataforma.terapeutica/rastreios/pipeline/public-experience-v2.json?v=2.0.0';
const ADAPTER_CONFIG='https://ricmurtapsicologia.github.io/plataforma.terapeutica/rastreios/pipeline/screening-adapters-v2.json?v=2.2.0';
const REPOS={
  'Rastreioclinico':'geral','rastreioTDAH':'tdah','tab-bateria-integrada':'bipolar',
  'Inventario-de-Tracos-Borderline':'borderline','bateria.narcisismo':'narcisismo',
  'Rastreio-de-Impulsividade':'impulsividade','rastreio.de.esquemas':'esquemas',
  'rastreiomodosesquematicos':'modos','Escala-de-Necessidades-Emocionais':'necessidades',
  'Escala-de-Co-Depenpencia-Emocional':'codependencia','ICAPS':'icaps','TriagemRiscoSuicidio':'risco'
};
const BLOCK_ACTION=/corrigir|calcular|resultado|relat[oó]rio|processar|concluir|finalizar|enviar|submit|download|baixar/i;
const TECH_LABEL=/\b(?:TDAH|TAB|bipolar|borderline|narcis|suic[ií]d|transtorno|RAC-?5TR|EIR-|ICAPS|SMI\s*1\.1|NPI-?16|BIS-?11|MDQ|HCL-?32|BSDS)\b/i;
const WHATS=/wa\.me|api\.whatsapp\.com|whatsapp:\/\//i;
let instrumentId='';
let cfg=null;
let adapter=null;
let identityState={};
let identityObserver=null;
const originalOpen=window.open.bind(window);
window.open=function(url,...args){if(WHATS.test(String(url||''))){console.warn('Canal WhatsApp desabilitado para rastreios clínicos.');return null}return originalOpen(url,...args)};
function idFromLocation(){const seg=location.pathname.split('/').filter(Boolean)[0]||'';if(seg==='Inicio-de-Jornada-Terapeutica')return new URLSearchParams(location.search).get('instrument')||'';return REPOS[seg]||''}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]))}
function today(){const d=new Date();const local=new Date(d.getTime()-d.getTimezoneOffset()*60000);return local.toISOString().slice(0,10)}
function removeSplash(){document.querySelectorAll('#splash,.splash,[class*="splash-screen" i],[id*="splash-screen" i]').forEach(n=>n.remove());document.querySelectorAll('#mainContent,main,.container').forEach(n=>{n.classList.add('show');n.hidden=false})}
function removeWhatsApp(){document.querySelectorAll('a[href*="wa.me"],a[href*="whatsapp" i],[id*="whats" i],[class*="whats" i]').forEach(n=>n.remove())}
function discoverHero(){const candidates=['.hero img','.hero-img','img.banner','.banner-wrap img','header img','main img'];for(const sel of candidates){const el=document.querySelector(sel);if(el?.src&&el.naturalWidth!==1)return {src:el.src,alt:el.alt||''}}return null}
function hideLegacyPresentation(){
  ['header.hero','.banner-wrap','section.intro','.instrument-hero'].forEach(sel=>document.querySelectorAll(sel).forEach(n=>{if(!n.closest('.rm-screening-shell'))n.hidden=true}));
  document.querySelectorAll('h1,h2,.technical-label,.instrument-name').forEach(h=>{
    if(!h.closest('.rm-screening-shell')&&!h.closest('form')&&TECH_LABEL.test(h.textContent||'')){h.hidden=true;h.setAttribute('aria-hidden','true')}
  });
}
function shellMarkup(c,hero){const steps=(c.onboarding||[]).slice(0,3);return `<section class="rm-screening-shell" aria-labelledby="rm-screening-title"><div class="rm-screening-hero"><div class="rm-screening-copy"><p class="rm-eyebrow">${esc(c.eyebrow||'Rastreio clínico')}</p><h1 id="rm-screening-title">${esc(c.publicName)}</h1><p class="rm-story">${esc(c.story||'')}</p></div><div class="rm-screening-visual" ${hero?'':'aria-hidden="true"'}>${hero?`<img src="${esc(hero.src)}" alt="${esc(hero.alt||'Imagem de apoio ao rastreio clínico')}">`:''}</div></div><div class="rm-screening-body"><div class="rm-screening-intro"><div><h2>Antes de começar</h2><p>${esc(c.intro||'')}</p><div class="rm-clinical-note">Não existem respostas certas ou erradas. Responda pela sua experiência real. Este rastreio organiza informações para análise clínica e não estabelece diagnóstico isoladamente.</div></div><aside class="rm-onboarding" aria-label="Como responder"><h2>Como responder</h2><ol>${steps.map(s=>`<li>${esc(s)}</li>`).join('')}</ol></aside></div></div></section>`}
function insertShell(c){if(document.querySelector('.rm-screening-shell'))return;const hero=discoverHero();const wrap=document.createElement('div');wrap.innerHTML=shellMarkup(c,hero);const node=wrap.firstElementChild;const target=document.querySelector('main,.container,.wrap,.wrapper,.page')||document.body.firstElementChild;document.body.insertBefore(node,target||null)}
function first(selector){if(!selector)return null;try{return document.querySelector(selector)}catch{return null}}
function resolveTarget(){if(!adapter)return null;if(adapter.mode==='form')return first(adapter.formSelector);if(adapter.mode==='legacyContainer')return first(adapter.containerSelector);return null}
function resolveIdentityMount(){
  const target=resolveTarget();
  if(!target)return null;
  if(adapter.mode==='form')return {host:target,before:target.firstChild,form:target};
  const anchor=first(adapter.identityAnchorSelector)||first(adapter.identity?.name);
  let block=null;
  if(anchor&&adapter.identityBlockSelector){try{block=anchor.closest(adapter.identityBlockSelector)}catch{block=null}}
  if(block?.parentElement)return {host:block.parentElement,before:block,form:null};
  return {host:target,before:target.firstChild,form:null};
}
function setSource(source,value){if(!source)return;source.value=value;source.dispatchEvent(new Event('input',{bubbles:true}));source.dispatchEvent(new Event('change',{bubbles:true}))}
function hideDuplicateSource(source){if(!source)return;const box=source.closest('.field,label,.form-group,.patient-info>*,.idgrid>*');if(box&&!box.closest('.rm-identity'))box.style.display='none'}
function ensureHidden(form,name,value){if(!form)return;let h=form.querySelector(`input[type="hidden"][name="${name}"]`);if(!h){h=document.createElement('input');h.type='hidden';h.name=name;form.appendChild(h)}h.value=value}
function injectIdentity(){
  if(document.querySelector('.rm-identity'))return true;
  const mount=resolveIdentityMount();
  if(!mount)return false;
  const a=adapter.identity||{};
  const monitoring=adapter.identityProfile==='monitoring_longitudinal';
  const nameSource=first(a.name),appSource=first(a.application),birthSource=first(a.birth);
  const showBirth=!monitoring;
  const showApplication=!monitoring||Boolean(appSource);
  const sec=document.createElement('section');sec.className='rm-identity';
  const fields=[`<label class="rm-field"><span>Nome completo</span><input data-rm="name" type="text" autocomplete="name" maxlength="120" required></label>`];
  if(showBirth)fields.push(`<label class="rm-field"><span>Data de nascimento</span><input data-rm="birth" type="date" required></label>`);
  if(showApplication)fields.push(`<label class="rm-field"><span>Data de aplicação do rastreio</span><input data-rm="application" type="date" required></label>`);
  sec.innerHTML=`<h2>Identificação</h2><div class="rm-identity-grid">${fields.join('')}</div>`;
  mount.host.insertBefore(sec,mount.before||null);
  const n=sec.querySelector('[data-rm="name"]'),b=sec.querySelector('[data-rm="birth"]'),d=sec.querySelector('[data-rm="application"]');
  n.value=nameSource?.value||'';
  if(b)b.value=birthSource?.value||'';
  if(d)d.value=appSource?.value||today();
  const sync=()=>{
    identityState={name:n.value.trim(),birthDate:b?.value||'',applicationDate:d?.value||'',profile:adapter.identityProfile||'screening_canonical'};
    setSource(nameSource,n.value);if(b)setSource(birthSource,b.value);if(d)setSource(appSource,d.value);
    if(!monitoring&&mount.form){ensureHidden(mount.form,'rm_full_name',n.value);ensureHidden(mount.form,'rm_birth_date',b?.value||'');ensureHidden(mount.form,'rm_application_date',d?.value||'')}
  };
  [n,b,d].filter(Boolean).forEach(x=>x.addEventListener('input',sync));sync();
  hideDuplicateSource(nameSource);if(b)hideDuplicateSource(birthSource);if(d)hideDuplicateSource(appSource);
  if(mount.form){mount.form.addEventListener('submit',e=>{const missing=!n.value.trim()||(b&&!b.value)||(d&&!d.value);if(missing){e.preventDefault();e.stopImmediatePropagation();sec.scrollIntoView({behavior:'smooth',block:'center'});(!n.value.trim()?n:(b&&!b.value?b:d))?.focus()}else sync()},true)}
  return true;
}
function mountIdentityWhenReady(){
  if(injectIdentity())return;
  identityObserver?.disconnect();
  identityObserver=new MutationObserver(()=>{if(injectIdentity()){identityObserver.disconnect();identityObserver=null}});
  identityObserver.observe(document.body,{childList:true,subtree:true});
  window.setTimeout(()=>{identityObserver?.disconnect();identityObserver=null},15000);
}
function hideLegacyResults(){document.body.classList.add('rm-hide-legacy-results');['#results','#resultsSection','#resultsPanel','.results-panel','.results','#reportBox','#report','.out[id*="out"]','.gauge-container','#actionsSection','.result-actions','.result-section'].forEach(sel=>document.querySelectorAll(sel).forEach(n=>{if(!n.closest('.rm-completion')){n.hidden=true;n.style.setProperty('display','none','important');n.setAttribute('aria-hidden','true')}}))}
function showHold(){let box=document.querySelector('.rm-unavailable');if(!box){box=document.createElement('section');box.className='rm-unavailable';box.setAttribute('role','status');box.setAttribute('aria-live','polite');box.innerHTML='<h2>Envio temporariamente indisponível</h2><p>Este rastreio está passando por validação clínica e técnica antes da liberação do envio. Suas respostas não foram encaminhadas.</p>';const target=resolveTarget();(target?.parentElement||target||document.body).appendChild(box)}box.scrollIntoView({behavior:'smooth',block:'center'})}
function blockUnvalidatedActions(){
  if(cfg?.productionReady===true&&adapter?.submissionSupported!==false)return;
  document.addEventListener('submit',e=>{e.preventDefault();e.stopImmediatePropagation();showHold()},true);
  document.addEventListener('click',e=>{const btn=e.target.closest('button,a,input[type="button"],input[type="submit"]');if(!btn)return;const type=String(btn.getAttribute('type')||'').toLowerCase();const text=[btn.textContent,btn.value,btn.id,btn.className].join(' ');if(type==='submit'||BLOCK_ACTION.test(text)){e.preventDefault();e.stopImmediatePropagation();showHold()}},true);
}
function completion(){let box=document.querySelector('.rm-completion');if(!box){box=document.createElement('section');box.className='rm-completion';box.hidden=true;box.setAttribute('role','status');box.setAttribute('aria-live','polite');box.innerHTML='<h2>Rastreio concluído com sucesso.</h2><p>Suas respostas foram registradas e encaminhadas para análise clínica do psicólogo responsável.</p>';document.body.appendChild(box)}return box}
function confirmDelivery(detail={}){if(cfg?.productionReady!==true||adapter?.submissionSupported===false)return;const box=completion();box.hidden=false;const target=resolveTarget();if(adapter?.mode==='form'&&target)target.hidden=true;hideLegacyResults();box.scrollIntoView({behavior:'smooth',block:'start'});window.dispatchEvent(new CustomEvent('rm:screening-completed',{detail:{instrumentId,...detail}}))}
function installApi(){window.RMScreeningUI={confirmDelivery,getIdentity:()=>({...identityState}),instrumentId,version:VERSION}}
function drainPending(){const q=Array.isArray(window.__RM_PENDING_DELIVERY)?window.__RM_PENDING_DELIVERY.splice(0):[];q.forEach(detail=>confirmDelivery(detail||{}))}
async function init(){
  instrumentId=idFromLocation();if(!instrumentId)return;
  document.body.classList.add('rm-screening-v2');removeSplash();removeWhatsApp();hideLegacyResults();
  const [rConfig,rAdapters]=await Promise.all([fetch(CONFIG,{cache:'no-store'}),fetch(ADAPTER_CONFIG,{cache:'no-store'})]);
  if(!rConfig.ok)throw new Error(`PUBLIC_EXPERIENCE_V2_${rConfig.status}`);
  if(!rAdapters.ok)throw new Error(`SCREENING_ADAPTERS_V2_${rAdapters.status}`);
  const [root,adapterRoot]=await Promise.all([rConfig.json(),rAdapters.json()]);
  cfg=root.instruments?.[instrumentId];adapter=adapterRoot.instruments?.[instrumentId];
  if(!cfg)throw new Error('INSTRUMENT_CONFIG_MISSING');
  if(!adapter)throw new Error('INSTRUMENT_ADAPTER_MISSING');
  document.title=cfg.publicName;insertShell(cfg);hideLegacyPresentation();mountIdentityWhenReady();removeWhatsApp();blockUnvalidatedActions();completion();installApi();drainPending();
  new MutationObserver(()=>{removeWhatsApp();hideLegacyResults()}).observe(document.body,{childList:true,subtree:true});
}
window.addEventListener('rm:screening-delivery-confirmed',e=>confirmDelivery(e.detail||{}));
installApi();if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>init().catch(fail),{once:true});else init().catch(fail);
function fail(error){console.error(error);document.body?.classList.add('rm-screening-v2');removeSplash();removeWhatsApp();const box=document.createElement('section');box.className='rm-unavailable';box.innerHTML='<h2>Não foi possível carregar o rastreio com segurança.</h2><p>Recarregue a página. Nenhuma resposta foi enviada.</p>';document.body?.prepend(box)}
})();
