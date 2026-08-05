const VERSION='1.7.6';
const VERSION_RE=/^Versão\s+\d+\.\d+\.\d+\./;

function applyVersion(){
  document.querySelectorAll('.tiny').forEach(el=>{
    const text=el.textContent||'';
    if(!VERSION_RE.test(text))return;
    const next=text.replace(VERSION_RE,`Versão ${VERSION}.`);
    if(next!==text)el.textContent=next;
  });
}

applyVersion();
new MutationObserver(applyVersion).observe(document.body,{childList:true,subtree:true});
