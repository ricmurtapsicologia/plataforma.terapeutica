# Plataforma Clínica Richelmy Murta — v2.2.0

Aplicação clínica local-first em GitHub Pages, com cofre AES-GCM, sincronização cifrada notebook ↔ celular, Google Agenda e recepção controlada das Anotações do Google Meet/Gemini.

## Fluxo v2.2

```text
Google Meet → Gemini/Drive → inbox local cifrado
                              ↓
                    associação pelo nome
                     ↙                 ↘
                  PRONTO             REVISAR
                     ↓                 ↓
               Paciente → Prontuário
                  [Revisar] [Criar prontuário]
                              ↓
                    Rascunho clínico
                              ↓
                    revisão profissional
                              ↓
                         Finalizado
                              ↓
                 cofre + sync cifrada
```

### Mudança central

A varredura automática do Gemini não grava mais sessões ou prontuários no cofre sincronizado. Ela atualiza somente um inbox local cifrado. Isso impede que notebook e celular gerem versões concorrentes do mesmo registro ao encontrar o mesmo arquivo.

O cofre só é alterado quando o profissional usa `Criar prontuário`, salva o rascunho ou finaliza o registro.

## Google Meet/Gemini

- backfill desde `01/06/2026`;
- identificação prioritária pelo nome completo/nome preferido encontrado nas Anotações/Transcrição do Gemini;
- data e horário confirmam a associação;
- primeiro nome isolado, sem confirmação suficiente, exige revisão;
- itens ambíguos ficam em `Revisar`;
- arquivos já classificados e não modificados não são relidos em todos os ciclos;
- transcrição integral não é copiada para o prontuário;
- documento original permanece no Google Drive;
- `fileId` do Google funciona como identificador estável e evita duplicação.

### Fim do loop “Conferindo”

1. `ready`, `quarantine`, `review` e `imported` são estados estáveis enquanto o arquivo não mudar;
2. o evento `Dados ✓` dispara somente a transição inicial para uma conferência;
3. as verificações automáticas respeitam intervalo mínimo de 5 minutos;
4. ao concluir a varredura o módulo encerra `scanning` e publica `Meet ✓`;
5. durante conflito de Dados o estado fica pausado (`Meet •`) e nenhum prontuário é criado.

## Revisar e criar prontuário

Em `Configurações → Google Meet · Gemini` existem:

- `Conferir novos resumos`;
- `Revisar pendências`;
- fila das pendências recentes;
- `Revisar`;
- `Criar prontuário` quando o paciente está definido.

Na ficha `Paciente → Prontuário`, resumos associados aparecem como `Resumo(s) aguardando prontuário`, sem ainda alterar o cofre.

Na revisão é possível conferir data/horário, corrigir o paciente, visualizar a síntese, abrir o Google Doc original e criar o rascunho clínico.

## Estrutura clínica do rascunho

O rascunho é sintético e orientado por TCC, sem inventar informação ausente:

1. `Foco clínico e evolução da sessão`;
2. `Procedimentos técnico-científicos adotados` — somente se constarem na fonte;
3. `Resposta do paciente e resultados observados` — somente quando documentados;
4. `Plano terapêutico, tarefas e encaminhamentos`.

O desenho segue a Resolução CFP nº 001/2009 e o Manual Orientativo de Registro e Elaboração de Documentos Psicológicos do CFP (2025): o prontuário deve permitir acompanhar demanda/objetivos, evolução, procedimentos técnico-científicos e encaminhamentos de forma sintética, necessária e sigilosa.

A plataforma não presume diagnóstico, técnica, risco, sintoma ou resultado. O Gemini é fonte auxiliar; a responsabilidade técnica permanece do profissional que revisa/finaliza.

## Conflito notebook ↔ celular

A detecção de conflito por registro continua ativa. A v2.2 acrescenta `Usar cofre remoto nos conflitos` quando `Dados` estiver em conflito.

Use essa ação no dispositivo secundário somente quando o notebook estiver correto e sincronizado. A recuperação:

- identifica os registros realmente conflitantes;
- substitui somente esses registros pela versão remota;
- preserva alterações locais não conflitantes;
- recompõe a baseline e permite que a sincronização normal continue;
- nunca roda automaticamente.

## Google Workspace

Escopos por dispositivo:

- `calendar.events` — Google Agenda;
- `drive.readonly` — leitura das Anotações do Gemini.

O token é curto e cifrado localmente. Nenhum segredo OAuth ou conteúdo clínico é publicado no GitHub.

## Indicadores

- `Dados ✓` — cofre sincronizado;
- `Agenda ✓` — Google Agenda operacional;
- `Meet ✓` — Gemini catalogado;
- `Meet ↻` — conferência ativa;
- `Meet •` — pausado, inclusive durante conflito de Dados;
- `Meet !` — falha de autorização/leitura.

## Limitação do GitHub Pages

A página não executa quando o navegador está totalmente fechado. Resumos novos são verificados ao retomar a plataforma e periodicamente enquanto ela está aberta. Automação 24/7 exigirá worker privado externo, que não deve receber a chave do cofre.

## Segurança

- PBKDF2-HMAC-SHA256 + AES-GCM;
- `clinic-sync-data` armazena somente envelope cifrado;
- inbox Gemini cifrado localmente;
- tokens Google/GitHub cifrados localmente;
- nomes e conteúdo clínico não entram no código público;
- varredura Gemini não altera o cofre;
- registro finalizado não é sobrescrito pelo Gemini;
- conflito pausa criação de prontuário.

## Organização funcional

O benchmarking de produto usa sistemas clínicos profissionais, inclusive PsicoManager, apenas como referência de ergonomia. A plataforma mantém como núcleos: Agenda, Pacientes, Sessões/Prontuário, Recursos/Documentos, Financeiro e Configurações/Integrações.

## Arquivos centrais

- `assets/js/secure-sync-v160.js` — sincronização cifrada;
- `assets/js/sync-conflict-recovery-v220.js` — recuperação controlada de conflitos;
- `assets/js/google-calendar-v168.js` — Agenda;
- `assets/js/google-workspace-oauth-v200.js` — Google Workspace;
- `assets/js/google-gemini-clinical-v220.js` — inbox, associação, revisão e criação explícita;
- `assets/js/ai-record-review-v220.js` — revisão/finalização profissional;
- `assets/js/workspace-status-v220.js` — indicador Meet;
- `assets/css/google-clinical-v220.css` — UX Gemini;
- `tests/self-test.html` — autoteste não destrutivo.

## Publicação

- aplicação: `main` / GitHub Pages;
- cofre remoto: `clinic-sync-data/.clinic-sync/vault.json`;
- versão: `2.2.0`;
- `SCHEMA_VERSION`: preservado; sem migração de IndexedDB.
