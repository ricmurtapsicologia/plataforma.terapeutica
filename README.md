# Plataforma Clínica Richelmy Murta — v2.4.6

Aplicação clínica local-first em GitHub Pages, com cofre AES-GCM, sincronização cifrada notebook ↔ celular, Google Workspace, Google Agenda e conciliação das Anotações do Google Meet/Gemini com Sessões e Prontuário.

## Objetivo da v2.4.6

A v2.4.6 corrige um bloqueio observado na sincronização notebook ↔ celular: o mesmo documento do Gemini podia gerar `gmappt_<fileId>` e `gmrec_<fileId>` nos dois dispositivos e o SyncManager tratava essas materializações automáticas como conflitos clínicos humanos.

A recuperação de conflitos agora separa duas classes:

1. conflitos automáticos e determinísticos do Gemini;
2. conflitos manuais/reais, que continuam exigindo decisão profissional.

## Conflitos Gemini determinísticos

`sync-conflict-recovery-v240.js` considera um conflito automaticamente conciliável somente quando:

- a entidade é `appointments:gmappt_<fileId>` ou `records:gmrec_<fileId>`;
- local e remoto contêm registros, não exclusões concorrentes;
- os dois lados apontam para o mesmo `fileId`;
- os dois lados apontam para o mesmo paciente;
- prontuários permanecem em `Rascunho IA` e ainda exigem revisão;
- nenhum dos lados está `Finalizado`.

Nesses casos, a versão mais recente pelo relógio do registro é incorporada ao cofre local e a baseline é atualizada apenas para aquelas chaves. Isso elimina falsos conflitos sem transformar prontuários finalizados ou dados manuais em merge automático.

## Conflitos manuais

Qualquer divergência fora dos critérios anteriores permanece bloqueada.

Na tela de Configurações, `Revisar conflito manual` mostra lado a lado:

- este dispositivo;
- cofre remoto;
- paciente;
- data/horário quando aplicável;
- status;
- data de atualização.

O profissional escolhe explicitamente `Manter este dispositivo` ou `Usar remoto`. A aplicação não toma essa decisão por conta própria.

## Identidade Gemini

A associação clínica segue esta ordem:

1. nome completo/nome preferido como participante do Gemini;
2. relação explícita `identificador do Meet (nome)` encontrada nas Anotações;
3. componente isolado do nome somente quando identifica exatamente um paciente ativo;
4. alias aprendido permanece cifrado no catálogo local.

Nenhum nome ou codinome clínico é hardcoded no repositório público.

## Pipeline Gemini

```text
Google Meet
   ↓
Anotações do Gemini no Drive
   ↓
fileId + modifiedTime
   ↓
identificação segura do paciente
   ↓
Sessão Realizada / Presente
   ↓
Prontuário Rascunho IA
   ↓
revisão profissional
```

IDs determinísticos:

- sessão: `gmappt_<fileId>`;
- prontuário: `gmrec_<fileId>`.

Registros finalizados não são sobrescritos e a transcrição integral permanece no Drive.

## Sincronização

`secure-sync-v240.js` permanece como único SyncManager:

- orientado por eventos;
- debounce de 1,6 s;
- heartbeat de 90 s;
- liderança de aba via `BroadcastChannel`;
- um `performSync` por vez;
- conflitos manuais reais continuam bloqueando o merge.

`sync-conflict-recovery-v240.js` é responsável apenas pela recuperação segura de conflitos e não substitui o SyncManager.

## Indicadores

Estado saudável esperado:

```text
Dados ✓   Agenda ✓   Meet ✓
```

Enquanto houver conflito manual:

```text
Dados !   Agenda ✓   Meet pausado
```

O Gemini somente volta a conciliar depois de `Dados ✓`.

## Arquitetura principal

- `assets/js/main-v240.js` — entrypoint único;
- `assets/js/secure-sync-v240.js` — SyncManager;
- `assets/js/sync-conflict-recovery-v240.js` — reconciliação de conflitos;
- `assets/js/google-workspace-oauth-v200.js` — OAuth Google único;
- `assets/js/google-calendar-service-v240.js` — Google Agenda;
- `assets/js/clinical-reconcile-v240.js` — pipeline incremental Gemini;
- `assets/js/gemini-name-token-repair-v245.js` — reparo histórico/identidade;
- `assets/js/top-status-owner-v243.js` — indicador único de Agenda;
- `assets/js/patient-ux-v240.js` — ficha individual do paciente;
- `tests/self-test.html` — autoteste não destrutivo.

## Segurança

- PBKDF2-HMAC-SHA256 + AES-GCM;
- branch `clinic-sync-data` contém somente o cofre cifrado;
- tokens Google/GitHub permanecem cifrados localmente;
- aliases e catálogo Gemini permanecem cifrados no navegador;
- nenhum nome/codinome clínico entra no código público;
- chave do cofre não é enviada ao Google nem ao GitHub;
- conflitos manuais não são resolvidos automaticamente.

## Publicação

- versão: `2.4.6`;
- `SCHEMA_VERSION`: 5, preservado;
- rollback imediato: `backup-pre-gemini-conflict-automerge-v2.4.6`;
- cofre remoto: branch `clinic-sync-data`.
