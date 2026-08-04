# Plataforma Clínica Richelmy Murta — v1.7.1

Aplicação clínica estática, local-first e de uso exclusivo do psicólogo, publicada por GitHub Pages.

## Estado atual
A v1.7.1 mantém o cofre clínico criptografado, a sincronização notebook ↔ celular e a integração automática com o Google Agenda. A camada mobile-first permanece ativa e a agenda foi simplificada para uma única visão semanal, removendo alternâncias redundantes e a lista duplicada de sessões abaixo do calendário.

## Segurança e acesso
- autenticação pela abertura real do cofre criptográfico local;
- PBKDF2-HMAC-SHA256 com 600.000 iterações para novos cofres locais;
- registros locais protegidos por AES-GCM;
- chave remota aleatória de 256 bits, independente da senha da plataforma;
- token GitHub e código de sincronização armazenados localmente de forma cifrada;
- token do Google Agenda armazenado localmente de forma cifrada e com duração limitada;
- nenhum campo clínico é publicado em texto legível no GitHub;
- o repositório público contém somente código e ativos da interface.

## Sincronização notebook ↔ celular
A sincronização usa a branch `clinic-sync-data`, fora da publicação do GitHub Pages. O arquivo remoto `.clinic-sync/vault.json` contém somente um envelope AES-256-GCM cifrado.

A fila durável é baseada no evento emitido somente depois do commit no IndexedDB. Se uma alteração ocorrer enquanto outro ciclo de sincronização estiver em andamento, ela permanece pendente e força um novo ciclo quando o anterior terminar.

Fluxo:
1. alteração é persistida localmente;
2. o banco emite `rm:local-data-changed` após concluir a gravação;
3. a fila registra a geração da alteração;
4. o motor de sincronização compara local e remoto;
5. alterações surgidas durante o ciclo geram reconciliação subsequente obrigatória;
6. a agenda é redesenhada após recebimento remoto concluído.

## Camada mobile-first
A interface do celular possui comportamento específico para telas pequenas:

- topbar compacta, evitando colisão horizontal entre menu, relógio e controles;
- controles secundários de tema e saída são retirados da faixa superior no celular; o atalho de privacidade permanece acessível na topbar;
- indicadores separados para estado de sincronização de dados e estado conhecido do Google Agenda;
- cards, formulários e modais ajustados para uma coluna em telas pequenas;
- modais transformados em painel inferior, com área útil maior;
- toasts e avisos posicionados respeitando `safe-area` do celular;
- textos técnicos longos, URLs e códigos passam a quebrar linha sem gerar overflow X;
- contexto do paciente deixa de permanecer sticky no celular, reduzindo congestionamento vertical;
- botões do contexto e dos cards são redistribuídos para alvos de toque mais consistentes;
- abas continuam horizontais, mas com rolagem limpa e sem barra visual;
- cartões de pacientes priorizam a próxima sessão em vez da mensagem repetitiva de ausência de síntese;
- o indicador inicial do painel `Hoje` destaca `Sessões hoje`;
- detalhes técnicos do Google OAuth ficam recolhidos por padrão em `Detalhes técnicos`.

## Agenda
- visão semanal única no notebook e no celular;
- no celular, a semana mantém rolagem horizontal controlada para preservar a legibilidade das sete colunas;
- navegação por semana anterior, semana atual e próxima semana;
- recorrência avulsa, semanal e quinzenal;
- inclusão, edição e exclusão;
- remarcação de data e horário diretamente na própria agenda;
- presença, pagamento e comunicação integrados;
- botão de WhatsApp disponível na janela de até 6 horas antes da sessão;
- somente o primeiro nome/nome preferido aparece nos cartões compactos da agenda;
- a lista duplicada `Sessões da semana`, anteriormente exibida abaixo do calendário, foi removida;
- sincronização automática com o Google Agenda quando a integração estiver conectada.

## Google Agenda — sincronização automática
A integração é opcional e usa Google Calendar API com OAuth do Google.

Depois de conectado o Google Agenda no dispositivo, a plataforma passa a:
- criar automaticamente o evento ao cadastrar um agendamento;
- atualizar automaticamente o evento quando data, horário ou duração forem alterados;
- remover automaticamente o evento quando o agendamento correspondente for excluído ou cancelado;
- reconciliar alterações de agenda recebidas pela sincronização notebook ↔ celular;
- manter uma fila local quando a autorização Google estiver temporariamente expirada;
- reenviar a fila após nova autorização;
- conferir automaticamente a agenda ao abrir/retomar a plataforma e após sincronização remota.

Os eventos são privados e contêm:
- título usando o código interno do paciente, e não o nome;
- horário e duração da sessão;
- lembrete `popup` 30 minutos antes;
- nenhum conteúdo clínico no corpo do evento.

A identificação do evento no Google é determinística a partir do ID interno do agendamento. Isso evita duplicação e permite atualização/exclusão do mesmo evento.

### Configuração do OAuth
Cliente OAuth Web no Google Cloud:

- origem JavaScript autorizada: `https://ricmurtapsicologia.github.io`
- URI de redirecionamento autorizada: `https://ricmurtapsicologia.github.io/plataforma.terapeutica/`
- escopo utilizado: `https://www.googleapis.com/auth/calendar.events`

A conexão usa redirecionamento da página inteira. Depois da autorização, o Google devolve o token à plataforma; o token é retirado da URL e cifrado localmente após o desbloqueio do cofre.

Cada dispositivo precisa autorizar o Google Agenda separadamente. O token do notebook não é sincronizado para o celular e vice-versa.

O Client ID pode ser público, mas não há client secret no repositório. Quando o token expira, a plataforma mantém os agendamentos pendentes e solicita nova conexão. A notificação de 30 minutos depende de as notificações do aplicativo Google Agenda estarem habilitadas no celular.

## Pacientes
- cadastro e edição;
- nome preferido e código interno;
- telefone, e-mail, modalidade, recorrência e valor de referência;
- síntese clínica, prontuário, notas restritas, formulação, planos, tarefas, materiais, documentos, comunicações, consentimentos e financeiro;
- na grade de pacientes, a interface prioriza a próxima sessão agendada;
- dados sensíveis permanecem sujeitos à máscara de privacidade da plataforma.

## Materiais e WhatsApp
Materiais associados e materiais premium possuem a ação `Enviar conteúdo no WhatsApp` dentro da visualização do próprio material. A mensagem leva o conteúdo textual do material diretamente para a conversa do paciente, além das opções existentes de PDF.

## Backup
O `.rmvault` continua sendo o formato restaurável recomendado. O código de sincronização deve permanecer guardado separadamente; se todos os dispositivos e o código forem perdidos, o cofre remoto não pode ser recuperado apenas a partir do GitHub.

## Resolução de concorrência
O mecanismo mantém baseline por dispositivo, merge por identificador e `updatedAt`, tombstones para exclusões e bloqueio de conflitos quando o mesmo registro é alterado nos dois dispositivos depois da última base comum.

## Limites de segurança
A arquitetura foi desenhada para que a exposição do repositório público, isoladamente, não revele conteúdo clínico. Isso não representa garantia absoluta contra comprometimento do dispositivo, perda de credenciais, malware, engenharia social ou falhas futuras da plataforma.

## Diagnóstico e qualidade
- diagnóstico interno em Configurações;
- `tests/self-test.html` não destrutivo;
- workflow `.github/workflows/static-integrity.yml` valida sintaxe JavaScript e imports locais em pull requests e no `main`;
- a camada mobile é exclusivamente de apresentação e ergonomia: não modifica IndexedDB, estrutura do cofre, chave de sincronização nem payload clínico remoto.

## Publicação
Código: branch `main`, pasta `/ (root)`, via GitHub Pages.

Cofre sincronizado: branch `clinic-sync-data`, arquivo `.clinic-sync/vault.json`.

Versão de interface: `1.7.1`.
