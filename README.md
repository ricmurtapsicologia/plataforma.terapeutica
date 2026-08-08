# Plataforma Clínica Richelmy Murta — v2.1.1

Aplicação clínica local-first publicada em GitHub Pages, com cofre AES-GCM, sincronização cifrada entre dispositivos, Google Agenda e integração automática com Google Meet/Gemini.

## Fluxo clínico

```text
Google Meet
   ↓
Anotações do Gemini no Google Drive
   ↓
Google Workspace OAuth
   ↓
Dados ✓ (cofre sincronizado)
   ↓
identificação do paciente pelo nome do participante
   ↓
confirmação por data/horário
   ↓
Sessão da Agenda da plataforma
   ↓
Rascunho IA no Prontuário
   ↓
revisão profissional
   ↓
Finalizado
```

## Importação do Gemini

- backfill automático a partir de `01/06/2026`;
- procura o nome do paciente nas próprias Anotações/Transcrição do Gemini;
- não utiliza `PAC-xxx` para identificar o paciente;
- data e horário confirmam a associação;
- nome completo do participante tem prioridade;
- primeiro nome só é aceito quando é único no cofre e existe uma sessão próxima no mesmo dia;
- associação ambígua permanece em quarentena;
- sessão existente é marcada `Realizada` e `Presente` quando a correspondência é segura;
- se não existir sessão local, cria sessão histórica com a data/hora do Meet;
- sessão cancelada/desmarcada não é reativada silenciosamente;
- cada resumo produz um registro `Rascunho IA` ligado à sessão;
- registro `Finalizado` nunca é sobrescrito pelo Gemini;
- rascunho editado depois da versão do Gemini não é sobrescrito automaticamente;
- revisão/finalização atualiza o mesmo registro, sem duplicação.

### Proteção contra conflitos

A v2.1.1 não inicia o backfill enquanto a sincronização notebook ↔ celular não estiver em `Dados ✓`.

Se o cofre estiver `Sincronizando`, `Pendente` ou `Conflito`, a importação é pausada. O Gemini volta a conferir automaticamente depois que o evento `rm:sync-status` informa `synced`.

O backfill é persistido em lote. Durante a gravação, eventos intermediários de sincronização são silenciados e, ao final, uma única alteração é sinalizada ao cofre. O Google Agenda não recebe eventos históricos duplicados durante esse processo.

## Idempotência

Os IDs são derivados do `fileId` do documento Gemini:

- sessão: `gmappt_<fileId>`;
- prontuário: `gmrec_<fileId>`.

Notebook e celular reconhecem o mesmo resumo como o mesmo registro.

## Estrutura do Rascunho IA

O texto do Gemini é organizado sem acrescentar informação ausente:

1. `Foco e evolução da sessão`;
2. `Intervenções e conteúdos trabalhados`;
3. `Orientações, tarefas ou encaminhamentos`.

O nome do paciente é neutralizado no texto gerado. A transcrição integral não é armazenada no cofre pela integração.

No Prontuário, `Rascunho IA` recebe a ação `Revisar IA`. Salvar ou finalizar atualiza o próprio registro.

## Google Workspace

Uma única autorização Google por dispositivo atende:

- `calendar.events` — Google Agenda;
- `drive.readonly` — leitura das Anotações do Gemini.

O token é de curta duração e fica cifrado localmente. Se houver `403`, a integração diferencia falta de escopo de `Google Drive API` desabilitada e apresenta acesso para ativação da API no projeto OAuth.

## Indicadores do cabeçalho

- `Dados ✓` — sincronização notebook ↔ celular;
- `Agenda ✓` — Google Agenda;
- `Meet ✓` — leitura Meet/Gemini.

`↻` indica processamento e `!` indica falha/ação necessária. No celular, o relógio pode ser ocultado para preservar os três estados sem quebrar a largura da tela.

## Limite do GitHub Pages

A página estática não executa com o navegador totalmente fechado. Os resumos são conferidos:

- depois que o cofre termina a sincronização inicial;
- ao retornar à aba;
- ao recuperar internet;
- a cada cinco minutos enquanto a plataforma permanece aberta.

Se uma sessão ocorrer com a plataforma fechada, o resumo entra automaticamente na próxima abertura após `Dados ✓`.

## Organização e benchmarking

A ficha do paciente usa cinco macroáreas, inspiradas em princípios de ergonomia de sistemas clínicos profissionais como o PsicoManager, sem copiar componentes proprietários:

- Visão geral;
- Clínica;
- Intervenções;
- Documentos;
- Administrativo.

A IA permanece integrada ao fluxo `Sessão → Prontuário` e não vira um silo separado.

## Segurança

- PBKDF2-HMAC-SHA256 para derivação da chave local;
- AES-GCM para registros clínicos;
- branch `clinic-sync-data` contém apenas envelope cifrado;
- tokens Google e GitHub ficam cifrados localmente;
- conteúdo clínico não é publicado no GitHub;
- importação aguarda `Dados ✓`;
- registros finalizados não são alterados automaticamente;
- conflitos reais bloqueiam a importação;
- testes não acessam o banco clínico real.

## Arquivos centrais

- `assets/js/database.js` — IndexedDB e persistência cifrada;
- `assets/js/secure-sync-v160.js` — sincronização do cofre;
- `assets/js/sync-supervisor-v162.js` — watchdog;
- `assets/js/google-calendar-v168.js` — Agenda;
- `assets/js/google-workspace-oauth-v200.js` — autorização Workspace;
- `assets/js/google-gemini-clinical-v210.js` — backfill/importação;
- `assets/js/ai-record-review-v210.js` — revisão de Rascunho IA;
- `assets/js/workspace-status-v210.js` — indicador Meet;
- `assets/css/google-clinical-v210.css` — apresentação;
- `tests/self-test.html` — autoteste não destrutivo.

## Publicação

- aplicação: `main` / GitHub Pages;
- cofre sincronizado: `clinic-sync-data/.clinic-sync/vault.json`;
- versão de interface: `2.1.1`;
- referência anterior: `backup-pre-gemini-autofill-v2.1`.
