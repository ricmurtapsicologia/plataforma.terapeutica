const VERSION='1.7.1';
function applyVersion(){
  document.querySelectorAll('.tiny').forEach(el=>{
    const text=el.textContent||'';
    if(/^Versão\s+1\.6\.(7|8|9)\./.test(text))el.textContent=text.replace(/^Versão\s+1\.6\.(7|8|9)\./,`Versão ${VERSION}.`);
  });
}
applyVersion();
new MutationObserver(applyVersion).observe(document.body,{childList:true,subtree:true});
