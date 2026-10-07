# Plataforma Clínica — Inventário arquitetural canônico

Data de consolidação: 2026-10-07  
Aplicação: 3.7.5  
Geração de hardening/arquitetura: v3.7.6

## Contrato arquitetural

A plataforma é local-first. Dados clínicos têm como fonte canônica o cofre local cifrado; o Google Drive `appDataFolder` recebe apenas o cofre remoto cifrado. GitHub é code-only.

```text
index.html
  ↓
main-v250.js
  ↓
bootstrap-v240.js
  ├─ login mínimo
  └─ após autenticação
       ├─ database / migrations / secure-sync
       ├─ estilos clínicos
       ├─ OAuth público
       └─ core/clinical-runtime-manifest-v376.mjs
             ↓
       domínios + adapters + governança
```

O runtime clínico completo não participa mais do carregamento pré-autenticação.

## Fontes canônicas

| Entidade | Fonte canônica | Projeção / integração |
|---|---|---|
| Paciente | IndexedDB cifrado | Drive appDataFolder cifrado |
| Sessão | IndexedDB cifrado | Google Calendar |
| Prontuário | IndexedDB cifrado | Drive appDataFolder cifrado |
| Formulação/plano | IndexedDB cifrado | — |
| Financeiro | IndexedDB cifrado | — |
| Meet/Gemini RAW | Google Drive | rascunho clínico sob revisão |
| Código | GitHub | GitHub Pages |

## Regras P0

1. Registro clínico crítico ilegível nunca é convertido em ausência de dado.
2. Falha de descriptografia em `patients`, `appointments`, `records`, `notes` ou `formulations` ativa `CLINICAL_DATA_INTEGRITY` e bloqueia mutações.
3. Diagnóstico da plataforma é read-only.
4. Limpeza de artefato exige marcador sintético explícito e confirmação.
5. Sessão curta não é presumida como teste.
6. Gemini não reativa paciente encerrado/inativo automaticamente.
7. Prontuário finalizado não pode ser sobrescrito automaticamente.
8. GitHub não recebe dados clínicos, backup real, token ou credencial.

## Composition root

`assets/js/core/clinical-runtime-manifest-v376.mjs` é o manifesto canônico do runtime autenticado. Ele organiza módulos por fases:

- platform;
- private-clinical-data;
- clinical-inputs;
- integrations;
- agenda-session;
- patient-treatment;
- governance.

`index.html` expõe somente um entrypoint ESM: `main-v250.js`.

## Owners

| Área | Owner canônico |
|---|---|
| Boot | `bootstrap-v240.js` |
| Composição | `clinical-runtime-manifest-v376.mjs` |
| Persistência | `database.js` |
| Sincronização | `secure-sync-v260.js` |
| Drive privado | `drive-appdata-storage-v260.js` |
| Agenda | `agenda-controller-v330.js` |
| Sessão | `clinical-session-runtime-v370.js` |
| Calendar | `calendar-adapter-v300.js` |
| Gemini | `clinical-reconcile-v270.js` |
| Integridade | `clinical-data-integrity-v340.js` + scanner read-only |
| Diagnóstico | `clinical-health-engine-v360.js` |

## Migrações e compatibilidade preservadas

Não foram removidos componentes ainda alcançáveis por caminho condicional:

- `legacy-sync-cleanup-v262.js`: migração condicional de estado legado;
- `gemini-materialization-integrity-v273.js`: one-shot condicional;
- internals do Calendar v240/v274/v276: encapsulados pelo `CalendarAdapter`.

## Cutoff 2026-10-07

O CI de reachability identificou 40 arquivos fora do grafo do runtime. Um deles é artefato de teste e foi preservado. Os demais 39 módulos históricos foram removidos em lote somente após:

```text
runtime reachable = false
external operational references = 0
missing reachable imports = 0
regression = green
browser probes = green
E2E = green
Lighthouse = green
```

O contrato `scripts/decommission-audit.mjs` bloqueia a reintrodução desses módulos.

## Performance

Carregamento pré-autenticação contém apenas o shell mínimo. Database, sync, integrações e 14 folhas de estilo clínicas são carregados somente depois da abertura do cofre.

Gate Lighthouse:

- Performance >= 90;
- Accessibility >= 95;
- Best Practices >= 95.

Na certificação anterior ao cutoff: Performance 100, Accessibility 96 e Best Practices 100.

## Certificação

A promoção depende de:

- P0 Public Repo Guard;
- Clinical Intake quality;
- Ecosystem sanitation;
- Static integrity;
- regressões clínicas;
- persistência em Chromium;
- Agenda em Chromium;
- reachability;
- decommission contract;
- auditoria 30/30;
- browser smoke/E2E;
- Lighthouse.

CI remoto não substitui validações que dependam de dois dispositivos físicos, OAuth real, conteúdo clínico real ou restore operacional real.
