export const DEFAULT_VAULT_PASSWORD='';
export const APP_VERSION='1.6.0';
export const SCHEMA_VERSION=5;
export const STORE_NAMES=['patients','appointments','records','notes','formulations','goals','tasks','materials','documents','payments','consents','communications','audit','settings'];
export const CLINICAL_STORES=['patients','appointments','records','notes','formulations','goals','tasks','materials','documents','payments','consents','communications'];
export const runtime={
  key:null,salt:null,locked:true,dataReady:false,route:'today',patientTab:'summary',selectedPatientId:null,
  sidebarOpen:false,privacyMask:false,privacyCover:false,
  financeHidden:true,lastActive:Date.now(),modalReturnFocus:null
};
export const data=Object.fromEntries(STORE_NAMES.map(name=>[name,[]]));
export const preferences={
  theme:localStorage.getItem('rm.pref.theme')||'light',
  fontScale:Number(localStorage.getItem('rm.pref.fontScale')||1),
  reducedMotion:localStorage.getItem('rm.pref.reducedMotion')==='true',
  lockOnBlur:localStorage.getItem('rm.pref.lockOnBlur')==='true',
  idleMinutes:Number(localStorage.getItem('rm.pref.idleMinutes')||15),
  professionalName:localStorage.getItem('rm.pref.professionalName')||'Richelmy Murta',
  professionalTitle:localStorage.getItem('rm.pref.professionalTitle')||'Psicólogo Clínico',
  crp:localStorage.getItem('rm.pref.crp')||'',
  contact:localStorage.getItem('rm.pref.contact')||'(35) 98464-0729',
  defaultSessionMinutes:Number(localStorage.getItem('rm.pref.defaultSessionMinutes')||50),
  silentStart:localStorage.getItem('rm.pref.silentStart')||'20:00',
  silentEnd:localStorage.getItem('rm.pref.silentEnd')||'08:00'
};
export const uid=(prefix='id')=>`${prefix}_${crypto.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2)}`;
export const todayISO=()=>{const d=new Date();return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
export const nowISO=()=>new Date().toISOString();
export const patientById=id=>data.patients.find(p=>p.id===id)||null;
export const selectedPatient=()=>patientById(runtime.selectedPatientId);
export function setStore(name,items){data[name]=Array.isArray(items)?items:[]}
export function savePreference(key,value){preferences[key]=value;localStorage.setItem(`rm.pref.${key}`,String(value))}
export function resetRuntime(){runtime.key=null;runtime.salt=null;runtime.locked=true;runtime.dataReady=false;runtime.route='today';runtime.patientTab='summary';runtime.selectedPatientId=null;runtime.sidebarOpen=false;runtime.privacyMask=false;runtime.privacyCover=false;for(const store of STORE_NAMES)data[store]=[]}
export const DEFAULT_TASK_TEMPLATES=[
  {title:'Registro de pensamentos',category:'TCC',objective:'Observar a relação entre situação, interpretação, emoção e resposta.',instruction:'Registre uma situação relevante, o pensamento que apareceu, a emoção, a intensidade e uma resposta alternativa possível.'},
  {title:'Análise funcional',category:'TCC',objective:'Compreender antecedentes, comportamento e consequências.',instruction:'Descreva o que ocorreu antes, o que você fez e o que aconteceu logo depois e mais tarde.'},
  {title:'Ativação comportamental',category:'TCC',objective:'Aumentar contato com atividades importantes e possíveis.',instruction:'Escolha uma atividade pequena, defina quando será realizada e registre o efeito observado.'},
  {title:'Solução de problemas',category:'TCC',objective:'Transformar um problema amplo em decisões executáveis.',instruction:'Defina o problema, liste opções, avalie custos e benefícios e escolha o próximo passo.'},
  {title:'Experimento comportamental',category:'TCC',objective:'Testar uma previsão de modo planejado.',instruction:'Registre a previsão, a ação de teste, o resultado e o que aprendeu.'},
  {title:'Desfusão',category:'ACT',objective:'Observar pensamentos como eventos mentais, não ordens.',instruction:'Complete: “Estou percebendo o pensamento de que...” e observe como isso altera sua relação com ele.'},
  {title:'Valores e ação comprometida',category:'ACT',objective:'Relacionar escolhas cotidianas a valores pessoais.',instruction:'Escolha um valor importante e uma ação pequena, concreta e possível para expressá-lo.'},
  {title:'Autocompaixão prática',category:'Contextual',objective:'Responder à dificuldade com firmeza e cuidado.',instruction:'Escreva o que diria a alguém importante na mesma situação e adapte essa resposta para você.'},
  {title:'Identificação de esquemas',category:'Terapia do Esquema',objective:'Reconhecer padrões emocionais recorrentes.',instruction:'Registre o gatilho, a necessidade emocional ativada, o esquema percebido e a resposta habitual.'},
  {title:'Modos de enfrentamento',category:'Terapia do Esquema',objective:'Diferenciar rendição, evitação, hipercompensação e respostas saudáveis.',instruction:'Descreva qual modo apareceu, o que ele tentou proteger e qual resposta adulta saudável seria possível.'},
  {title:'Cartão de enfrentamento',category:'Integrativa',objective:'Disponibilizar uma resposta breve para momentos críticos.',instruction:'Escreva uma mensagem curta, realista e acionável para consultar quando o padrão se repetir.'},
  {title:'Plano de manutenção',category:'Integrativa',objective:'Consolidar recursos e sinais de atenção.',instruction:'Liste sinais iniciais, estratégias úteis, pessoas de apoio e ações de retorno ao cuidado.'}
];
export const DEFAULT_MATERIALS=[
  {id:'mat_perfeccionismo',title:'Perfeccionismo e flexibilidade',category:'Cognições e padrões',summary:'Diferença entre excelência possível e padrões inflexíveis.',content:'Padrões elevados podem orientar esforço, mas se tornam disfuncionais quando o valor pessoal depende de desempenho sem margem para erro. Flexibilidade não é desistência: é ajustar critérios à realidade, preservar prioridades e aprender com resultados imperfeitos.'},
  {id:'mat_procrastinacao',title:'Procrastinação e ação possível',category:'Comportamento',summary:'Como reduzir a distância entre intenção e início.',content:'A procrastinação costuma ser mantida por alívio imediato. A estratégia é reduzir o tamanho da ação inicial, definir um ponto de começo observável e avaliar o processo depois de iniciá-lo, não antes.'},
  {id:'mat_ansiedade',title:'Ansiedade e regulação',category:'Emoções',summary:'Compreender alerta, evitação e enfrentamento gradual.',content:'Ansiedade é um sistema de alerta. Quando toda ativação é tratada como perigo, a evitação cresce e o medo se mantém. Regulação envolve reconhecer a resposta, reduzir luta desnecessária e escolher ações proporcionais.'},
  {id:'mat_crencas',title:'Crenças e interpretações',category:'Cognições e padrões',summary:'Separar fatos, interpretações e previsões.',content:'O cérebro organiza experiências por padrões. Uma interpretação pode parecer um fato por ser familiar. Registrar evidências, alternativas e consequências ajuda a tornar a leitura da situação mais precisa.'},
  {id:'mat_autocompaixao',title:'Autocompaixão sem permissividade',category:'Contextual',summary:'Cuidado responsável diante de falhas e limites.',content:'Autocompaixão combina reconhecimento da dificuldade, humanidade compartilhada e resposta útil. Ela não elimina responsabilidade; reduz a hostilidade interna que frequentemente impede mudança consistente.'},
  {id:'mat_valores',title:'Valores e decisões',category:'ACT',summary:'Usar direção de vida para escolher ações possíveis.',content:'Valores são direções, não metas concluídas. Uma decisão orientada por valores considera o que importa e qual ação possível pode ser tomada nas condições atuais.'}
];
