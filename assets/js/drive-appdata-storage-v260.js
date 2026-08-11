import {APPDATA_SCOPE,loadWorkspaceAuthorization} from './google-workspace-token-v260.js';

export const PRIVATE_VAULT_NAME='rm-clinic-sync-v2.json';
const DRIVE_API='https://www.googleapis.com/drive/v3';
const UPLOAD_API='https://www.googleapis.com/upload/drive/v3';
const FILE_FIELDS='id,name,modifiedTime,version,size,appProperties';

function storageError(message,code='STORAGE'){const err=new Error(message);err.code=code;return err}
async function authorization(){
  const auth=await loadWorkspaceAuthorization([APPDATA_SCOPE]);
  if(auth.ok)return auth;
  if(auth.reason==='scope')throw storageError('Reconecte o Google Workspace para autorizar o cofre privado da plataforma.','REAUTHORIZE');
  if(auth.reason==='expired')throw storageError('A autorização do Google Workspace expirou. Reconecte para continuar a sincronização.','REAUTHORIZE');
  throw storageError('Conecte o Google Workspace para usar a sincronização privada.','REAUTHORIZE');
}
async function gfetch(url,options={}){
  const auth=await authorization();
  const headers={Authorization:`Bearer ${auth.token}`,...(options.headers||{})};
  const response=await fetch(url,{...options,headers,cache:options.cache||'no-store'});
  if(response.status===401||response.status===403)throw storageError('O Google Workspace não autorizou o acesso ao cofre privado. Reconecte a conta.','REAUTHORIZE');
  return response;
}
function qValue(value){return String(value).replace(/\\/g,'\\\\').replace(/'/g,"\\'")}

export async function listPrivateVaults(){
  const params=new URLSearchParams({spaces:'appDataFolder',q:`name='${qValue(PRIVATE_VAULT_NAME)}' and trashed=false`,fields:`files(${FILE_FIELDS})`,pageSize:'10'});
  const response=await gfetch(`${DRIVE_API}/files?${params}`);
  if(!response.ok)throw storageError(`Google Drive respondeu ${response.status} ao localizar o cofre privado.`);
  const body=await response.json(),files=Array.isArray(body?.files)?body.files:[];
  return files;
}

async function metadata(fileId){
  const params=new URLSearchParams({fields:FILE_FIELDS});
  const response=await gfetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?${params}`);
  if(response.status===404)return null;
  if(!response.ok)throw storageError(`Google Drive respondeu ${response.status} ao conferir o cofre privado.`);
  const body=await response.json();
  return{...body,etag:response.headers.get('etag')||''};
}

export async function readPrivateVault(){
  const files=await listPrivateVaults();
  if(!files.length)return null;
  if(files.length>1)throw storageError('Foram encontrados múltiplos cofres privados da plataforma. A sincronização foi pausada para evitar ambiguidade.','DUPLICATE_REMOTE');
  const meta=await metadata(files[0].id);
  if(!meta)return null;
  const response=await gfetch(`${DRIVE_API}/files/${encodeURIComponent(meta.id)}?alt=media`);
  if(response.status===404)return null;
  if(!response.ok)throw storageError(`Google Drive respondeu ${response.status} ao baixar o cofre privado.`);
  let envelope=null;try{envelope=JSON.parse(await response.text())}catch{throw storageError('O arquivo privado existe, mas não contém um envelope JSON válido.','INVALID_REMOTE')}
  return{id:meta.id,version:String(meta.version||''),etag:meta.etag||response.headers.get('etag')||'',modifiedTime:meta.modifiedTime||'',size:Number(meta.size||0),envelope};
}

function multipartBody(metadataValue,text,boundary){
  return`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadataValue)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${text}\r\n--${boundary}--`;
}

async function createPrivateVault(envelope){
  const boundary=`rm_${crypto.randomUUID?.()||Date.now().toString(36)}`;
  const metadataValue={name:PRIVATE_VAULT_NAME,parents:['appDataFolder'],mimeType:'application/json',appProperties:{rmType:'clinical-vault',rmFormat:'rm-clinic-sync-v2'}};
  const params=new URLSearchParams({uploadType:'multipart',fields:FILE_FIELDS});
  const response=await gfetch(`${UPLOAD_API}/files?${params}`,{method:'POST',headers:{'Content-Type':`multipart/related; boundary=${boundary}`},body:multipartBody(metadataValue,JSON.stringify(envelope),boundary)});
  if(!response.ok)throw storageError(`Google Drive respondeu ${response.status} ao criar o cofre privado.`);
  const meta=await response.json();
  return{id:meta.id,version:String(meta.version||''),etag:response.headers.get('etag')||'',modifiedTime:meta.modifiedTime||'',size:Number(meta.size||0),envelope};
}

async function updatePrivateVault(envelope,expected){
  const current=await metadata(expected.id);
  if(!current)throw storageError('O cofre privado foi removido durante a sincronização.','RETRY');
  if(expected.version&&String(current.version||'')!==String(expected.version)){throw storageError('O cofre privado mudou em outro dispositivo.','RETRY')}
  const params=new URLSearchParams({uploadType:'media',fields:FILE_FIELDS});
  const headers={'Content-Type':'application/json'};
  const etag=expected.etag||current.etag||'';if(etag&&!String(etag).startsWith('W/'))headers['If-Match']=etag;
  const response=await gfetch(`${UPLOAD_API}/files/${encodeURIComponent(expected.id)}?${params}`,{method:'PATCH',headers,body:JSON.stringify(envelope)});
  if(response.status===409||response.status===412)throw storageError('O cofre privado mudou durante a gravação.','RETRY');
  if(!response.ok)throw storageError(`Google Drive respondeu ${response.status} ao atualizar o cofre privado.`);
  const meta=await response.json();
  const verify=await readPrivateVault();
  if(!verify||verify.id!==expected.id||Number(verify.envelope?.revision)!==Number(envelope?.revision))throw storageError('A gravação terminou, mas a revisão remota não pôde ser confirmada.','RETRY');
  return{id:meta.id||verify.id,version:String(meta.version||verify.version||''),etag:response.headers.get('etag')||verify.etag||'',modifiedTime:meta.modifiedTime||verify.modifiedTime||'',size:Number(meta.size||verify.size||0),envelope:verify.envelope};
}

export async function writePrivateVault(envelope,expected=null){
  if(!envelope||typeof envelope!=='object')throw storageError('Envelope de sincronização ausente.','INVALID_REMOTE');
  if(expected?.id)return updatePrivateVault(envelope,expected);
  const existing=await listPrivateVaults();
  if(existing.length)throw storageError('O cofre privado já foi inicializado por outro dispositivo. Sincronize novamente antes de gravar.','RETRY');
  return createPrivateVault(envelope);
}

export async function privateStorageHealth(){
  try{
    const files=await listPrivateVaults();
    return{ok:files.length<=1,remoteExists:files.length===1,duplicates:Math.max(0,files.length-1),provider:'google-drive-appdata'};
  }catch(err){return{ok:false,remoteExists:false,duplicates:0,provider:'google-drive-appdata',code:err?.code||'STORAGE',message:err?.message||String(err)}}
}
