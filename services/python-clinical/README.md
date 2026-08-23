# Clinical Sidecar — arquivado

Status na Plataforma Clínica 3.0: `ARCHIVED / NOT IN RUNTIME`.

Esta pasta permanece apenas como scaffold histórico de contrato para uma possível camada Python privada futura. Ela não está integrada ao frontend, não é publicada pelo GitHub Pages, não altera o cofre, o `SCHEMA_VERSION`, a sincronização, o Google OAuth, a Agenda, o Gemini ou a resolução de conflitos existentes.

O workflow correspondente é manual (`workflow_dispatch`) e não executa automaticamente em pushes ou pull requests.

Ponto de rollback histórico do repositório: `backup/pre-python-20260809`.

## Contrato preservado

Endpoints do scaffold:

- `GET /health` — saúde do serviço;
- `GET /v1/security/capabilities` — contrato explícito de não persistência/não escrita;
- `POST /v1/draft/prepare` — recebe texto e devolve apenas um rascunho normalizado, com hash e seções, sem persistência.

## Garantias

- não grava request body;
- não grava no cofre;
- não grava em branch de dados;
- não sobrescreve prontuário finalizado;
- não recebe secrets no payload;
- não faz chamada de IA;
- não é chamado pela PWA atual;
- não gera custo recorrente nem processamento automático.

Qualquer reativação exige decisão arquitetural explícita, infraestrutura privada apropriada, autenticação máquina-a-máquina, observabilidade sem conteúdo clínico e nova revisão de segurança.
