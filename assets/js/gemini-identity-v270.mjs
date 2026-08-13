export const normalizeIdentity=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();

export function participantLabels(raw=''){
  const found=new Set();
  for(const m of String(raw).matchAll(/^\s*([^\n:]{2,90}):\s+/gm)){
    const value=normalizeIdentity(m[1]);
    if(value)found.add(value);
  }
  for(const m of String(raw).matchAll(/\[([^\]\n]{2,90})\]/g)){
    const value=normalizeIdentity(m[1]);
    if(value)found.add(value);
  }
  return[...found];
}

export function patientAliases(patient){
  return[...new Set([patient?.name,patient?.preferredName].map(normalizeIdentity).filter(Boolean))];
}

function firstName(patient){return normalizeIdentity(String(patient?.preferredName||patient?.name||'').trim().split(/\s+/)[0])}
function uniqueFirstPatient(value,patients){
  const key=normalizeIdentity(value).split(' ')[0];
  if(key.length<4)return null;
  const hits=patients.filter(patient=>firstName(patient)===key);
  return hits.length===1?hits[0]:null;
}
function uniquePatientByNameValue(value,patients){
  const key=normalizeIdentity(value);
  if(!key)return null;
  const direct=patients.filter(patient=>patientAliases(patient).some(alias=>alias===key||alias.startsWith(`${key} `)||key.startsWith(`${alias} `)));
  if(direct.length===1)return direct[0];
  if(key.includes(' '))return null;
  return uniqueFirstPatient(key,patients);
}
function labelDirectlyMatchesAnotherPatient(label,patientId,patients){
  return patients.some(patient=>patient?.id!==patientId&&patientAliases(patient).some(alias=>alias===label||alias.startsWith(`${label} `)||label.startsWith(`${alias} `)));
}

export function learnAliasesFromDocuments({raws=[],patients=[],professionalName='',existingAliases={}}={}){
  const professional=normalizeIdentity(professionalName);
  const validIds=new Set(patients.map(patient=>patient?.id).filter(Boolean));
  const learned={};
  for(const [alias,patientId] of Object.entries(existingAliases||{})){
    const normalized=normalizeIdentity(alias);
    if(normalized&&validIds.has(patientId)&&!labelDirectlyMatchesAnotherPatient(normalized,patientId,patients))learned[normalized]=patientId;
  }
  for(const raw of raws){
    const text=String(raw||'');
    const labels=participantLabels(text).filter(label=>label&&label!==professional);
    for(const match of text.matchAll(/\(([^)\n]{2,90})\)/g)){
      const patient=uniquePatientByNameValue(match[1],patients);
      if(!patient)continue;
      const before=normalizeIdentity(text.slice(Math.max(0,match.index-240),match.index));
      const candidates=labels
        .filter(label=>before.lastIndexOf(label)>=0)
        .filter(label=>!labelDirectlyMatchesAnotherPatient(label,patient.id,patients))
        .sort((a,b)=>before.lastIndexOf(b)-before.lastIndexOf(a)||b.length-a.length);
      const alias=candidates[0];
      if(alias&&alias.length>=3)learned[alias]=patient.id;
    }
  }
  return learned;
}

export function identifyPatientFromDocument({raw='',patients=[],professionalName='',learnedAliases={}}={}){
  const professional=normalizeIdentity(professionalName);
  const labels=participantLabels(raw).filter(label=>label&&label!==professional);
  const rank=[];
  for(const patient of patients){
    let score=0,confidence=0,evidence='';
    for(const alias of patientAliases(patient)){
      if(alias.split(' ').length>=2&&labels.some(label=>label===alias||label.startsWith(`${alias} `)||alias.startsWith(`${label} `))){
        score=200;confidence=1;evidence='nome completo do paciente no Gemini';break;
      }
    }
    if(!score){
      for(const label of labels){
        if(learnedAliases[label]===patient.id&&!labelDirectlyMatchesAnotherPatient(label,patient.id,patients)){
          score=195;confidence=.99;evidence='identificador do Meet confirmado por relação histórica explícita';break;
        }
      }
    }
    if(!score){
      const first=firstName(patient);
      const unique=first.length>=4&&patients.filter(item=>firstName(item)===first).length===1;
      if(unique&&labels.some(label=>label===first)){
        score=150;confidence=.96;evidence='primeiro nome único e exato no cofre';
      }
    }
    if(score)rank.push({patient,score,confidence,evidence});
  }
  rank.sort((a,b)=>b.score-a.score);
  if(!rank.length)return{patient:null,confidence:0,reason:'Paciente não identificado com segurança.',labels};
  if(rank.length>1&&rank[0].score-rank[1].score<25)return{patient:null,confidence:0,reason:'Associação ambígua entre pacientes.',labels};
  if(rank[0].confidence<.95)return{patient:null,confidence:rank[0].confidence,reason:'Confiança insuficiente para associação automática.',labels};
  return{...rank[0],automatic:true,labels};
}
