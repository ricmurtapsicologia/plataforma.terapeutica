import process from 'node:process';

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
  ['icaps','ICAPS',['index.html','js/app.js','js/submission.js']],
  ['risco','TriagemRiscoSuicidio',['index.html']],
  ['monitoramentos','Inicio-de-Jornada-Terapeutica',['monitoramento.html','assets/monitoramentos-v2.js','assets/monitoramentos-uniformity-bridge-v1.js']]
];

const HARD = [
  ['SPLASH', /(?:id|class)=["'][^"']*splash|splash\s*screen/i],
  ['WHATSAPP', /wa\.me|api\.whatsapp\.com|whatsapp:\/\//i],
  ['LOCAL_CLINICAL_STORAGE', /localStorage|sessionStorage|indexedDB/i],
  ['FIREBASE_CLINICAL_STORAGE', /firebase(?:js|Config|app|firestore)|getFirestore|addDoc\s*\(/i],
  ['VISIBLE_GOOGLE_FORMS', /<(?:iframe|a)\b[^>]*(?:docs\.google\.com\/forms|forms\.gle)/i],
  ['BACKSTAGE_TODO', /\bTODO\b|\bFIXME\b|substituir depois|gerado por ia|system prompt|instru[cç][aã]o ao desenvolvedor/i]
];

const WARN = [
  ['DEBUG_CONSOLE', /console\.(?:log|debug)\s*\(/i],
  ['PROMPT_WORD', /\bprompt\b/i]
];

async function fetchRaw(repo, path) {
  const url = `https://raw.githubusercontent.com/${OWNER}/${repo}/main/${path}`;
  const r = await fetch(url, { headers: { 'user-agent': 'rm-screening-audit-v2' } });
  if (!r.ok) throw new Error(`${repo}/${path}: HTTP ${r.status}`);
  return await r.text();
}

const report = { generatedAt: new Date().toISOString(), hardFailures: [], warnings: [], files: [] };

for (const [instrumentId, repo, paths] of TARGETS) {
  for (const path of paths) {
    let text;
    try {
      text = await fetchRaw(repo, path);
    } catch (error) {
      report.hardFailures.push({ instrumentId, repo, path, rule: 'FETCH_FAILED', detail: String(error.message || error) });
      continue;
    }
    report.files.push({ instrumentId, repo, path, bytes: Buffer.byteLength(text) });
    for (const [rule, rx] of HARD) if (rx.test(text)) report.hardFailures.push({ instrumentId, repo, path, rule });
    for (const [rule, rx] of WARN) if (rx.test(text)) report.warnings.push({ instrumentId, repo, path, rule });
  }
}

console.log(JSON.stringify(report, null, 2));
console.log(`PUBLIC_SURFACE_AUDIT files=${report.files.length} hard=${report.hardFailures.length} warnings=${report.warnings.length}`);
if (report.hardFailures.length) process.exitCode = 1;
