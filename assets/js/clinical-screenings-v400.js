const MANIFEST_URL='rastreios/pipeline/instruments.manifest.json?v=1.2.0';
const GROUP_ORDER=['Geral','Neurodesenvolvimento','Humor','Personalidade','Dimensões clínicas','Terapia do Esquema','Relacionamentos','Monitoramento','Risco e segurança'];
const JOURNEY_URL='https://ricmurtapsicologia.github.io/Inicio-de-Jornada-Terapeutica/';
const DEFAULT_TITLE='Richelmy Murta — Clínica';
let screenings=[];
let catalogReady=false;
let catalogError=null;
let activeGroup='Todos';
let searchTerm='';
let toastTimer=null;

const esc=value=>String(value??'').replace(/[&<>'\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]));
const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();

function assertPublicCatalog(items){
  if(!Array.isArray(items)||items.length!==15)throw new Error('Catálogo clínico incompleto.');
  const ids=new Set();
  for(const item of items){
    if(!item?.id||ids.has(item.id))throw new Error('Identificador de rastreio inválido ou duplicado.');
    ids.add(item.id);
    if(!/^https:\/\//.test(item.publicUrl||''))throw new Error(`URL pública inválida: ${item.id}`);
    if(/docs\.google\.com\/forms/i.test(item.publicUrl))throw new Error(`Motor de coleta exposto como URL pública: ${item.id}`);
  }
}

async function loadCatalog(){
  try{
    const response=await fetch(MANIFEST_URL,{cache:'no-store'});
    if(!response.ok)throw new Error(`Falha ao carregar catálogo (${response.status}).`);
    const manifest=await response.json();
    assertPublicCatalog(manifest.instruments);
    screenings=manifest.instruments.map(item=>({
      id:item.id,group:item.group,name:item.publicName,tech:item.technicalName,desc:item.description||'',url:item.publicUrl,
      integrated:item.formState==='ACTIVE',restricted:item.requiresDedicatedSafetyFlow===true||item.criticality==='CRITICAL'
    }));
    catalogReady=true;catalogError=null;
  }catch(err){
    console.error('Falha ao carregar o catálogo canônico de rastreios.',err);
    catalogError=err;catalogReady=false;
  }
  if(location.hash.replace(/^#/,'')==='rastreios')renderPanel();
}

function registryLabel(item){
  if(item.integrated)return '<span class="screening-chip ok">Registro integrado</span>';
  return '<span class="screening-chip neutral">Aplicação disponível</span>';
}

function card(item){
  const risk=item.restricted?'<span class="screening-chip warn">Fluxo clínico de segurança</span>':'';
  return `<article class="screening-card" data-screening-card data-group="${esc(item.group)}" data-search="${esc(normalize(`${item.name} ${item.tech} ${item.desc} ${item.group}`))}">
    <div class="screening-card-head"><div><div class="small muted">${esc(item.group)}</div><h3>${esc(item.name)}</h3></div></div>
    <div class="screening-chip-row"><span class="screening-chip">${esc(item.tech)}</span>${registryLabel(item)}${risk}</div>
    <p>${esc(item.desc)}</p>
    <div class="screening-actions">
      <a class="btn" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer" aria-label="Abrir ${esc(item.name)}">Abrir rastreio</a>
      <button type="button" class="btn secondary" data-screening-action="share" data-url="${esc(item.url)}" data-name="${esc(item.name)}" aria-label="Compartilhar ${esc(item.name)}">Compartilhar</button>
    </div>
  </article>`;
}

function loadingMarkup(){return `<div class="screening-panel"><section class="screening-hero"><div><div class="eyebrow">Plataforma Clínica</div><h1>Painel de Rastreios</h1><p>Carregando catálogo clínico canônico…</p></div></section></div>`}
function errorMarkup(){return `<div class="screening-panel"><section class="screening-error" role="alert"><h2>Catálogo temporariamente indisponível</h2><p>O painel bloqueou a apresentação porque não conseguiu validar a fonte canônica. Recarregue a plataforma antes de compartilhar um rastreio.</p><button class="btn" type="button" data-screening-action="reload">Tentar novamente</button></section></div>`}

function panelMarkup(){
  const groups=GROUP_ORDER.map(group=>{
    const items=screenings.filter(item=>item.group===group);
    if(!items.length)return'';
    return `<section class="screening-section" data-screening-section data-group="${esc(group)}"><div class="screening-section-title"><h2>${esc(group)}</h2><span>${items.length} ${items.length===1?'recurso':'recursos'}</span></div><div class="screening-grid">${items.map(card).join('')}</div></section>`;
  }).join('');
  const integrated=screenings.filter(item=>item.integrated).length;
  return `<div class="screening-panel" id="screening-panel-root">
    <section class="screening-hero">
      <div><div class="eyebrow">Plataforma Clínica</div><h1>Painel de Rastreios</h1><p>Central profissional para localizar, abrir e compartilhar rastreios clínicos. Os links públicos preservam uma interface clínica própria; os mecanismos de registro permanecem em segundo plano.</p></div>
      <div class="screening-hero-actions"><button type="button" class="btn secondary" data-screening-action="share" data-url="${JOURNEY_URL}" data-name="Jornada Terapêutica">Compartilhar Jornada</button><a class="btn" href="${JOURNEY_URL}" target="_blank" rel="noopener noreferrer">Abrir Jornada</a></div>
    </section>
    <section class="screening-summary" aria-label="Resumo do catálogo">
      <div class="screening-stat"><small>Rastreios e acompanhamentos</small><strong>${screenings.length}</strong></div>
      <div class="screening-stat"><small>Grupos clínicos</small><strong>${GROUP_ORDER.length}</strong></div>
      <div class="screening-stat"><small>Registro integrado</small><strong>${integrated}</strong></div>
      <div class="screening-stat"><small>Aplicações públicas ativas</small><strong>${screenings.length}</strong></div>
    </section>
    <section class="screening-landing-card" aria-label="Jornada Terapêutica"><div><h2>Jornada Terapêutica</h2><p>Landing pública independente para acesso orientado a materiais e instrumentos. Não funciona como prontuário.</p></div><div class="screening-chip-row"><span class="screening-chip ok">Interface pública</span><span class="screening-chip">Separada do painel</span></div></section>
    <section class="screening-toolbar" aria-label="Filtros do painel"><div class="screening-search"><span aria-hidden="true">⌕</span><label class="sr-only" for="screening-search-input">Pesquisar rastreios</label><input id="screening-search-input" type="search" placeholder="Pesquisar por nome, área ou finalidade" autocomplete="off" value="${esc(searchTerm)}"></div><div class="screening-filter-row" role="group" aria-label="Filtrar por grupo"><button class="screening-filter" data-screening-filter="Todos" aria-pressed="${activeGroup==='Todos'}">Todos</button>${GROUP_ORDER.map(group=>`<button class="screening-filter" data-screening-filter="${esc(group)}" aria-pressed="${activeGroup===group}">${esc(group)}</button>`).join('')}</div></section>
    <div class="sr-only" id="screening-result-status" aria-live="polite"></div>
    <div id="screening-catalog">${groups}</div>
    <div class="screening-empty" id="screening-empty" hidden>Nenhum rastreio corresponde aos filtros atuais.</div>
  </div>`;
}

function ensureNav(){
  const nav=document.querySelector('.sidebar nav');
  if(!nav||nav.querySelector('[data-screenings-nav="true"]'))return;
  const button=document.createElement('button');button.type='button';button.className='nav-link';button.dataset.screeningsNav='true';button.setAttribute('aria-label','Abrir Painel de Rastreios');button.innerHTML='<img src="assets/images/brand-symbol.svg" alt="">Rastreios';
  const resources=[...nav.querySelectorAll('.nav-link')].find(el=>el.dataset.route==='resources');
  if(resources?.nextSibling)nav.insertBefore(button,resources.nextSibling);else nav.appendChild(button);
}
function markNav(){const isOpen=location.hash.replace(/^#/,'')==='rastreios';document.querySelectorAll('.sidebar .nav-link').forEach(el=>el.classList.toggle('active',isOpen&&el.dataset.screeningsNav==='true'))}
function renderPanel(){
  const main=document.getElementById('main-content');if(!main)return;
  main.innerHTML=catalogError?errorMarkup():catalogReady?panelMarkup():loadingMarkup();
  if(catalogReady)applyFilters(false);markNav();document.title='Painel de Rastreios — Richelmy Murta';
}
function openPanel(){document.querySelector('.sidebar')?.classList.remove('open');if(location.hash!=='#rastreios')history.pushState(null,'','#rastreios');renderPanel()}
function applyFilters(announce=true){
  const root=document.getElementById('screening-panel-root');if(!root)return;
  const term=normalize(searchTerm.trim());let visibleCards=0;
  root.querySelectorAll('[data-screening-section]').forEach(section=>{let sectionVisible=0;section.querySelectorAll('[data-screening-card]').forEach(cardEl=>{const group=cardEl.dataset.group||'';const visible=(activeGroup==='Todos'||group===activeGroup)&&(!term||(cardEl.dataset.search||'').includes(term));cardEl.hidden=!visible;if(visible){sectionVisible+=1;visibleCards+=1}});section.hidden=sectionVisible===0});
  const empty=root.querySelector('#screening-empty');if(empty)empty.hidden=visibleCards>0;
  root.querySelectorAll('[data-screening-filter]').forEach(btn=>btn.setAttribute('aria-pressed',String(btn.dataset.screeningFilter===activeGroup)));
  const status=root.querySelector('#screening-result-status');if(status&&announce)status.textContent=`${visibleCards} ${visibleCards===1?'rastreio encontrado':'rastreios encontrados'}.`;
}
async function copyText(text){
  if(navigator.clipboard?.writeText){try{await navigator.clipboard.writeText(text);return true}catch(err){console.warn('Clipboard API indisponível; usando fallback.',err)}}
  const input=document.createElement('textarea');input.value=text;input.setAttribute('readonly','');input.setAttribute('aria-hidden','true');input.style.position='fixed';input.style.opacity='0';input.style.pointerEvents='none';document.body.appendChild(input);input.select();let ok=false;try{ok=document.execCommand('copy')}finally{input.remove()}if(!ok)throw new Error('Não foi possível copiar o link neste navegador.');return true;
}
function announce(message){let box=document.getElementById('screening-live');if(!box){box=document.createElement('div');box.id='screening-live';box.className='sr-only';box.setAttribute('aria-live','polite');document.body.appendChild(box)}box.textContent='';setTimeout(()=>{box.textContent=message},20)}
function notify(message,type='ok'){announce(message);clearTimeout(toastTimer);document.getElementById('screening-toast')?.remove();const box=document.createElement('div');box.id='screening-toast';box.className=`screening-toast ${type==='error'?'error':''}`;box.setAttribute('role','status');box.textContent=message;document.body.appendChild(box);toastTimer=setTimeout(()=>box.remove(),3200)}
async function handleAction(el){
  const action=el.dataset.screeningAction;if(action==='reload'){catalogError=null;catalogReady=false;renderPanel();await loadCatalog();return}
  const url=el.dataset.url;const name=el.dataset.name||'Rastreio';if(!url)return;
  if(action==='share'){const shareData={title:name,text:`${name} — acesso ao rastreio`,url};if(navigator.share){try{await navigator.share(shareData);return}catch(err){if(err?.name==='AbortError')return;console.warn('Compartilhamento nativo indisponível; copiando link.',err)}}await copyText(url);notify(`O link de ${name} foi copiado.`)}
}
function onRendered(){ensureNav();if(location.hash.replace(/^#/,'')==='rastreios')renderPanel();else document.title=DEFAULT_TITLE}
document.addEventListener('rm:rendered',onRendered);document.addEventListener('rm:app-ready',()=>setTimeout(onRendered,0));
document.addEventListener('click',event=>{const nav=event.target.closest?.('[data-screenings-nav="true"]');if(nav){event.preventDefault();event.stopPropagation();openPanel();return}const filter=event.target.closest?.('[data-screening-filter]');if(filter){activeGroup=filter.dataset.screeningFilter||'Todos';applyFilters();return}const action=event.target.closest?.('[data-screening-action]');if(action){event.preventDefault();void handleAction(action).catch(err=>{console.error('Falha em ação do Painel de Rastreios',err);notify(err?.message||'Não foi possível concluir a ação.','error')})}},false);
document.addEventListener('input',event=>{if(event.target?.id==='screening-search-input'){searchTerm=event.target.value||'';applyFilters()}},false);
window.addEventListener('popstate',()=>{if(location.hash.replace(/^#/,'')==='rastreios')renderPanel()});window.addEventListener('hashchange',()=>{if(location.hash.replace(/^#/,'')==='rastreios')renderPanel()});
if(document.querySelector('.sidebar'))onRendered();
void loadCatalog();
