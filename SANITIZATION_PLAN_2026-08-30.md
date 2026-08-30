# Plano saneador — Plataforma Clínica — 2026-08-30

## Objetivo

Consolidar a plataforma sem ampliar escopo funcional, reduzindo risco de regressão, carga cognitiva e ambiguidade de governança entre navegador, Google Workspace, Meet/Gemini, Secretary Core/Vercel e WhatsApp.

## Princípios de execução

1. `main` permanece congelado durante o saneamento; mudanças entram por pull request.
2. Nenhum dado clínico real é usado em CI, documentação ou testes de repositório público.
3. Não remover funcionalidades clínicas no primeiro ciclo; primeiro consolidar navegação, contratos e observabilidade.
4. Toda mudança P0 deve possuir teste automatizado ou gate verificável.
5. Integrações externas devem operar com privilégio mínimo, fail-closed e minimização de dados.
6. Mudanças visuais amplas e refatorações de carregamento ficam fora do mesmo lote para evitar regressões cruzadas.

## P0 — integridade, segurança e governança

- alinhar README, build e `APP_VERSION` à mesma fonte canônica;
- manter guardrails contra storage clínico público e finalização autônoma por IA;
- formalizar a fronteira de dados do Secretary Core/WhatsApp;
- certificar que telefone/texto não apareçam em logs do frontend;
- manter Calendar como camada operacional, não prontuário;
- exigir contrato automatizado do ecossistema no CI;
- manter validação profissional obrigatória no pipeline Gemini/Meet;
- validar retenção do outbox sem apagar payload antes do envio de lembretes futuros.

## P1 — UX operacional

- reduzir a navegação visível do paciente a seis áreas primárias;
- preservar funções menos frequentes em `Mais`;
- manter ações críticas de agendamento e troca de paciente no cabeçalho;
- preservar alvos de toque adequados no mobile;
- realizar auditoria visual real antes de consolidar CSS ou alterar layout global.

## P2 — engenharia e manutenção

- consolidar folhas CSS em ciclo separado, após baseline visual;
- estudar lazy loading/paralelização do boot com medição antes/depois;
- remover módulos aposentados apenas com prova de ausência de dependência;
- automatizar changelog/build em ciclo posterior;
- tornar checks críticos obrigatórios por regra de proteção de branch após estabilização.

## Gates de aceite

- versão documental = versão do runtime;
- no máximo seis áreas primárias no workspace do paciente;
- todas as áreas secundárias continuam acessíveis;
- contrato de WhatsApp administrativo, nonce e hash do telefone preservados;
- CSP sem `connect-src *`;
- CI de saneamento aprovado;
- static integrity existente aprovado;
- nenhum dado real introduzido nos commits;
- `main` sem alteração até revisão dos PRs.

## Itens deliberadamente fora deste lote

- consolidação das 15 folhas CSS;
- alteração global do carregamento dos módulos;
- migração de provider/storage;
- mudanças destrutivas de dados;
- automação de prontuário sem revisão humana;
- testes com pacientes reais.
