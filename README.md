# Plataforma Clínica Richelmy Murta — v2.4.1

Aplicação clínica local-first em GitHub Pages, com cofre AES-GCM, sincronização cifrada notebook ↔ celular, Google Workspace, Google Agenda e conciliação das Anotações do Google Meet/Gemini com Sessões e Prontuário.

## Objetivo da v2.4.1

A v2.4.1 é um hotfix de integridade clínica sobre a arquitetura estável da v2.4. O foco é corrigir associações históricas do Gemini quando o participante usa nome, apelido, conta comercial ou outro identificador diferente do nome cadastrado na plataforma, sem publicar aliases ou nomes de pacientes no repositório.

Princípio: **a identidade clínica é inferida apenas por evidência disponível nas próprias Anotações do Gemini e pelos pacientes ativos do cofre desbloqueado**.

## Arquitetura preservada

```text
index.html
   ↓
main-v240.js                ← único entrypoint
   ↓
serviços e UX em ordem controlada
   ↓
bootstrap-v240.js
   ↓
cofre → dados → interface
```

A v2.4.1 mantém o SyncManager event-driven, aba líder por `BroadcastChannel`, Agenda mobile com renderizador único, OAuth Google Workspace único e pipeline incremental do Gemini.

## Reclassificação histórica do Gemini

`gemini-reclassify-v241.js` executa uma correção única por dispositivo, somente depois de `Dados ✓` e com Google Workspace autorizado.

Fluxo:

```text
Anotações Gemini desde 01/05/2026
        ↓
leitura controlada do Drive
        ↓
identificação dos participantes
        ↓
relação explícita "identificador (nome)"
        ↓
alias cifrado localmente
        ↓
reclassificação do catálogo
        ↓
correção de Sessões/Prontuários automáticos
        ↓
reconciliação normal v2.4
```

Regras de segurança:

- nenhum alias clínico é escrito no código público;
- aliases aprendidos ficam no catálogo Gemini cifrado no navegador;
- paciente é considerado somente se estiver ativo no cofre;
- documentos sem paciente ativo permanecem fora do prontuário clínico;
- registros manuais sem origem Gemini não são apagados;
- sessão/prontuário claramente criados automaticamente por um documento Gemini não clínico podem ser removidos;
- vínculos automáticos antigos com paciente incorreto são corrigidos usando o `fileId` do documento como identidade estável;
- data/hora são obtidas do título das Anotações e normalizadas para o horário cheio mais próximo;
- a correção é idempotente e marcada localmente após execução.

## Google Meet/Gemini

`clinical-reconcile-v240.js` continua sendo o pipeline permanente e incremental.

- backfill desde `01/05/2026`;
- paciente identificado pelo nome/alias encontrado no Gemini, nunca por `PAC-xxx`;
- `fileId` identifica deterministicamente sessão/prontuário;
- documento não modificado é ignorado após classificação estável;
- concorrência máxima de 2 exports do Drive;
- sessão segura vira `Realizada / Presente`;
- prontuário vira `Rascunho IA`;
- transcrição integral permanece no Drive;
- registro finalizado não é sobrescrito pelo pipeline normal;
- Gemini pausa durante conflito de Dados.

## Prontuário assistido por IA

Na ficha individual e em `Paciente → Prontuário` há `Gerar prontuário por IA`.

O prompt `TCC-CFP-v2.4` exige registro sintético, baseado exclusivamente no resumo/anotações do Gemini, contendo somente foco/demanda, evolução observável, procedimentos efetivamente descritos, resposta do paciente, decisões, tarefas e encaminhamentos. Não pode inventar diagnóstico, hipótese, técnica, risco, sintoma, fala ou resultado. A finalização exige revisão profissional.

## Agenda

- `agenda-mobile-v183.js` é o único renderizador mobile;
- `agenda-actions-v240.js` concentra gerenciar, remarcar, presença/ausência/cancelamento, WhatsApp, pagamento e ações do calendário;
- `google-calendar-service-v240.js` é o único serviço de espelhamento Google;
- OAuth permanece centralizado em `google-workspace-oauth-v200.js` com `calendar.events` e `drive.readonly`.

## Sincronização

`secure-sync-v240.js` é o único coordenador de sincronização.

- debounce de 1,6 s para alterações locais;
- heartbeat de segurança de 90 s;
- somente um `performSync` simultâneo;
- eleição de aba líder;
- sync sem mudança não reconstrói a interface;
- conflitos continuam bloqueando merge automático;
- recuperação manual permanece em `sync-conflict-recovery-v240.js`.

## Timestamps

- `updatedAt`: relógio da entidade clínica;
- `source.sourceModifiedAt` / `gemini.sourceModifiedAt`: relógio da fonte Gemini.

Essa separação impede que um documento antigo do Drive reduza a prioridade temporal de uma alteração clínica mais recente.

## Ficha individual do paciente

`patient-ux-v240.js` mantém a lista geral apenas quando nenhum paciente está aberto. Ao selecionar um paciente, a ficha individual vira o contexto principal, com acesso direto a Prontuário e `Gerar prontuário por IA`.

## Segurança

- PBKDF2-HMAC-SHA256 + AES-GCM;
- `clinic-sync-data` contém somente envelope cifrado;
- tokens Google/GitHub cifrados localmente;
- catálogo Gemini e aliases cifrados localmente;
- nomes, aliases e conteúdo clínico não entram no código público;
- chave do cofre não é enviada ao Google nem ao GitHub;
- conflito pausa a conciliação.

## Arquivos centrais

- `assets/js/main-v240.js` — entrypoint único;
- `assets/js/bootstrap-v240.js` — boot resiliente;
- `assets/js/secure-sync-v240.js` — SyncManager event-driven e multiaba;
- `assets/js/google-workspace-oauth-v200.js` — OAuth único Workspace;
- `assets/js/google-calendar-service-v240.js` — Google Agenda;
- `assets/js/clinical-reconcile-v240.js` — pipeline incremental Gemini;
- `assets/js/gemini-migration-v240.js` — migração segura de timestamps;
- `assets/js/gemini-reclassify-v241.js` — reclassificação histórica de aliases/vínculos automáticos;
- `assets/js/agenda-mobile-v183.js` — renderizador mobile;
- `assets/js/agenda-actions-v240.js` — ações da Agenda;
- `assets/js/patient-ux-v240.js` — contexto individual;
- `assets/js/workspace-status-v240.js` — indicador Meet;
- `assets/js/runtime-monitor-v240.js` — observabilidade técnica;
- `tests/self-test.html` — autoteste não destrutivo.

## CI

`Static integrity` valida sintaxe JavaScript, imports locais, assets do index, entrypoint único, invariantes de Sync/Google/Gemini e consistência da versão.

## Publicação

- aplicação: `main` / GitHub Pages;
- versão: `2.4.1`;
- `SCHEMA_VERSION`: 5, preservado;
- rollback imediato: `backup-pre-gemini-alias-fix-v2.4.1`;
- backup arquitetural anterior: `backup-pre-stability-refactor-v2.4`.
