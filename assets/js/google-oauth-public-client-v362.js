/*
 * Google OAuth public client bootstrap for new browsers/devices.
 * The OAuth client ID is a public identifier. Secrets and refresh tokens never belong here.
 */
(()=>{
  const STORAGE_KEY='rm.google.calendar.clientId';
  const RETIRED_CLIENT_ID='561272367028-lb7baolsc8sgcnei74lq880tv64lsu0.apps.googleusercontent.com';
  const CONFIG_URL='https://secretaria-digital-core.vercel.app/api/scheduler?view=google-oauth-public';
  const valid=value=>/^[0-9]+-[a-z0-9_-]+\.apps\.googleusercontent\.com$/i.test(String(value||'').trim());

  const initial=String(localStorage.getItem(STORAGE_KEY)||'').trim();
  if(initial===RETIRED_CLIENT_ID)localStorage.removeItem(STORAGE_KEY);

  window.__rmGoogleClientIdReady=(async()=>{
    const current=String(localStorage.getItem(STORAGE_KEY)||'').trim();
    if(valid(current)&&current!==RETIRED_CLIENT_ID)return current;
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),5000);
    try{
      const response=await fetch(CONFIG_URL,{cache:'no-store',credentials:'omit',signal:controller.signal});
      if(!response.ok)throw new Error(`public_oauth_config_${response.status}`);
      const payload=await response.json();
      const id=String(payload?.client_id||'').trim();
      if(payload?.configured!==true||!valid(id)||id===RETIRED_CLIENT_ID)throw new Error('public_oauth_client_invalid');
      localStorage.setItem(STORAGE_KEY,id);
      return id;
    }catch(err){
      console.warn('[OAuth] Não foi possível obter automaticamente o Google OAuth Client ID.',err);
      return '';
    }finally{
      clearTimeout(timeout);
    }
  })();
})();
