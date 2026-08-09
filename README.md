# Plataforma Clínica Richelmy Murta — v2.4.8

Aplicação clínica local-first em GitHub Pages, com cofre AES-GCM, sincronização cifrada notebook ↔ celular, Google Workspace, Google Agenda e conciliação das Anotações do Google Meet/Gemini com Sessões e Prontuário.

## Objetivo da v2.4.8

A v2.4.8 corrige falsos conflitos de sincronização que ainda apareciam na revisão manual quando local e remoto representavam a mesma decisão clínica, mas possuíam timestamps diferentes.

Exemplo real:

```text
Este dispositivo: Excluído em 04:32:43
Cofre remoto:     Excluído em 04:33:59
```

Os dois lados concordam que a entidade está excluída. Isso não exige escolha humana.

## Equivalência semântica

`sync-semantic-conflict-cleanup-v248.js` executa antes da revisão manual e reconhece como equivalentes:

1. a mesma entidade excluída nos dois lados, independentemente do horário do tombstone;
2. entidades manuais presentes nos dois lados cujo conteúdo é idêntico após remover somente campos técnicos voláteis de sincronização.

A rotina não modifica o conteúdo clínico e não escolhe silenciosamente entre dados diferentes. Ela atualiza apenas a baseline local para registrar que aqueles dois estados representam a mesma decisão.

Campos clínicos, paciente, data, horário, status, texto e demais conteúdos permanecem parte da comparação.

## O que continua exigindo revisão humana

Permanecem em `Revisar conflitos manuais`:

- registro existente em um lado e excluído no outro;
- paciente diferente;
- data/horário diferente;
- status diferente;
- conteúdo clínico diferente;
- qualquer outra divergência semântica real.

Cada conflito verdadeiro continua sendo resolvido individualmente com `Manter este dispositivo` ou `Usar remoto`.

## Integração com o Gemini

A política existente é preservada:

- sessão: `gmappt_<fileId>`;
- prontuário: `gmrec_<fileId>`;
- Gemini equivalente pode ser conciliado automaticamente;
- Gemini divergente exige comando explícito na base considerada correta;
- prontuário `Finalizado` não é sobrescrito;
- o Gemini fica pausado enquanto houver conflito real de Dados.

## Identidade Gemini

A associação usa nome completo/nome preferido, relações explícitas encontradas nas próprias Anotações do Gemini e componente único do nome quando ele identifica exatamente um paciente ativo. Nenhum nome ou codinome clínico é hardcoded no repositório público.

## Arquitetura principal

- `assets/js/main-v240.js` — entrypoint único;
- `assets/js/secure-sync-v240.js` — SyncManager event-driven;
- `assets/js/sync-semantic-conflict-cleanup-v248.js` — saneamento de falsos conflitos semanticamente equivalentes;
- `assets/js/sync-conflict-recovery-v247.js` — recuperação transacional dos conflitos reais;
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
- o saneamento v2.4.8 não altera dados clínicos;
- divergências reais continuam bloqueadas para decisão explícita.

## Publicação

- versão: `2.4.8`;
- `SCHEMA_VERSION`: 5, preservado;
- rollback: `backup-pre-semantic-conflicts-v2.4.8`;
- cofre remoto: branch `clinic-sync-data`.
