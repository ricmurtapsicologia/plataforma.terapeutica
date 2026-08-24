export const CLINICAL_INTAKE_VERSION='3.1.0';
export const RESPONSE_SHEET_ID='1W4QKSvzX7pm_cDs6U32EOty5rpI2jbsFJEWvuoPpjyw';
export const RESPONSE_SHEET_TITLE='Respostas — Antes da nossa primeira sessão';
export const REVIEW_STATUS='AWAITING_PSYCHOLOGIST_REVIEW';

export const FIELD={
  timestamp:'Timestamp',
  name:'Nome completo',
  preferred:'Como você prefere ser chamado(a)?',
  age:'Idade',
  occupation:'Ocupação ou profissão',
  livesWith:'Com quem você vive atualmente?',
  reason:'O que fez você procurar terapia neste momento?',
  currentDifficulty:'Se você pudesse me ajudar a compreender o que está mais difícil atualmente, o que me contaria?',
  impact:'Quanto essa situação tem afetado sua vida atualmente?',
  impactAreas:'Em quais áreas da sua vida você percebe maior impacto atualmente?',
  responsePattern:'Quando essas dificuldades aparecem, o que costuma acontecer com você?',
  triggers:'Existem situações, pessoas ou momentos em que isso costuma ficar mais difícil?',
  coping:'O que você costuma fazer para lidar com isso?',
  helps:'Existe alguma coisa que costuma ajudar, mesmo que seja apenas um pouco?',
  childhood:'Quando você pensa na sua infância, como descreveria, de forma geral, o ambiente em que cresceu?',
  caregivers:'Quem foram as pessoas mais importantes na sua criação e como você se lembra da relação com elas?',
  emotionalResponse:'Quando você estava triste, preocupado(a), com medo ou precisava de ajuda, como as pessoas próximas costumavam reagir?',
  feelingsSpace:'Na sua família havia espaço para falar sobre sentimentos, necessidades ou dificuldades?',
  earlyMaturity:'Você sente que precisou amadurecer muito cedo, assumir muitas responsabilidades ou aprender a resolver as coisas sozinho(a)?',
  formativeExperience:'Existe alguma experiência da infância ou adolescência que você sente que ainda influencia sua vida atualmente?',
  repeatedPatterns:'Existe algum tipo de situação ou relacionamento que parece se repetir na sua vida, mesmo quando você gostaria que fosse diferente?',
  selfTalk:'Quando algo importante dá errado, como você costuma falar consigo mesmo(a)?',
  relationalDifficulty:'O que costuma ser mais difícil para você nas relações com outras pessoas?',
  misunderstood:'Existe algo sobre você que sente que as pessoas próximas nem sempre conseguem compreender?',
  strengths:'O que você reconhece em você como uma força ou qualidade?',
  priorResources:'O que já ajudou você a atravessar outros períodos difíceis?',
  support:'Quem ou o que representa apoio importante para você atualmente?',
  priorTherapy:'Você já fez psicoterapia anteriormente?',
  priorTherapyWorked:'O que funcionou bem naquela experiência?',
  priorTherapyDifferent:'Existe alguma coisa que você gostaria que fosse diferente desta vez?',
  health:'Existe algum acompanhamento de saúde ou condição clínica que você considera importante eu conhecer?',
  medication:'Faz uso atualmente de algum medicamento que considere relevante me informar?',
  medicationName:'Qual medicamento você considera importante me informar?',
  desiredChange:'Se nosso trabalho estiver fazendo diferença na sua vida, o que você gostaria de perceber diferente daqui a alguns meses?',
  expectations:'O que você espera encontrar neste processo de terapia?',
  comfort:'O que ajuda você a se sentir confortável para falar sobre coisas importantes com alguém?',
  urgentSafety:'Existe neste momento alguma situação urgente relacionada à sua segurança ou à segurança de outra pessoa que você considere importante que eu saiba antes da sessão?',
  importantNow:'O que você considera importante eu saber neste momento?',
  additional:'Existe alguma coisa que eu não perguntei e que você gostaria que eu soubesse antes da nossa primeira sessão?'
};

export const REQUIRED_HEADERS=[FIELD.timestamp,FIELD.name,FIELD.reason,FIELD.currentDifficulty,FIELD.impact,FIELD.impactAreas,FIELD.responsePattern,FIELD.priorTherapy,FIELD.medication,FIELD.desiredChange,FIELD.urgentSafety];

const SECTIONS=[
  ['Contexto inicial',[FIELD.preferred,FIELD.age,FIELD.occupation,FIELD.livesWith]],
  ['Demanda atual',[FIELD.reason,FIELD.currentDifficulty,FIELD.impact,FIELD.impactAreas,FIELD.responsePattern,FIELD.triggers,FIELD.coping,FIELD.helps]],
  ['História e desenvolvimento',[FIELD.childhood,FIELD.caregivers,FIELD.emotionalResponse,FIELD.feelingsSpace,FIELD.earlyMaturity,FIELD.formativeExperience]],
  ['Padrões, relações e autoavaliação',[FIELD.repeatedPatterns,FIELD.selfTalk,FIELD.relationalDifficulty,FIELD.misunderstood]],
  ['Recursos e apoio',[FIELD.strengths,FIELD.priorResources,FIELD.support]],
  ['Terapia e saúde',[FIELD.priorTherapy,FIELD.priorTherapyWorked,FIELD.priorTherapyDifferent,FIELD.health,FIELD.medication,FIELD.medicationName]],
  ['Objetivos e expectativas',[FIELD.desiredChange,FIELD.expectations,FIELD.comfort]],
  ['Segurança e informações adicionais',[FIELD.urgentSafety,FIELD.importantNow,FIELD.additional]]
];

export function parseCsv(text=''){
  const rows=[];let row=[],field='',quoted=false;
  for(let i=0;i<String(text).length;i++){
    const ch=text[i];
    if(quoted){
      if(ch==='"'&&text[i+1]==='"'){field+='"';i++;continue}
      if(ch==='"'){quoted=false;continue}
      field+=ch;continue;
    }
    if(ch==='"'){quoted=true;continue}
    if(ch===','){row.push(field);field='';continue}
    if(ch==='\n'){row.push(field.replace(/\r$/,''));rows.push(row);row=[];field='';continue}
    field+=ch;
  }
  row.push(field.replace(/\r$/,''));
  if(row.length>1||row[0]!==''||!rows.length)rows.push(row);
  return rows.filter(r=>r.some(v=>String(v||'').trim()!==''));
}

export function rowsToObjects(rows){
  if(!Array.isArray(rows)||!rows.length)return[];
  const headers=rows[0].map(x=>String(x||'').trim());
  const missing=REQUIRED_HEADERS.filter(h=>!headers.includes(h));
  if(missing.length)throw new Error(`ANAMNESE_SCHEMA_MISMATCH:${missing.length}`);
  return rows.slice(1).map((values,index)=>({
    __row:index+2,
    ...Object.fromEntries(headers.map((h,i)=>[h,String(values[i]??'').trim()]))
  })).filter(row=>row[FIELD.name]&&row[FIELD.timestamp]);
}

export function normalizeIdentity(value=''){
  return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
}

export function bindPatientExact(row,patients=[]){
  const target=normalizeIdentity(row?.[FIELD.name]);
  if(!target)return{ok:false,reason:'MISSING_PATIENT_NAME',patient:null,matches:0};
  const matches=(Array.isArray(patients)?patients:[]).filter(p=>normalizeIdentity(p?.name)===target);
  if(matches.length===1)return{ok:true,reason:'EXACT_NAME',patient:matches[0],matches:1};
  return{ok:false,reason:matches.length?'AMBIGUOUS_PATIENT_BINDING':'PATIENT_NOT_FOUND',patient:null,matches:matches.length};
}

function canonicalRowPayload(row){
  const entries=Object.keys(row||{}).filter(k=>k!=='__row').sort().map(k=>[k,String(row[k]??'').trim()]);
  return JSON.stringify(entries);
}

export async function rowFingerprint(row){
  const bytes=new TextEncoder().encode(canonicalRowPayload(row));
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}

function normalizedAnswer(value=''){
  return normalizeIdentity(value).replace(/\s+/g,' ');
}

export function isExplicitNegative(value=''){
  const v=normalizedAnswer(value);
  if(!v)return true;
  const exact=new Set(['nao','nenhum','nenhuma','nada','sem risco','nao ha','nao existe','nao no momento','no momento nao','nao neste momento','nenhuma situacao','nenhuma no momento']);
  return exact.has(v);
}

function affirmativeLike(value=''){
  const v=normalizedAnswer(value);
  return /^(sim|uso|utilizo|tomo|faco|ja fiz|fiz|estou|tenho)\b/.test(v);
}

export function reviewFlags(row){
  const flags=[];
  const urgent=String(row?.[FIELD.urgentSafety]||'').trim();
  if(urgent&&!isExplicitNegative(urgent))flags.push({code:'PRIORITY_SAFETY_REVIEW',level:'priority',field:FIELD.urgentSafety});
  const priorTherapy=String(row?.[FIELD.priorTherapy]||'').trim();
  if(affirmativeLike(priorTherapy)&&!String(row?.[FIELD.priorTherapyWorked]||'').trim())flags.push({code:'EXPLORE_PRIOR_THERAPY',level:'review',field:FIELD.priorTherapy});
  const medication=String(row?.[FIELD.medication]||'').trim();
  if(affirmativeLike(medication)&&!String(row?.[FIELD.medicationName]||'').trim())flags.push({code:'CONFIRM_MEDICATION_DETAILS',level:'review',field:FIELD.medication});
  return flags;
}

function sectionItems(row,fields){return fields.map(field=>({field,patientReportedFact:String(row?.[field]||'').trim()})).filter(x=>x.patientReportedFact)}

export function buildStructuredAnalysis(row){
  const flags=reviewFlags(row);
  return{
    generatedBy:'deterministic-structured-intake-v310',
    autonomousDiagnosis:false,
    inferenceGenerated:false,
    factProvenance:'PATIENT_REPORTED',
    reviewRequired:true,
    priorityHumanReview:flags.some(x=>x.level==='priority'),
    flags,
    sections:SECTIONS.map(([title,fields])=>({title,items:sectionItems(row,fields)})).filter(s=>s.items.length)
  };
}

function renderAnalysisText(analysis){
  const lines=[
    'SÍNTESE ESTRUTURADA AUTOMÁTICA — ANAMNESE',
    `Status: ${REVIEW_STATUS}`,
    '',
    'Este artefato organiza respostas relatadas pelo paciente para revisão profissional. Não produz diagnóstico, hipótese diagnóstica ou conclusão clínica autônoma.'
  ];
  if(analysis.priorityHumanReview)lines.push('','ATENÇÃO: há resposta no campo de segurança que requer revisão humana prioritária.');
  for(const section of analysis.sections){
    lines.push('',section.title.toUpperCase());
    for(const item of section.items)lines.push(`• ${item.field}\n  ${item.patientReportedFact}`);
  }
  if(analysis.flags.length){lines.push('','PONTOS PARA CONFERÊNCIA');for(const flag of analysis.flags)lines.push(`• ${flag.code}`)}
  return lines.join('\n');
}

export function buildClinicalIntakeArtifact({patient,row,fingerprint,now=new Date().toISOString()}){
  if(!patient?.id)throw new Error('UNAMBIGUOUS_PATIENT_BINDING_REQUIRED');
  if(!fingerprint)throw new Error('INTAKE_FINGERPRINT_REQUIRED');
  const analysis=buildStructuredAnalysis(row);
  return{
    id:`intake_${fingerprint.slice(0,40)}`,
    patientId:patient.id,
    kind:'clinicalIntake',
    title:analysis.priorityHumanReview?'Anamnese — revisão prioritária':'Anamnese — aguardando revisão',
    text:renderAnalysisText(analysis),
    status:REVIEW_STATUS,
    reviewRequired:true,
    autonomousDiagnosis:false,
    originalPreserved:true,
    source:{type:'google-form-response',responseSheetId:RESPONSE_SHEET_ID,rowFingerprint:fingerprint,submittedAt:String(row?.[FIELD.timestamp]||'')},
    intake:analysis,
    createdAt:now,
    updatedAt:now
  };
}

export function sanitizedLedgerEntry(fingerprint,state='IMPORTED',at=new Date().toISOString()){
  if(!fingerprint)throw new Error('INTAKE_FINGERPRINT_REQUIRED');
  return{fingerprint,state,at};
}
