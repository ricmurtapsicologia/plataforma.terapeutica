const FLAG='__rmPublicClinicalStorageGuardV252';

if(!globalThis[FLAG]){
  globalThis[FLAG]=true;
  const priorFetch=globalThis.fetch.bind(globalThis);
  const REPO_API='https://api.github.com/repos/ricmurtapsicologia/plataforma.terapeutica/contents/';
  const blockedMethods=new Set(['PUT','POST','PATCH','DELETE']);

  function isRepositoryWrite(url,method){
    return blockedMethods.has(method)&&String(url||'').startsWith(REPO_API);
  }

  globalThis.fetch=async function p0PublicClinicalStorageGuard(input,options={}){
    const url=typeof input==='string'?input:input?.url||String(input||'');
    const method=String(options?.method||(typeof input!=='string'&&input?.method)||'GET').toUpperCase();
    if(isRepositoryWrite(url,method)){
      document.dispatchEvent(new CustomEvent('rm:clinical-storage-security-blocked',{detail:{reason:'github-clinical-write-forbidden',method}}));
      throw new Error('P0: gravação de dados clínicos via GitHub bloqueada. O GitHub é somente código; use o cofre clínico privado.');
    }
    return priorFetch(input,options);
  };
}
