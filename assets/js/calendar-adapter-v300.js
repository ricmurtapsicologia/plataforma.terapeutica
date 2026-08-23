const VERSION='3.0.0';

// O adapter é o único proprietário de boot da integração Calendar na Plataforma 3.
// Os módulos internos permanecem isolados por responsabilidade até a próxima
// consolidação física, sem que o entrypoint principal os trate como runtimes concorrentes.
const components=[
  ['./google-calendar-service-v240.js','serviço'],
  ['./calendar-integrity-v274.js','integridade'],
  ['./calendar-reverse-reconcile-v275.js','conciliação reversa']
];

const loaded=[];
for(const [path,role] of components){
  try{
    await import(path);
    loaded.push(role);
  }catch(error){
    console.error(`CalendarAdapter: falha em ${role}`,error);
    document.dispatchEvent(new CustomEvent('rm:calendar-status',{detail:{status:'error',source:'calendar-adapter-v300',role,message:error?.message||String(error)}}));
    throw error;
  }
}

globalThis.__rmCalendarAdapter={version:VERSION,owner:'calendar-adapter-v300',components:loaded};
document.dispatchEvent(new CustomEvent('rm:calendar-adapter-ready',{detail:{version:VERSION,components:loaded}}));
