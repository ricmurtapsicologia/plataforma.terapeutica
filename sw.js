// v1.6.6 — service worker mínimo para compatibilidade OAuth em GitHub Pages.
// Não faz cache clínico nem intercepta APIs externas. Apenas acrescenta COOP às navegações
// da própria plataforma, preservando a relação segura com o popup do Google Identity Services.

const SW_VERSION='1.6.6';

self.addEventListener('install',()=>{
  self.skipWaiting();
});

self.addEventListener('activate',event=>{
  event.waitUntil(self.clients.claim());
});

function withOAuthPopupHeader(response){
  if(!response || response.type==='opaque') return response;
  const headers=new Headers(response.headers);
  headers.set('Cross-Origin-Opener-Policy','same-origin-allow-popups');
  headers.set('X-RM-Service-Worker',SW_VERSION);
  return new Response(response.body,{
    status:response.status,
    statusText:response.statusText,
    headers
  });
}

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET' || event.request.mode!=='navigate') return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin) return;
  event.respondWith((async()=>{
    try{
      const response=await fetch(event.request,{cache:'no-store'});
      return withOAuthPopupHeader(response);
    }catch{
      const fallback=await fetch('./index.html',{cache:'no-store'});
      return withOAuthPopupHeader(fallback);
    }
  })());
});

self.addEventListener('message',event=>{
  if(event.data==='SKIP_WAITING') self.skipWaiting();
});
