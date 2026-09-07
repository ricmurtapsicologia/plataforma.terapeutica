const OWNER = 'ricmurtapsicologia';

const TARGETS = [
  ['geral','Rastreioclinico',['index.html']],
  ['tdah','rastreioTDAH',['index.html']],
  ['bipolar','tab-bateria-integrada',['index.html']],
  ['borderline','Inventario-de-Tracos-Borderline',['index.html']],
  ['narcisismo','bateria.narcisismo',['index.html']],
  ['impulsividade','Rastreio-de-Impulsividade',['index.html']],
  ['esquemas','rastreio.de.esquemas',['index.html']],
  ['modos','rastreiomodosesquematicos',['index.html']],
  ['necessidades','Escala-de-Necessidades-Emocionais',['index.html']],
  ['codependencia','Escala-de-Co-Depenpencia-Emocional',['index.html']],
  ['icaps','ICAPS',['index.html']],
  ['risco','TriagemRiscoSuicidio',['index.html']],
  ['humor','Inicio-de-Jornada-Terapeutica',['assets/monitoramentos-v2.js']],
  ['ansiedade','Inicio-de-Jornada-Terapeutica',['assets/monitoramentos-v2.js']],
  ['autoestima','Inicio-de-Jornada-Terapeutica',['assets/monitoramentos-v2.js']]
];

async function raw(repo,path){
  const u=`https://raw.githubusercontent.com/${OWNER}/${repo}/main/${path}`;
  const r=await fetch(u,{headers:{'user-agent':'rm-adapter-discovery-v2'}});
  if(!r.ok) throw new Error(`${repo}/${path}: HTTP ${r.status}`);
  return r.text();
}

function attr(tag,name){
  const m=tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`,'i'));
  return m?.[1]||null;
}

function forms(text){
  return [...text.matchAll(/<form\b[^>]*>/gi)].map(m=>({
    tag:m[0], id:attr(m[0],'id'), name:attr(m[0],'name'), action:attr(m[0],'action'), method:attr(m[0],'method')
  }));
}

function controls(text){
  return [...text.matchAll(/<(?:input|select|textarea)\b[^>]*>/gi)].map(m=>({
    tag:m[0].slice(0,240), id:attr(m[0],'id'), name:attr(m[0],'name'), type:attr(m[0],'type')
  })).filter(x=>x.id||x.name);
}

function labels(text){
  const out=[];
  for(const m of text.matchAll(/<label\b[^>]*for\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/label>/gi)){
    const clean=m[2].replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
    out.push({for:m[1],text:clean.slice(0,160)});
  }
  return out;
}

const identityRx=/(nome|name|nascimento|birth|data|date|idade|age|email|e-mail|paciente|respondente|application|aplica[cç][aã]o)/i;
const report={schemaVersion:'1.0.0',generatedAt:new Date().toISOString(),instruments:{},failures:[]};

for(const [id,repo,paths] of TARGETS){
  let combined='';
  try{for(const p of paths) combined+='\n'+await raw(repo,p)}catch(e){report.failures.push({id,repo,error:String(e.message||e)});continue}
  const fs=forms(combined);
  const cs=controls(combined);
  const ls=labels(combined);
  const identityControls=cs.filter(c=>identityRx.test(`${c.id||''} ${c.name||''}`));
  const identityLabels=ls.filter(l=>identityRx.test(l.text));
  report.instruments[id]={repo,paths,forms:fs,identityControls,identityLabels,controlCount:cs.length};
}

console.log(JSON.stringify(report,null,2));
console.log(`ADAPTER_DISCOVERY instruments=${Object.keys(report.instruments).length} failures=${report.failures.length}`);
if(report.failures.length) process.exitCode=1;
