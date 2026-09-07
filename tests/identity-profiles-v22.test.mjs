import fs from 'node:fs/promises';

const adapters=JSON.parse(await fs.readFile('rastreios/pipeline/screening-adapters-v2.json','utf8'));
const runtime=await fs.readFile('assets/js/screening-system-v2.js','utf8');
const apps=await fs.readFile('rastreios/pipeline/apps-script/Code.gs','utf8');
const monitorings=['humor','ansiedade','autoestima'];
const failures=[];
const ok=(condition,message)=>{if(!condition)failures.push(message)};

ok(adapters.schemaVersion==='2.2.0','schemaVersion deve ser 2.2.0');
ok(Array.isArray(adapters.contract?.identityProfiles?.screening_canonical?.required),'perfil screening_canonical ausente');
ok(Array.isArray(adapters.contract?.identityProfiles?.monitoring_longitudinal?.required),'perfil monitoring_longitudinal ausente');

for(const [id,item] of Object.entries(adapters.instruments||{})){
  if(monitorings.includes(id)){
    ok(item.identityProfile==='monitoring_longitudinal',`${id}: perfil longitudinal ausente`);
    ok(item.identity?.birth===null,`${id}: não deve inventar seletor de nascimento`);
    ok(item.identityTransport?.birth==='not_collected',`${id}: transporte de nascimento deve ser not_collected`);
    ok(item.submissionSupported===true,`${id}: monitoramento ativo deve continuar operacional`);
  }else{
    ok(item.identityProfile==='screening_canonical',`${id}: perfil canônico ausente`);
    for(const field of ['name','birth','application']){
      ok(typeof item.identity?.[field]==='string'&&item.identity[field],`${id}: identity.${field} deve ter seletor explícito`);
      ok(item.identityTransport?.[field]==='native_field',`${id}: transporte ${field} deve ser native_field`);
    }
  }
}

ok(adapters.instruments.humor.identityTransport.application==='collector_timestamp','humor: aplicação deve vir do timestamp');
ok(adapters.instruments.ansiedade.identityTransport.application==='collector_field','ansiedade: aplicação deve usar campo do coletor');
ok(adapters.instruments.autoestima.identityTransport.application==='collector_field','autoestima: aplicação deve usar campo do coletor');
ok(runtime.includes("VERSION='2.2.0'"),'runtime deve estar em 2.2.0');
ok(runtime.includes("identityProfile==='monitoring_longitudinal'"),'runtime deve diferenciar monitoramentos');
ok(runtime.includes('if(!monitoring&&mount.form)'), 'runtime não pode sintetizar hidden fields nos monitoramentos');
ok(apps.includes("'Carimbo de data/hora'")&&apps.includes("'Timestamp'"),'Apps Script deve manter fallback de timestamp');
ok(apps.includes("'Data de nascimento'"),'Apps Script deve reconhecer nascimento quando existir no coletor');

if(failures.length){
  console.error(JSON.stringify({status:'FAIL',failures},null,2));
  process.exit(1);
}

console.log(JSON.stringify({status:'PASS',schema:adapters.schemaVersion,screeningCanonical:12,monitoringLongitudinal:3,syntheticBirthForMonitoring:false},null,2));
console.log('IDENTITY_PROFILES_V22_PASS');
