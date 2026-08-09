# Plataforma Clínica Richelmy Murta — v2.4.7

Aplicação clínica local-first em GitHub Pages, com cofre AES-GCM, sincronização cifrada notebook ↔ celular, Google Workspace, Google Agenda e conciliação das Anotações do Google Meet/Gemini com Sessões e Prontuário.

## Objetivo da v2.4.7

A v2.4.7 corrige a etapa final da recuperação de conflitos notebook ↔ celular. Antes, um conflito manual restante bloqueava o SyncManager e fazia conflitos Gemini já conciliados reaparecerem, porque a resolução ocorria apenas localmente e ainda dependia de uma sincronização posterior.

Agora `sync-conflict-recovery-v247.js` publica a resolução parcial diretamente no cofre remoto, preservando os conflitos que ainda exigem decisão humana.

## Política de conflitos

### 1. Gemini equivalente

Conflitos `appointments:gmappt_<fileId>` e `records:gmrec_<fileId>` podem ser conciliados automaticamente quando os dois lados representam semanticamente o mesmo registro. Campos voláteis de sincronização não entram nessa comparação.

### 2. Gemini divergente

Se o mesmo `fileId` tiver diferença de associação, data, status ou conteúdo, a plataforma não decide silenciosamente. Na base confirmada como correta aparece o comando:

`Usar este dispositivo no Gemini (N)`

Esse comando publica no cofre remoto somente os registros determinísticos selecionados a partir deste dispositivo. Prontuários `Finalizado` ficam fora dessa operação.

### 3. Conflitos manuais

IDs não determinísticos, como `appointments:apt_...`, permanecem protegidos. `Revisar conflitos manuais` mostra, para cada registro:

- este dispositivo;
- cofre remoto;
- paciente;
- data/horário;
- status;
- data da atualização.

Cada conflito é resolvido individualmente com `Manter este dispositivo` ou `Usar remoto`.

## Resolução transacional parcial

A recuperação v2.4.7 trabalha em duas imagens:

```text
LOCAL CORRETO                   COFRE REMOTO
      │                              │
      └──────── merge seguro ────────┘
                    │
          conflitos escolhidos
                    │
         ┌──────────┴──────────┐
         │                     │
  snapshot publicado    snapshot local
  conflitos pendentes   conflitos pendentes
  ficam como remoto      ficam como local
         │                     │
         └──── baseline parcial┘
```

Assim, conflitos já resolvidos são efetivamente gravados na branch `clinic-sync-data`, mesmo quando ainda existe outro conflito manual. O SyncManager deixa de reencontrar os mesmos `gmappt_.../gmrec_...` em cada ciclo.

## Gemini e prontuário

- backfill desde 01/05/2026;
- sessão determinística: `gmappt_<fileId>`;
- prontuário determinístico: `gmrec_<fileId>`;
- sessão associada com segurança: `Realizada / Presente`;
- prontuário automático: `Rascunho IA`;
- prontuário finalizado não é sobrescrito;
- transcrição integral permanece no Drive;
- identidade/aliases permanecem cifrados localmente;
- o Gemini fica pausado enquanto houver conflito de Dados.

## Identidade Gemini

A associação segue nome completo/nome preferido, relação explícita `identificador do Meet (nome)` e componente único do nome quando ele identifica apenas um paciente ativo. Nenhum nome ou codinome clínico é hardcoded no repositório público.

## Arquitetura principal

- `assets/js/main-v240.js` — entrypoint único;
- `assets/js/secure-sync-v240.js` — SyncManager event-driven;
- `assets/js/sync-conflict-recovery-v247.js` — resolução parcial publicada diretamente no cofre remoto;
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
- tokens Google/GitHub ficam cifrados localmente;
- a chave do cofre não é enviada ao Google nem ao GitHub;
- prontuários finalizados não entram na resolução automática Gemini;
- conflitos manuais são resolvidos individualmente.

## Publicação

- versão: `2.4.7`;
- `SCHEMA_VERSION`: 5, preservado;
- rollback: `backup-pre-conflict-publish-v2.4.7-final`;
- cofre remoto: branch `clinic-sync-data`.
