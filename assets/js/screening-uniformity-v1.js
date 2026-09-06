(()=>{
'use strict';
const CONFIG_URL='https://ricmurtapsicologia.github.io/plataforma.terapeutica/rastreios/pipeline/public-experience.json?v=1.0.0';
const REPO_MAP={
  'Rastreioclinico':'geral','rastreioTDAH':'tdah','tab-bateria-integrada':'bipolar',
  'Inventario-de-Tracos-Borderline':'borderline','bateria.narcisismo':'narcisismo','Rastreio-de-Impulsividade':'impulsividade',
  'rastreio.de.esquemas':'esquemas','rastreiomodosesquematicos':'modos','Escala-de-Necessidades-Emocionais':'necessidades',
  'Escala-de-Co-Depenpencia-Emocional':'codependencia','ICAPS':'icaps','TriagemRiscoSuicidio':'risco'
};
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const today=()=>{const d=new Date(),z=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}`};
let experience=null;let instrumentId='';let canonicalInputs={};let form=null;
function resolveInstrument(){
  const segment=decodeURIComponent(location.pathname.split('/').filter(Boolean)[0]||'');
  if(segment==='Inicio-de-Jornada-Terapeutica'){
    const key=new URLSearchParams(location.search).get('instrument');
    if(['humor','ansiedade','autoestima'].includes(key))return key;
    return '';
  }
  return REPO_MAP[segment]||'';
}
function findExistingInput(kind){
  const candidates=[...document.querySelectorAll('input,select,textarea')].filter(el=>!el.closest('.rm-identity-panel'));
  const patterns={
    name:/\bnome( completo)?\b/,
    birth:/data de nascimento|nascimento|birth/,
    application:/data de (aplica(c|ç)(a|ã)o|preenchimento|resposta)|application date/
  };
  return candidates.find(el=>{
    const label=el.labels?.[0]?.textContent||el.closest('label')?.textContent||'';
    const bag=normalize(`${label} ${el.name||''} ${el.id||''} ${el.placeholder||''}`);
    return patterns[kind].test(bag);
  })||null;
}
function makeHidden(name,value=''){
  if(!form)return null;
  let input=form.querySelector(`input[name="${name}"]`);
  if(!input){input=document.createElement('input');input.type='hidden';input.name=name;input.value=value;input.dataset.rmMeta='true';form.appendChild(input)}
  return input;
}
function syncPair(canonical,source){
  if(!source)return;
  if(source.value&&!canonical.value)canonical.value=source.value;
  const push=()=>{source.value=canonical.value;source.dispatchEvent(new Event('input',{bubbles:true}));source.dispatchEvent(new Event('change',{bubbles:true}))};
  const pull=()=>{if(document.activeElement!==canonical)canonical.value=source.value||''};
  canonical.addEventListener('input',push);canonical.addEventListener('change',push);source.addEventListener('input',pull);source.addEventListener('change',pull);
}
function fieldMarkup(id,label,type,attrs=''){return `<label class="rm-identity-field" for="${id}">${label}<input id="${id}" type="${type}" ${attrs}></label>`}
function injectIdentity(){
  form=document.querySelector('form');if(!form)return;
  const sourceName=findExistingInput('name');const sourceBirth=findExistingInput('birth');const sourceApplication=findExistingInput('application');
  const panel=document.createElement('section');panel.className='rm-identity-panel';panel.dataset.rmIdentity='true';panel.setAttribute('aria-labelledby','rm-identity-title');
  panel.innerHTML=`<h2 id="rm-identity-title">Identificação da aplicação</h2><p>Esses dados ajudam o psicólogo a reconhecer corretamente sua aplicação e compará-la com outros momentos do acompanhamento.</p><div class="rm-identity-grid">${fieldMarkup('rm-full-name','Nome completo','text','autocomplete="name" maxlength="120" required')}${fieldMarkup('rm-birth-date','Data de nascimento','date','required')}${fieldMarkup('rm-application-date','Data de aplicação do rastreio','date','required readonly')}</div><p class="rm-standard-sr-only" id="rm-identity-status" aria-live="assertive"></p>`;
  form.insertBefore(panel,form.firstChild);
  canonicalInputs={name:panel.querySelector('#rm-full-name'),birth:panel.querySelector('#rm-birth-date'),application:panel.querySelector('#rm-application-date')};
  canonicalInputs.application.value=today();
  syncPair(canonicalInputs.name,sourceName||makeHidden('rm_full_name'));
  syncPair(canonicalInputs.birth,sourceBirth||makeHidden('rm_birth_date'));
  syncPair(canonicalInputs.application,sourceApplication||makeHidden('rm_application_date',today()));
  if(sourceApplication&&!sourceApplication.value){sourceApplication.value=today();sourceApplication.dispatchEvent(new Event('change',{bubbles:true}))}
  form.addEventListener('submit',event=>{
    const invalid=Object.values(canonicalInputs).find(input=>!input.value||!input.checkValidity());
    if(invalid){event.preventDefault();event.stopImmediatePropagation();panel.querySelector('#rm-identity-status').textContent='Complete os três campos de identificação antes de finalizar o rastreio.';invalid.focus();invalid.reportValidity()}
  },true);
}
function shellMarkup(item,image){
  const steps=(item.onboarding||[]).map(step=>`<li>${esc(step)}</li>`).join('');
  return `<section class="rm-standard-shell" data-rm-standard-shell aria-labelledby="rm-public-title"><header class="rm-standard-hero"><p class="rm-standard-eyebrow">${esc(item.eyebrow)}</p><h1 id="rm-public-title">${esc(item.publicName)}</h1><p class="rm-standard-tech">${esc(item.technicalLabel)}</p></header><figure class="rm-standard-banner"><img src="${esc(image.url)}" alt="${esc(image.alt)}" loading="eager" decoding="async"><figcaption class="rm-standard-image-credit">${esc(image.credit)}</figcaption></figure><div class="rm-standard-content"><section class="rm-standard-story"><h2>Antes de começar</h2><p>${esc(item.story)}</p><p>${esc(item.intro)}</p></section><aside class="rm-standard-onboarding"><h2>Em três passos</h2><ol>${steps}</ol></aside><p class="rm-standard-note"><strong>Importante:</strong> este material é um rastreio clínico e não estabelece diagnóstico por si só. O valor do resultado depende da análise profissional e da integração com o contexto clínico.</p></div></section>`;
}
function hideLegacyPresentation(){
  const firstForm=document.querySelector('form');
  ['header.hero','.banner-wrap','section.intro'].forEach(selector=>document.querySelectorAll(selector).forEach(el=>{if(!el.closest('[data-rm-standard-shell]')&&(!firstForm||el.compareDocumentPosition(firstForm)&Node.DOCUMENT_POSITION_FOLLOWING))el.hidden=true}));
}
function injectCompletion(){
  const box=document.createElement('section');box.className='rm-completion-panel';box.hidden=true;box.setAttribute('role','status');box.setAttribute('aria-live','polite');box.innerHTML='<strong>Rastreio concluído com sucesso.</strong><p>Suas respostas foram registradas e enviadas ao psicólogo responsável para análise e parecer clínico.</p>';
  (form||document.querySelector('main')||document.body).insertAdjacentElement('afterend',box);
  const confirm=detail=>{box.hidden=false;box.dataset.submissionId=detail?.submissionId||'';box.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'})};
  window.addEventListener('rm:screening-delivery-confirmed',event=>confirm(event.detail||{}));
  window.RMScreeningUI=Object.freeze({
    confirmDelivery(detail={}){window.dispatchEvent(new CustomEvent('rm:screening-delivery-confirmed',{detail}))},
    getIdentity(){return {fullName:canonicalInputs.name?.value||'',birthDate:canonicalInputs.birth?.value||'',applicationDate:canonicalInputs.application?.value||today(),instrumentId}}
  });
}
async function init(){
  instrumentId=resolveInstrument();if(!instrumentId)return;
  const response=await fetch(CONFIG_URL,{cache:'no-store'});if(!response.ok)throw new Error(`PUBLIC_EXPERIENCE_LOAD_FAILED:${response.status}`);
  experience=await response.json();const item=experience.instruments?.[instrumentId];if(!item)return;
  const image=experience.images?.[item.image];if(!image)return;
  document.body.classList.add('rm-screening-unified');document.body.dataset.rmInstrument=instrumentId;document.documentElement.lang='pt-BR';
  document.title=`${item.publicName} — Richelmy Murta`;
  const shell=document.createElement('div');shell.innerHTML=shellMarkup(item,image);document.body.insertBefore(shell.firstElementChild,document.body.firstChild);
  hideLegacyPresentation();injectIdentity();injectCompletion();
  window.dispatchEvent(new CustomEvent('rm:screening-uniformity-ready',{detail:{instrumentId}}));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>void init().catch(console.error),{once:true});else void init().catch(console.error);
})();
