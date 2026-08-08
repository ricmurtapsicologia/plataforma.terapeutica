# Plataforma Clínica Richelmy Murta — v2.2.0

Aplicação clínica local-first publicada em GitHub Pages. O cofre clínico permanece no dispositivo, cifrado em AES-GCM, com sincronização cifrada notebook ↔ celular e integrações opcionais com Google Agenda e Google Meet/Gemini.

## Arquitetura clínica v2.2

```text
Google Meet
   ↓
Anotações do Gemini no Google Drive
   ↓
Google Workspace OAuth (Drive somente leitura)
   ↓
INBOX GEMINI LOCAL CIFRADO
   ├─ associação segura pelo nome → PRONTO
   └─ associação duvidosa → REVISAR
             ↓
Paciente → Prontuário
   ↓
[Revisar] [Criar prontuário]
   ↓
Rascunho clínico
   ↓
revisão profissional
   ↓
Finalizado
   ↓
cofre + sincronização cifrada
```

### Regra principal de segurança

A varredura automática do Gemini **não grava mais pacientes, sessões ou prontuários no cofre sincronizado**. Ela apenas atualiza um inbox local cifrado.

Isso evita que notebook e celular produzam, ao mesmo tempo, versões diferentes do mesmo registro apenas porque ambos encontraram o mesmo arquivo do Gemini.

A escrita no cofre ocorre somente quando o profissional usa `Criar prontuário`, salva um rascunho ou finaliza o registro.

## Recepção do Google Meet/Gemini

- backfill a partir de `01/06/2026`;
- busca somente Google Docs de Anotações do Gemini;
- identifica o paciente prioritariamente pelo nome completo/nome preferido encontrado nas anotações/transcrição;
- data e horário servem como confirmação;
- primeiro nome isolado sem confirmação suficiente não gera prontuário automaticamente;
- resumo ambíguo permanece na fila `Revisar`;
- arquivos já classificados e não modificados não são relidos a cada ciclo;
- o mesmo `fileId` do Google é usado como identificador estável;
- transcrição integral não é copiada para o prontuário;
- o arquivo original continua no Google Drive.

### Estados

- `Pronto` — paciente associado com segurança; aparece na ficha do paciente com `Revisar` e `Criar prontuário`;
- `Revisar` — identidade ou vínculo não suficientemente seguro;
- `Prontuário` — rascunho clínico já criado;
- `Finalizado` — registro revisado e validado profissionalmente.

## Fim do loop “Conferindo”

A v2.2 elimina a revarredura contínua observada na v2.1:

1. um arquivo sem alteração mantém sua classificação local;
2. `quarentena/revisar` não é relido automaticamente enquanto `modifiedTime` não mudar;
3. o evento `Dados ✓` dispara somente a transição inicial para uma conferência;
4. novas conferências automáticas respeitam intervalo mínimo de 5 minutos;
5. ao terminar o lote, o estado muda explicitamente para `Meet ✓`.

## Prontuário psicológico

O rascunho derivado do Gemini segue uma estrutura clínica sintética:

1. `Foco clínico e evolução da sessão`;
2. `Procedimentos técnico-científicos adotados` — somente quando identificáveis na fonte;
3. `Resposta do paciente e resultados observados` — somente quando constam no resumo;
4. `Plano terapêutico, tarefas e encaminhamentos`.

A organização foi desenhada para ser compatível com a Resolução CFP nº 001/2009 e orientações atuais do Sistema Conselhos: o registro deve contemplar de forma sucinta a evolução do trabalho, procedimentos técnico-científicos adotados, resultados/decisões e encaminhamentos, preservando sigilo e somente informações necessárias.

A abordagem clínica é compatível com Terapia Cognitivo-Comportamental, mas **não presume técnica, diagnóstico, risco, sintoma ou resultado que não esteja documentado na fonte**. O Gemini é fonte auxiliar; a responsabilidade técnica permanece do profissional que revisa/finaliza o registro.

Referências normativas utilizadas no desenho do fluxo:

- Resolução CFP nº 001/2009 — registro documental;
- Manual Orientativo de Registro e Elaboração de Documentos Psicológicos do CFP (2025);
- orientações dos CRPs sobre prontuário psicológico, prontuário eletrônico, sigilo e acesso da pessoa atendida.

## Fila de revisão

Em `Configurações → Google Meet · Gemini` existem:

- `Conferir novos resumos`;
- `Revisar pendências`;
- uma lista das pendências mais recentes;
- botão `Revisar`;
- botão `Criar prontuário` quando há paciente associado.

Na ficha do paciente, aba `Prontuário`, um resumo associado aparece antes do formulário como `Resumo(s) aguardando prontuário`, sem ainda modificar o cofre.

Ao revisar uma pendência é possível:

- conferir data/horário;
- selecionar/corrigir o paciente;
- ver a síntese/rastro clínico;
- abrir o Google Doc original;
- salvar a associação;
- criar o prontuário.

## Conflito notebook ↔ celular

A sincronização continua com detecção de conflito por registro.

A v2.2 adiciona uma recuperação controlada para o cenário em que o notebook está correto/sincronizado e o celular apresenta conflito. Em Configurações, quando `Dados` estiver em conflito, aparece `Usar cofre remoto nos conflitos`.

Essa ação:

- deve ser usada no dispositivo secundário somente quando a versão remota está correta;
- substitui **somente os registros conflitantes** pela versão remota;
- preserva alterações locais que não estejam em conflito;
- recompõe a baseline e permite que a sincronização normal continue.

Ela não é executada automaticamente.

## Google Workspace

Uma autorização Google por dispositivo atende:

- `calendar.events` — Google Agenda;
- `drive.readonly` — leitura das Anotações do Gemini.

O token é de curta duração e fica cifrado localmente com a chave do cofre. Segredos OAuth não são publicados no repositório.

## Indicadores do cabeçalho

- `Dados ✓` — cofre notebook ↔ celular sincronizado;
- `Agenda ✓` — Google Agenda operacional;
- `Meet ✓` — Gemini catalogado e sem varredura pendente;
- `Meet ↻` — conferência em andamento;
- `Meet !` — erro de autorização/leitura;
- estado pausado durante conflito de `Dados`.

## Limitação do GitHub Pages

Como a aplicação é estática, não executa quando o navegador está totalmente fechado. Novos resumos são verificados ao abrir/retomar a plataforma e periodicamente enquanto ela estiver aberta. Automação 24/7 exigirá worker privado externo; a chave do cofre não deve ser entregue a esse worker.

## Segurança

- PBKDF2-HMAC-SHA256 para derivação da chave local;
- AES-GCM para registros clínicos;
- `clinic-sync-data` contém somente envelope cifrado;
- tokens Google/GitHub ficam cifrados localmente;
- conteúdo clínico e nomes de pacientes não entram no código público;
- inbox Gemini é cifrado localmente;
- transcrição integral não é persistida pela integração;
- registros finalizados não são sobrescritos pelo Gemini;
- varredura Gemini não altera o cofre;
- conflitos pausam qualquer criação de prontuário.

## Organização funcional

Benchmarking de fluxo com sistemas clínicos profissionais, incluindo PsicoManager, foi usado apenas como referência de ergonomia. A plataforma prioriza cinco núcleos: Agenda, Pacientes, Sessões/Prontuário, Recursos/Documentos e Financeiro, com integrações técnicas mantidas em Configurações.

## Arquivos centrais

- `assets/js/database.js` — IndexedDB/persistência cifrada;
- `assets/js/secure-sync-v160.js` — sincronização do cofre;
- `assets/js/sync-supervisor-v162.js` — watchdog;
- `assets/js/sync-conflict-recovery-v220.js` — resolução controlada de conflito;
- `assets/js/google-calendar-v168.js` — Agenda;
- `assets/js/google-workspace-oauth-v200.js` — autorização Workspace;
- `assets/js/google-gemini-clinical-v220.js` — inbox, classificação, revisão e criação explícita;
- `assets/js/ai-record-review-v220.js` — revisão/finalização profissional;
- `assets/js/workspace-status-v210.js` — indicador Meet;
- `assets/css/google-clinical-v220.css` — UX Gemini;
- `tests/self-test.html` — autoteste não destrutivo.

## Publicação

- aplicação: `main` / GitHub Pages;
- cofre remoto: `clinic-sync-data/.clinic-sync/vault.json`;
- versão: `2.2.0`;
- schema clínico: preservado; não há migração de IndexedDB nesta versão.
