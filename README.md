# Plataforma Clínica Richelmy Murta — v3.8.0

Aplicação clínica local-first publicada como código estático em GitHub Pages. O repositório público contém somente código e assets da aplicação; dados clínicos novos não são persistidos no GitHub.

## Fonte canônica de versão

A versão funcional da aplicação é definida em `assets/js/version.js`. `index.html`, entrypoint, documentação e testes devem permanecer coerentes com essa fonte. Identificador canônico: build `3.8.0-main-v250`.

## Arquitetura vigente

A plataforma usa cofre local cifrado e sincronização privada notebook ↔ celular por Google Drive `appDataFolder`.

Fluxo principal:

```text
IndexedDB local cifrado
        ↓
SyncManager v2.6
        ↓
Google Workspace OAuth — scope drive.appdata
        ↓
Google Drive appDataFolder
        ↓
cofre remoto cifrado AES-256-GCM
```

O antigo backend GitHub `clinic-sync-data` é legado e está bloqueado para novas escritas pelo guardrail P0. O GitHub público não deve ser usado como banco de pacientes, prontuários, sessões, respostas clínicas ou transcrições.

A linha 3.8 introduz hardening de integridade: leitura clínica fail-closed, tombstones transacionais, vínculo paciente–sessão–prontuário verificado, módulos ES com identidade canônica, carregamento de funcionalidades após autenticação e gates de CI que falham quando smoke/E2E/Lighthouse falham.

## Segurança e privacidade

- dados locais protegidos por PBKDF2-HMAC-SHA256 + AES-GCM;
- cofre remoto protegido por AES-256-GCM antes da gravação no `appDataFolder`;
- código de sincronização separado da senha de acesso local;
- Google Drive `appDataFolder` não aparece como arquivo comum no Meu Drive;
- nenhum nome/codinome de paciente deve ser hardcoded no código público;
- `public-clinical-storage-guard-v251.js` bloqueia novas escritas clínicas no backend GitHub legado;
- conteúdo Gemini/Meet deve permanecer em ambiente clínico restrito;
- divergências reais de dados bloqueiam a sincronização automática e exigem decisão explícita;
- prontuário final não deve ser sobrescrito automaticamente por Gemini/IA;
- falha de descriptografia não é interpretada como store vazia;
- gravação/exclusão e seus tombstones usam a mesma transação local quando pertencem à mesma operação lógica.

## Sincronização privada

`assets/js/secure-sync-v260.js` é o runtime atual de sincronização. Ele implementa:

- Google Drive privado como provider `google-drive-appdata`;
- detecção de cofre remoto e revisão remota;
- merge por clocks e baseline;
- bloqueio de conflitos reais;
- retries em alterações concorrentes;
- eleição de aba líder com `BroadcastChannel`;
- heartbeat e push event-driven;
- adoção segura do cofre remoto por novo dispositivo;
- identificação estável do dispositivo.

O módulo `assets/js/drive-appdata-storage-v260.js` executa leitura/escrita exclusivamente no `appDataFolder`.

## Gemini e conciliação clínica

`assets/js/clinical-reconcile-v270.js` é o runtime canônico de conciliação Gemini/Meet. A identidade de módulos deve permanecer única no navegador: o mesmo arquivo não deve ser carregado simultaneamente com e sem query string. Conteúdo clínico conciliado continua restrito ao cofre e aos fluxos privados autorizados.

## Backup e restore

A Central de Backup gera `.rmvault` local. A validação atual inclui teste de restore isolado: o arquivo é carregado em um IndexedDB temporário, todos os stores são relidos e comparados e o banco temporário é removido ao final. A base clínica ativa não é alterada durante esse teste.

Arquivos relacionados:

- `assets/js/backup.js` — backup, teste isolado e restore;
- `tests/self-test.html` — autoteste não destrutivo;
- `CLINICAL_CUTOVER_CHECKLIST.md` — gate operacional para migração do dispositivo principal e segundo dispositivo.

## Google Calendar e início de sessão

O Calendar é camada operacional, não prontuário. O título permitido para sessões é:

```text
T – Nome
```

Não devem ser enviados para a descrição do evento diagnóstico, conteúdo de sessão, prontuário, respostas de instrumentos, transcrição Gemini ou outros dados clínicos.

O runtime `assets/js/clinical-session-runtime-v370.js` implementa o ciclo operacional de sessão. Para uma sessão do dia, o comando `Iniciar sessão` localiza o evento por identidade estável, reutiliza um Google Meet existente ou solicita uma única conferência no próprio evento, grava `sessionStartedAt` no cofre cifrado com readback e abre o Meet. O cronômetro é derivado do timestamp persistido, e não de estado volátil do navegador.

Ao encerrar, a plataforma registra `sessionEndedAt`, duração real, presença e estado realizado, com opção de desfazer um início acidental sem apagar o Meet já criado. Alterações no Google Calendar preservam a identidade da sessão para evitar duplicações.

## Gate de release

A branch de hardening não deve ser promovida para produção enquanto houver falha em teste de regressão, smoke, persistência, Agenda, isolamento de prontuário, estabilidade visual, Public Repo Guard ou nos limiares definidos de Lighthouse. O CI é deliberadamente fail-closed.
