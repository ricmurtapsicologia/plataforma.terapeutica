# Plataforma Clínica Richelmy Murta — v2.4.0

Aplicação clínica local-first em GitHub Pages, com cofre AES-GCM, sincronização cifrada notebook ↔ celular, Google Workspace, Google Agenda e conciliação das Anotações do Google Meet/Gemini com Sessões e Prontuário.

## Objetivo da v2.4

A v2.4 é uma release de estabilização e reengenharia. O foco é eliminar intermitência causada por múltiplos timers, múltiplos controladores do mesmo DOM, dois mecanismos concorrentes de sincronização e duplicidade de OAuth/Agenda.

Princípio de arquitetura: **um estado deve ter um único proprietário**.

## Arquitetura de boot

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

A página possui fallback visual de inicialização e watchdog de 12 s. Uma falha de bootstrap deixa mensagem explícita em vez de tela vazia.

## Sincronização v2.4

`secure-sync-v240.js` é o único coordenador de sincronização.

- orientada por eventos;
- debounce de 1,6 s para alterações locais;
- heartbeat de segurança de 90 s em vez de polling de 15 s;
- somente um `performSync` simultâneo;
- `BroadcastChannel` com eleição de aba líder;
- nenhuma reconstrução da interface quando o remoto não alterou dados locais;
- `rm:data-patched` informa as stores realmente modificadas;
- conflitos continuam bloqueando merge automático;
- recuperação manual por registro em `sync-conflict-recovery-v240.js`.

Estados: `Dados ✓`, `Dados ↻`, `Dados !` e `Dados •`.

## Renderização

Foi removida a relação antiga `sync concluído → render completo`. Um sync sem mudança atualiza apenas o status. Render integral permanece reservado a navegação ou mudança real de dados.

## Agenda

- `agenda-mobile-v183.js` é o único renderizador mobile;
- `agenda-actions-v240.js` concentra gerenciar, remarcar, presença/ausência/cancelamento, lembrete WhatsApp, pagamento e agendamento por clique no calendário desktop;
- os antigos módulos concorrentes da Agenda foram removidos;
- `google-calendar-service-v240.js` é o único serviço de espelhamento Google.

## Google Workspace

OAuth permanece centralizado em `google-workspace-oauth-v200.js` com `calendar.events` e `drive.readonly`.

`google-calendar-service-v240.js` não possui OAuth próprio. Ele consome exclusivamente o token Workspace cifrado. Sessões futuras e eventos já gerenciados pela plataforma são sincronizados; histórico legado não é recriado automaticamente para evitar duplicidade.

## Google Meet/Gemini

`clinical-reconcile-v240.js` utiliza pipeline incremental:

```text
Drive files.list
      ↓
fileId + modifiedTime
      ↓
novo/modificado?
  ┌───┴───┐
 NÃO      SIM
  ↓        ↓
skip     export
           ↓
      identificar paciente
           ↓
      preparar changeset
           ↓
   escrita em lote IndexedDB
           ↓
      um evento de sync
```

Regras:

- backfill desde `01/05/2026`;
- paciente identificado pelo nome no Gemini, nunca por `PAC-xxx`;
- aliases explicitamente encontrados nas próprias anotações são aprendidos localmente e cifrados;
- concorrência máxima de 2 exports do Drive;
- documento não modificado não é reexportado;
- `fileId` identifica deterministicamente sessão/prontuário;
- sessão segura vira `Realizada / Presente`;
- prontuário vira `Rascunho IA`;
- transcrição integral permanece no Drive;
- registro finalizado não é sobrescrito;
- Gemini pausa em conflito de Dados.

## Timestamps

A v2.4 separa:

- `updatedAt`: relógio de alteração da entidade clínica;
- `source.sourceModifiedAt` / `gemini.sourceModifiedAt`: relógio do documento-fonte.

`gemini-migration-v240.js` corrige registros antigos sem rebaixar `updatedAt` para uma data antiga do Gemini.

## Prontuário assistido por IA

Na ficha individual e em `Paciente → Prontuário` há `Gerar prontuário por IA`.

O prompt `TCC-CFP-v2.4` determina que o rascunho seja sintético e contenha apenas o que estiver sustentado nas Anotações do Gemini: foco/demanda, evolução observável, procedimentos efetivamente descritos, resposta do paciente, decisões, tarefas e encaminhamentos. Não pode inventar diagnóstico, hipótese, técnica, risco, sintoma, fala ou resultado. A finalização exige revisão profissional.

Não há segunda chave de API generativa publicada no GitHub Pages.

## Ficha individual do paciente

`patient-ux-v240.js` reduz exposição de dados e aproxima a UX de sistemas clínicos profissionais:

- lista geral aparece somente sem paciente aberto;
- após selecionar um paciente, a grade geral fica oculta;
- atalhos `Prontuário` e `Gerar prontuário por IA` ficam no contexto do paciente;
- navegação agrupada em Visão geral, Clínica, Intervenções, Documentos e Administrativo;
- `Trocar paciente` retorna à lista.

## Multiaba

A aba líder executa o sync automático; demais abas sinalizam alterações via `BroadcastChannel`. Isso reduz chamadas duplicadas e corrida de escrita no mesmo navegador.

## Service Worker legado

O antigo service worker de popup OAuth foi removido do repositório. `legacy-sw-cleanup-v240.js` apenas desregistra eventual worker antigo ainda instalado no navegador, sem `location.reload()` automático. OAuth usa redirecionamento de página inteira.

## Observabilidade

`runtime-monitor-v240.js` registra somente métricas técnicas em `window.__rmRuntimeMetrics`: renders, ciclos/erros de sync, Calendar e Gemini, erros não tratados e mudanças de rota. Nenhum nome ou conteúdo clínico entra nas métricas.

## Segurança

- PBKDF2-HMAC-SHA256 + AES-GCM;
- `clinic-sync-data` contém somente envelope cifrado;
- tokens Google/GitHub cifrados localmente;
- catálogo Gemini cifrado localmente;
- nomes e conteúdo clínico não entram no código público;
- registro finalizado não é sobrescrito;
- conflito pausa a conciliação;
- chave do cofre não é enviada ao Google nem ao GitHub.

## Arquivos centrais

- `assets/js/main-v240.js` — entrypoint único;
- `assets/js/bootstrap-v240.js` — boot resiliente;
- `assets/js/secure-sync-v240.js` — SyncManager event-driven e multiaba;
- `assets/js/sync-conflict-recovery-v240.js` — recuperação manual de conflitos;
- `assets/js/google-workspace-oauth-v200.js` — OAuth único Workspace;
- `assets/js/google-calendar-service-v240.js` — Google Agenda;
- `assets/js/clinical-reconcile-v240.js` — pipeline incremental Gemini;
- `assets/js/gemini-migration-v240.js` — migração segura de timestamps;
- `assets/js/agenda-mobile-v183.js` — renderizador mobile;
- `assets/js/agenda-actions-v240.js` — ações da Agenda;
- `assets/js/patient-ux-v240.js` — contexto individual;
- `assets/js/workspace-status-v240.js` — indicador Meet;
- `assets/js/runtime-monitor-v240.js` — observabilidade técnica;
- `tests/self-test.html` — autoteste não destrutivo.

## Código legado removido na v2.4

Preservado para rollback na branch `backup-pre-stability-refactor-v2.4`, mas removido da nova linha principal:

- `bootstrap-v151.js`;
- `secure-sync-v160.js`;
- `sync-supervisor-v162.js`;
- `google-calendar-v168.js`;
- `clinical-reconcile-v230.js`;
- `gemini-migration-v230.js`;
- `optimization-v180.js`;
- `agenda-enhancements-v152.js`;
- `agenda-tools-v162.js`;
- `workspace-status-v220.js`;
- `sync-conflict-recovery-v220.js`;
- `sw-coop-register-v165.js`;
- `sw.js`.

## CI

`Static integrity` valida:

1. sintaxe de todos os JavaScript;
2. imports locais;
3. assets do `index.html`;
4. entrypoint único;
5. ausência dos módulos concorrentes no index;
6. heartbeat/aba líder do SyncManager;
7. ausência de OAuth no serviço de Agenda;
8. incrementalidade e `sourceModifiedAt` no Gemini;
9. consistência da versão.

## Limitação do GitHub Pages

A aplicação não executa com todos os navegadores fechados. Resumos novos são conciliados na próxima abertura/retomada depois de `Dados ✓`. Automação 24/7 exigiria worker privado externo sem acesso à chave do cofre.

## Publicação

- aplicação: `main` / GitHub Pages;
- cofre remoto: `clinic-sync-data/.clinic-sync/vault.json`;
- versão: `2.4.0`;
- `SCHEMA_VERSION`: 5, preservado;
- rollback: `backup-pre-stability-refactor-v2.4`.
