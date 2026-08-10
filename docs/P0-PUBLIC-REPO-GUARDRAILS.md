# P0 — Guardrails do repositório público

Este documento registra controles preventivos aplicados ao repositório público sem transportar conteúdo clínico para o GitHub.

## Escopo

- impedir commit acidental de cofres, bancos locais, exports e backups clínicos;
- detectar formatos comuns de credenciais incorporadas ao código;
- manter o repositório como superfície de código e assets não sensíveis;
- preservar a aplicação e a sincronização existentes enquanto o storage remoto é avaliado separadamente.

## Fora deste repositório

Dados clínicos reais, respostas de instrumentos, documentos de sessão, backups reais, tokens e chaves devem permanecer fora do `main` público.

## Não altera

Este pacote não altera schema clínico, agenda, Google OAuth, fluxo Gemini, criptografia, dados locais ou sincronização em produção.

## Gate

O workflow `P0 Public Repo Guard` deve estar verde antes de mergear alterações no `main`.
