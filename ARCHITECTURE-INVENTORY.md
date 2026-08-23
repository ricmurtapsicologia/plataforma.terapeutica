# Plataforma Clínica 3.0 — Inventário arquitetural

Data de consolidação: 2026-08-22

## Princípios

1. Uma fonte canônica por entidade clínica.
2. Um proprietário por integração.
3. Dados clínicos nunca usam GitHub como storage.
4. IA/Gemini produz apoio documental; a decisão e finalização permanecem profissionais.
5. Reparos históricos são condicionais ou transitórios, não runtimes permanentes.
6. Falha de integração externa não bloqueia a operação clínica local.

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

## Componentes ativos de boot — v3.0.0

| Componente | Classe | Proprietário | Estado |
|---|---|---|---|
| platform-runtime-v300.js | CORE/UX/OBSERVABILITY | Plataforma | CANÔNICO |
| google-workspace-oauth-v200.js | INTEGRATION | Google Workspace | CANÔNICO |
| google-workspace-auto-renew-v264.js | INTEGRATION | Google Workspace | CANÔNICO |
| google-calendar-service-v240.js | INTEGRATION | Calendar | ATIVO — candidato a adapter único |
| calendar-integrity-v274.js | INTEGRATION/SAFETY | Calendar | ATIVO — consolidar em CalendarAdapter |
| calendar-reverse-reconcile-v275.js | INTEGRATION | Calendar | ATIVO — consolidar em CalendarAdapter |
| gemini-sharing-guard-v250.js | SECURITY | Gemini | CANÔNICO |
| public-clinical-storage-guard-v251.js | SECURITY | Storage | CANÔNICO |
| clinical-reconcile-v270.js | INTEGRATION/CLINICAL | Gemini | PROPRIETÁRIO ÚNICO |
| gemini-historical-identity-repair-v272.js | REPAIR/SAFETY | Gemini | ATIVO enquanto existirem identidades históricas |
| ai-record-review-v220.js | CLINICAL/SAFETY | Prontuário | CANÔNICO |
| agenda-mobile-v183.js | UX | Agenda | ATIVO |
| agenda-actions-v240.js | DOMAIN/INTEGRATION | Agenda | ATIVO |
| portable-tools-v153.js | UX | Plataforma | ATIVO |
| sync-semantic-conflict-cleanup-v260.js | SYNC/SAFETY | Sync | ATIVO — resolve somente equivalência semântica |
| legacy-sync-cleanup-v262.js | MIGRATION/SAFETY | Sync | ATIVO temporariamente; remove estado GitHub legado |
| patient-closure-v172.js | DOMAIN | Paciente | ATIVO |
| version-v170.js | UX | Release | ATIVO |
| material-share-v162.js | DOMAIN/UX | Materiais | ATIVO |
| mobile-ux-v170.js | UX | Mobile | ATIVO |
| patient-ux-v240.js | UX | Paciente | ATIVO |

## Componentes retirados do boot permanente na v3.0.0

| Componente | Destino |
|---|---|
| runtime-monitor-v240.js | absorvido por platform-runtime-v300.js |
| legacy-sw-cleanup-v240.js | absorvido como migração persistente one-shot |
| browser-fixes-v153.js | absorvido por platform-runtime-v300.js |
| top-status-owner-v243.js | absorvido por platform-runtime-v300.js |
| workspace-status-v240.js | absorvido por platform-runtime-v300.js |
| gemini-materialization-integrity-v273.js | carregado somente se marcador de conclusão estiver ausente |

## Componentes legados proibidos no boot

- clinical-reconcile-v240.js
- gemini-autodelivery-v264.js
- gemini-alias-continuity-v263.js
- gemini-name-token-repair-v245.js
- gemini-migration-v240.js
- gemini-attendance-repair-v249.js
- sync-conflict-recovery-v247.js
- legacy-sync-cleanup-v242.js

O workflow `Static integrity` falha caso esses runtimes retornem ao entrypoint.

## Identidade canônica de sessão

A v3 introduz `clinicalSessionId`.

Regra inicial de migração:

1. appointment existente recebe `clinicalSessionId = appointment.id`;
2. record recebe o ID somente se já houver vínculo explícito por `appointmentId` ou pelo mesmo `source.fileId`;
3. nenhuma associação nova é criada por nome, semelhança textual ou proximidade de horário nesta migração;
4. o reconciliador Gemini mantém sua revisão humana para ambiguidades.

## UX do psicólogo

O workspace do paciente passa de 13 destinos simultâneos para 6 grupos:

- Principal
- Sessões
- Clínica
- Tratamento
- Recursos
- Administração

Subáreas continuam acessíveis contextualmente, sem perda funcional. Ações frequentes são reunidas em `+ Ação`, e duplicações de `Agendar sessão`/máscara de privacidade são suprimidas na renderização.

## Pendências controladas pós-v3

Estas não bloqueiam a v3.0.0, mas permanecem como dívida técnica explícita:

1. fundir `google-calendar-service`, `calendar-integrity` e `calendar-reverse-reconcile` em um `CalendarAdapter`;
2. retirar `legacy-sync-cleanup-v262.js` após janela de migração comprovada;
3. aposentar `gemini-historical-identity-repair-v272.js` quando não houver mais identidades órfãs históricas;
4. consolidar fisicamente as folhas CSS históricas após regressão visual comparativa;
5. renomear arquivos versionados no nome somente em uma futura reestruturação de build, evitando alteração massiva nesta versão clínica.
