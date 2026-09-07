# Contrato canônico — coleta, registro e relatórios

## Princípio

A página pública do ecossistema é a interface de aplicação. O mecanismo externo de coleta pode permanecer como destino técnico da submissão, e o Google Sheets como base tabular e de governança. O GitHub nunca persiste respostas clínicas, nomes de respondentes, resultados ou prontuários.

## Interface pública e motor de coleta

A interface nativa do Google Forms não é uma interface pública canônica do ecossistema. Quando existir um Form válido e ativo, ele deve ser tratado somente como motor de coleta em segundo plano.

Regras obrigatórias:

1. `publicUrl` nunca pode apontar para `docs.google.com/forms`.
2. Botões de abrir, copiar ou compartilhar nunca podem entregar URL direta do Form.
3. A marca, cabeçalho, navegação ou página nativa do Google Forms não deve aparecer para o respondente.
4. A página hospedeira deve utilizar HTML/CSS próprios, sem `iframe` visível do Form.
5. O destino técnico de submissão pode permanecer configurado internamente como `formUrl`/`formResponse`, sem virar conteúdo de interface.
6. O teste de publicação deve falhar se qualquer `publicUrl` voltar a apontar para Forms ou se um `iframe` público de Forms for reintroduzido.

Estado canônico na Jornada Terapêutica:

- Monitoramento de Humor — interface própria `monitoramento.html?instrument=humor`;
- Monitoramento de Ansiedade — interface própria `monitoramento.html?instrument=ansiedade`;
- Monitoramento de Autoestima / Rosenberg — interface própria `monitoramento.html?instrument=autoestima`;
- Dados para continuidade do atendimento — interface própria `monitoramento.html?instrument=controle`, classificada como apoio e não como um dos 15 rastreios.

O manifesto distingue `publicUrl`, `formUrl`, `presentationMode` e `hostPage`. `publicUrl` é sempre compartilhável; `formUrl` é somente infraestrutura.

## Destino

Todos os mecanismos de coleta devem ser vinculados ao arquivo mestre de respostas, criando uma aba própria por instrumento quando a migração estiver concluída. A aba de configuração `RastreiosConfig` associa o nome da aba de respostas ao `instrument_id`, versão, nome público e função de correção.

## Perfis de identidade

A identidade da interface deve refletir apenas dados que possuem destino persistente real. Há dois perfis canônicos:

- `screening_canonical` — rastreios clínicos dedicados: `Nome completo`, `Data de nascimento` e `Data de aplicação do rastreio`, todos com destino persistente explícito antes de qualquer liberação de entrega em produção.
- `monitoring_longitudinal` — Humor, Ansiedade e Autoestima: exige `Nome completo`; a data de aplicação usa o campo real do coletor quando existente ou o carimbo de data/hora do Google Forms. `Data de nascimento` não é solicitada nem sintetizada enquanto o coletor ativo não possuir campo persistente próprio.

É proibido criar campo visual ou hidden de identidade que não seja efetivamente persistido pelo mecanismo de coleta.

## Campos do respondente

Cada aplicação deve pedir apenas o necessário ao instrumento e ao contexto. A identificação não pressupõe vínculo terapêutico.

Campos padronizados quando aplicáveis:

- `Nome completo` — opcional quando a aplicação puder ser anônima/avulsa;
- `Idade` — somente quando clinicamente necessária;
- `E-mail` — opcional;
- `Telefone` — opcional;
- `Origem do acesso` — Paciente em acompanhamento / Encaminhado / Recebi de outra pessoa / Acesso espontâneo / Outro;
- `Código clínico` — opcional; nunca obrigatório para acesso público;
- `Ciência de finalidade e limites` — obrigatória, deixando claro que rastreio não equivale a diagnóstico.

Os títulos de perguntas devem ser únicos. Quando o texto clínico de dois itens for igual ou muito semelhante, usar um prefixo técnico estável, como `Q01 ·`, `Q02 ·`, preservando o texto do item após o identificador. O motor falha de forma fechada quando encontra cabeçalhos duplicados para impedir perda ou sobrescrita silenciosa de respostas.

`submission_id`, `instrument_id`, `instrument_version`, escores e status de relatório são derivados pelo motor e não precisam ser perguntas visíveis.

## Colunas derivadas

O motor cria, quando ausentes, as seguintes colunas ao final da aba de respostas:

- `__submission_id`
- `__instrument_id`
- `__instrument_version`
- `__score_total`
- `__dimension_scores`
- `__interpretation`
- `__attention_points`
- `__next_step`
- `__report_status`
- `__report_sent_at`
- `__report_error`

## Regras de segurança

1. Nunca colocar nome, diagnóstico, conteúdo de resposta ou risco no assunto do e-mail.
2. O assunto padrão é `Novo relatório de rastreio clínico`.
3. O destinatário deve ser definido em Script Properties como `REPORT_RECIPIENT`; não publicar e-mail pessoal no código.
4. Não enviar diagnóstico automático. A linguagem deve ser dimensional e de rastreio.
5. Instrumentos sem função de correção validada ficam com `SCORER_PENDING` e não recebem interpretação automatizada como se estivessem validados.
6. Todo instrumento com coletor ausente ou scorer `pending` deve permanecer inativo até a validação clínica e técnica do espelho, da correção e do relatório.
7. EIR-RS usa fluxo separado de segurança e não pode depender apenas de escore global.
8. O motor usa lock, `submission_id` e estado de entrega para reduzir duplicidade. Antes do envio, grava e força persistência de `SENDING`; após sucesso grava `SENT`.
9. Se uma execução futura encontrar `SENDING`, o estado é tratado como ambíguo e o processamento é interrompido para revisão manual, evitando um segundo e-mail potencialmente duplicado.
10. Cabeçalhos duplicados em abas de respostas interrompem o processamento até saneamento da origem.

## Estados de migração

`ATIVO → ESPELHADO → VALIDADO → REDIRECIONADO → ARQUIVADO → EXCLUÍVEL`

Nenhum repositório individual deve avançar para `ARQUIVADO` antes de existir espelho validado, planilha vinculada, correção validada, relatório testado e URL canônica estável.

## Onda de implantação

1. Humor, Ansiedade e Autoestima — coletores existentes reutilizados por interfaces clínicas próprias.
2. Necessidades Emocionais, Codependência e ICAPS.
3. Esquemas, Modos e Impulsividade.
4. TDAH, TAB, Borderline, Narcisismo e Rastreio Geral.
5. Risco suicida — último, após validação específica de segurança.
