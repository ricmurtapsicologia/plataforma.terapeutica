const VERSION='1.7.2';
function applyVersion(){
  document.querySelectorAll('.tiny').forEach(el=>{
    const text=el.textContent||'';
    if(/^Versão\s+\d+\.\d+\.\d+\./.test(text))el.textContent=text.replace(/^Versão\s+\d+\.\d+\.\d+\./,`Versão ${VERSION}.`);
  });
}
applyVersion();
new MutationObserver(applyVersion).observe(document.body,{childList:true,subtree:true});
