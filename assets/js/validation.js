export const sanitizeText=value=>String(value??'').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').trim();
export const validEmail=value=>!value||/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
export const rawPhone=value=>String(value||'').replace(/\D/g,'');
export const normalizePhone=value=>{const n=rawPhone(value);if(n.length===10||n.length===11)return`55${n}`;return n};
export const validPhone=value=>{const n=rawPhone(value);return !value||[10,11,12,13].includes(n.length)};
export const validDate=value=>!value||/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(`${value}T12:00:00`));
export const validTime=value=>!value||/^([01]\d|2[0-3]):[0-5]\d$/.test(value);
export const positiveMoney=value=>Number.isFinite(Number(value))&&Number(value)>=0;
export function assert(condition,message){if(!condition)throw new Error(message)}
export function safeJson(text,maxBytes=25_000_000){assert(new Blob([text]).size<=maxBytes,'O arquivo excede o limite permitido.');let parsed;try{parsed=JSON.parse(text)}catch{throw new Error('O arquivo não contém JSON válido.')}return parsed}
export const escapeHtml=value=>String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt',"'":'&#39;','"':'&quot;'}[c]));
export function validatePatient(p){assert(sanitizeText(p.name).length>=2,'Informe o nome do paciente.');assert(validEmail(p.email),'E-mail inválido.');assert(validPhone(p.phone),'Telefone inválido. Use (XX) XXXXX-XXXX.');if(p.birthDate)assert(validDate(p.birthDate),'Data de nascimento inválida.');if(p.value!==''&&p.value!=null)assert(positiveMoney(p.value),'Valor inválido.')}
