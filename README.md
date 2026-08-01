# Plataforma Clínica Richelmy Murta — v1.3.2

Aplicação estática, local-first e de uso exclusivo do psicólogo Richelmy Murta.

## Acesso
A plataforma utiliza uma senha local de acesso. A senha não é exibida neste README nem armazenada em texto claro no arquivo de estado.

## Recursos
- agenda com lembrete por WhatsApp;
- cadastro de pacientes;
- prontuário, notas restritas, conceitualização e plano terapêutico;
- exercícios e textos psicoeducativos;
- geração de folhas A4 para salvar em PDF;
- envio assistido via WhatsApp;
- calendário ICS, financeiro, consentimentos e backup local protegido.

## PDF e WhatsApp
Clique em **Gerar PDF**, escolha **Salvar como PDF** no navegador e depois anexe o arquivo manualmente ao WhatsApp. O navegador não permite anexar automaticamente um PDF pelo link `wa.me`.

## Segurança
Não envie backups, PDFs, capturas ou dados de pacientes ao GitHub. Os dados clínicos ficam no armazenamento local do navegador. Mantenha cópias de segurança periódicas.

## Integrações Google
A arquitetura está preparada para integração com Google Calendar, Google Drive e Gmail por OAuth. A ativação depende de um OAuth Client ID configurado para esta origem do GitHub Pages.
