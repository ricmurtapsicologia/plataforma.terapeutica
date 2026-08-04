# Plataforma Clínica Richelmy Murta — v1.6.2

Aplicação clínica estática, local-first e de uso exclusivo do psicólogo, publicada por GitHub Pages.

## Estado atual
A v1.6.2 mantém o cofre clínico criptografado e a sincronização notebook ↔ celular, reforçando a fila de sincronização da agenda e acrescentando recursos operacionais de remarcação, WhatsApp e Google Agenda.

## Segurança e acesso
- autenticação pela abertura real do cofre criptográfico local;
- PBKDF2-HMAC-SHA256 com 600.000 iterações para novos cofres locais;
- registros locais protegidos por AES-GCM;
- chave remota aleatória de 256 bits, independente da senha da plataforma;
- token GitHub e código de sincronização armazenados localmente de forma cifrada;
- nenhum campo clínico é publicado em texto legível no GitHub.

## Sincronização notebook ↔ celular
A sincronização usa a branch `clinic-sync-data`, fora da publicação do GitHub Pages. O arquivo remoto `.clinic-sync/vault.json` contém somente um envelope AES-256-GCM cifrado.

A v1.6.2 acrescenta uma fila durável baseada no evento emitido somente depois do commit no IndexedDB. Se uma alteração ocorrer enquanto outro ciclo de sincronização estiver em andamento, ela permanece pendente e força um novo ciclo quando o anterior terminar. Isso elimina a dependência do antigo bridge baseado em temporização de cliques da agenda.

Fluxo:
1. alteração é persistida localmente;
2. o banco emite `rm:local-data-changed` após concluir a gravação;
3. a fila registra a geração da alteração;
4. o motor de sincronização compara local e remoto;
5. alterações surgidas durante o ciclo geram reconciliação subsequente obrigatória;
6. a agenda é redesenhada após recebimento remoto concluído.

## Agenda
- visão semanal;
- recorrência avulsa, semanal e quinzenal;
- inclusão, edição e exclusão;
- remarcação de data e horário diretamente na própria agenda;
- presença, pagamento e comunicação integrados;
- botão de WhatsApp disponível na janela de até 6 horas antes da sessão;
- atualização manual/automática do Google Agenda quando a integração estiver conectada.

## Google Agenda
A integração é opcional e usa Google Identity Services + Google Calendar API.

Ao salvar ou remarcar uma sessão, a plataforma pode criar ou atualizar um evento privado no calendário principal com:
- título usando o código interno do paciente, e não o nome;
- horário e duração da sessão;
- lembrete `popup` 30 minutos antes;
- nenhum conteúdo clínico no corpo do evento.

Configuração por dispositivo:
1. criar um OAuth Client ID para aplicativo Web no Google Cloud;
2. autorizar a origem `https://ricmurtapsicologia.github.io`;
3. informar o Client ID em `Configurações > Google Agenda`;
4. conectar a conta Google e autorizar somente o escopo de eventos do calendário.

O access token do Google é armazenado localmente de forma cifrada e expira periodicamente. Quando expirar, a plataforma mantém os agendamentos pendentes e solicita nova conexão. A notificação de 30 minutos depende de as notificações do aplicativo Google Agenda estarem habilitadas no celular.

## Materiais e WhatsApp
Materiais associados e materiais premium ganham a ação `Enviar conteúdo no WhatsApp` dentro da visualização do próprio material. A mensagem leva o conteúdo textual do material diretamente para a conversa do paciente, além das opções existentes de PDF.

## Proteção da primeira migração
A criação inicial do cofre remoto permanece protegida contra dispositivo local vazio. O notebook que contém a base válida continua sendo a fonte da primeira carga.

## Backup
O `.rmvault` continua sendo o formato restaurável recomendado. O código de sincronização deve permanecer guardado separadamente; se todos os dispositivos e o código forem perdidos, o cofre remoto não pode ser recuperado apenas a partir do GitHub.

## Resolução de concorrência
O mecanismo mantém baseline por dispositivo, merge por identificador e `updatedAt`, tombstones para exclusões e bloqueio de conflitos quando o mesmo registro é alterado nos dois dispositivos depois da última base comum.

## Limites de segurança
A arquitetura foi desenhada para que a exposição do repositório público, isoladamente, não revele conteúdo clínico. Isso não representa garantia absoluta contra comprometimento do dispositivo, perda de credenciais, malware ou falhas futuras da plataforma.

## Diagnóstico e qualidade
- diagnóstico interno em Configurações;
- `tests/self-test.html` não destrutivo;
- workflow `.github/workflows/static-integrity.yml` valida sintaxe JavaScript e imports locais em pull requests e no `main`.

## Publicação
Código: branch `main`, pasta `/ (root)`, via GitHub Pages.

Cofre sincronizado: branch `clinic-sync-data`, arquivo `.clinic-sync/vault.json`.

Versão de interface: `1.6.2`.
