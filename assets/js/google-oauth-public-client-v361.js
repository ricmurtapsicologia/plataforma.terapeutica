/*
 * Google OAuth Web Client ID used by the public GitHub Pages frontend.
 * OAuth client IDs are public identifiers; no client secret or access token belongs here.
 * This bootstrap runs before the application modules so a new browser/device can start
 * the Google Workspace authorization flow without relying on pre-existing localStorage.
 */
(()=>{
  const STORAGE_KEY='rm.google.calendar.clientId';
  const PUBLIC_CLIENT_ID='561272367028-lb7baolsc8sgcnei74lq880tv64lsu0.apps.googleusercontent.com';
  const valid=value=>/^[0-9]+-[a-z0-9_-]+\.apps\.googleusercontent\.com$/i.test(String(value||'').trim());
  const current=String(localStorage.getItem(STORAGE_KEY)||'').trim();
  if(!valid(current))localStorage.setItem(STORAGE_KEY,PUBLIC_CLIENT_ID);
})();
