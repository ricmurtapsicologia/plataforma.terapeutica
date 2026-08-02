const VALID_ROUTES=new Set(['today','agenda','patients','resources','financeiro','settings']);

function activateRoute(route){
  document.querySelectorAll('.nav-link[data-route]').forEach(btn=>{
    btn.classList.toggle('active',btn.dataset.route===route);
    btn.setAttribute('aria-current',btn.dataset.route===route?'page':'false');
  });
}

function navigate(route){
  if(!VALID_ROUTES.has(route))return;
  activateRoute(route);
  const target=`#${route}`;
  if(location.hash===target){
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }else{
    location.hash=route;
  }
}

document.addEventListener('click',event=>{
  const nav=event.target.closest('.nav-link[data-route]');
  if(!nav)return;
  event.preventDefault();
  event.stopImmediatePropagation();
  navigate(nav.dataset.route);
},true);

document.addEventListener('keydown',event=>{
  const nav=event.target.closest?.('.nav-link[data-route]');
  if(!nav||!['Enter',' '].includes(event.key))return;
  event.preventDefault();
  event.stopImmediatePropagation();
  navigate(nav.dataset.route);
},true);

const observer=new MutationObserver(()=>{
  document.querySelectorAll('.nav-link[data-route]').forEach(btn=>{
    btn.type='button';
    btn.style.pointerEvents='auto';
    btn.removeAttribute('disabled');
  });
  const current=location.hash.replace(/^#/,'')||'today';
  if(VALID_ROUTES.has(current))activateRoute(current);
});
observer.observe(document.documentElement,{subtree:true,childList:true});

window.addEventListener('hashchange',()=>{
  const route=location.hash.replace(/^#/,'')||'today';
  if(VALID_ROUTES.has(route))activateRoute(route);
});
