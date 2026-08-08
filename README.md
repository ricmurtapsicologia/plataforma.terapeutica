# Plataforma Clínica Richelmy Murta — v2.0.0

Aplicação clínica local-first publicada em GitHub Pages, com cofre AES-GCM, sincronização cifrada entre dispositivos, Google Agenda e integração controlada com Google Meet/Gemini.

## Princípios da v2

1. O GitHub Pages continua sendo uma aplicação estática.
2. O cofre clínico continua sendo a fonte de verdade dos pacientes, sessões e prontuários.
3. Nenhum segredo OAuth ou conteúdo clínico é publicado no código-fonte.
4. Google Agenda e Google Drive usam uma única autorização Google Workspace por dispositivo.
5. Anotações do Gemini não entram diretamente no prontuário sincronizado.
6. O Gemini alimenta um inbox local cifrado; a plataforma identifica o paciente pelo nome encontrado nas próprias anotações/transcrição e usa data/horário somente como confirmação.
7. O editor do prontuário pode ser preenchido automaticamente, mas o registro só integra o cofre quando o profissional salva ou finaliza.
8. Associação ambígua permanece fora do prontuário.

## Arquitetura

```text
Google Meet
   ↓
Anotações do Gemini no Google Drive
   ↓
Google Workspace OAuth
   ↓
Leitura somente do Drive
   ↓
Inbox clínico local cifrado
   ↓
Identificação nominal do paciente
   ↓
Confirmação por data/horário da sessão
   ↓
Pré-preenchimento do editor de prontuário
   ↓
Revisão profissional
   ↓
Salvar / Finalizar
   ↓
Cofre clínico + sincronização cifrada
```

A integração do Gemini não escreve diretamente em `records`, `appointments`, `patients` ou `settings`. Isso evita que uma varredura do Drive gere alterações concorrentes no cofre notebook ↔ celular.

## Google Workspace

A conexão solicita somente:

- `calendar.events`: sincronização de agenda;
- `drive.readonly`: leitura das Anotações do Gemini.

O token é de curta duração e fica cifrado localmente usando a chave do cofre. Cada dispositivo autoriza o Google separadamente.

### Recepção dos resumos do Gemini

O módulo `assets/js/google-gemini-clinical-inbox-v200.js`:

- procura Google Docs com Anotações do Gemini a partir de 01/06/2026;
- lê o conteúdo somente quando a autorização do Drive está válida;
- busca o nome completo ou nome preferido do paciente no conteúdo do Gemini;
- usa o horário da reunião e a agenda local para corroborar a associação;
- mantém casos ambíguos em quarentena local;
- extrai a síntese e eventuais próximas etapas;
- prepara um rascunho clínico sem acrescentar informações ausentes;
- pré-preenche o editor de `Prontuário` do paciente;
- considera o resumo utilizado apenas depois que um registro é efetivamente salvo no cofre.

O inbox é cifrado em `localStorage` e não faz parte da sincronização clínica. O texto bruto da transcrição completa não é persistido pela plataforma.

## Limitação da aplicação estática

O GitHub Pages não executa código quando a página está fechada. Nesta versão, a plataforma confere novos resumos:

- ao abrir/desbloquear o cofre;
- ao voltar para a aba;
- ao recuperar conexão com a internet;
- periodicamente enquanto a aplicação permanece aberta.

Automação 24/7 com a página fechada exige um worker privado externo. Esse componente deve ser implantado separadamente e nunca receber a chave privada do cofre.

## Organização funcional

A plataforma mantém como núcleos principais:

- Hoje;
- Agenda;
- Pacientes;
- Prontuário e sessões;
- Tarefas e materiais;
- Documentos;
- Financeiro;
- Configurações e integrações.

A IA clínica foi incorporada ao fluxo `Sessão → Prontuário`, em vez de aparecer como uma área independente.

## Benchmarking de produto

A organização da v2 considera padrões de sistemas clínicos profissionais, especialmente:

- agenda integrada a confirmações, recorrência e status;
- ficha única do paciente;
- prontuário conectado à sessão;
- IA como apoio à transcrição, resumo e evolução;
- financeiro vinculado aos atendimentos;
- redução de telas técnicas e exposição de parâmetros de integração.

O objetivo é adotar princípios de ergonomia e fluxo, sem reproduzir componentes proprietários de terceiros.

## Segurança

- PBKDF2-HMAC-SHA256 para derivação da chave local;
- AES-GCM para registros clínicos;
- branch `clinic-sync-data` contém apenas envelope cifrado;
- tokens Google e GitHub ficam cifrados localmente;
- conteúdo do Gemini fica em inbox local cifrado até a revisão;
- o módulo de Gemini não altera automaticamente o cofre;
- conflitos de sincronização continuam bloqueando sobrescrita silenciosa;
- nenhuma rotina de teste acessa dados clínicos reais.

## Arquivos centrais

- `assets/js/database.js` — IndexedDB e persistência cifrada;
- `assets/js/crypto.js` — criptografia;
- `assets/js/secure-sync-v160.js` — sincronização do cofre;
- `assets/js/sync-supervisor-v162.js` — watchdog e recuperação;
- `assets/js/google-calendar-v168.js` — Agenda;
- `assets/js/google-workspace-oauth-v200.js` — autorização Google Workspace;
- `assets/js/google-gemini-clinical-inbox-v200.js` — recepção e pré-preenchimento Gemini;
- `assets/js/modules/patients.js` — ficha e sessões;
- `assets/js/modules/records.js` — prontuário;
- `assets/css/google-clinical-v200.css` — integração clínica Google;
- `tests/self-test.html` — autoteste não destrutivo.

## Publicação

- aplicação: branch `main`, GitHub Pages `/`;
- cofre sincronizado: branch `clinic-sync-data`, `.clinic-sync/vault.json`;
- versão de interface: `2.0.0`.

Antes da v2 foi criada a referência `backup-pre-workspace-clinical-v2`. A implementação foi primeiro validada em `workspace-clinical-v2-staging` antes da publicação na `main`.
