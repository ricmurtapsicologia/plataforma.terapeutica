const VERSION='3.2.0';

const CP1252={8364:128,8218:130,402:131,8222:132,8230:133,8224:134,8225:135,710:136,8240:137,352:138,8249:139,338:140,381:142,8216:145,8217:146,8220:147,8221:148,8226:149,8211:150,8212:151,732:152,8482:153,353:154,8250:155,339:156,382:158,376:159};
const asciiSafe=ch=>{const code=ch.codePointAt(0);if(code>=32&&code<=126)return code;if(code>=160&&code<=255)return code;if(CP1252[code])return CP1252[code];return 63};
function pdfEscape(value=''){let out='';for(const ch of String(value||'')){const code=asciiSafe(ch);const c=String.fromCharCode(code);if(c==='\\'||c==='('||c===')')out+='\\'+c;else if(code<32||code>126)out+='\\'+code.toString(8).padStart(3,'0');else out+=c}return out}
function clean(value=''){return String(value??'').replace(/\r/g,'').replace(/[\t ]+/g,' ').trim()}
function wrap(text,max=88){const source=String(text||'').replace(/\r/g,'').split('\n'),lines=[];for(const raw of source){if(!raw.trim()){lines.push('');continue}const words=raw.trim().split(/\s+/);let line='';for(const word of words){if(!line){line=word;continue}if((line+' '+word).length<=max){line+=' '+word;continue}lines.push(line);line=word}if(line)lines.push(line)}return lines}
function normalizeSections(sections=[]){return (Array.isArray(sections)?sections:[]).filter(Boolean).map(section=>({heading:clean(section.heading||''),text:String(section.text||''),lines:Array.isArray(section.lines)?section.lines.map(String):null,spaceBefore:Number(section.spaceBefore||0)}))}
function moneyText(value){return Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
function pageContent({title='',subtitle='',meta=[],sections=[],footer='',page=1,pages=1}){
  const cmds=[];let y=800;
  const text=(value,x,size=11,font='F1')=>{cmds.push(`BT /${font} ${size} Tf ${x} ${y} Td (${pdfEscape(value)}) Tj ET`)};
  const rule=(from,to,at=y)=>cmds.push(`${from} ${at} m ${to} ${at} l S`);
  text(title,54,18,'F2');y-=22;if(subtitle){text(subtitle,54,10,'F1');y-=17}rule(54,541,y);y-=18;
  for(const line of meta){text(line,54,9,'F1');y-=13}if(meta.length)y-=4;
  for(const section of normalizeSections(sections)){
    y-=section.spaceBefore;
    if(section.heading){text(section.heading,54,11,'F2');y-=16}
    const lines=section.lines||wrap(section.text,92);
    for(const line of lines){if(!line){y-=8;continue}text(line,54,10.5,'F1');y-=14}
    y-=8;
  }
  rule(54,541,58);y=43;if(footer)text(footer,54,8,'F1');y=31;text(`Página ${page}/${pages}`,480,8,'F1');
  return cmds.join('\n');
}
function paginate({title='',subtitle='',meta=[],sections=[],footer=''}){
  const units=[];
  for(const s of normalizeSections(sections)){
    const lines=s.lines||wrap(s.text,92);units.push({heading:s.heading,lines,spaceBefore:s.spaceBefore})
  }
  const pages=[];let page=[],used=0;const capacity=43;
  for(const unit of units){let lines=[...unit.lines],heading=unit.heading;while(lines.length||heading){const headCost=heading?2:0,room=capacity-used-headCost;if(room<=2&&page.length){pages.push(page);page=[];used=0;continue}const take=Math.max(1,Math.min(lines.length,Math.max(1,room)));const chunk=lines.splice(0,take);page.push({heading,lines:chunk,spaceBefore:unit.spaceBefore});used+=headCost+chunk.length+1;heading='';if(lines.length&&used>=capacity-2){pages.push(page);page=[];used=0}}}
  if(page.length||!pages.length)pages.push(page);
  return pages.map((sections,index)=>pageContent({title,subtitle,meta,sections,footer,page:index+1,pages:pages.length}));
}
function buildPdfBytes(model){
  const pageStreams=paginate(model),objects=[];
  const add=body=>{objects.push(body);return objects.length};
  const catalog=add('<< /Type /Catalog /Pages 2 0 R >>');
  add('');
  const fontRegular=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const fontBold=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const pageIds=[];
  for(const stream of pageStreams){const contentId=add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);const pageId=add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> >> /Contents ${contentId} 0 R >>`);pageIds.push(pageId)}
  objects[1]=`<< /Type /Pages /Kids [${pageIds.map(id=>`${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  let out='%PDF-1.4\n%âãÏÓ\n',offsets=[0];
  for(let i=0;i<objects.length;i++){offsets[i+1]=out.length;out+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`}
  const xref=out.length;out+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;for(let i=1;i<=objects.length;i++)out+=`${String(offsets[i]).padStart(10,'0')} 00000 n \n`;out+=`trailer\n<< /Size ${objects.length+1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const bytes=new Uint8Array(out.length);for(let i=0;i<out.length;i++)bytes[i]=out.charCodeAt(i)&255;return bytes;
}
export function createPdf(model={}){const bytes=buildPdfBytes(model);return new Blob([bytes],{type:'application/pdf'})}
export function createPdfFile(model={},filename='documento.pdf'){return new File([createPdf(model)],filename,{type:'application/pdf',lastModified:Date.now()})}
export function downloadPdf(blob,filename='documento.pdf'){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000)}
export async function sharePdf({file,text='',title=''}){if(!file)throw new Error('PDF não disponível.');if(navigator.canShare?.({files:[file]})){await navigator.share({files:[file],text,title});return{ok:true,mode:'native-file-share'}}downloadPdf(file,file.name||'documento.pdf');return{ok:false,mode:'download-fallback'}}
export function pdfToBase64(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(reader.error);reader.onload=()=>resolve(String(reader.result||'').split(',')[1]||'');reader.readAsDataURL(blob)})}
export function sanitizeFilename(value='documento'){return `${String(value||'documento').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,100)||'documento'}.pdf`.replace(/\.pdf\.pdf$/i,'.pdf')}
export const PDF_ENGINE_VERSION=VERSION;
export const formatBRL=moneyText;

globalThis.__rmPdfEngine={version:VERSION,createPdf,createPdfFile,downloadPdf,sharePdf,pdfToBase64,sanitizeFilename};
