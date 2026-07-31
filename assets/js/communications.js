import {normalizePhone,validEmail,validPhone,assert} from './validation.js';
export function whatsappUrl(phone,message){assert(validPhone(phone),'Telefone inválido para WhatsApp.');const n=normalizePhone(phone);return`https://wa.me/${n}?text=${encodeURIComponent(message)}`}
export function openWhatsApp(phone,message){const url=whatsappUrl(phone,message);const win=window.open(url,'_blank','noopener,noreferrer');if(!win)throw new Error('O navegador bloqueou a abertura do WhatsApp.');return url}
export function mailtoUrl({to,subject,body,cc=''}){assert(validEmail(to),'E-mail inválido.');if(cc)assert(validEmail(cc),'E-mail de cópia inválido.');const q=new URLSearchParams({subject,body});if(cc)q.set('cc',cc);return`mailto:${encodeURIComponent(to)}?${q.toString()}`}
export function openEmail(payload){location.href=mailtoUrl(payload);return true}
export async function copyText(text){if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(text);return true}const ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.opacity='0';document.body.append(ta);ta.select();const ok=document.execCommand('copy');ta.remove();if(!ok)throw new Error('Não foi possível copiar.');return true}
export async function shareNative({title,text,url,files=[]}){if(!navigator.share)throw new Error('Compartilhamento nativo indisponível neste navegador.');const payload={title,text};if(url)payload.url=url;if(files.length){if(!navigator.canShare?.({files}))throw new Error('Este navegador não permite compartilhar arquivos.');payload.files=files}await navigator.share(payload);return true}
export function renderTemplate(template,vars){return template.replace(/{{([a-z_]+)}}/gi,(_,k)=>String(vars[k]??''))}
export const DEFAULT_MESSAGES={
  sessionReminder:'Olá, {{primeiro_nome}}. Lembro que temos uma sessão agendada para {{data_sessao}}, às {{hora_sessao}}. Caso precise solicitar alteração, responda por este canal. {{nome_profissional}} — {{titulo_profissional}}.',
  confirmation:'Olá, {{primeiro_nome}}. Poderia confirmar nosso horário de {{data_sessao}}, às {{hora_sessao}}? {{nome_profissional}} — {{titulo_profissional}}.',
  scheduleChange:'Olá, {{primeiro_nome}}. Houve uma alteração no horário do nosso encontro. O novo horário é {{data_sessao}}, às {{hora_sessao}}. Fineza confirmar o recebimento.',
  taskAvailable:'Olá, {{primeiro_nome}}. Há uma nova atividade disponível relacionada ao seu acompanhamento. O prazo combinado é {{prazo}}. O material será enviado em arquivo separado.',
  materialAvailable:'Olá, {{primeiro_nome}}. Encaminho um material psicoeducativo relacionado ao nosso acompanhamento. O arquivo segue separado para sua leitura.',
  documentAvailable:'Olá, {{primeiro_nome}}. O documento solicitado está disponível. O arquivo será encaminhado separadamente.',
  paymentPending:'Olá, {{primeiro_nome}}. Consta um pagamento administrativo pendente. Caso já tenha sido realizado, desconsidere e me encaminhe o comprovante.',
  custom:'Olá, {{primeiro_nome}}. '
};
