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
function normalizeSpec(from,spec){
  const clean=String(spec).split('?')[0].split('#')[0];
  if(!clean.startsWith('.'))return null;
  return path.normalize(path.resolve(path.dirname(from),clean));
}
function references(file){
  const source=fs.readFileSync(file,'utf8'),refs=new Set();
  const patterns=[
    /(?:from\s*|import\s*\()\s*['"]([^'"]+\.m?js(?:\?[^'"]*)?)['"]/g,
    /['"]((?:\.\.?\/)[^'"]+\.m?js(?:\?[^'"]*)?)['"]/g
  ];
  for(const pattern of patterns){
    for(const match of source.matchAll(pattern)){
      const resolved=normalizeSpec(file,match[1]);
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

const edges=new Map();
const missing=[];
for(const file of files){
  const deps=references(file);
  edges.set(file,deps.filter(dep=>fileSet.has(dep)));
  for(const dep of deps)if(dep.startsWith(JS_ROOT)&&!fileSet.has(dep))missing.push(`${rel(file)} -> ${rel(dep)}`);
}

const reachable=new Set(),stack=[...roots];
while(stack.length){
  const file=stack.pop();
  if(reachable.has(file))continue;
  reachable.add(file);
  for(const dep of edges.get(file)||[])stack.push(dep);
}

const unreachable=files.filter(file=>!reachable.has(file)).map(rel).sort();
const report={
  roots:roots.map(rel),
  files:files.length,
  reachable:reachable.size,
  unreachable:unreachable.length,
  missing:[...new Set(missing)].sort(),
  unreachableFiles:unreachable
};
console.log(JSON.stringify(report,null,2));
if(report.missing.length)process.exitCode=1;
