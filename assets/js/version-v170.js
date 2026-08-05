import {APP_VERSION} from './version.js';

const VERSION_RE=/^Versão\s+\d+\.\d+\.\d+\./;

function applyVersion(){
  document.querySelectorAll('.tiny').forEach(el=>{
    const text=el.textContent||'';
    if(!VERSION_RE.test(text))return;
    const next=text.replace(VERSION_RE,`Versão ${APP_VERSION}.`);
    if(next!==text)el.textContent=next;
  });
}

applyVersion();
document.addEventListener('rm:rendered',applyVersion);
document.addEventListener('rm:app-ready',applyVersion);
