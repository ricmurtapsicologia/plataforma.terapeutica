// Agenda is not proof of patient identity or attendance. Fail closed.
const VERSION='3.4.3';
async function autoAssociate(){
  const result={version:VERSION,linked:0,merged:0,automaticAssociationDisabled:true,reason:'Horário isolado não comprova identidade nem atendimento real.'};
  globalThis.__rmGeminiAutoAssociateStatus=result;
  return result;
}
globalThis.__rmGeminiAutoAssociate={version:VERSION,run:autoAssociate,status:()=>globalThis.__rmGeminiAutoAssociateStatus||null};
