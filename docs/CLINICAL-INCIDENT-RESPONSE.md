# Plataforma Clínica — Resposta a Incidente e Recuperação

## Objetivo

Estabelecer um procedimento mínimo e rastreável para falhas de segurança, perda de acesso, corrupção de dados, perda de dispositivo, exposição indevida ou indisponibilidade da Plataforma Clínica.

## Princípios

1. Proteger primeiro a confidencialidade e a integridade dos dados clínicos.
2. Não improvisar restore destrutivo sobre a base ativa.
3. Não registrar dados clínicos, credenciais, tokens, chaves ou códigos de sincronização em GitHub, Issues, logs públicos ou canais administrativos.
4. Preservar evidências técnicas mínimas sem copiar conteúdo clínico identificável.
5. IA e automações não podem decidir sozinhas pela sobrescrita de prontuário ou resolução de conflito real.

## Classificação inicial

### P0 — Crítico

- suspeita de exposição de dados clínicos;
- perda ou comprometimento de credencial/chave relevante;
- corrupção ou perda do cofre clínico sem recuperação imediatamente comprovada;
- gravação clínica em superfície pública;
- conflito de sincronização com risco de perda/sobrescrita de dados;
- acesso indevido confirmado ou fortemente suspeito.

### P1 — Alto

- sincronização indisponível;
- falha recorrente de OAuth/Drive;
- backup não validado;
- divergência entre dispositivos;
- falha de Meet/Gemini que afete rastreabilidade do registro clínico.

### P2 — Operacional

- falha visual;
- link ou recurso administrativo quebrado;
- erro que não afete confidencialidade, integridade ou disponibilidade de dados clínicos.

## Procedimento P0

1. Interromper a ação automática relacionada ao incidente.
2. Não apagar dados, cofres, históricos ou credenciais por impulso.
3. Preservar o último backup `.rmvault` conhecido como íntegro.
4. Isolar o dispositivo ou integração suspeita quando isso puder ser feito sem destruir evidência.
5. Bloquear sincronização automática se houver divergência real de dados.
6. Identificar a superfície envolvida: dispositivo local, Google Drive `appDataFolder`, Google Workspace/OAuth, GitHub, Secretary Core, Meet/Gemini ou outro componente.
7. Rotacionar/revogar credenciais comprometidas somente após identificar dependências legítimas.
8. Testar recuperação primeiro por `Testar restore isolado`.
9. Restaurar sobre a base ativa somente quando houver necessidade real de recuperação e após backup adicional do estado atual.
10. Verificar se existe obrigação de comunicação ao titular e/ou autoridade competente conforme a legislação e regulamentação vigentes.
11. Registrar conclusão técnica do incidente sem incluir conteúdo clínico identificável.

## Perda de dispositivo

1. Revogar sessões e acessos relevantes do dispositivo perdido quando aplicável.
2. Considerar comprometido qualquer segredo que estivesse acessível no dispositivo sem proteção suficiente.
3. Confirmar existência de backup/cofre remoto íntegro antes de qualquer reconstrução.
4. Preparar novo dispositivo limpo.
5. Autorizar Google Workspace somente no novo dispositivo controlado.
6. Adotar o cofre remoto conforme o fluxo seguro da plataforma.
7. Conferir contagens e amostra funcional pela própria interface.
8. Executar teste bidirecional antes de retomar uso normal.

## Suspeita de corrupção ou divergência

1. Suspender merge automático.
2. Identificar qual revisão/dispositivo contém a base presumidamente íntegra.
3. Não resolver por `last-write-wins` quando houver conflito clínico real.
4. Comparar metadados e revisões sem exportar conteúdo para logs públicos.
5. Decidir explicitamente qual estado será preservado.
6. Gerar backup antes da correção.
7. Executar readback/validação após a correção.

## Recuperação por backup

1. Selecionar o arquivo `.rmvault` pretendido.
2. Executar `Testar restore isolado`.
3. Exigir leitura e comparação integral dos stores no banco temporário.
4. Se o teste falhar, não utilizar esse backup para sobrescrever a base ativa.
5. Se o teste passar e houver necessidade real de restore, gerar antes um backup adicional do estado atual.
6. Executar restore controlado.
7. Validar contagens, integridade, agenda, prontuários e sincronização após a recuperação.

## Incidente envolvendo GitHub público

1. O GitHub deve permanecer code-only.
2. Se dado clínico real ou segredo aparecer em commit, Issue, PR ou artefato público, tratar como P0.
3. Remover a exposição da superfície pública usando procedimento técnico apropriado.
4. Considerar rotação de qualquer segredo exposto.
5. Avaliar necessidade de limpeza de histórico quando a remoção do arquivo atual não eliminar a exposição histórica.
6. Reexecutar `P0 Public Repo Guard` e revisar as regras preventivas.

## Incidente envolvendo Meet/Gemini

1. Tratar conteúdo automático como RAW até revisão profissional.
2. Não promover automaticamente conteúdo para prontuário final.
3. Suspender conciliação automática em caso de identidade ambígua.
4. Confirmar identidade da sessão por vínculo estável com agenda/evento.
5. Manter rascunho em estado de revisão obrigatória até validação humana.

## Retorno à operação

O incidente somente pode ser encerrado quando aplicável:

- causa identificada ou risco contido;
- credenciais comprometidas tratadas;
- cofre íntegro confirmado;
- backup/restore validado;
- sincronização validada;
- ausência de duplicidade ou perda confirmada;
- controles preventivos revisados;
- obrigações legais/regulatórias avaliadas;
- registro técnico mínimo concluído.

## Registro mínimo do incidente

Registrar apenas:

- identificador interno do incidente;
- data/hora;
- categoria P0/P1/P2;
- componente afetado;
- natureza do problema;
- ações de contenção;
- ações de recuperação;
- resultado dos testes;
- decisão de encerramento;
- necessidade ou não de avaliação jurídica/regulatória.

Nunca incluir nesse registro público conteúdo de sessão, diagnóstico, telefone, nome de paciente, credencial, token, chave ou código de sincronização.
