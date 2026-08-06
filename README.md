# Plataforma Clínica Richelmy Murta — v1.8.4

Aplicação clínica local-first, de uso exclusivo do psicólogo, publicada por GitHub Pages. A versão 1.8.4 preserva o modelo de dados, o cofre criptográfico, a sincronização entre dispositivos, a integração com Google Agenda e os fluxos clínicos existentes, acrescentando um histórico visual de sessões dentro da área de cada paciente.

## v1.8.4 — Sessões no perfil do paciente

A área do paciente passa a ter a aba `Sessões`, com organização visual inspirada em agendas clínicas profissionais, sem copiar componentes proprietários.

Principais mudanças:

- a antiga aba visual `Timeline` passa a se apresentar como `Sessões`;
- histórico de agendamentos do paciente em ordem cronológica decrescente;
- cada sessão mostra data, horário inicial e final, dia da semana e modalidade;
- frequência destacada por situação: `Presente`, `Ausente`, `Cancelada`, `Confirmada`, `Realizada` ou `Agendada`;
- contadores rápidos de sessões totais, presentes, ausentes e canceladas;
- ações diretas `Gerenciar` e `Editar` em cada sessão;
- botão `Agendar sessão` disponível no próprio histórico;
- demais registros clínicos da antiga timeline permanecem preservados em uma área recolhível, evitando perda funcional;
- experiência responsiva para celular, com trilho cronológico vertical e cartões compactos;
- nenhuma alteração em `SCHEMA_VERSION`, no formato do cofre ou na estrutura dos agendamentos.

Arquivo visual adicionado:

- `assets/css/patient-sessions-v184.css` — timeline de sessões, badges de frequência e responsividade mobile.

## v1.8.3 — Agenda mobile

A Agenda no celular foi redesenhada com referência visual em agendas clínicas profissionais, mantendo identidade própria da plataforma e sem copiar componentes proprietários.

Principais mudanças:

- visão diária em formato de timeline vertical;
- faixa completa visível e navegável de 06:00 a 23:00;
- altura real de 1080 px para a grade diária, sem truncamento no meio do dia;
- ausência de rolagem horizontal na visão principal do celular;
- faixa semanal compacta no topo para troca rápida de dia;
- navegação entre semanas e botão `Hoje`;
- cabeçalho visual de agenda com hierarquia semelhante a aplicativos clínicos profissionais;
- linhas de hora e meia hora para leitura rápida;
- indicador do horário atual quando o dia selecionado é hoje;
- compromissos posicionados pela hora real e com altura proporcional à duração;
- cartão de compromisso tocável para abrir o gerenciamento da sessão;
- botão flutuante `+` para nova sessão;
- cores distintas para sessão pendente, confirmada, realizada, ausente e cancelada;
- modo escuro preservado;
- desktop mantido com a agenda semanal já existente;
- nenhuma alteração em `SCHEMA_VERSION` ou no formato do cofre.

Arquivos adicionados:

- `assets/js/agenda-mobile-v183.js` — composição, navegação e comportamento da timeline móvel;
- `assets/css/agenda-mobile-v183.css` — layout, responsividade, hierarquia visual e estados da agenda móvel.

## Estado acumulado da série 1.8.x

- versão centralizada em `assets/js/version.js`;
- contraste e tipografia revisados para notebook e celular;
- camada consolidada `clinical-ui-v180.css`;
- supervisão automática de sincronização com watchdog e retry progressivo;
- faixa da agenda de 06:00 a 23:00;
- indicadores separados `Dados` e `Agenda` na topbar;
- cartões semanais sem recorte de ícones;
- integração com Google Agenda automática;
- navegação do paciente organizada em macroáreas;
- histórico visual de sessões por paciente;
- painel `Hoje` com priorização da próxima sessão;
- proteção adicional contra tentativas repetidas de senha incorreta;
- autoteste e workflow de integridade estática.

## Arquitetura

A aplicação continua em JavaScript ES Modules, sem migração para framework.

Arquivos principais:

- `assets/js/database.js`: IndexedDB e persistência criptografada;
- `assets/js/crypto.js`: derivação de chave e AES-GCM;
- `assets/js/secure-sync-v160.js`: sincronização cifrada e resolução de concorrência;
- `assets/js/sync-supervisor-v162.js`: fila pós-commit, recuperação e watchdog;
- `assets/js/google-calendar-v168.js`: integração com Google Calendar;
- `assets/js/modules/*`: módulos de domínio e apresentação clínica;
- `assets/js/optimization-v180.js`: ergonomia e apresentação adaptativa;
- `assets/js/agenda-mobile-v183.js`: agenda diária mobile em timeline;
- `assets/js/modules/patients.js`: cadastro, contexto do paciente e histórico de sessões;
- `assets/css/app.css`: base visual;
- `assets/css/clinical-ui-v180.css`: tokens, contraste e ergonomia consolidada;
- `assets/css/patient-sessions-v184.css`: histórico visual de sessões do paciente;
- `assets/css/agenda-sync-fix-v182.css`: correções da agenda semanal;
- `assets/css/agenda-mobile-v183.css`: agenda mobile v1.8.3.

A v1.8.4 não altera `SCHEMA_VERSION` nem o formato do cofre clínico.

## Segurança e acesso

- autenticação pela abertura real do cofre criptográfico local;
- PBKDF2-HMAC-SHA256 com 600.000 iterações para novos cofres locais;
- registros locais protegidos por AES-GCM;
- chave remota aleatória de 256 bits, independente da senha da plataforma;
- token GitHub e código de sincronização armazenados localmente de forma cifrada;
- token do Google Agenda armazenado localmente de forma cifrada e com duração limitada;
- nenhum campo clínico é publicado em texto legível no GitHub;
- o repositório público contém código, ativos e somente ciphertext no branch de sincronização;
- após tentativas repetidas de senha incorreta, a interface aplica atraso temporário progressivo.

### Limites do modelo

A criptografia protege o conteúdo clínico, mas não substitui a segurança do dispositivo. Malware, perda de credenciais, engenharia social, extensões maliciosas ou comprometimento físico do navegador permanecem riscos externos.

O IndexedDB mantém alguns metadados estruturais fora do ciphertext (`id`, `patientId`, `updatedAt`) para indexação e sincronização. Eles não contêm o conteúdo textual do prontuário, mas podem revelar relações estruturais em um dispositivo comprometido.

## Sincronização notebook ↔ celular

A sincronização usa a branch `clinic-sync-data`, fora da publicação do GitHub Pages. O arquivo remoto `.clinic-sync/vault.json` contém um envelope AES-256-GCM cifrado.

Fluxo resumido:

1. a alteração é persistida localmente;
2. o banco emite `rm:local-data-changed` após concluir a gravação;
3. a fila marca a base como pendente;
4. o motor compara local e remoto;
5. alterações concorrentes são avaliadas por baseline, identificador e `updatedAt`;
6. tombstones preservam exclusões;
7. conflitos reais bloqueiam sobrescrita silenciosa;
8. após reconciliação, memória e interface são redesenhadas;
9. polling automático permanece ativo enquanto a aplicação está visível e conectada;
10. o supervisor verifica a saúde da sincronização e força nova tentativa quando necessário;
11. falhas transitórias recebem retry progressivo automático.

Na topbar:

- `Dados ✓`: estado conhecido da sincronização do cofre entre dispositivos;
- `Agenda ✓`: estado conhecido da integração local com o Google Agenda.

A integração do Google Agenda continua automática para criação, remarcação, cancelamento e alterações recebidas da sincronização.

## Agenda

### Notebook

- visão semanal de sete dias;
- horários de 06:00 a 23:00;
- cartões compactos com ações sem recorte;
- semana anterior, atual e próxima;
- recorrência avulsa, semanal e quinzenal;
- inclusão, edição, remarcação e exclusão;
- confirmação por WhatsApp;
- presença, pagamento e registro integrados.

### Celular — v1.8.3

A visão principal é diária e ocupa toda a largura útil da tela.

Estrutura:

1. cabeçalho da agenda;
2. mês e navegação de semana;
3. botão `Hoje`;
4. faixa com os sete dias;
5. linha `Dia todo`;
6. identificação do dia selecionado;
7. timeline vertical completa de 06:00 a 23:00;
8. compromissos posicionados no horário real;
9. botão flutuante para nova sessão.

A grade móvel não usa um contêiner com altura reduzida. As 18 faixas horárias são renderizadas integralmente, permitindo rolagem vertical natural da página até o fim do dia.

A visualização semanal anterior continua existindo no código para compatibilidade e desktop, mas a interface móvel v1.8.3 prioriza a timeline diária por ser mais legível e adequada ao toque.

## Google Agenda

A integração é opcional e usa Google Calendar API com OAuth do Google.

Quando conectado, a plataforma:

- cria evento ao cadastrar agendamento;
- atualiza data, horário ou duração;
- remove evento quando o agendamento correspondente é excluído ou cancelado;
- reconcilia alterações recebidas pela sincronização entre dispositivos;
- mantém fila local quando a autorização Google expira;
- tenta reenviar após nova autorização.

Os eventos são privados e usam código interno do paciente, sem conteúdo clínico no corpo do evento.

Cada dispositivo autoriza o Google separadamente. O token do notebook não é sincronizado para o celular e vice-versa.

## Pacientes e organização clínica

A navegação visual permanece organizada em cinco macroáreas:

- Visão geral;
- Clínica;
- Intervenções;
- Documentos;
- Administrativo.

Na área individual do paciente, a aba `Sessões` mostra o histórico completo de agendamentos com os estados de frequência. Os registros clínicos não relacionados diretamente a uma sessão permanecem acessíveis na mesma área, em bloco recolhível.

O cadastro e o histórico de pacientes encerrados permanecem preservados. Agendamentos na data de encerramento ou posteriores são removidos conforme a regra clínica existente.

## Minimização de dados

A plataforma deve armazenar somente dados necessários ao cuidado ou à administração legítima da clínica. Campos como CPF, RG, endereço e foto devem ser usados apenas quando houver necessidade concreta.

## Financeiro

- total recebido e pendente;
- valor estimado do mês corrente;
- quantidade de sessões previstas;
- comparação mensal entre `Recebido` e `Estimado`;
- sessões incompatíveis com encerramento do paciente não entram na estimativa;
- funcionamento global e individual por paciente.

## Backup

O `.rmvault` permanece o formato restaurável recomendado. Antes de alterações estruturais, deve ser mantido um backup verificável do cofre e uma referência Git conhecida do código funcional.

Referências anteriores da série 1.8.x:

- `backup-pre-v1.8.0`;
- `refactor-v1.8.0`;
- `hotfix-v1.8.1-agenda-status`;
- `hotfix-v1.8.2-agenda-sync`.

## Diagnóstico e qualidade

- `tests/self-test.html`: teste não destrutivo de navegador, criptografia, IndexedDB temporário, schema, versão, histórico de sessões, faixa da Agenda, timeline móvel, status da topbar, watchdog e arquivos críticos;
- `.github/workflows/static-integrity.yml`: valida sintaxe JavaScript, imports locais, arquivos referenciados no `index.html`, remoção de patches antigos e consistência de versão;
- nenhuma rotina de teste abre ou altera o banco clínico real.

## Publicação

Código: branch `main`, pasta `/ (root)`, via GitHub Pages.

Cofre sincronizado: branch `clinic-sync-data`, arquivo `.clinic-sync/vault.json`.

Versão de interface: `1.8.4`.
