# Plataforma Clínica Richelmy Murta — v2.4.5

Aplicação clínica local-first em GitHub Pages, com cofre AES-GCM, sincronização cifrada notebook ↔ celular, Google Workspace, Google Agenda e conciliação das Anotações do Google Meet/Gemini com Sessões e Prontuário.

## Objetivo da v2.4.5

A v2.4.5 corrige um caso real de identificação no Gemini: o nome exibido entre parênteses pode ser um componente intermediário do nome completo cadastrado, e não necessariamente o primeiro nome ou o nome preferido.

A nova rotina `gemini-name-token-repair-v245.js` aceita esse componente somente quando ele identifica de forma única um único paciente ativo. Nenhum nome ou codinome clínico é escrito no repositório público.

## Regra de identidade

A associação segue esta ordem:

1. nome completo/nome preferido do paciente como participante do Gemini;
2. relação explícita `identificador do Meet (nome)` encontrada nas próprias Anotações;
3. se o valor entre parênteses for um único componente do nome, ele só é aceito quando esse componente existir no nome de exatamente um paciente ativo;
4. o identificador do Meet aprendido é armazenado apenas no catálogo Gemini cifrado localmente.

Exemplo abstrato:

```text
Participante X (NomeIntermediário)
        ↓
NomeIntermediário pertence a exatamente 1 paciente ativo
        ↓
Participante X ↔ patientId
```

## Reparo histórico

Após `Dados ✓`, a rotina v2.4.5 executa uma vez por dispositivo:

```text
Anotações Gemini desde 01/05/2026
        ↓
leitura do Drive
        ↓
identificação segura
        ↓
criação/correção da sessão Realizada / Presente
        ↓
criação/correção do prontuário Rascunho IA
        ↓
remoção de materializações automáticas inválidas
        ↓
1 evento de sincronização
```

Regras de integridade:

- sessão: `gmappt_<fileId>`;
- prontuário: `gmrec_<fileId>`;
- registro finalizado não é sobrescrito;
- materialização automática sem paciente ativo pode ser removida;
- dados manuais não são removidos pela rotina;
- a transcrição integral permanece no Drive;
- aliases ficam cifrados no navegador;
- conflitos de Dados pausam a conciliação Gemini.

## Prontuário assistido por IA

Cada sessão identificada pode receber `Rascunho IA`, estruturado a partir exclusivamente do resumo/anotações do Gemini em foco/evolução, procedimentos descritos, resposta/resultados observados e plano/tarefas/encaminhamentos. O prompt `TCC-CFP-v2.4` proíbe inventar diagnóstico, hipótese, técnica, risco, sintoma, fala ou resultado ausente na fonte. A finalização exige revisão profissional.

## Indicadores do topo

`top-status-owner-v243.js` mantém um único indicador oficial de Agenda.

```text
Dados ✓   Agenda ✓   Meet ✓
```

## Arquitetura principal

- `assets/js/main-v240.js` — entrypoint único;
- `assets/js/secure-sync-v240.js` — SyncManager event-driven e multiaba;
- `assets/js/google-workspace-oauth-v200.js` — OAuth único;
- `assets/js/google-calendar-service-v240.js` — Google Agenda;
- `assets/js/clinical-reconcile-v240.js` — pipeline incremental permanente do Gemini;
- `assets/js/gemini-name-token-repair-v245.js` — reparo histórico por nome/componente único;
- `assets/js/top-status-owner-v243.js` — proprietário único do chip Agenda;
- `assets/js/patient-ux-v240.js` — ficha individual;
- `tests/self-test.html` — autoteste não destrutivo.

## Segurança

- PBKDF2-HMAC-SHA256 + AES-GCM;
- branch `clinic-sync-data` contém somente o cofre cifrado;
- tokens Google/GitHub ficam cifrados localmente;
- aliases e catálogo Gemini ficam cifrados no navegador;
- nenhum nome/codinome clínico é hardcoded no código público;
- chave do cofre não é enviada ao Google nem ao GitHub.

## Publicação

- versão: `2.4.5`;
- `SCHEMA_VERSION`: 5, preservado;
- rollback imediato: `backup-pre-name-token-fix-v2.4.5`;
- cofre remoto: branch `clinic-sync-data`.
