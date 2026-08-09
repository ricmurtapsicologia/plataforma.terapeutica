# Plataforma Clínica Richelmy Murta — v2.3.0

Aplicação clínica local-first em GitHub Pages, com cofre AES-GCM, sincronização cifrada notebook ↔ celular, Google Agenda e conciliação das Anotações do Google Meet/Gemini com Sessões e Prontuário.

## Fluxo v2.3

```text
Google Meet → Anotações do Gemini no Drive
                     ↓
            identificação nominal
                     ↓
        normalização de data/horário
                     ↓
        Sessão realizada / presente
                     ↓
        Rascunho IA no prontuário
                     ↓
           revisão profissional
                     ↓
                Finalizado
                     ↓
          cofre + sync cifrada
```

A conciliação só grava no cofre quando `Dados ✓`. Se houver conflito notebook ↔ celular, o Gemini fica pausado e não cria ou altera sessões/prontuários.

## Período rastreado

- backfill desde `01/05/2026`;
- somente Google Docs identificados como Anotações do Gemini;
- arquivos novos ou modificados são verificados periodicamente enquanto a aplicação está aberta;
- `fileId` do Google é usado como identidade estável da sessão para impedir duplicação.

## Identificação do paciente

A associação não depende do código `PAC-xxx`.

A ordem de evidências é:

1. nome completo/nome preferido encontrado no conteúdo do Gemini;
2. identificador/apelido explicitamente relacionado ao paciente dentro das próprias anotações, aprendido localmente e mantido cifrado;
3. primeiro nome, somente quando é único entre os pacientes em acompanhamento.

O nome do profissional é excluído da identificação de paciente. Itens ambíguos não são forçados para um prontuário.

## Data e horário

O título das Anotações do Gemini é a fonte primária de data e hora da sessão realizada.

Para conciliar com a agenda clínica, os minutos são arredondados para o horário cheio mais próximo:

- `20:04 → 20:00`;
- `19:05 → 19:00`;
- `20:22 → 20:00`;
- `18:57 → 19:00`.

Uma sessão já existente próxima pode ser movida para a data/hora comprovada pelo Gemini quando não possui prontuário conflitante. Caso contrário, é criada uma sessão determinística própria, marcada como `Realizada / Presente`.

## Prontuário automático

Para cada sessão Gemini associada com segurança, a plataforma garante a existência de um prontuário.

O registro automático é criado como `Rascunho IA`, nunca como `Finalizado`.

Estrutura:

1. `Foco clínico e evolução da sessão`;
2. `Procedimentos técnico-científicos adotados` — somente quando descritos na fonte;
3. `Resposta do paciente e resultados observados` — somente quando documentados;
4. `Plano terapêutico, tarefas e encaminhamentos`.

A transcrição integral não é copiada para o prontuário e permanece no Google Drive.

Registros finalizados não são sobrescritos pelo Gemini. Se já existir um registro manual para a mesma data/sessão, ele é preservado e considerado cobertura clínica da sessão.

## Botão “Gerar prontuário por IA”

Na ficha individual e em `Paciente → Prontuário` existe o botão `Gerar prontuário por IA`.

Ele utiliza o conteúdo já produzido por IA pelo Google Gemini e aplica o prompt clínico `TCC-CFP-v2.3` para estruturar o rascunho. Nesta versão não existe uma segunda chamada a um modelo generativo externo: isso evita publicar chave de API ou enviar prontuário para outro serviço a partir de uma página estática.

### Prompt clínico TCC-CFP-v2.3

> Atue como apoio à documentação clínica de um psicólogo com referencial principal em Terapia Cognitivo-Comportamental. A partir exclusivamente do resumo e das anotações produzidas pelo Google Meet/Gemini, redija uma evolução de prontuário sintética, objetiva, cronológica e tecnicamente defensável. Registre somente elementos necessários ao acompanhamento: foco/demanda da sessão, evolução clínica observável, procedimentos técnico-científicos efetivamente descritos, resposta do paciente, decisões clínicas, tarefas e encaminhamentos. Não invente diagnóstico, hipótese, técnica, risco, sintoma, fala, resultado ou conduta ausente na fonte. Não copie a transcrição integral. Evite juízos morais, detalhes íntimos sem pertinência clínica e linguagem estigmatizante. Preserve a distinção entre relato do paciente e intervenção profissional. O texto final deve ser revisado pelo psicólogo antes da finalização.

A responsabilidade técnica permanece do profissional que revisa e finaliza o registro.

## Ficha individual do paciente

A navegação foi ajustada para contexto clínico único:

- a tela `Pacientes` mostra a lista apenas enquanto nenhum paciente está aberto;
- ao abrir um paciente, a grade com todos os demais deixa de ficar visível;
- a ficha individual passa a ser o contexto principal;
- `Prontuário` e `Gerar prontuário por IA` ficam disponíveis diretamente no cabeçalho da ficha;
- `Trocar paciente` retorna à lista geral.

Isso reduz exposição desnecessária de nomes e aproxima a UX de sistemas clínicos profissionais.

## Google Workspace

Escopos por dispositivo:

- `calendar.events` — criação/edição da Google Agenda;
- `drive.readonly` — leitura das Anotações do Gemini.

O token é curto e cifrado localmente. Nenhum segredo OAuth ou conteúdo clínico é publicado no GitHub.

## Sincronização notebook ↔ celular

A conciliação Gemini só inicia em `Dados ✓`.

- `Dados ✓`: seguro para conciliar;
- conflito: Gemini fica pausado;
- IDs de sessão/prontuário derivados do `fileId` evitam duplicação;
- timestamps de registros automáticos derivam da própria sessão/arquivo, reduzindo divergências entre dispositivos;
- um dispositivo que recebe primeiro o registro remoto não o recria localmente.

A recuperação controlada de conflitos da v2.2 continua disponível em Configurações.

## Indicadores

- `Dados ✓` — cofre sincronizado;
- `Agenda ✓` — Google Agenda operacional;
- `Meet ✓` — Gemini conciliado;
- `Meet ↻` — conciliação ativa;
- `Meet •` — pausado, inclusive durante conflito de Dados;
- `Meet !` — falha de autorização/leitura.

## Limitação do GitHub Pages

A aplicação não executa com todos os navegadores fechados. Um resumo criado enquanto a plataforma estiver fechada será conciliado na próxima abertura, depois de `Dados ✓`. Automação 24/7 exigiria um worker privado externo; a chave do cofre não deve ser enviada a esse worker.

## Segurança

- PBKDF2-HMAC-SHA256 + AES-GCM;
- `clinic-sync-data` armazena somente envelope cifrado;
- catálogo Gemini cifrado localmente;
- tokens Google/GitHub cifrados localmente;
- nomes e conteúdo clínico não entram no código público;
- transcrição integral não entra no prontuário;
- registro finalizado não é sobrescrito;
- conflito pausa a conciliação.

## Organização funcional

O benchmarking usa sistemas clínicos profissionais, inclusive PsicoManager, somente como referência de ergonomia. Os núcleos permanecem: Hoje, Agenda, Pacientes, Sessões/Prontuário, Recursos/Documentos, Financeiro e Configurações/Integrações.

## Arquivos centrais

- `assets/js/secure-sync-v160.js` — sincronização cifrada;
- `assets/js/sync-conflict-recovery-v220.js` — recuperação controlada de conflitos;
- `assets/js/google-calendar-v168.js` — Google Agenda;
- `assets/js/google-workspace-oauth-v200.js` — OAuth Agenda + Drive;
- `assets/js/clinical-reconcile-v230.js` — backfill desde maio, associação nominal, conciliação de sessões e prontuário automático;
- `assets/js/ai-record-review-v220.js` — revisão/finalização profissional;
- `assets/js/workspace-status-v220.js` — indicador Meet;
- `assets/css/google-clinical-v220.css` — UX da integração clínica;
- `tests/self-test.html` — autoteste não destrutivo.

## Publicação

- aplicação: `main` / GitHub Pages;
- cofre remoto: `clinic-sync-data/.clinic-sync/vault.json`;
- versão: `2.3.0`;
- `SCHEMA_VERSION`: preservado; sem migração de IndexedDB.
