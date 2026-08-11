# Plataforma Clínica Richelmy Murta — v2.5.2

Aplicação clínica local-first publicada como código estático em GitHub Pages. O repositório público contém somente código e assets da aplicação; dados clínicos novos não são persistidos no GitHub.

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

## Segurança e privacidade

- dados locais protegidos por PBKDF2-HMAC-SHA256 + AES-GCM;
- cofre remoto protegido por AES-256-GCM antes da gravação no `appDataFolder`;
- código de sincronização separado da senha de acesso local;
- Google Drive `appDataFolder` não aparece como arquivo comum no Meu Drive;
- nenhum nome/codinome de paciente é hardcoded no código público;
- `public-clinical-storage-guard-v251.js` bloqueia novas escritas clínicas no backend GitHub legado;
- conteúdo Gemini/Meet deve permanecer em ambiente clínico restrito;
- divergências reais de dados bloqueiam a sincronização automática e exigem decisão explícita;
- prontuário final não deve ser sobrescrito automaticamente por Gemini/IA.

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

## Backup e restore

A Central de Backup gera `.rmvault` local. A validação atual inclui teste de restore isolado: o arquivo é carregado em um IndexedDB temporário, todos os stores são relidos e comparados e o banco temporário é removido ao final. A base clínica ativa não é alterada durante esse teste.

Arquivos relacionados:

- `assets/js/backup.js` — backup, teste isolado e restore;
- `tests/self-test.html` — autoteste não destrutivo;
- `CLINICAL_CUTOVER_CHECKLIST.md` — gate operacional para migração do dispositivo principal e segundo dispositivo.

## Google Calendar

O Calendar é camada operacional, não prontuário. O título permitido para sessões é:

```text
T – Nome
```

Não devem ser enviados para a descrição do evento diagnóstico, conteúdo de sessão, prontuário, respostas de instrumentos, transcrição Gemini ou outros dados clínicos.

## Meet / Gemini

Pipeline autorizado:

```text
Anotações Gemini RAW
        ↓
Drive clínico / 03_ARQUIVO_RESTRITO
        ↓
DRAFT_NEEDS_REVIEW em 02_PROCESSAMENTO
        ↓
revisão profissional obrigatória
        ↓
registro final no cofre clínico
```

A saída automática do Gemini é fonte RAW e pode conter erros. IA pode preparar draft, mas não finaliza prontuário sem revisão profissional.

## Entrypoints atuais

- `index.html` — build `2.5.2`;
- `assets/js/main-v250.js` — entrypoint principal;
- `assets/js/bootstrap-v240.js` — boot/login e carregamento do SyncManager atual;
- `assets/js/secure-sync-v260.js` — sincronização privada;
- `assets/js/drive-appdata-storage-v260.js` — storage remoto privado;
- `assets/js/google-workspace-token-v260.js` — autorização Workspace/appData;
- `assets/js/public-clinical-storage-guard-v251.js` — fail-closed para storage clínico público legado;
- `assets/js/gemini-sharing-guard-v250.js` — guardrail de compartilhamento Gemini;
- `assets/js/clinical-reconcile-v240.js` — conciliação incremental Gemini;
- `tests/self-test.html` — autoteste não destrutivo.

## Estado de implantação

Código/arquitetura privada: implementados.

Ainda dependem do dispositivo do usuário e não podem ser concluídos apenas por CI remoto:

1. gerar/validar backup `.rmvault` no dispositivo principal;
2. reconectar Google Workspace com autorização `drive.appdata`;
3. inicializar o cofre privado a partir da base correta no dispositivo principal;
4. configurar o segundo dispositivo com o mesmo código de sincronização;
5. comprovar notebook ↔ celular nos dois sentidos;
6. executar teste de restore isolado com um backup real;
7. confirmar que o backend GitHub legado não é mais necessário para operação clínica.

Somente depois desses gates o cutover deve ser marcado como concluído.
