const VERSION='1.6.9';
function applyVersion(){
  document.querySelectorAll('.tiny').forEach(el=>{
    const text=el.textContent||'';
    if(/^Versão\s+1\.6\.(7|8)\./.test(text)){
      el.textContent=text.replace(/^Versão\s+1\.6\.(7|8)\./,`Versão ${VERSION}.`);
    }
  });
}
applyVersion();
new MutationObserver(applyVersion).observe(document.body,{childList:true,subtree:true});
