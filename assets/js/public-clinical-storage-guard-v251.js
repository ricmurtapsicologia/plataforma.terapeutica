const FLAG='__rmPublicClinicalStorageGuardV251';

if(!globalThis[FLAG]){
  globalThis[FLAG]=true;
  const priorFetch=globalThis.fetch.bind(globalThis);
  const TARGET='https://api.github.com/repos/ricmurtapsicologia/plataforma.terapeutica/contents/.clinic-sync/vault.json';
  const blockedMethods=new Set(['PUT','POST','PATCH','DELETE']);

  globalThis.fetch=async function p0PublicClinicalStorageGuard(input,options={}){
    const url=typeof input==='string'?input:input?.url||String(input||'');
    const method=String(options?.method||(typeof input!=='string'&&input?.method)||'GET').toUpperCase();
    if(url.startsWith(TARGET)&&blockedMethods.has(method)){
      document.dispatchEvent(new CustomEvent('rm:clinical-storage-security-blocked',{detail:{reason:'public-github-storage',method}}));
      throw new Error('P0: gravação clínica em repositório GitHub público bloqueada. Use o cofre local e backup até a ativação do storage privado.');
    }
    return priorFetch(input,options);
  };
}
