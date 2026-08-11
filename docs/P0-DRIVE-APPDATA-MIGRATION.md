# P0 — Migração do sync clínico para Google Drive appDataFolder

## Objetivo

Substituir o uso operacional da branch pública `clinic-sync-data` por um cofre cifrado armazenado no `appDataFolder` do Google Drive, preservando o banco local, o formato criptográfico, os IDs internos, a Agenda e a experiência visual da plataforma.

## Estado de segurança

- O GitHub público permanece apenas como código.
- Novas gravações em `.clinic-sync/vault.json` continuam bloqueadas pelo guardrail P0.
- A branch histórica não é apagada durante a migração.
- O novo storage exige o escopo OAuth `https://www.googleapis.com/auth/drive.appdata`.
- O conteúdo é cifrado no navegador antes do upload.
- A chave de sincronização não é enviada ao Google.

## Cutover seguro

1. Publicar a versão 2.5.0 somente após CI verde.
2. Abrir a plataforma no dispositivo principal que contém a base clínica atual.
3. Gerar e guardar um backup `.rmvault` antes de inicializar o novo remoto.
4. Em Configurações, reconectar o Google Workspace para conceder `drive.appdata`.
5. Confirmar que a plataforma mostra `Google Workspace: Autorizado` e `Cofre remoto: Ainda não inicializado`.
6. Inicializar o cofre privado somente a partir do dispositivo principal.
7. Guardar o código de sincronização fora da plataforma.
8. Executar `Sincronizar agora` e confirmar revisão remota sem erro.
9. No segundo dispositivo, reconectar o Google Workspace, informar o mesmo código de sincronização e sincronizar.
10. Testar alteração sintética notebook → celular → notebook antes de depender do novo remoto para trabalho real.

## Rollback

Enquanto o P0 não estiver concluído:

- não apagar `clinic-sync-data`;
- não reescrever histórico;
- não revogar credenciais antigas antes dos testes;
- manter `backup/p0-baseline-20260810` como referência de código anterior ao P0;
- manter backup `.rmvault` independente do `appDataFolder`.

## Gates de aceite

- CI `Static integrity` verde.
- CI `P0 Public Repo Guard` verde.
- teste sintético do merge verde.
- OAuth com `drive.appdata` concedido.
- criação/leitura/atualização do cofre privado confirmadas.
- backup → restore testado em dispositivo real.
- notebook ↔ celular testado.
- nenhuma gravação nova no GitHub público.
- auditoria final de credenciais e superfícies públicas concluída.

## Observação

O `appDataFolder` é storage de sincronização, não substituto do backup independente. O backup `.rmvault` continua obrigatório para recuperação controlada.
