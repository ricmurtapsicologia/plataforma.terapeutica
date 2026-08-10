const FLAG='__rmGeminiSharingGuardV250';

if(!globalThis[FLAG]){
  globalThis[FLAG]=true;
  const originalFetch=globalThis.fetch.bind(globalThis);
  const DRIVE_EXPORT=/^https:\/\/www\.googleapis\.com\/drive\/v3\/files\/([^/?]+)\/export(?:\?|$)/;
  const publicRoles=new Set(['reader','commenter','writer','owner']);

  function authHeaders(options={}){
    const headers=new Headers(options.headers||{});
    const authorization=headers.get('Authorization');
    return authorization?{Authorization:authorization}:{};
  }

  async function assertPrivateDriveFile(fileId,options={}){
    const fields='id,shared,permissions(type,role,allowFileDiscovery)';
    const url=`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?supportsAllDrives=true&fields=${encodeURIComponent(fields)}`;
    const response=await originalFetch(url,{method:'GET',headers:authHeaders(options),cache:'no-store'});
    if(!response.ok){
      document.dispatchEvent(new CustomEvent('rm:gemini-security-blocked',{detail:{fileId,reason:'permission-check-failed'}}));
      throw new Error('P0: não foi possível verificar as permissões da Anotação do Gemini. A conciliação foi bloqueada por segurança.');
    }
    const metadata=await response.json();
    const anyone=(Array.isArray(metadata?.permissions)?metadata.permissions:[]).find(p=>p?.type==='anyone'&&publicRoles.has(String(p?.role||'')));
    if(anyone){
      document.dispatchEvent(new CustomEvent('rm:gemini-security-blocked',{detail:{fileId,reason:'anyone-access',role:anyone.role||''}}));
      throw new Error('P0: Anotação do Gemini com acesso por “qualquer pessoa” foi bloqueada. Remova o compartilhamento público no Drive antes de conciliar.');
    }
    return true;
  }

  globalThis.fetch=async function p0ProtectedFetch(input,options={}){
    const url=typeof input==='string'?input:input?.url||String(input||'');
    const match=url.match(DRIVE_EXPORT);
    if(match){
      const fileId=decodeURIComponent(match[1]);
      await assertPrivateDriveFile(fileId,options);
    }
    return originalFetch(input,options);
  };
}
