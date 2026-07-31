# Plataforma Clínica Richelmy

Aplicação web estática, local-first e single-user para organização clínica individual. O GitHub Pages hospeda apenas os arquivos do sistema. Os dados cadastrados são gravados no navegador do usuário por meio de IndexedDB e criptografados com Web Crypto API.

## Escopo

A aplicação reúne:

- agenda e sessões;
- cadastro e seleção explícita de pacientes;
- fluxo único de atendimento;
- prontuário com finalização e adendos;
- notas técnicas restritas;
- conceitualização e ciclo de manutenção;
- plano terapêutico;
- tarefas e materiais;
- documentos;
- consentimentos;
- financeiro;
- comunicação assistida por WhatsApp, e-mail, cópia e Web Share;
- arquivos ICS;
- pacotes protegidos para pacientes;
- importação de respostas criptografadas;
- backup criptografado;
- trilha local de atividades;
- PWA e modo offline do shell.

## Limites técnicos

Esta é uma aplicação estática. Ela não possui backend, sincronização entre dispositivos, autenticação remota do paciente, auditoria independente de servidor ou push remoto automático.

WhatsApp e e-mail são assistidos: a plataforma prepara a mensagem e abre o aplicativo correspondente. A ação final de envio e qualquer marcação de envio continuam sob controle do psicólogo.

## Publicação no GitHub Pages

1. Crie um repositório privado ou público.
2. Envie todo o conteúdo desta pasta para a raiz do repositório.
3. Abra `Settings > Pages`.
4. Em `Build and deployment`, selecione `Deploy from a branch`.
5. Selecione a branch `main` e a pasta `/root`.
6. Salve e aguarde a publicação.

A plataforma deve ser acessada por HTTPS. O GitHub Pages fornece HTTPS para o endereço publicado.

## Primeira utilização

1. Abra a plataforma.
2. Crie uma senha com pelo menos dez caracteres.
3. Guarde a senha fora da aplicação.
4. Cadastre o primeiro paciente.
5. Gere um backup após a configuração inicial.

A senha não é armazenada e não pode ser recuperada. Sem a senha e sem um backup utilizável, os dados podem se tornar inacessíveis.

## Armazenamento e criptografia

- IndexedDB armazena os registros criptografados.
- AES-GCM de 256 bits protege cada entidade.
- PBKDF2 com SHA-256 deriva a chave a partir da senha.
- Cada registro recebe IV próprio.
- `localStorage` guarda apenas preferências não sensíveis.
- A chave permanece apenas na memória enquanto o cofre está desbloqueado.

## Backup

Use `Configurações > Central de Backup > Gerar backup .rmvault`.

Recomendações:

- gerar backup ao menos semanalmente;
- gerar backup antes de atualizar o código;
- manter cópias em locais protegidos;
- testar periodicamente a verificação do arquivo;
- nunca editar manualmente o arquivo `.rmvault`.

A restauração substitui o banco local atual. A senha válida será a senha do cofre contido no backup.

## Comunicação pelo WhatsApp

O telefone deve incluir DDI e DDD. Exemplo brasileiro: `5535999999999`.

A plataforma usa um link `wa.me` com texto previamente codificado. Ela não envia mensagens automaticamente e não consulta entrega ou leitura.

## Comunicação por e-mail

A plataforma usa `mailto:` para abrir o cliente de e-mail configurado. Anexos não são inseridos automaticamente. Gere o arquivo, salve-o e anexe manualmente.

## Compartilhamento nativo

Quando a Web Share API estiver disponível, a plataforma pode abrir a folha de compartilhamento do dispositivo. Em navegadores sem suporte, use os fallbacks de cópia, download, WhatsApp ou e-mail.

## Arquivos ICS

A agenda pode gerar arquivos `.ics` com títulos genéricos. O arquivo pode ser aberto no Google Calendar, Outlook, Apple Calendar e aplicativos compatíveis.

## Pacote do paciente

A aplicação gera um arquivo HTML independente contendo apenas o material ou tarefa selecionada.

No modo protegido:

1. crie um PIN;
2. gere o arquivo;
3. envie o arquivo por um canal;
4. envie o PIN por canal separado;
5. não registre o PIN dentro do prontuário ou do próprio arquivo.

O paciente pode preencher a tarefa e gerar `resposta-paciente.rmresponse`. Para importar:

1. selecione explicitamente o paciente correto;
2. abra `Comunicações` ou `Tarefas`;
3. escolha `Importar resposta`;
4. informe o PIN recebido;
5. confira paciente, tarefa e prévia;
6. confirme a associação.

## Modo paciente local

O modo paciente é destinado ao uso no mesmo dispositivo, com o paciente diante do profissional. A saída exige a senha do cofre e bloqueia a aplicação. Ele não é um portal remoto.

## Atualização

Antes de substituir arquivos no GitHub:

1. gere backup;
2. verifique o backup;
3. publique a nova versão;
4. abra a plataforma;
5. aguarde a atualização do service worker;
6. confira os dados e a versão do esquema.

## Migração da versão anterior

Se o navegador ainda possui a chave `richelmyMurtaClinicalVault.v2`, a área de Configurações oferece importação do cofre anterior. A importação exige a senha antiga e traz apenas estruturas compatíveis. Revise todos os cadastros após a migração.

## Privacidade e segurança operacional

- não compartilhe a senha;
- não use computadores públicos;
- mantenha sistema e navegador atualizados;
- bloqueie o cofre ao se afastar;
- use o botão de ocultação visual em ambientes compartilhados;
- não exponha conteúdo clínico em mensagens de WhatsApp ou assunto de e-mail;
- registre consentimentos e preferências de canal;
- revise documentos antes de emitir;
- mantenha backups protegidos.

A implementação técnica não substitui análise jurídica, ética, de segurança e de conformidade profissional.

## Autoteste

Abra `tests/self-test.html` pelo endereço do GitHub Pages. O teste usa um banco temporário separado e não altera dados clínicos.

## Estrutura

```text
/
├── index.html
├── 404.html
├── manifest.webmanifest
├── sw.js
├── .nojekyll
├── README.md
├── REFATORACAO.md
├── assets/
│   ├── css/app.css
│   ├── images/
│   └── js/
│       ├── app.js
│       ├── database.js
│       ├── crypto.js
│       ├── communications.js
│       ├── patient-package.js
│       └── modules/
└── tests/self-test.html
```
