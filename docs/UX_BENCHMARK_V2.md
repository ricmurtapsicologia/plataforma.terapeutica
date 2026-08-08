# Benchmark funcional — Plataforma Clínica v2

Referência principal: padrões públicos de produto do PsicoManager, sem reprodução de componentes proprietários.

## O que a plataforma já deve preservar

- agenda diária/semanal com status de sessão;
- Google Agenda;
- ficha única do paciente;
- histórico de sessões dentro do paciente;
- prontuário, notas restritas e conceitualização separados;
- tarefas e materiais;
- documentos e consentimentos;
- financeiro vinculado ao paciente;
- cofre criptografado e sincronização notebook ↔ celular;
- mobile-first.

## Mudança de maior valor na v2

### IA dentro do fluxo clínico

O benchmark mostra maior valor quando a IA aparece durante/pós-sessão e alimenta o prontuário, em vez de existir como ferramenta isolada.

Decisão da v2:

`Meet → Gemini → Inbox clínico cifrado → Paciente → Prontuário → Revisão → Salvar`.

A IA não cria registros sincronizados sem revisão profissional.

## Reorganizações recomendadas

### Prioridade 1 — paciente

A ficha atual possui muitas abas lineares. A próxima revisão deve agrupá-las visualmente sem alterar os dados:

1. **Resumo** — Principal, Sessões;
2. **Clínica** — Atendimento, Prontuário, Notas restritas, Conceitualização, Plano;
3. **Intervenções** — Tarefas, Materiais;
4. **Documentos** — Documentos, Consentimentos, Comunicações;
5. **Administrativo** — Financeiro e cadastro.

A navegação pode usar uma barra principal curta e um segundo nível contextual, evitando treze opções simultâneas no celular.

### Prioridade 2 — configurações

Parâmetros técnicos não devem ocupar a tela principal. OAuth Client ID, origem e URI ficam recolhidos em `Configuração técnica do Google`.

Na superfície principal devem aparecer somente:

- estado do Google Workspace;
- Agenda;
- Meet/Gemini;
- sincronização do cofre;
- backup;
- segurança.

### Prioridade 3 — sessão

Cada sessão deve concentrar:

- presença/status;
- pagamento;
- link da videochamada;
- resumo Gemini disponível;
- prontuário/evolução;
- tarefa/combinado;
- próxima sessão.

### Prioridade 4 — painel Hoje

O painel deve priorizar exceções e ações:

- próxima sessão;
- confirmações pendentes;
- resumo Gemini aguardando revisão;
- sessão sem prontuário;
- pagamento pendente;
- conflito real de sincronização.

Evitar métricas decorativas que não gerem ação.

## Funcionalidades que não devem ser adicionadas agora

- múltiplos indicadores técnicos na topbar;
- segundo banco clínico em nuvem;
- duplicação do prontuário no Google Drive;
- criação automática de registros definitivos por IA;
- exposição de chaves/API secrets no GitHub Pages;
- criação de uma sala de vídeo própria enquanto o Google Meet atende ao fluxo.

## Critério de arquitetura

Nova função só entra se melhorar pelo menos um destes pontos:

- reduzir cliques;
- reduzir duplicação;
- diminuir risco clínico/operacional;
- aumentar legibilidade mobile;
- automatizar tarefa repetitiva sem enfraquecer o cofre.
