import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const JS_ROOT=path.join(ROOT,'assets','js');

function walk(dir){
  const out=[];
  for(const name of fs.readdirSync(dir)){
    const full=path.join(dir,name),stat=fs.statSync(full);
    if(stat.isDirectory())out.push(...walk(full));
    else if(/\.m?js$/.test(name))out.push(full);
  }
  return out;
}
function rel(file){return path.relative(ROOT,file).replaceAll('\\','/')}
function resolveSpec(from,spec){
  const clean=String(spec).split('?')[0].split('#')[0];
  if(clean.startsWith('./')||clean.startsWith('../'))return path.normalize(path.resolve(path.dirname(from),clean));
  if(clean.startsWith('assets/js/'))return path.normalize(path.resolve(ROOT,clean));
  return null;
}
function references(file){
  const source=fs.readFileSync(file,'utf8'),refs=new Set();
  const patterns=[
    /(?:from\s*|import\s*\()\s*['"`]((?:\.\.?\/)[^'"`$?]+\.m?js)/g,
    /['"`]((?:\.\.?\/)[^'"`$?]+\.m?js)/g,
    /(?:\.src|src)\s*=\s*['"`](assets\/js\/[^'"`$?]+\.m?js)/g
  ];
  for(const pattern of patterns){
    for(const match of source.matchAll(pattern)){
      const resolved=resolveSpec(file,match[1]);
      if(resolved)refs.add(resolved);
    }
  }
  return [...refs];
}

const files=walk(JS_ROOT),fileSet=new Set(files);
const index=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
const roots=[...index.matchAll(/<script[^>]+src="(assets\/js\/[^"?#]+\.m?js)/g)]
  .map(match=>path.resolve(ROOT,match[1]))
  .filter(file=>fileSet.has(file));

const edges=new Map(),missingByFile=new Map();
for(const file of files){
  const deps=references(file),present=[],missing=[];
  for(const dep of deps){
    if(fileSet.has(dep))present.push(dep);
    else if(dep.startsWith(JS_ROOT))missing.push(dep);
  }
  edges.set(file,present);
  missingByFile.set(file,missing);
}

const reachable=new Set(),stack=[...roots];
while(stack.length){
  const file=stack.pop();
  if(reachable.has(file))continue;
  reachable.add(file);
  for(const dep of edges.get(file)||[])stack.push(dep);
}

const reachableMissing=[];
for(const file of reachable){
  for(const dep of missingByFile.get(file)||[])reachableMissing.push(`${rel(file)} -> ${rel(dep)}`);
}
const unreachableFiles=files.filter(file=>!reachable.has(file));
const historicalMissing=[];
for(const file of unreachableFiles){
  for(const dep of missingByFile.get(file)||[])historicalMissing.push(`${rel(file)} -> ${rel(dep)}`);
}

const report={
  roots:roots.map(rel),
  files:files.length,
  reachable:reachable.size,
  unreachable:unreachableFiles.length,
  missingReachable:[...new Set(reachableMissing)].sort(),
  historicalMissing:[...new Set(historicalMissing)].sort(),
  unreachableFiles:unreachableFiles.map(rel).sort()
};
console.log(JSON.stringify(report,null,2));
if(report.missingReachable.length)process.exitCode=1;
