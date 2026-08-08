# Plataforma Clínica Richelmy Murta — v2.1.0

Aplicação clínica local-first publicada em GitHub Pages, com cofre AES-GCM, sincronização cifrada entre dispositivos, Google Agenda e integração automática com Google Meet/Gemini.

## v2.1 — Meet/Gemini → Agenda → Prontuário

A partir desta versão, as Anotações do Gemini deixam de funcionar apenas como um inbox de pré-visualização e passam a alimentar o fluxo clínico da plataforma.

```text
Google Meet
   ↓
Anotações do Gemini no Google Drive
   ↓
Google Workspace OAuth
   ↓
identificação do paciente pelo nome do participante
   ↓
confirmação por data/horário
   ↓
Sessão da Agenda da plataforma
   ↓
Rascunho IA no Prontuário
   ↓
revisão profissional
   ↓
Finalizado
```

### Regras de importação

- backfill automático a partir de `01/06/2026`;
- procura o nome do paciente nas próprias Anotações/Transcrição do Gemini;
- não utiliza `PAC-xxx` para identificar o paciente;
- data e horário servem como confirmação da associação;
- nome completo do participante tem prioridade;
- primeiro nome somente é aceito quando é único no cofre e existe uma sessão próxima no mesmo dia;
- associação ambígua permanece em quarentena;
- sessão já existente é marcada como `Realizada` e `Presente` quando a correspondência é segura;
- se não existir sessão local, é criada uma sessão histórica com a data/hora do Meet;
- sessão cancelada ou desmarcada não é reativada silenciosamente;
- cada resumo produz um registro `Rascunho IA` vinculado à sessão;
- registro finalizado nunca é sobrescrito pelo Gemini;
- rascunho editado após a versão do Gemini não é sobrescrito automaticamente;
- a revisão/finalização atualiza o mesmo registro, evitando duplicação.

### Idempotência e sincronização

Os IDs são derivados do `fileId` do documento Gemini:

- sessão: `gmappt_<fileId>`;
- prontuário: `gmrec_<fileId>`.

Isso permite que notebook e celular encontrem o mesmo documento sem gerar duas sessões ou dois prontuários.

O backfill é persistido em lote e não dispara a criação de eventos históricos duplicados no Google Agenda. Após a importação, a sincronização cifrada do cofre é acionada uma única vez.

## Estrutura do Rascunho IA

O texto do Gemini é convertido para uma evolução clínica sintética, sem adicionar informação ausente:

1. `Foco e evolução da sessão`;
2. `Intervenções e conteúdos trabalhados`;
3. `Orientações, tarefas ou encaminhamentos`.

O nome do paciente é neutralizado no texto gerado e o nome do profissional é substituído por `Profissional` quando necessário. A transcrição integral não é armazenada no cofre pela integração.

No Prontuário, registros `Rascunho IA` recebem ação `Revisar IA`. Durante a revisão, salvar ou finalizar atualiza o mesmo registro.

## Google Workspace

A plataforma utiliza uma única autorização Google por dispositivo para:

- `calendar.events`: sincronização da agenda;
- `drive.readonly`: leitura das Anotações do Gemini.

O token é de curta duração e fica cifrado localmente com a chave do cofre. Nenhuma chave OAuth é publicada no código-fonte.

Se o OAuth estiver autorizado mas a leitura do Gemini falhar com `403`, a integração diferencia falta de escopo de `Google Drive API` desabilitada no projeto e apresenta o acesso direto para ativação da API.

## Indicadores no cabeçalho

A topbar passa a mostrar três estados operacionais:

- `Dados ✓` — cofre notebook ↔ celular;
- `Agenda ✓` — Google Agenda;
- `Meet ✓` — leitura do Meet/Gemini.

Estados transitórios usam `↻`; falhas usam `!`.

No celular, o relógio é ocultado quando necessário para preservar os três indicadores sem quebrar a largura da tela.

## Limite da aplicação estática

GitHub Pages não executa JavaScript com a página completamente fechada. Por isso, novos documentos são processados:

- ao abrir/desbloquear o cofre;
- ao retornar à aba;
- ao recuperar internet;
- a cada cinco minutos enquanto a plataforma estiver aberta.

Se uma sessão ocorrer com a plataforma fechada, o resumo será capturado automaticamente na próxima abertura. Automação 24/7 com o dispositivo desligado exigirá um worker privado externo, sem acesso à chave do cofre.

## Organização funcional e benchmarking

A arquitetura permanece centrada em cinco macroáreas na ficha do paciente, seguindo princípios de ergonomia observados em sistemas clínicos profissionais como o PsicoManager, sem copiar componentes proprietários:

- Visão geral;
- Clínica;
- Intervenções;
- Documentos;
- Administrativo.

A IA não ganha uma tela clínica independente: ela entra no fluxo `Sessão → Prontuário`, reduzindo cliques e mantendo a ficha do paciente como contexto principal.

## Segurança

- PBKDF2-HMAC-SHA256 para derivação da chave local;
- AES-GCM para registros clínicos;
- branch `clinic-sync-data` contém apenas envelope cifrado;
- tokens Google e GitHub ficam cifrados localmente;
- conteúdo bruto do Gemini não é publicado no GitHub;
- registros finalizados não são alterados automaticamente;
- conflitos reais continuam bloqueando sobrescrita silenciosa;
- testes não abrem nem modificam o banco clínico real.

## Arquivos centrais

- `assets/js/database.js` — IndexedDB e persistência cifrada;
- `assets/js/crypto.js` — criptografia;
- `assets/js/secure-sync-v160.js` — sincronização do cofre;
- `assets/js/sync-supervisor-v162.js` — watchdog;
- `assets/js/google-calendar-v168.js` — Agenda;
- `assets/js/google-workspace-oauth-v200.js` — autorização Workspace;
- `assets/js/google-gemini-clinical-v210.js` — backfill e importação automática;
- `assets/js/ai-record-review-v210.js` — revisão e finalização do Rascunho IA;
- `assets/js/workspace-status-v210.js` — indicador Meet;
- `assets/css/google-clinical-v210.css` — apresentação da integração;
- `tests/self-test.html` — autoteste não destrutivo.

## Publicação

- aplicação: branch `main`, GitHub Pages `/`;
- cofre sincronizado: branch `clinic-sync-data`, `.clinic-sync/vault.json`;
- versão de interface: `2.1.0`.

Referências de segurança existentes: `backup-pre-workspace-clinical-v2` e `backup-pre-gemini-autofill-v2.1` (criada antes da promoção da v2.1 para `main`).
