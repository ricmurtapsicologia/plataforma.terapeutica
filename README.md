# Plataforma Clínica Richelmy Murta — v1.8.2

Aplicação clínica local-first, de uso exclusivo do psicólogo, publicada por GitHub Pages. A v1.8.2 preserva a refatoração controlada da série 1.8.x e corrige três pontos operacionais: cartões da Agenda sem ícones cortados, faixa semanal móvel integral de 06:00 a 23:00 e supervisão automática contínua da sincronização, sem alterar o modelo de dados, o cofre criptográfico, o Google Agenda, o financeiro ou os fluxos clínicos.

## Estado da versão 1.8.2

Principais mudanças acumuladas na série 1.8.x:

- versão da aplicação centralizada em `assets/js/version.js`;
- contraste e tipografia revisados para notebook e celular;
- remoção dos patches antigos `agenda-clarity-v169` e `agenda-accessibility-v177`;
- camada consolidada `clinical-ui-v180.css`;
- camada de comportamento `optimization-v180.js`;
- Agenda mobile com visualização `Dia` como padrão e `Semana` opcional;
- Agenda semanal ampliada para a faixa de 06:00 a 23:00, em notebook e celular;
- clique em horário vazio calculado de forma coerente com a faixa 06:00–23:00;
- cartões semanais ajustados para manter os ícones integralmente visíveis;
- ação manual individual do Google Agenda retirada do cartão compacto, pois a integração permanece automática;
- visualização semanal móvel deixa de truncar a grade vertical e preserva as 18 horas completas;
- indicadores separados `Dados` e `Agenda` visíveis na topbar tanto no notebook quanto no celular;
- sincronização de dados com fila por alteração, polling do motor e watchdog de recuperação automática;
- retry progressivo automático quando ocorre falha transitória de sincronização;
- botões compactos da grade semanal preservados, com ações grandes na visualização diária;
- ação destrutiva de exclusão retirada do cartão semanal no celular;
- legenda permanente de ações removida da Agenda;
- navegação do paciente organizada em macroáreas: Visão geral, Clínica, Intervenções, Documentos e Administrativo;
- painel `Hoje` prioriza `Sessões hoje` e destaca a próxima sessão;
- atraso progressivo temporário após tentativas repetidas de senha incorreta;
- autoteste e workflow de integridade atualizados.

## Arquitetura

A aplicação continua em JavaScript ES Modules, sem migração para framework. A separação principal é:

- `assets/js/database.js`: IndexedDB e persistência criptografada;
- `assets/js/crypto.js`: derivação de chave e AES-GCM;
- `assets/js/secure-sync-v160.js`: sincronização cifrada e resolução de concorrência;
- `assets/js/sync-supervisor-v162.js`: fila pós-commit, recuperação e watchdog da sincronização;
- `assets/js/google-calendar-v168.js`: integração com Google Calendar;
- `assets/js/modules/*`: módulos de domínio e apresentação clínica;
- `assets/js/optimization-v180.js`: ergonomia e apresentação adaptativa sem alterar o modelo de dados;
- `assets/css/app.css`: base visual;
- `assets/css/clinical-ui-v180.css`: tokens, contraste, agenda mobile e ergonomia consolidada;
- `assets/css/agenda-sync-fix-v182.css`: correção cirúrgica dos cartões e da rolagem integral da agenda semanal móvel.

A v1.8.2 não altera `SCHEMA_VERSION` nem o formato do cofre clínico.

## Segurança e acesso

- autenticação pela abertura real do cofre criptográfico local;
- PBKDF2-HMAC-SHA256 com 600.000 iterações para novos cofres locais;
- registros locais protegidos por AES-GCM;
- chave remota aleatória de 256 bits, independente da senha da plataforma;
- token GitHub e código de sincronização armazenados localmente de forma cifrada;
- token do Google Agenda armazenado localmente de forma cifrada e com duração limitada;
- nenhum campo clínico é publicado em texto legível no GitHub;
- o repositório público contém código, ativos e somente ciphertext no branch de sincronização;
- após tentativas repetidas de senha incorreta, a interface aplica atraso temporário progressivo, sem bloqueio permanente do cofre.

### Limites do modelo

A criptografia protege o conteúdo clínico, mas não substitui a segurança do dispositivo. Malware, perda de credenciais, engenharia social, extensões maliciosas ou comprometimento físico do navegador permanecem riscos externos.

O IndexedDB mantém alguns metadados estruturais fora do ciphertext (`id`, `patientId`, `updatedAt`) para indexação e sincronização. Eles não contêm o conteúdo textual do prontuário, mas podem revelar relações estruturais entre registros em um dispositivo já comprometido.

## Sincronização notebook ↔ celular

A sincronização usa a branch `clinic-sync-data`, fora da publicação do GitHub Pages. O arquivo remoto `.clinic-sync/vault.json` contém um envelope AES-256-GCM cifrado.

Fluxo:

1. alteração é persistida localmente;
2. o banco emite `rm:local-data-changed` somente após concluir a gravação;
3. a fila marca a base como pendente;
4. o motor compara local e remoto;
5. alterações concorrentes são avaliadas por baseline, identificador e `updatedAt`;
6. tombstones preservam exclusões;
7. conflito real nos dois dispositivos bloqueia sobrescrita silenciosa;
8. após reconciliação, a memória e a interface são redesenhadas;
9. o motor mantém polling automático enquanto a aplicação está visível e conectada;
10. o supervisor verifica a saúde da sincronização e força nova tentativa quando não há conclusão recente;
11. falhas transitórias recebem retry progressivo automático, sem sobrescrever conflitos reais.

Na topbar, `Dados ✓` representa o estado da sincronização do cofre entre dispositivos e `Agenda ✓` representa o estado conhecido da integração local com o Google Agenda. Os dois indicadores são exibidos em notebook e celular.

A integração do Google Agenda continua automática para criação, remarcação, cancelamento e alterações recebidas da sincronização. A reconciliação do Google também é acionada após a conclusão da sincronização dos dados, enquanto a autorização OAuth estiver válida.

O código de sincronização deve permanecer guardado separadamente. Se todos os dispositivos e esse código forem perdidos, o cofre remoto não pode ser recuperado apenas a partir do GitHub.

## Agenda

A grade semanal reserva 18 faixas horárias completas, de 06:00 a 23:00. Cada hora mantém 60 px de altura na grade, resultando em 1080 px de área vertical útil e preservando o posicionamento dos compromissos pelo horário real.

### Notebook

- visão semanal de sete dias, preservando o modelo anterior;
- horários visíveis de 06:00 a 23:00;
- cartões compactos com ações sem recorte dos ícones;
- semana anterior, atual e próxima;
- recorrência avulsa, semanal e quinzenal;
- inclusão, edição, remarcação e exclusão;
- confirmação por WhatsApp;
- presença, pagamento e registro integrados;
- primeiro nome/nome preferido nos cartões compactos.

### Celular

A visualização padrão permanece `Dia`, com leitura vertical e alvos de toque maiores. A visualização `Semana` continua disponível quando necessária.

Na visão diária:

- navegação por dia dentro da semana exibida;
- cartões verticais com horário, paciente, estado e modalidade;
- `Confirmar` e `Gerenciar` com alvos de toque adequados;
- `Nova sessão neste dia` preenche a data automaticamente.

Na visão semanal:

- a grade preserva sete colunas com rolagem horizontal controlada;
- a faixa horária completa de 06:00 a 23:00 permanece disponível sem truncamento vertical;
- o componente admite rolagem nos dois eixos quando necessária;
- os cartões mantêm os ícones essenciais integralmente visíveis;
- `Excluir` não fica exposto no cartão compacto em telas pequenas, reduzindo toque destrutivo acidental.

## Google Agenda

A integração é opcional e usa Google Calendar API com OAuth do Google.

Quando conectado, a plataforma:

- cria evento ao cadastrar agendamento;
- atualiza data, horário ou duração;
- remove evento quando o agendamento correspondente é excluído/cancelado;
- reconcilia alterações recebidas pela sincronização entre dispositivos;
- mantém fila local quando a autorização Google expira;
- tenta reenviar após nova autorização.

Os eventos são privados e usam código interno do paciente, sem conteúdo clínico no corpo do evento.

Cada dispositivo autoriza o Google separadamente. O token do notebook não é sincronizado para o celular e vice-versa. Quando a autorização OAuth expira, o Google exige nova autorização do usuário; essa limitação não é contornada pela plataforma.

## Pacientes e organização clínica

As funções existentes permanecem preservadas. A navegação visual foi reduzida a cinco macroáreas:

- Visão geral;
- Clínica;
- Intervenções;
- Documentos;
- Administrativo.

As abas originais continuam existindo internamente e são apenas filtradas pela macroárea, evitando migração de dados ou mudança de rotas clínicas.

O cadastro e o histórico de pacientes encerrados permanecem preservados. Agendamentos na data de encerramento ou posteriores são removidos conforme a regra clínica já existente.

## Minimização de dados

A plataforma deve armazenar somente dados necessários ao cuidado ou à administração legítima da clínica. Campos como CPF, RG, endereço e foto devem ser usados apenas quando houver necessidade concreta. O fato de um campo existir no sistema não torna seu preenchimento obrigatório.

## Financeiro

- total recebido e pendente;
- valor estimado do mês corrente;
- quantidade de sessões previstas;
- comparação mensal entre `Recebido` e `Estimado`;
- sessões incompatíveis com encerramento do paciente não entram na estimativa;
- funcionamento global e individual por paciente.

## Backup

O `.rmvault` permanece o formato restaurável recomendado. Antes de alterações estruturais, deve ser mantido um backup verificável do cofre e uma referência Git conhecida do código funcional.

Branches de referência da série 1.8.x:

- `backup-pre-v1.8.0`: referência de rollback do código anterior à refatoração;
- `refactor-v1.8.0`: refatoração principal;
- `hotfix-v1.8.1-agenda-status`: correção da faixa horária e estados da topbar;
- `hotfix-v1.8.2-agenda-sync`: correção dos cartões, grade móvel integral e supervisão automática da sincronização.

## Diagnóstico e qualidade

- `tests/self-test.html`: teste não destrutivo de navegador, criptografia, IndexedDB temporário, schema, versão, faixa da Agenda, cartões, status da topbar, watchdog e arquivos críticos;
- `.github/workflows/static-integrity.yml`: valida sintaxe JavaScript, imports locais, arquivos referenciados no `index.html`, remoção de patches antigos e consistência de versão;
- nenhuma rotina de teste abre ou altera o banco clínico real.

## Publicação

Código: branch `main`, pasta `/ (root)`, via GitHub Pages.

Cofre sincronizado: branch `clinic-sync-data`, arquivo `.clinic-sync/vault.json`.

Versão de interface: `1.8.2`.