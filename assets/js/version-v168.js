const VERSION='1.6.8';
function applyVersion(){
  document.querySelectorAll('.tiny').forEach(el=>{
    if(/^Versão\s+1\.6\.7\./.test(el.textContent||'')){
      el.textContent=(el.textContent||'').replace(/^Versão\s+1\.6\.7\./,`Versão ${VERSION}.`);
    }
  });
}
applyVersion();
new MutationObserver(applyVersion).observe(document.body,{childList:true,subtree:true});
