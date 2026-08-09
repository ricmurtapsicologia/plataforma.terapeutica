# Plataforma Clínica Richelmy Murta — v2.4.3

Aplicação clínica local-first em GitHub Pages, com cofre AES-GCM, sincronização cifrada notebook ↔ celular, Google Workspace, Google Agenda e conciliação das Anotações do Google Meet/Gemini com Sessões e Prontuário.

## Objetivo da v2.4.3

A v2.4.3 corrige duas falhas observadas em produção:

1. aliases/codinomes explícitos do Gemini podiam ser aprendidos de forma incorreta quando o texto vinha como `identificador (nome do paciente)` dentro de uma frase maior;
2. a antiga reclassificação corrigia apenas sessões/prontuários já existentes e não materializava os que estavam ausentes;
3. chips antigos de `Agenda` podiam sobreviver no topo após renderizações/cache anteriores.

## Reparo Gemini v2.4.3

`gemini-repair-v243.js` executa uma correção única por dispositivo depois de `Dados ✓`.

Fluxo:

```text
Drive / Anotações Gemini desde 01/05/2026
        ↓
leitura dos documentos
        ↓
extração dos participantes
        ↓
relação explícita identificador ↔ paciente ativo
        ↓
alias cifrado no catálogo local
        ↓
localização/criação da sessão
        ↓
localização/criação do prontuário Rascunho IA
        ↓
1 evento de sincronização
```

Regras:

- nenhum nome ou alias clínico é hardcoded no repositório público;
- aliases são aprendidos apenas a partir das próprias Anotações do Gemini e dos pacientes ativos do cofre desbloqueado;
- o identificador da fonte continua sendo o `fileId` do documento;
- sessão ausente recebe ID determinístico `gmappt_<fileId>`;
- prontuário ausente recebe ID determinístico `gmrec_<fileId>`;
- sessão materializada fica `Realizada / Presente`;
- prontuário materializado fica `Rascunho IA` e exige revisão profissional;
- registro finalizado não é sobrescrito;
- transcrição integral não é copiada para o prontuário;
- o reparo é idempotente e executa apenas uma vez por dispositivo na versão 2.4.3.

## Prontuário assistido por IA

O conteúdo é estruturado a partir do resumo/anotações do Gemini em:

- foco clínico e evolução da sessão;
- procedimentos técnico-científicos efetivamente descritos;
- resposta do paciente e resultados observados;
- plano terapêutico, tarefas e encaminhamentos.

O prompt `TCC-CFP-v2.4` proíbe inventar diagnóstico, hipótese, técnica, risco, sintoma, fala, resultado ou conduta ausente na fonte. A finalização continua dependendo da revisão profissional.

## Indicadores do topo

`top-status-owner-v243.js` trata `rm-calendar-status-v240` como proprietário único do indicador de Agenda e observa toda a árvore da aplicação. Qualquer outro botão/chip/status cujo texto comece por `Agenda` é removido.

Estado esperado:

```text
Dados ✓   Agenda ✓   Meet ✓
```

## Sincronização

`secure-sync-v240.js` continua sendo o único SyncManager:

- event-driven;
- debounce de 1,6 s;
- heartbeat de 90 s;
- aba líder via `BroadcastChannel`;
- um `performSync` por vez;
- conflitos clínicos reais bloqueiam o merge automático;
- estados técnicos legados do Meet são saneados por `legacy-sync-cleanup-v242.js`.

## Google Workspace

- OAuth único em `google-workspace-oauth-v200.js`;
- Agenda em `google-calendar-service-v240.js`;
- Gemini/Drive em `clinical-reconcile-v240.js`;
- escopos: `calendar.events` e `drive.readonly`.

## Ficha do paciente

Ao abrir um paciente, a lista geral deixa de ser o contexto principal. A ficha individual mantém acesso direto a `Prontuário` e `Gerar prontuário por IA`.

## Segurança

- PBKDF2-HMAC-SHA256 + AES-GCM;
- cofre remoto contém somente envelope cifrado;
- tokens Google/GitHub ficam cifrados localmente;
- catálogo Gemini e aliases ficam cifrados no navegador;
- nomes, aliases e conteúdo clínico não entram no código público;
- chave do cofre não é enviada ao Google nem ao GitHub.

## Arquivos centrais

- `assets/js/main-v240.js` — entrypoint único;
- `assets/js/bootstrap-v240.js` — boot;
- `assets/js/secure-sync-v240.js` — sincronização;
- `assets/js/google-workspace-oauth-v200.js` — OAuth;
- `assets/js/google-calendar-service-v240.js` — Agenda Google;
- `assets/js/top-status-owner-v243.js` — proprietário único do chip Agenda;
- `assets/js/clinical-reconcile-v240.js` — pipeline incremental Gemini;
- `assets/js/gemini-repair-v243.js` — reparo/materialização histórica;
- `assets/js/legacy-sync-cleanup-v242.js` — limpeza de estado técnico antigo;
- `assets/js/patient-ux-v240.js` — ficha individual;
- `tests/self-test.html` — autoteste não destrutivo.

## Publicação

- versão: `2.4.3`;
- `SCHEMA_VERSION`: 5, preservado;
- rollback imediato: `backup-pre-aparecida-gemini-fix-v2.4.3`;
- cofre remoto: branch `clinic-sync-data`.
