const seen=new WeakSet();
function sanitize(top=document.querySelector('.top-actions')){
  if(!top)return;
  const owner=top.querySelector('#rm-calendar-status-v240');
  for(const node of [...top.children]){
    if(node===owner)continue;
    const text=String(node.textContent||'').trim();
    if(/^Agenda(?:\s|$)/i.test(text))node.remove();
  }
}
function bind(){
  const top=document.querySelector('.top-actions');if(!top)return;
  sanitize(top);if(seen.has(top))return;seen.add(top);
  new MutationObserver(()=>sanitize(top)).observe(top,{childList:true});
}
document.addEventListener('rm:rendered',()=>queueMicrotask(bind));
document.addEventListener('rm:calendar-status',()=>queueMicrotask(bind));
document.addEventListener('rm:data-ready',()=>setTimeout(bind,100));
