# Clinical Sidecar — contrato isolado

Esta pasta é um scaffold de contrato para uma futura camada Python privada. Ela não está integrada ao frontend, não é publicada pelo GitHub Pages e não altera o cofre, o `SCHEMA_VERSION`, a sincronização, o Google OAuth, a Agenda, o Gemini ou a resolução de conflitos existentes.

Ponto de rollback do repositório: `backup/pre-python-20260809`.

## Objetivo desta etapa

Validar a fronteira arquitetural antes de qualquer integração real.

Endpoints disponíveis:

- `GET /health` — saúde do serviço;
- `GET /v1/security/capabilities` — contrato explícito de não persistência/não escrita;
- `POST /v1/draft/prepare` — recebe texto e devolve apenas um rascunho normalizado, com hash e seções, sem persistência.

O contrato atual rejeita campos extras. Isso impede que identificadores de paciente sejam adicionados informalmente ao payload nesta fase.

## Garantias da fase 0

- não grava request body;
- não grava no cofre;
- não grava na branch `clinic-sync-data`;
- não sobrescreve prontuário finalizado;
- não recebe secrets no payload;
- não faz chamada de IA;
- não é chamado pela PWA atual.

## Execução local

```bash
cd services/python-clinical
pip install -r requirements.txt
uvicorn app.main:app --reload
pytest -q
```

## Próximas fases, somente após aprovação

1. mover/hospedar o serviço em infraestrutura privada apropriada;
2. autenticação máquina-a-máquina e origem permitida explícita;
3. integração Google server-side com secrets fora do repositório;
4. processamento Gemini/Meet como `draft`;
5. revisão explícita antes de qualquer persistência clínica;
6. observabilidade sem conteúdo clínico em logs;
7. somente depois avaliar jobs e automações.

A PWA atual deve continuar funcional mesmo se este serviço estiver indisponível.
