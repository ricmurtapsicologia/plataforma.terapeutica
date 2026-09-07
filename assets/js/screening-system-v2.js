(()=>{
'use strict';
const CONFIG='https://ricmurtapsicologia.github.io/plataforma.terapeutica/rastreios/pipeline/public-experience-v2.json?v=2.0.0';
const REPOS={
  'Rastreioclinico':'geral','rastreioTDAH':'tdah','tab-bateria-integrada':'bipolar',
  'Inventario-de-Tracos-Borderline':'borderline','bateria.narcisismo':'narcisismo',
  'Rastreio-de-Impulsividade':'impulsividade','rastreio.de.esquemas':'esquemas',
  'rastreiomodosesquematicos':'modos','Escala-de-Necessidades-Emocionais':'necessidades',
  'Escala-de-Co-Depenpencia-Emocional':'codependencia','ICAPS':'icaps','TriagemRiscoSuicidio':'risco'
};
const ADAPTERS={
  geral:{name:'#patientName',application:'#responseDate'},
  tdah:{name:'#name',application:'#date'},
  bipolar:{name:'#nome',application:'#data'},
  borderline:{name:'#fullName',application:'#date'},
  narcisismo:{name:'#nome, #name, #fullName',application:'#data, #date'},
  impulsividade:{name:'#fullName',application:'#date'},
  esquemas:{name:'#nomeCompleto',application:'#dataAplicacao'},
  modos:{name:'#name',application:'#date'},
  necessidades:{name:'#name',application:'#date'},
  codependencia:{name:'#fullName',application:'#date'},
  icaps:{name:'#name'},
  risco:{name:'#paciente',application:'#data'},
  humor:{name:'input[name="entry.1449005772"]'},
  ansiedade:{name:'input[name="entry.1449005772"]',application:'input[name="entry.99768501"]'},
  autoestima:{name:'input[name="entry.1449005772"]',application:'input[name="entry.444633849"]'}
};
const BLOCK_ACTION=/corrigir|calcular|gerar\s+(?:os\s+)?resultados?|gerar\s+relat[oó]rio|processar\s+dados|enviar\s+resultado|download\s*pdf|baixar\s+relat[oó]rio/i;
const WHATS=/wa\.me|api\.whatsapp\.com|whatsapp:\/\//i;
let instrumentId='';
let cfg=null;
let identityState={};
let originalOpen=window.open.bind(window);
window.open=function(url,...args){if(WHATS.test(String(url||''))){console.warn('Canal WhatsApp desabilitado para rastreios clínicos.');return null}return originalOpen(url,...args)};
function idFromLocation(){const seg=location.pathname.split('/').filter(Boolean)[0]||'';if(seg==='Inicio-de-Jornada-Terapeutica')return new URLSearchParams(location.search).get('instrument')||'';return REPOS[seg]||''}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function today(){const d=new Date();const local=new Date(d.getTime()-d.getTimezoneOffset()*60000);return local.toISOString().slice(0,10)}
function removeSplash(){document.querySelectorAll('#splash,.splash,[class*="splash-screen" i],[id*="splash-screen" i]').forEach(n=>n.remove());document.querySelectorAll('#mainContent,main,.container').forEach(n=>{n.classList.add('show');n.hidden=false})}
function removeWhatsApp(){document.querySelectorAll('a[href*="wa.me"],a[href*="whatsapp" i],[id*="whats" i],[class*="whats" i]').forEach(n=>n.remove())}
function discoverHero(){const candidates=['.hero img','.hero-img','img.banner','.banner-wrap img','header img','main img'];for(const sel of candidates){const el=document.querySelector(sel);if(el?.src&&el.naturalWidth!==1)return {src:el.src,alt:el.alt||''}}return null}
function hideLegacyPresentation(){['header.hero','.banner-wrap','section.intro','.instrument-hero'].forEach(sel=>document.querySelectorAll(sel).forEach(n=>{if(!n.closest('.rm-screening-shell'))n.hidden=true}));document.querySelectorAll('h1').forEach(h=>{if(!h.closest('.rm-screening-shell')&&/TDAH|bipolar|borderline|narcis|suic[ií]d|transtorno|EIR-|ICAPS|SMI\s*1\.1/i.test(h.textContent||''))h.setAttribute('aria-hidden','true')})}
function shellMarkup(c,hero){const steps=(c.onboarding||[]).slice(0,3);return `<section class="rm-screening-shell" aria-labelledby="rm-screening-title"><div class="rm-screening-hero"><div class="rm-screening-copy"><p class="rm-eyebrow">${esc(c.eyebrow||'Rastreio clínico')}</p><h1 id="rm-screening-title">${esc(c.publicName)}</h1><p class="rm-story">${esc(c.story||'')}</p></div><div class="rm-screening-visual" ${hero?'':'aria-hidden="true"'}>${hero?`<img src="${esc(hero.src)}" alt="${esc(hero.alt||'Imagem de apoio ao rastreio clínico')}">`:''}</div></div><div class="rm-screening-body"><div class="rm-screening-intro"><div><h2>Antes de começar</h2><p>${esc(c.intro||'')}</p><div class="rm-clinical-note">Não existem respostas certas ou erradas. Responda pela sua experiência real. Este rastreio organiza informações para análise clínica e não estabelece diagnóstico isoladamente.</div></div><aside class="rm-onboarding" aria-label="Como responder"><h2>Como responder</h2><ol>${steps.map(s=>`<li>${esc(s)}</li>`).join('')}</ol></aside></div></div></section>`}
function insertShell(c){if(document.querySelector('.rm-screening-shell'))return;const hero=discoverHero();const wrap=document.createElement('div');wrap.innerHTML=shellMarkup(c,hero);const node=wrap.firstElementChild;const target=document.querySelector('main,.container,.wrap,.wrapper,.page')||document.body.firstElementChild;document.body.insertBefore(node,target||null)}
function first(selector){if(!selector)return null;try{return document.querySelector(selector)}catch{return null}}
function setSource(source,value){if(!source)return;source.value=value;source.dispatchEvent(new Event('input',{bubbles:true}));source.dispatchEvent(new Event('change',{bubbles:true}))}
function hideDuplicateSource(source){if(!source)return;const box=source.closest('.field,label,.form-group,.patient-info>*,.idgrid>*');if(box&&!box.closest('.rm-identity'))box.style.display='none'}
function injectIdentity(){const form=document.querySelector('form');if(!form||form.querySelector('.rm-identity'))return;const a=ADAPTERS[instrumentId]||{};const nameSource=first(a.name),appSource=first(a.application),birthSource=first(a.birth);
 const sec=document.createElement('section');sec.className='rm-identity';sec.innerHTML=`<h2>Identificação</h2><div class="rm-identity-grid"><label class="rm-field"><span>Nome completo</span><input data-rm="name" type="text" autocomplete="name" maxlength="120" required></label><label class="rm-field"><span>Data de nascimento</span><input data-rm="birth" type="date" required></label><label class="rm-field"><span>Data de aplicação do rastreio</span><input data-rm="application" type="date" required></label></div>`;
 form.insertBefore(sec,form.firstChild);const n=sec.querySelector('[data-rm="name"]'),b=sec.querySelector('[data-rm="birth"]'),d=sec.querySelector('[data-rm="application"]');n.value=nameSource?.value||'';b.value=birthSource?.value||'';d.value=appSource?.value||today();
 const sync=()=>{identityState={name:n.value.trim(),birthDate:b.value,applicationDate:d.value};setSource(nameSource,n.value);setSource(birthSource,b.value);setSource(appSource,d.value);ensureHidden(form,'rm_full_name',n.value);ensureHidden(form,'rm_birth_date',b.value);ensureHidden(form,'rm_application_date',d.value)};[n,b,d].forEach(x=>x.addEventListener('input',sync));sync();hideDuplicateSource(nameSource);hideDuplicateSource(birthSource);hideDuplicateSource(appSource);
 form.addEventListener('submit',e=>{if(!n.value.trim()||!b.value||!d.value){e.preventDefault();e.stopImmediatePropagation();sec.scrollIntoView({behavior:'smooth',block:'center'});( !n.value.trim()?n:!b.value?b:d).focus()}else sync()},true)}
function ensureHidden(form,name,value){let h=form.querySelector(`input[type="hidden"][name="${name}"]`);if(!h){h=document.createElement('input');h.type='hidden';h.name=name;form.appendChild(h)}h.value=value}
function hideLegacyResults(){document.body.classList.add('rm-hide-legacy-results');['#results','#resultsSection','.results-panel','#reportBox','#report','.out[id*="out"]','.gauge-container','#actionsSection'].forEach(sel=>document.querySelectorAll(sel).forEach(n=>{if(!n.closest('.rm-completion'))n.hidden=true}))}
function showHold(){let box=document.querySelector('.rm-unavailable');if(!box){box=document.createElement('section');box.className='rm-unavailable';box.setAttribute('role','status');box.innerHTML='<h2>Envio temporariamente indisponível</h2><p>Este rastreio está passando por validação técnica antes da liberação do envio. Suas respostas não foram encaminhadas.</p>';const form=document.querySelector('form');(form?.parentElement||document.body).appendChild(box)}box.scrollIntoView({behavior:'smooth',block:'center'})}
function blockUnvalidatedActions(){if(cfg?.collectorReady)return;document.addEventListener('click',e=>{const btn=e.target.closest('button,a,input[type="button"],input[type="submit"]');if(!btn)return;const text=[btn.textContent,btn.value,btn.id,btn.className].join(' ');if(BLOCK_ACTION.test(text)){e.preventDefault();e.stopImmediatePropagation();showHold()}},true)}
function completion(){let box=document.querySelector('.rm-completion');if(!box){box=document.createElement('section');box.className='rm-completion';box.hidden=true;box.setAttribute('role','status');box.setAttribute('aria-live','polite');box.innerHTML='<h2>Rastreio concluído com sucesso.</h2><p>Suas respostas foram registradas e encaminhadas para análise clínica do psicólogo responsável.</p>';document.body.appendChild(box)}return box}
function confirmDelivery(detail={}){const box=completion();box.hidden=false;document.querySelectorAll('form').forEach(f=>{if(!f.closest('.rm-completion'))f.hidden=true});hideLegacyResults();box.scrollIntoView({behavior:'smooth',block:'start'});window.dispatchEvent(new CustomEvent('rm:screening-completed',{detail:{instrumentId,...detail}}))}
function installApi(){window.RMScreeningUI={confirmDelivery,getIdentity:()=>({...identityState}),instrumentId,version:'2.0.0'}}
async function init(){instrumentId=idFromLocation();if(!instrumentId)return;document.body.classList.add('rm-screening-v2');removeSplash();removeWhatsApp();hideLegacyResults();const r=await fetch(CONFIG,{cache:'no-store'});if(!r.ok)throw new Error(`PUBLIC_EXPERIENCE_V2_${r.status}`);const root=await r.json();cfg=root.instruments?.[instrumentId];if(!cfg)throw new Error('INSTRUMENT_CONFIG_MISSING');insertShell(cfg);hideLegacyPresentation();injectIdentity();removeWhatsApp();blockUnvalidatedActions();completion();installApi();new MutationObserver(()=>removeWhatsApp()).observe(document.body,{childList:true,subtree:true})}
installApi();if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>init().catch(fail),{once:true});else init().catch(fail);
function fail(error){console.error(error);document.body?.classList.add('rm-screening-v2');removeSplash();removeWhatsApp();const box=document.createElement('section');box.className='rm-unavailable';box.innerHTML='<h2>Não foi possível carregar o rastreio com segurança.</h2><p>Recarregue a página. Nenhuma resposta foi enviada.</p>';document.body?.prepend(box)}
})();
