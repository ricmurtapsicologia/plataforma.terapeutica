# Plataforma Clínica Richelmy Murta — v2.4.4

Aplicação clínica local-first em GitHub Pages, com cofre AES-GCM, sincronização cifrada notebook ↔ celular, Google Workspace, Google Agenda e conciliação das Anotações do Google Meet/Gemini com Sessões e Prontuário.

## Objetivo da v2.4.4

A v2.4.4 corrige o reparo histórico do Gemini em produção. O catálogo anterior podia carregar aliases aprendidos incorretamente e preservar um Rascunho IA antigo mesmo quando o documento de origem não correspondia mais a paciente ativo.

A rotina `gemini-canonical-repair-v244.js` reconstrói os aliases do zero usando apenas evidência explícita existente nas próprias Anotações do Gemini e os pacientes ativos do cofre desbloqueado.

## Reparo canônico do Gemini

Fluxo:

```text
Anotações Gemini desde 01/05/2026
        ↓
leitura controlada do Drive
        ↓
extração dos participantes
        ↓
reconstrução dos aliases sem reutilizar associações antigas
        ↓
identificação segura do paciente
        ↓
criação/correção da sessão Realizada / Presente
        ↓
criação/correção do prontuário Rascunho IA
        ↓
remoção de materialização automática sem paciente ativo
        ↓
1 evento de sincronização
```

Regras de integridade:

- nenhum nome ou alias clínico é hardcoded no repositório público;
- aliases antigos do catálogo não alimentam a reconstrução v2.4.4;
- paciente é associado somente por nome de participante ou alias explicitamente relacionado a paciente ativo no Gemini;
- sessão ausente recebe ID determinístico `gmappt_<fileId>`;
- prontuário ausente recebe ID determinístico `gmrec_<fileId>`;
- prontuário finalizado não é sobrescrito;
- registro manual sem origem Gemini não é apagado;
- sessão/prontuário automáticos de documento sem paciente ativo podem ser removidos;
- transcrição integral permanece no Drive;
- a correção é idempotente e executa uma vez por dispositivo na v2.4.4.

## Prontuário assistido por IA

Cada sessão segura recebe `Rascunho IA` estruturado a partir do resumo/anotações do Gemini em:

- foco clínico e evolução da sessão;
- procedimentos técnico-científicos efetivamente descritos;
- resposta do paciente e resultados observados;
- plano terapêutico, tarefas e encaminhamentos.

O prompt `TCC-CFP-v2.4` não permite inventar diagnóstico, hipótese, técnica, risco, sintoma, fala, resultado ou conduta ausente na fonte. A finalização exige revisão profissional.

## Indicadores do topo

`top-status-owner-v243.js` mantém `rm-calendar-status-v240` como proprietário único do indicador de Agenda e remove chips redundantes após renderizações.

Estado esperado:

```text
Dados ✓   Agenda ✓   Meet ✓
```

## Sincronização

`secure-sync-v240.js` permanece como único SyncManager:

- orientado por eventos;
- debounce de 1,6 s;
- heartbeat de 90 s;
- aba líder via `BroadcastChannel`;
- um `performSync` por vez;
- conflitos clínicos reais bloqueiam merge automático;
- estados técnicos legados do Meet são saneados por `legacy-sync-cleanup-v242.js`.

## Google Workspace

- OAuth único: `google-workspace-oauth-v200.js`;
- Google Agenda: `google-calendar-service-v240.js`;
- pipeline permanente Gemini/Drive: `clinical-reconcile-v240.js`;
- reparo histórico canônico: `gemini-canonical-repair-v244.js`;
- escopos: `calendar.events` e `drive.readonly`.

## Ficha do paciente

Ao abrir um paciente, a ficha individual é o contexto principal. Há acesso direto a `Prontuário` e `Gerar prontuário por IA`.

## Segurança

- PBKDF2-HMAC-SHA256 + AES-GCM;
- cofre remoto contém somente envelope cifrado;
- tokens Google/GitHub ficam cifrados localmente;
- catálogo Gemini e aliases ficam cifrados no navegador;
- nomes, aliases e conteúdo clínico não entram no código público;
- chave do cofre não é enviada ao Google nem ao GitHub.

## Arquivos centrais

- `assets/js/main-v240.js` — entrypoint único;
- `assets/js/bootstrap-v240.js` — boot resiliente;
- `assets/js/secure-sync-v240.js` — sincronização;
- `assets/js/google-workspace-oauth-v200.js` — OAuth;
- `assets/js/google-calendar-service-v240.js` — Agenda Google;
- `assets/js/top-status-owner-v243.js` — proprietário único do chip Agenda;
- `assets/js/clinical-reconcile-v240.js` — pipeline incremental Gemini;
- `assets/js/gemini-canonical-repair-v244.js` — reconstrução canônica e limpeza de materializações indevidas;
- `assets/js/legacy-sync-cleanup-v242.js` — limpeza de estado técnico antigo;
- `assets/js/patient-ux-v240.js` — ficha individual;
- `tests/self-test.html` — autoteste não destrutivo.

## Publicação

- versão: `2.4.4`;
- `SCHEMA_VERSION`: 5, preservado;
- rollback imediato: `backup-pre-gemini-clean-v2.4.4`;
- cofre remoto: branch `clinic-sync-data`.
