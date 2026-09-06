# Painel de Rastreios — Plano Executor

## Objetivo
Consolidar a governança dos rastreios clínicos na Plataforma Clínica sem transformar a Jornada Terapêutica em painel e sem bloquear o acesso público aos instrumentos.

## Arquitetura
- Plataforma Clínica: ambiente profissional protegido.
- Painel de Rastreios: módulo interno da Plataforma Clínica.
- Jornada Terapêutica: landing page pública independente.
- Rastreios: URLs públicas permanentes, compartilháveis com pacientes e não pacientes.
- Google Forms/Sheets: registro canônico alvo para todas as aplicações.
- E-mail: relatório clínico HTML estruturado após submissão, quando a automação de registro estiver concluída.

## Escopo do catálogo inicial
1. Rastreio Clínico Geral (RAC-5TR)
2. Rastreio de TDAH em Adultos
3. Rastreio do Espectro Bipolar
4. Rastreio de Traços Borderline
5. Rastreio de Traços Narcisistas
6. Perfil de Impulsividade
7. Mapa de Esquemas
8. Mapa de Modos Esquemáticos
9. Necessidades Emocionais
10. Dependência e Codependência Emocional
11. ICAPS — Prontidão para Separação
12. Avaliação Clínica de Risco Suicida
13. Monitoramento de Humor
14. Monitoramento de Ansiedade
15. Monitoramento de Autoestima

## Ações de cada card
- Abrir
- Copiar link
- Compartilhar
- Indicar situação do registro (Forms ativo ou legado em migração)

## Plano de ação executor
1. Inventariar rastreios e landing pages existentes.
2. Classificar redundâncias: manter, aprofundamento de 2ª etapa, monitoramento, fundir ou arquivar.
3. Padronizar nomenclatura pública sem apagar os nomes técnicos internos.
4. Construir o Painel de Rastreios dentro da Plataforma Clínica.
5. Aplicar design system único, mobile-first, acessível e compatível com tema claro/escuro.
6. Preservar todas as URLs públicas atuais durante a transição.
7. Mapear quais instrumentos já possuem Google Forms e quais precisam de espelhamento.
8. Migrar, instrumento por instrumento, para registro canônico Forms/Sheets sem armazenar respostas no GitHub.
9. Implementar relatório HTML por e-mail com identificação, escore, dimensões, síntese prudente, alertas e próximo passo clínico.
10. Consolidar futuramente as páginas públicas em um único repositório/rota de rastreios.
11. Redirecionar URLs antigas antes de arquivar repositórios individuais.
12. Excluir repositórios antigos somente após validação de dependências, redirecionamento e período de estabilidade.

## Protocolo obrigatório de auditoria
Cada ciclo contém duas auditagens seguidas de sanitização.

### Auditagem A — Auditoria 30/30 canônica
Smoke; Pinpoint; Deep; Consistency; Contradiction; Completeness; Traceability; Compliance; Regression; Change-impact; Cross-reference; Link integrity; Visual QA; Accessibility; Usability; Cognitive-load; Narrative-flow; Red-team; Edge-case; Scenario stress; Fact-check; Citation; Source-to-claim; Legal defensibility; Decision-readiness; Publication preflight; Version-drift; Canonical-template; Duplication/redundancy; Terminology.

### Auditagem B — Clínica, UX, segurança e sanitização
- linguagem de rastreio versus diagnóstico;
- separação Painel Clínico x Jornada Terapêutica;
- acesso público sem associação automática a prontuário;
- ausência de persistência clínica nova no GitHub;
- integridade de links;
- compatibilidade mobile;
- tema claro/escuro;
- navegação por teclado e leitores de tela;
- fallback de clipboard/compartilhamento;
- não regressão do shell clínico;
- revisão de redundâncias e taxonomia;
- prontidão para Forms/Sheets e relatórios.

## Três ciclos
### Ciclo 1 — Arquitetura e robustez
Construção do módulo, design system, navegação, filtros, compartilhamento e saneamento técnico inicial.

### Ciclo 2 — Conteúdo, links e usabilidade
Auditoria de catálogo, nomes, classificação, estados de registro, links públicos, navegação mobile e mensagens clínicas.

### Ciclo 3 — Regressão e publicação
Auditoria final 30/30 + clínica/UX/segurança, sanitização de regressões, preflight de publicação e confirmação de que nenhum repositório legado foi apagado prematuramente.

## Smoke test final
Critérios mínimos:
- Plataforma abre sem erro novo de boot.
- Login existente permanece intacto.
- Menu Rastreios aparece após abertura do cofre.
- Painel abre em #rastreios.
- Busca funciona.
- Filtros funcionam.
- Abrir funciona em nova aba.
- Copiar link possui fallback.
- Compartilhar possui fallback.
- Jornada permanece externa e independente.
- Tema claro/escuro não quebra contraste.
- Layout funciona em desktop, tablet e celular.
- Retorno às rotas existentes funciona.
- Nenhuma resposta clínica é persistida pelo módulo.

## Registro de execução — 05/09/2026
### Ciclo 1 — concluído e sanitizado
- Painel implementado em módulo isolado, sem alteração do cofre ou persistência clínica.
- Design system corrigido para herdar os tokens nativos da Plataforma Clínica em tema claro e escuro.
- Busca, filtros, abertura, cópia e compartilhamento implementados com fallback.
- Jornada Terapêutica mantida como landing page independente.

### Ciclo 2 — concluído e sanitizado
- Detectada falha no contrato de saneamento do ecossistema por alteração indevida do marcador canônico de build.
- Marcador restaurado para o contrato `APP_VERSION-main-v250`.
- Gaveta móvel saneada ao abrir Rastreios.
- Feedback visual e acessível de copiar/compartilhar incluído.
- Contraste dos filtros ajustado para tema claro/escuro.

### Ciclo 3 — concluído
- Static integrity: aprovado.
- P0 Public Repo Guard: aprovado.
- Ecosystem sanitation: aprovado após correção.
- Sintaxe JavaScript, testes clínicos de regressão, probes reais de navegador, imports locais, assets do index, invariantes arquiteturais e consistência de versão: aprovados.
- Nenhum repositório legado excluído.
- Catálogo permanece com links públicos compartilháveis por qualquer pessoa.

## Regra de exclusão
Nenhum repositório individual deve ser excluído na fase atual. Estado obrigatório: ATIVO → MIGRADO → REDIRECIONADO → ARQUIVADO → EXCLUÍDO, somente após smoke test e estabilidade.
