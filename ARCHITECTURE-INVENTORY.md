# Plataforma Clínica 3.3 — Inventário arquitetural

Data de consolidação: 2026-08-26

## Princípios

1. Uma fonte canônica por entidade clínica.
2. Um proprietário por integração e por fluxo operacional crítico.
3. Dados clínicos nunca usam GitHub como storage.
4. IA/Gemini produz apoio documental; a decisão e finalização permanecem profissionais.
5. Reparos históricos são condicionais ou transitórios, não runtimes permanentes.
6. Falha de integração externa não bloqueia a operação clínica local.
7. A Agenda possui um único proprietário operacional: `agenda-controller-v330.js`.

## Fontes canônicas

| Entidade | Fonte canônica | Projeção/integração |
|---|---|---|
| Paciente | Cofre clínico local cifrado | Drive appDataFolder como cópia sincronizada cifrada |
| Sessão clínica | Cofre clínico local cifrado | Google Calendar como projeção externa |
| Prontuário | Cofre clínico local cifrado | Drive appDataFolder como cópia sincronizada cifrada |
| Documento Meet/Gemini | Google Drive | Evidência documental para rascunho clínico |
| Financeiro | Cofre clínico local cifrado | Nenhuma fonte externa canônica |
| Preferências | Storage local protegido/cofre | — |
| Código | GitHub | GitHub Pages |

## Componentes ativos de boot — v3.3.0

| Componente | Classe | Proprietário | Estado |
|---|---|---|---|
| platform-runtime-v300.js | CORE/UX/OBSERVABILITY | Plataforma | CANÔNICO |
| migration-router-v300.js | MIGRATION ROUTER | Plataforma | CANÔNICO; carrega reparos somente sob condição |
| google-workspace-oauth-v200.js | INTEGRATION | Google Workspace | CANÔNICO |
| google-workspace-auto-renew-v264.js | INTEGRATION | Google Workspace | CANÔNICO |
| calendar-adapter-v300.js | INTEGRATION | Calendar | PROPRIETÁRIO ÚNICO DE BOOT |
| gemini-sharing-guard-v250.js | SECURITY | Gemini | CANÔNICO |
| public-clinical-storage-guard-v251.js | SECURITY | Storage | CANÔNICO |
| clinical-reconcile-v270.js | INTEGRATION/CLINICAL | Gemini | PROPRIETÁRIO ÚNICO |
| gemini-historical-identity-repair-v272.js | REPAIR/SAFETY | Gemini | ATIVO enquanto existirem identidades históricas |
| ai-record-review-v220.js | CLINICAL/SAFETY | Prontuário | CANÔNICO |
| agenda-mobile-v183.js | UX | Agenda | VIEW MOBILE; sem propriedade das ações clínicas |
| session-payment-visibility-v322.js | DOMAIN/UX | Financeiro | SERVIÇO DE PAGAMENTO; não captura ações da Agenda |
| agenda-controller-v330.js | DOMAIN/UX/PERSISTENCE | Agenda | PROPRIETÁRIO ÚNICO DAS AÇÕES DE SESSÃO |
| portable-tools-v153.js | UX | Plataforma | ATIVO |
| sync-semantic-conflict-cleanup-v260.js | SYNC/SAFETY | Sync | ATIVO; atua apenas em conflito real |
| patient-closure-v172.js | DOMAIN | Paciente | ATIVO |
| version-v170.js | UX | Release | ATIVO |
| material-share-v162.js | DOMAIN/UX | Materiais | ATIVO |
| mobile-ux-v170.js | UX | Mobile | ATIVO |
| patient-ux-v240.js | UX | Paciente | ATIVO |
| record-persistence-v320.js | CLINICAL/PERSISTENCE | Prontuário | CANÔNICO |
| treatment-plan-intelligence-v320.js | CLINICAL | Plano terapêutico | CANÔNICO |
| patient-delivery-finance-v320.js | DOMAIN/INTEGRATION | Entregas/Financeiro | CANÔNICO |
| patient-workspace-v320.js | UX | Paciente | CANÔNICO |
| clinical-orchestrator-v320.js | ORCHESTRATION | Ecossistema clínico | CANÔNICO |

## Agenda v3.3 — contrato operacional

A partir da v3.3.0, a sessão é uma unidade clicável no desktop e no mobile.

O cartão exibe:

- paciente;
- horário;
- situação da sessão/presença;
- situação de pagamento.

Ações clínicas não são mais apresentadas como sequência de microbotões coloridos. `WA`, `R`, `•••`, `×` e a injeção posterior de remarcação deixaram de fazer parte da view canônica.

O evento canônico é `data-action="appointment-open"`. O controlador `agenda-controller-v330.js` concentra:

- abertura da sessão;
- presença (`Presente`, `Faltou`, `Desmarcou`);
- remarcação;
- vínculo financeiro;
- WhatsApp;
- abertura do atendimento;
- exclusão com confirmação.

Alterações de presença e remarcação são gravadas cifradas e lidas novamente do IndexedDB antes de a interface informar sucesso. Exclusões usam `deleteRecord`, preservando tombstones necessários à sincronização.

## Componentes encapsulados/condicionais

| Componente | Proprietário | Política |
|---|---|---|
| google-calendar-service-v240.js | calendar-adapter-v300.js | interno do adapter |
| calendar-integrity-v274.js | calendar-adapter-v300.js | interno do adapter |
| calendar-reverse-reconcile-v275.js | calendar-adapter-v300.js | interno do adapter |
| gemini-materialization-integrity-v273.js | platform-runtime-v300.js | importado somente se o marcador `done` estiver ausente |
| legacy-sync-cleanup-v262.js | migration-router-v300.js | importado somente quando houver estado legado detectável ou conflito |

## Componentes retirados do boot permanente

- runtime-monitor-v240.js — absorvido por `platform-runtime-v300.js`;
- legacy-sw-cleanup-v240.js — absorvido como migração persistente one-shot;
- browser-fixes-v153.js — absorvido por `platform-runtime-v300.js`;
- top-status-owner-v243.js — absorvido por `platform-runtime-v300.js`;
- workspace-status-v240.js — absorvido por `platform-runtime-v300.js`;
- gemini-materialization-integrity-v273.js — passou a carregamento condicional;
- legacy-sync-cleanup-v262.js — passou a carregamento condicional;
- google-calendar-service-v240.js, calendar-integrity-v274.js e calendar-reverse-reconcile-v275.js — pertencem ao `CalendarAdapter`;
- agenda-actions-v240.js — retirado do boot na v3.3.0; sua propriedade operacional foi substituída por `agenda-controller-v330.js`.

## Componentes legados proibidos no boot

- clinical-reconcile-v240.js
- gemini-autodelivery-v264.js
- gemini-alias-continuity-v263.js
- gemini-name-token-repair-v245.js
- gemini-migration-v240.js
- gemini-attendance-repair-v249.js
- sync-conflict-recovery-v247.js
- legacy-sync-cleanup-v242.js
- agenda-actions-v240.js

O workflow `Static integrity` falha caso o antigo proprietário da Agenda retorne ao entrypoint.

## Identidade canônica de sessão

A v3 mantém `clinicalSessionId`.

Regra de migração:

1. appointment existente recebe `clinicalSessionId = appointment.id`;
2. record recebe o ID somente se já houver vínculo explícito por `appointmentId` ou pelo mesmo `source.fileId`;
3. a gravação da migração usa lote cifrado atômico com verificação (`bulkPutEncryptedAtomic(..., {verify:true})`);
4. nenhuma associação nova é criada por nome, semelhança textual ou proximidade de horário;
5. o reconciliador Gemini mantém revisão humana para ambiguidades.

## UX do psicólogo

O workspace do paciente permanece organizado em 6 grupos:

- Principal
- Sessões
- Clínica
- Tratamento
- Recursos
- Administração

Na Agenda, o mesmo controlador é usado pelas views desktop e mobile. O cartão é um `<button>` acessível, portanto clique, Enter e Espaço acionam o mesmo fluxo sem ações anônimas dependentes apenas de cor.

## IA/documentação assistida

Comandos do Gemini são apresentados como preparação/refação de rascunho, não como decisão clínica autônoma. Prontuários finalizados permanecem protegidos contra sobrescrita automática e ambiguidades de identidade seguem para revisão profissional.

## Verificação v3.3.0

A CI executa, além das regressões clínicas anteriores:

- `tests/agenda-v330.test.mjs` — propriedade única, domínio, acessibilidade estrutural e regressão contra microbotões;
- `tests/agenda-browser-v330.html` — teste em Chromium real de abertura da sessão, presença, persistência, remarcação, vínculo de pagamento, confirmação de exclusão e idempotência após 100 eventos de renderização.

## Pendências controladas pós-v3.3

1. retirar definitivamente `legacy-sync-cleanup-v262.js` quando nenhum dispositivo/dado histórico depender dele;
2. aposentar `gemini-historical-identity-repair-v272.js` após evidência de ausência de identidades órfãs históricas;
3. consolidar fisicamente folhas CSS históricas fora da Agenda em pacote separado, com regressão visual antes/depois;
4. renomear arquivos versionados no nome apenas em futura reestruturação de build.
