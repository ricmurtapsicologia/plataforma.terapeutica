# Blueprint operacional — geração de valor clínico v3.9.0

Data do plano: 2026-11-04. Base de desenvolvimento: Plataforma Clínica 3.7.8.
Escopo: melhoria incremental, sem dados reais no GitHub público e sem migração de schema.

## Objetivo

Integrar plano terapêutico validado, preparação de sessão, objetivos, medidas descritivas comparáveis e revisão clínica, mantendo a decisão do psicólogo.

## Entregas implementadas na branch de revisão

1. \`clinical-value-core-v390.mjs\`: resolução de plano aprovado, isolamento por paciente, série de medidas, validações e sinais documentais.
2. \`session-tcc-prep-v360.js\`: plano individualizado aprovado aparece como fonte clínica, distinguindo rascunhos posteriores e medidas comparáveis. O texto livre é exibido, mas não convertido automaticamente em objetivos ou decisões.
3. \`tcc-goal-editor-v360.js\`: vínculo explícito entre objetivo terapêutico e versão aprovada, selecionado pelo profissional. Essa referência prioriza objetivos na preparação sem interpretar texto livre.
4. \`clinical-value-runtime-v390.js\`: medidas 0–10 revisadas, com procedência identificada (autorrelato ou observação profissional), direção da escala, vínculo opcional à sessão, correção aditiva sem apagar o original, eventos de auditoria, gráfico e tabela acessível.
5. \`clinical-health-engine-v360.js\`: alertas somente de leitura para plano sem validação, objetivo sem medida e revisão vencida, ativos apenas no piloto.
6. \`clinical-runtime-manifest-v376.mjs\`: registro único do runtime, preservando a ordem dos módulos.
7. Testes de domínio e browser sintéticos, executados na CI. Não utilizam conteúdo clínico real.

## Fonte de verdade

- Pacientes, prontuários, medidas, tarefas e planos: cofre local cifrado (IndexedDB), com sincronização privada \`appDataFolder\`.
- Plano aprovado: nota \`clinicalPlanReviewedVersion\` com \`status=Validado pelo profissional\` e \`reviewRequired=false\`.
- Plano assistido: \`therapeuticActionPlan\`, usado apenas como referência de rascunho quando não houver plano aprovado.
- Medida: nota \`clinicalProgressMeasurement\` vinculada ao paciente e objetivo exatos.
- Agenda: vínculo por ID da sessão, não por aproximação de nome.
- Gemini: rascunhos devem ser revisados antes da finalização profissional.

## Regras clínicas

- Uma medida 0–10 criada aqui é descritiva e **não constitui instrumento psicométrico validado**.
- Séries de orientação ou procedência diferentes não são agregadas.
- A variação observada não estabelece relação causal com a intervenção.
- O profissional escolhe se, como e quando mensurar; a ausência de registro gera aviso documental, não alerta de risco automático.
- Plano aprovado e prontuários finalizados não podem ser sobrescritos pelo módulo de evolução.
- A preparação sugere tópicos; não grava automaticamente no prontuário e não substitui avaliação de risco.

## Segurança e reversão

A visualização e edição do piloto permanecem **desativadas por padrão**. O acionamento em Configurações exige:
- backup \`.rmvault\` recente, reconhecido pelo próprio aplicativo;
- teste de restauração isolado bem-sucedido no navegador;
- confirmação explícita pelo profissional de que a sincronização notebook ↔ celular foi verificada bidirecionalmente.

O aplicativo não dispõe de prova automatizada da verificação física de dois dispositivos. Essa confirmação não é certificação técnica independente.

Para reverter: desativar o piloto em Configurações e, se necessário, restaurar o commit anterior da aplicação. **Não apagar** registros de medidas válidos. Restauração sobre banco real somente para recuperação supervisionada.

## Testes

- \`tests/clinical-value-v390.test.mjs\`: plano aprovado versus rascunho, isolamento de paciente, valor e data, procedência e orientação, correções, series e regressões.
- \`tests/clinical-value-browser-v390.html\`: síntese de plano validado na sessão, alerta sobre rascunho posterior, medida de evolução, proteção contra HTML injetado, isolamento de pacientes e desligamento da função.
- Workflows: \`Static integrity\` e \`Clinical certification\`.

## Gates que dependem do profissional e do dispositivo real

- [ ] Gerar \`.rmvault\` real do cofre principal e guardar cópia segura.
- [ ] Testar restauração isolada usando esse arquivo.
- [ ] Verificar cofre privado, autorização Google e revisão remota.
- [ ] Demonstrar alteração A→B e B→A em notebook e celular, sem duplicação.
- [ ] Comprovar no celular a usabilidade, o fluxo completo de sessão e a consistência do painel.
- [ ] Conferir amostra de registros reais com acesso autorizado, sem reproduzi-los em logs.
- [ ] Revisar e aprovar clinicamente as sugestões em atendimento controlado.
- [ ] Confirmar ausência de regressões em agenda, pagamentos e prontuários.
- [ ] Habilitar o piloto em Configurações.

**Não considerar implantação completa sem todos esses gates.**

## Indicadores de valor — piloto de 30 dias

- Cobertura de referência ao plano aprovado entre sessões com plano validado: meta 100%.
- Registros de medidas vinculados ao paciente e objetivo corretos: meta 100%.
- Prontuários finalizados alterados indevidamente: meta 0.
- Duplicação por sincronização: meta 0.
- Revisões que documentam uma decisão clínica: meta experimental ≥ 90%.
- Tempo de preparação: medir antes e depois; redução de 30% é hipótese, não resultado.

Monitorar apenas dados agregados locais, sem envio automático de metadados clínicos para serviços públicos.

## Critério de conclusão

A entrega de engenharia exige testes de código e browser aprovados, aprovação de revisão e proteção de dados. O aceite operacional exige backup, sincronização, aplicação clínica e medição real da utilidade — passos que não são demonstrados por CI remota.
