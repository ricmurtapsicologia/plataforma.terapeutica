const SCREENINGS=[
  {id:'geral',group:'Geral',name:'Rastreio Clínico Geral',tech:'RAC-5TR',desc:'Triagem ampla de domínios psicopatológicos para orientar aprofundamentos clínicos.',url:'https://ricmurtapsicologia.github.io/Rastreioclinico/',registry:'legacy'},
  {id:'tdah',group:'Neurodesenvolvimento',name:'Rastreio de TDAH em Adultos',tech:'EIR-TDAH-A',desc:'Rastreio multidimensional de desatenção, hiperatividade/impulsividade, funções executivas e impacto funcional.',url:'https://ricmurtapsicologia.github.io/rastreioTDAH/',registry:'legacy'},
  {id:'bipolar',group:'Humor',name:'Rastreio do Espectro Bipolar',tech:'Bateria TAB',desc:'Bateria específica para investigação de indicadores compatíveis com espectro bipolar.',url:'https://ricmurtapsicologia.github.io/tab-bateria-integrada/',registry:'legacy'},
  {id:'borderline',group:'Personalidade',name:'Rastreio de Traços Borderline',tech:'Triagem de traços',desc:'Rastreio orientativo de padrões emocionais e relacionais associados a traços borderline.',url:'https://ricmurtapsicologia.github.io/Inventario-de-Tracos-Borderline/',registry:'legacy'},
  {id:'narcisismo',group:'Personalidade',name:'Rastreio de Traços Narcisistas',tech:'Bateria de traços',desc:'Investigação dimensional de características narcisistas e traços de personalidade relacionados.',url:'https://ricmurtapsicologia.github.io/bateria.narcisismo/',registry:'legacy'},
  {id:'impulsividade',group:'Dimensões clínicas',name:'Perfil de Impulsividade',tech:'Rastreio dimensional',desc:'Avaliação complementar de impulsividade como dimensão transdiagnóstica.',url:'https://ricmurtapsicologia.github.io/Rastreio-de-Impulsividade/',registry:'legacy'},
  {id:'esquemas',group:'Terapia do Esquema',name:'Mapa de Esquemas',tech:'Padrões emocionais',desc:'Mapeamento de esquemas iniciais desadaptativos para apoio à formulação em Terapia do Esquema.',url:'https://ricmurtapsicologia.github.io/rastreio.de.esquemas/',registry:'legacy'},
  {id:'modos',group:'Terapia do Esquema',name:'Mapa de Modos Esquemáticos',tech:'SMI 1.1',desc:'Mapeamento de modos esquemáticos e padrões de enfrentamento para formulação clínica.',url:'https://ricmurtapsicologia.github.io/rastreiomodosesquematicos/',registry:'legacy'},
  {id:'necessidades',group:'Terapia do Esquema',name:'Necessidades Emocionais',tech:'Escala complementar',desc:'Exploração de necessidades emocionais relevantes para compreensão de padrões relacionais e esquemáticos.',url:'https://ricmurtapsicologia.github.io/Escala-de-Necessidades-Emocionais/',registry:'legacy'},
  {id:'codependencia',group:'Relacionamentos',name:'Dependência e Codependência Emocional',tech:'Escala relacional',desc:'Rastreio de padrões de dependência, autocancelamento, validação e limites em vínculos afetivos.',url:'https://ricmurtapsicologia.github.io/Escala-de-Co-Depenpencia-Emocional/',registry:'legacy'},
  {id:'icaps',group:'Relacionamentos',name:'ICAPS — Prontidão para Separação',tech:'ICAPS',desc:'Instrumento complementar para organizar indicadores relacionados à prontidão para processos de separação.',url:'https://ricmurtapsicologia.github.io/ICAPS/',registry:'legacy'},
  {id:'risco',group:'Risco e segurança',name:'Avaliação Clínica de Risco Suicida',tech:'EIR-RS',desc:'Triagem clínica estruturada de risco suicida. Uso profissional requer integração com entrevista e manejo de segurança.',url:'https://ricmurtapsicologia.github.io/TriagemRiscoSuicidio/',registry:'legacy',restricted:true},
  {id:'humor',group:'Monitoramento',name:'Monitoramento de Humor',tech:'Google Forms',desc:'Acompanhamento breve de humor para uso longitudinal ao longo do processo terapêutico.',url:'https://docs.google.com/forms/d/e/1FAIpQLSfOwfOe9OAx_XgnsEMa8FzV2QJR8-ZkHmGD2gWEOcBeK41Odw/viewform',registry:'forms'},
  {id:'ansiedade',group:'Monitoramento',name:'Monitoramento de Ansiedade',tech:'Google Forms',desc:'Acompanhamento breve de sintomas ansiosos e de sua variação ao longo do tratamento.',url:'https://docs.google.com/forms/d/e/1FAIpQLSdCuc1WnzTjMbRSyNmS5kuyG1NsaG95zMDO0v0GMABH8zodhg/viewform',registry:'forms'},
  {id:'autoestima',group:'Monitoramento',name:'Monitoramento de Autoestima',tech:'Rosenberg · Google Forms',desc:'Acompanhamento complementar de autoestima para comparação longitudinal quando clinicamente pertinente.',url:'https://docs.google.com/forms/d/e/1FAIpQLScu5CuRbE_UB829g4GqzMJyfm6J6sEdfw_xPUPEA3yMy6-6aw/viewform',registry:'forms'}
];

const GROUP_ORDER=['Geral','Neurodesenvolvimento','Humor','Personalidade','Dimensões clínicas','Terapia do Esquema','Relacionamentos','Monitoramento','Risco e segurança'];
const JOURNEY_URL='https://ricmurtapsicologia.github.io/Inicio-de-Jornada-Terapeutica/';
const DEFAULT_TITLE='Richelmy Murta — Clínica';
let activeGroup='Todos';
let searchTerm='';

const esc=value=>String(value??'').replace(/[&<>'\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]));
const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();

function registryLabel(item){
  if(item.registry==='forms')return '<span class="screening-chip ok">Forms ativo</span>';
  return '<span class="screening-chip warn">Registro legado · migrar</span>';
}

function card(item){
  const risk=item.restricted?'<span class="screening-chip warn">Uso clínico supervisionado</span>':'';
  return `<article class="screening-card" data-screening-card data-group="${esc(item.group)}" data-search="${esc(normalize(`${item.name} ${item.tech} ${item.desc} ${item.group}`))}">
    <div class="screening-card-head"><div><div class="small muted">${esc(item.group)}</div><h3>${esc(item.name)}</h3></div></div>
    <div class="screening-chip-row"><span class="screening-chip">${esc(item.tech)}</span>${registryLabel(item)}${risk}</div>
    <p>${esc(item.desc)}</p>
    <div class="screening-actions">
      <a class="btn" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">Abrir</a>
      <button type="button" class="btn secondary" data-screening-action="copy" data-url="${esc(item.url)}" data-name="${esc(item.name)}">Copiar link</button>
      <button type="button" class="btn secondary" data-screening-action="share" data-url="${esc(item.url)}" data-name="${esc(item.name)}">Compartilhar</button>
    </div>
  </article>`;
}

function panelMarkup(){
  const groups=GROUP_ORDER.map(group=>{
    const items=SCREENINGS.filter(item=>item.group===group);
    if(!items.length)return'';
    return `<section class="screening-section" data-screening-section data-group="${esc(group)}"><div class="screening-section-title"><h2>${esc(group)}</h2><span>${items.length} ${items.length===1?'recurso':'recursos'}</span></div><div class="screening-grid">${items.map(card).join('')}</div></section>`;
  }).join('');
  const migrated=SCREENINGS.filter(item=>item.registry==='forms').length;
  return `<div class="screening-panel" id="screening-panel-root">
    <section class="screening-hero">
      <div><div class="eyebrow">Plataforma Clínica</div><h1>Painel de Rastreios</h1><p>Central profissional para abrir, copiar e compartilhar rastreios públicos. O acesso aos instrumentos é livre por link; o painel organiza a governança clínica e a migração para registro canônico em Forms/Sheets.</p></div>
      <div class="screening-hero-actions"><button type="button" class="btn secondary" data-screening-action="copy" data-url="${JOURNEY_URL}" data-name="Jornada Terapêutica">Copiar Jornada</button><a class="btn" href="${JOURNEY_URL}" target="_blank" rel="noopener noreferrer">Abrir Jornada</a></div>
    </section>
    <section class="screening-summary" aria-label="Resumo do catálogo">
      <div class="screening-stat"><small>Rastreios e acompanhamentos</small><strong>${SCREENINGS.length}</strong></div>
      <div class="screening-stat"><small>Grupos clínicos</small><strong>${GROUP_ORDER.length}</strong></div>
      <div class="screening-stat"><small>Com Forms já ativo</small><strong>${migrated}</strong></div>
      <div class="screening-stat"><small>Em migração de registro</small><strong>${SCREENINGS.length-migrated}</strong></div>
    </section>
    <section class="screening-landing-card" aria-label="Jornada Terapêutica"><div><h2>Jornada Terapêutica</h2><p>Landing page pública independente. Não é o Painel Clínico e não funciona como prontuário.</p></div><div class="screening-chip-row"><span class="screening-chip ok">Landing pública</span><span class="screening-chip">Separada do painel</span></div></section>
    <section class="screening-toolbar" aria-label="Filtros do painel"><div class="screening-search"><span aria-hidden="true">⌕</span><label class="sr-only" for="screening-search-input">Pesquisar rastreios</label><input id="screening-search-input" type="search" placeholder="Pesquisar por nome, área ou finalidade" autocomplete="off" value="${esc(searchTerm)}"></div><div class="screening-filter-row" role="group" aria-label="Filtrar por grupo"><button class="screening-filter" data-screening-filter="Todos" aria-pressed="${activeGroup==='Todos'}">Todos</button>${GROUP_ORDER.map(group=>`<button class="screening-filter" data-screening-filter="${esc(group)}" aria-pressed="${activeGroup===group}">${esc(group)}</button>`).join('')}</div></section>
    <div id="screening-catalog">${groups}</div>
    <div class="screening-empty" id="screening-empty" hidden>Nenhum rastreio corresponde aos filtros atuais.</div>
  </div>`;
}

function ensureNav(){
  const nav=document.querySelector('.sidebar nav');
  if(!nav||nav.querySelector('[data-screenings-nav="true"]'))return;
  const button=document.createElement('button');
  button.type='button';
  button.className='nav-link';
  button.dataset.screeningsNav='true';
  button.setAttribute('aria-label','Abrir Painel de Rastreios');
  button.innerHTML='<img src="assets/images/brand-symbol.svg" alt="">Rastreios';
  const resources=[...nav.querySelectorAll('.nav-link')].find(el=>el.dataset.route==='resources');
  if(resources?.nextSibling)nav.insertBefore(button,resources.nextSibling);else nav.appendChild(button);
}

function markNav(){
  const isOpen=location.hash.replace(/^#/,'')==='rastreios';
  document.querySelectorAll('.sidebar .nav-link').forEach(el=>el.classList.toggle('active',isOpen&&el.dataset.screeningsNav==='true'));
}

function renderPanel(){
  const main=document.getElementById('main-content');
  if(!main)return;
  main.innerHTML=panelMarkup();
  applyFilters();
  markNav();
  document.title='Painel de Rastreios — Richelmy Murta';
}

function openPanel(){
  if(location.hash!=='#rastreios')history.pushState(null,'','#rastreios');
  renderPanel();
}

function applyFilters(){
  const root=document.getElementById('screening-panel-root');
  if(!root)return;
  const term=normalize(searchTerm.trim());
  let visibleCards=0;
  root.querySelectorAll('[data-screening-section]').forEach(section=>{
    let sectionVisible=0;
    section.querySelectorAll('[data-screening-card]').forEach(cardEl=>{
      const group=cardEl.dataset.group||'';
      const matchesGroup=activeGroup==='Todos'||group===activeGroup;
      const matchesTerm=!term||(cardEl.dataset.search||'').includes(term);
      const visible=matchesGroup&&matchesTerm;
      cardEl.hidden=!visible;
      if(visible){sectionVisible+=1;visibleCards+=1}
    });
    section.hidden=sectionVisible===0;
  });
  const empty=root.querySelector('#screening-empty');
  if(empty)empty.hidden=visibleCards>0;
  root.querySelectorAll('[data-screening-filter]').forEach(btn=>btn.setAttribute('aria-pressed',String(btn.dataset.screeningFilter===activeGroup)));
}

async function copyText(text){
  if(navigator.clipboard?.writeText){try{await navigator.clipboard.writeText(text);return true}catch(err){console.warn('Clipboard API indisponível; usando fallback.',err)}}
  const input=document.createElement('textarea');
  input.value=text;input.setAttribute('readonly','');input.setAttribute('aria-hidden','true');input.style.position='fixed';input.style.opacity='0';input.style.pointerEvents='none';document.body.appendChild(input);input.select();
  let ok=false;try{ok=document.execCommand('copy')}finally{input.remove()}
  if(!ok)throw new Error('Não foi possível copiar o link neste navegador.');
  return true;
}

function announce(message){
  let box=document.getElementById('screening-live');
  if(!box){box=document.createElement('div');box.id='screening-live';box.className='sr-only';box.setAttribute('aria-live','polite');document.body.appendChild(box)}
  box.textContent='';setTimeout(()=>{box.textContent=message},20);
}

async function handleAction(el){
  const action=el.dataset.screeningAction;
  const url=el.dataset.url;
  const name=el.dataset.name||'Rastreio';
  if(!url)return;
  if(action==='copy'){await copyText(url);announce(`Link de ${name} copiado.`);return}
  if(action==='share'){
    const shareData={title:name,text:`${name} — acesso ao rastreio`,url};
    if(navigator.share){try{await navigator.share(shareData);return}catch(err){if(err?.name==='AbortError')return;console.warn('Compartilhamento nativo indisponível; copiando link.',err)}}
    await copyText(url);announce(`Compartilhamento indisponível. Link de ${name} copiado.`);
  }
}

function onRendered(){
  ensureNav();
  if(location.hash.replace(/^#/,'')==='rastreios')renderPanel();
  else document.title=DEFAULT_TITLE;
}

document.addEventListener('rm:rendered',onRendered);
document.addEventListener('rm:app-ready',()=>setTimeout(onRendered,0));
document.addEventListener('click',event=>{
  const nav=event.target.closest?.('[data-screenings-nav="true"]');
  if(nav){event.preventDefault();event.stopPropagation();openPanel();return}
  const filter=event.target.closest?.('[data-screening-filter]');
  if(filter){activeGroup=filter.dataset.screeningFilter||'Todos';applyFilters();return}
  const action=event.target.closest?.('[data-screening-action]');
  if(action){event.preventDefault();void handleAction(action).catch(err=>{console.error('Falha em ação do Painel de Rastreios',err);announce(err?.message||'Não foi possível concluir a ação.')})}
},false);
document.addEventListener('input',event=>{if(event.target?.id==='screening-search-input'){searchTerm=event.target.value||'';applyFilters()}},false);
window.addEventListener('popstate',()=>{if(location.hash.replace(/^#/,'')==='rastreios')renderPanel()});
window.addEventListener('hashchange',()=>{if(location.hash.replace(/^#/,'')==='rastreios')renderPanel()});

if(document.querySelector('.sidebar'))onRendered();
