# Plataforma Clínica Richelmy Murta — v1.5.3

Aplicação clínica estática, local-first e de uso exclusivo do psicólogo, publicada por GitHub Pages.

## Estado atual
A v1.5.3 preserva o núcleo estabilizado das versões anteriores e acrescenta somente ajustes cirúrgicos de agenda, aniversários, PDF, exportação e portabilidade.

## Inicialização e estabilidade
- senha local validada antes da abertura da interface;
- interface abre sem depender da leitura integral do IndexedDB;
- dados locais são carregados em segundo plano;
- relógio pertence ao núcleo e atualiza a cada segundo;
- não há `MutationObserver` global capaz de congelar a interface;
- módulos opcionais são isolados para que uma falha localizada não derrube a plataforma;
- arquivos versionados evitam exigir exclusão manual do IndexedDB.

## Agenda
- visão semanal;
- semana anterior, atual e seguinte;
- recorrência avulsa, semanal e quinzenal;
- clique em horário vazio para abrir uma nova sessão com data/horário preenchidos;
- edição e exclusão individual;
- exclusão de série recorrente;
- registro de sessão pela própria agenda;
- menu de presença e pagamento diretamente em cada sessão;
- estados: Presente, Desmarcou e Faltou;
- registro de pagamento associado à sessão;
- lembrete via WhatsApp;
- aviso quando uma sessão entra na janela das próximas 6 horas.

## Aniversários
- aviso um dia antes do aniversário em amarelo claro;
- aviso do dia em laranja;
- popup de aniversário com foto do paciente quando cadastrada;
- botão para preparar mensagem de feliz aniversário no WhatsApp;
- popup exibido apenas uma vez por paciente no dia.

## Pacientes
- foto local;
- CPF e RG;
- endereço completo;
- telefone, e-mail e canal preferido;
- valor de referência;
- frequência usual;
- síntese clínica;
- rascunho automático;
- agendamento diretamente pelo paciente;
- WhatsApp e e-mail.

## Recursos e PDF
A biblioteca psicoeducativa possui materiais estruturados com exercício, reflexão, papelaria profissional, texto justificado, contato e QR Code para WhatsApp.

Na v1.5.3 foi corrigida a compatibilidade de abertura da janela de impressão/PDF em navegadores que retornavam `null` quando `window.open` era chamado com `noopener/noreferrer`.

## Backup e exportação
### Backup seguro `.rmvault`
É o formato restaurável da plataforma. Mantém a estrutura criptografada necessária para recuperar o banco local.

### Exportação Excel
Em Configurações há também uma exportação legível `.xls`, organizada por áreas: pacientes, agenda, prontuários, notas, conceitualizações, objetivos, tarefas, materiais, documentos, financeiro, consentimentos e comunicações.

O arquivo Excel é destinado a leitura e organização. Ele **não é criptografado** e não substitui o `.rmvault` para restauração integral. Fotografias não são incorporadas ao Excel para evitar arquivos excessivamente grandes.

## Sincronização entre notebook e celular
O GitHub Pages distribui e atualiza o **código da aplicação**, mas o IndexedDB clínico continua local a cada navegador.

A plataforma **não grava dados clínicos no repositório público**. CPF, fotos, prontuários, agenda e demais dados não devem ser sincronizados para o repositório público da página, mesmo criptografados com a senha local.

Para sincronização automática entre notebook e celular é necessário um armazenamento privado autenticado, por exemplo:
- repositório GitHub privado dedicado exclusivamente ao arquivo clínico criptografado; ou
- Google Drive privado via OAuth.

Todos os repositórios atualmente disponíveis nesta conta estão públicos; portanto a sincronização clínica automática não foi ativada artificialmente nesta versão. Em Configurações há um painel que explica os requisitos para ativar a sincronização privada sem expor dados.

A instalação móvel/PWA continua sendo apenas uma instalação da interface enquanto não houver armazenamento privado configurado. Os dados não são copiados automaticamente do notebook para o celular apenas pela instalação.

## Segurança dos dados
- IndexedDB local criptografado;
- nenhum dado clínico é publicado no GitHub;
- nenhuma rotina automática apaga pacientes;
- exclusão clínica permanece vinculada ao paciente específico;
- backup periódico `.rmvault` recomendado;
- Excel deve ser tratado como arquivo sensível porque é legível.

## Diagnóstico e qualidade
- diagnóstico interno em Configurações;
- `tests/self-test.html` não destrutivo;
- workflow `.github/workflows/static-integrity.yml` para sintaxe e imports locais.

## Publicação
Origem: branch `main`, pasta `/ (root)`, via GitHub Pages.

Versão de interface: `1.5.3`.
