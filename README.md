# Plataforma Clínica Richelmy Murta — v2.4.0

Aplicação clínica local-first em GitHub Pages, com cofre AES-GCM, sincronização cifrada notebook ↔ celular, Google Workspace, Google Agenda e conciliação das Anotações do Google Meet/Gemini com Sessões e Prontuário.

## Objetivo da v2.4

A v2.4 é uma release de estabilização e reengenharia. O foco é eliminar intermitência causada por múltiplos timers, múltiplos controladores do mesmo DOM, dois mecanismos concorrentes de sincronização e duplicidade de OAuth/Agenda.

Princípio de arquitetura:

> Um estado deve ter um único proprietário.

## Arquitetura de boot

`index.html` possui apenas um entrypoint JavaScript:

```text
index.html
   ↓
main-v240.js
   ↓
serviços e UX em ordem controlada
   ↓
bootstrap-v240.js
   ↓
cofre → dados → interface
```

A página possui fallback visual de inicialização. Se o bootstrap não concluir em tempo razoável, o usuário recebe mensagem explícita em vez de uma tela vazia.

## Sincronização v2.4

`secure-sync-v240.js` substitui o antigo conjunto `secure-sync-v160 + sync-supervisor-v162` como coordenador único.

Características:

- orientada por eventos;
- debounce para alteração local;
- heartbeat de segurança de 90 s, em vez de polling agressivo de 15 s;
- somente uma sincronização simultânea;
- `BroadcastChannel` e eleição de aba líder para evitar dois motores de sync no mesmo navegador;
- nenhuma reconstrução da interface quando o cofre remoto não alterou os dados locais;
- `rm:data-patched` informa quais stores realmente mudaram;
- conflito continua bloqueando merge automático;
- recuperação controlada por registro permanece disponível.

Estados:

- `Dados ✓` — sincronizado;
- `Dados ↻` — sincronizando;
- `Dados !` — erro/conflito;
- `Dados •` — pendente/configuração necessária.

## Renderização

A v2.4 remove a relação antiga:

```text
sync concluído → render completo da aplicação
```

Agora um ciclo de sync sem alteração modifica somente o chip de status. Render completo é reservado para mudanças reais de dados ou ações de navegação.

## Agenda

A Agenda passa a ter um único renderizador mobile: `agenda-mobile-v183.js`.

As ações clínicas/administrativas foram consolidadas em `agenda-actions-v240.js`:

- gerenciar sessão;
- remarcar;
- presença/ausência/cancelamento;
- lembrete WhatsApp;
- pagamento;
- abertura do registro da sessão.

As camadas antigas que simultaneamente modificavam a Agenda deixam de ser carregadas pelo entrypoint.

## Google Workspace

OAuth continua centralizado em `google-workspace-oauth-v200.js` com os escopos:

- `calendar.events`;
- `drive.readonly`.

`google-calendar-service-v240.js` não possui OAuth próprio. Ele consome exclusivamente o token Workspace cifrado no dispositivo. Isso elimina o estado inconsistente em que Agenda e Meet utilizavam autorizações diferentes.

O serviço de Agenda cria/atualiza compromissos futuros e eventos que já pertencem à plataforma. O histórico legado não é recriado automaticamente, evitando duplicação com eventos antigos já existentes no Google Agenda.

## Google Meet/Gemini

`clinical-reconcile-v240.js` substitui a conciliação v2.3.

Fluxo:

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
   1 lote IndexedDB
           ↓
      1 evento de sync
```

Características:

- backfill desde `01/05/2026`;
- associação pelo nome encontrado no Gemini, nunca por `PAC-xxx`;
- alias explicitamente aprendido das próprias anotações e armazenado cifrado;
- fila de leitura com concorrência máxima de 2 documentos;
- documentos estáveis não são reexportados;
- `fileId` continua sendo identidade determinística;
- sessão é marcada `Realizada / Presente` quando a associação é segura;
- prontuário é criado como `Rascunho IA`;
- transcrição integral permanece no Drive;
- registros finalizados não são sobrescritos.

## Timestamps e sincronização

A v2.4 separa o relógio clínico do relógio da fonte.

- `updatedAt`: relógio de alteração da entidade no cofre;
- `source.sourceModifiedAt` / `gemini.sourceModifiedAt`: momento em que o documento Gemini foi modificado.

A migração `gemini-migration-v240.js` corrige registros antigos para que o `modifiedTime` do Gemini não rebaixe silenciosamente o `updatedAt` de uma entidade clínica.

## Prontuário assistido por IA

Na ficha individual e em `Paciente → Prontuário` existe `Gerar prontuário por IA`.

O prompt clínico `TCC-CFP-v2.4` exige:

1. foco/demanda da sessão;
2. evolução clínica observável;
3. procedimentos técnico-científicos efetivamente descritos;
4. resposta do paciente;
5. decisões, tarefas e encaminhamentos;
6. nenhuma invenção de diagnóstico, técnica, risco, sintoma, fala ou resultado ausente;
7. nenhuma transcrição integral;
8. revisão profissional obrigatória antes da finalização.

A v2.4 continua usando o conteúdo produzido pelo Gemini como fonte; não publica chave de uma segunda API generativa no GitHub Pages.

## Ficha individual do paciente

`patient-ux-v240.js` mantém a lista geral apenas enquanto nenhum paciente está aberto.

Quando um paciente é selecionado:

- a grade com todos os pacientes deixa de ficar visível;
- a ficha individual vira o contexto principal;
- aparecem atalhos `Prontuário` e `Gerar prontuário por IA`;
- a navegação é agrupada em Visão geral, Clínica, Intervenções, Documentos e Administrativo;
- `Trocar paciente` volta para a lista.

## Multiaba

A sincronização usa `BroadcastChannel` para eleger uma aba líder. Apenas a aba líder executa sincronização automática. Alterações feitas em outra aba sinalizam a líder, reduzindo corrida de escrita e chamadas duplicadas ao GitHub.

## Service Worker legado

O antigo service worker usado para contornar popup OAuth não é mais registrado. `legacy-sw-cleanup-v240.js` remove registros antigos de `sw.js` sem executar reload automático. O OAuth atual usa redirecionamento de página inteira.

## Observabilidade

`runtime-monitor-v240.js` registra somente métricas técnicas, nunca dados clínicos:

- renders;
- ciclos de sync;
- erros de sync;
- ciclos Calendar;
- ciclos Gemini;
- erros não tratados;
- mudanças de rota.

Disponível em runtime por `window.__rmRuntimeMetrics` para diagnóstico local.

## Segurança

- PBKDF2-HMAC-SHA256 + AES-GCM;
- `clinic-sync-data` contém somente envelope cifrado;
- tokens Google/GitHub cifrados localmente;
- catálogo Gemini cifrado localmente;
- nomes e conteúdo clínico não entram no código público;
- registro finalizado não é sobrescrito;
- conflito pausa a conciliação;
- nenhuma chave do cofre é enviada ao Google ou ao GitHub.

## Arquivos centrais v2.4

- `assets/js/main-v240.js` — entrypoint único;
- `assets/js/bootstrap-v240.js` — boot resiliente;
- `assets/js/secure-sync-v240.js` — SyncManager event-driven e multiaba;
- `assets/js/google-workspace-oauth-v200.js` — OAuth único Workspace;
- `assets/js/google-calendar-service-v240.js` — serviço Google Agenda;
- `assets/js/clinical-reconcile-v240.js` — pipeline incremental Gemini;
- `assets/js/gemini-migration-v240.js` — correção segura de timestamps antigos;
- `assets/js/agenda-mobile-v183.js` — único renderizador mobile da Agenda;
- `assets/js/agenda-actions-v240.js` — ações da Agenda;
- `assets/js/patient-ux-v240.js` — contexto individual do paciente;
- `assets/js/workspace-status-v240.js` — indicador Meet orientado por eventos;
- `assets/js/runtime-monitor-v240.js` — métricas técnicas;
- `assets/js/sync-conflict-recovery-v220.js` — recuperação manual de conflitos;
- `tests/self-test.html` — autoteste não destrutivo.

## Código legado não carregado

A v2.4 deixa de carregar no runtime:

- `sync-supervisor-v162.js`;
- `google-calendar-v168.js`;
- `clinical-reconcile-v230.js`;
- `gemini-migration-v230.js`;
- `optimization-v180.js`;
- `agenda-enhancements-v152.js`;
- `agenda-tools-v162.js`;
- `workspace-status-v220.js`;
- `sw-coop-register-v165.js`.

Esses arquivos podem ser removidos definitivamente após homologação da v2.4; a branch `backup-pre-stability-refactor-v2.4` preserva o estado anterior para rollback.

## Limitação do GitHub Pages

A aplicação não executa com todos os navegadores fechados. Resumos Gemini novos serão conciliados na próxima abertura/retomada depois de `Dados ✓`. Automação 24/7 exigiria um worker privado externo sem acesso à chave do cofre.

## Publicação

- aplicação: `main` / GitHub Pages;
- cofre remoto: `clinic-sync-data/.clinic-sync/vault.json`;
- versão: `2.4.0`;
- `SCHEMA_VERSION`: 5, preservado;
- rollback: `backup-pre-stability-refactor-v2.4`.
