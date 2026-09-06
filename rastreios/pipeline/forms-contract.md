# Contrato canônico — Forms, Sheets e relatórios

## Princípio

A página pública é a interface de aplicação. O Google Forms é o registro canônico da submissão. O Google Sheets é a base tabular e de governança. O GitHub nunca persiste respostas clínicas, nomes de respondentes, resultados ou prontuários.

## Destino

Todos os Forms devem ser vinculados ao mesmo arquivo mestre de respostas, criando uma aba própria por instrumento. A aba de configuração `RastreiosConfig` associa o nome da aba de respostas ao `instrument_id`, versão, nome público e função de correção.

## Campos do respondente

Os Forms devem pedir apenas o necessário ao instrumento e ao contexto. A identificação não pressupõe vínculo terapêutico.

Campos padronizados quando aplicáveis:

- `Nome completo` — opcional quando a aplicação puder ser anônima/avulsa;
- `Idade` — somente quando clinicamente necessária;
- `E-mail` — opcional;
- `Telefone` — opcional;
- `Origem do acesso` — Paciente em acompanhamento / Encaminhado / Recebi de outra pessoa / Acesso espontâneo / Outro;
- `Código clínico` — opcional; nunca obrigatório para acesso público;
- `Ciência de finalidade e limites` — obrigatória, deixando claro que rastreio não equivale a diagnóstico.

Os títulos de perguntas devem ser únicos em cada Form. Quando o texto clínico de dois itens for igual ou muito semelhante, usar um prefixo técnico estável, como `Q01 ·`, `Q02 ·`, preservando o texto do item após o identificador. O motor falha de forma fechada quando encontra cabeçalhos duplicados para impedir perda ou sobrescrita silenciosa de respostas.

`submission_id`, `instrument_id`, `instrument_version`, escores e status de relatório são derivados pelo Apps Script e não precisam ser perguntas visíveis no Form.

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
6. EIR-RS usa fluxo separado de segurança e não pode depender apenas de escore global.
7. O motor usa lock e `submission_id` para evitar e-mails duplicados.
8. Cabeçalhos duplicados em abas de respostas interrompem o processamento até saneamento do Form.

## Estados de migração

`ATIVO → ESPELHADO → VALIDADO → REDIRECIONADO → ARQUIVADO → EXCLUÍVEL`

Nenhum repositório individual deve avançar para `ARQUIVADO` antes de existir Form espelho, planilha vinculada, correção validada, relatório testado e URL canônica estável.

## Onda de implantação

1. Humor, Ansiedade e Autoestima — Forms já existentes.
2. Necessidades Emocionais, Codependência e ICAPS.
3. Esquemas, Modos e Impulsividade.
4. TDAH, TAB, Borderline, Narcisismo e Rastreio Geral.
5. Risco suicida — último, após validação específica de segurança.
