# Clinical Private Vault — Cutover & Acceptance Checklist

Este checklist encerra o P0/P5 de storage clínico. Ele deve ser executado no dispositivo principal e depois em um segundo dispositivo real. Não registre senhas, código de sincronização, nomes de pacientes ou conteúdo clínico neste arquivo, em issues ou em logs públicos.

## Gate A — preparação no dispositivo principal

- [ ] Confirmar que a plataforma carregada é build 2.5.2 ou superior.
- [ ] Executar `Configurações → Executar diagnóstico` e corrigir qualquer erro antes de prosseguir.
- [ ] Gerar um backup `.rmvault` local.
- [ ] Usar `Testar restore isolado` sobre esse backup e exigir resultado positivo.
- [ ] Guardar o backup fora do repositório GitHub e fora de pastas públicas/compartilhadas.

Critério de aceite: backup real validado em IndexedDB temporário sem alteração da base ativa.

## Gate B — autorização Google privada

- [ ] Em `Configurações`, abrir a área de sincronização segura.
- [ ] Reconectar Google Workspace quando solicitado.
- [ ] Confirmar autorização para o scope `drive.appdata`.
- [ ] Confirmar na interface: `Storage remoto = Google Drive privado` e `Área = appDataFolder`.

Critério de aceite: Workspace autorizado e provider identificado como `google-drive-appdata`.

## Gate C — inicialização do cofre remoto

Este gate deve ser executado somente no dispositivo que contém a base clínica correta e completa.

- [ ] Confirmar novamente que a base local exibida é a base correta.
- [ ] Selecionar `Inicializar cofre privado neste dispositivo`.
- [ ] Gerar e guardar o código de sincronização em local seguro, fora do GitHub.
- [ ] Confirmar que a interface passa a mostrar `Cofre remoto = Inicializado`.
- [ ] Confirmar revisão remota maior que zero e estado `Dados ✓`/sincronizado.

Critério de aceite: primeira revisão cifrada gravada em `appDataFolder` sem escrita no backend GitHub legado.

## Gate D — segundo dispositivo real

- [ ] Abrir a mesma versão da plataforma no celular/segundo dispositivo.
- [ ] Reconectar Google Workspace no segundo dispositivo.
- [ ] Informar o mesmo código de sincronização do cofre privado.
- [ ] Se a base local estiver vazia, permitir a adoção segura da base remota.
- [ ] Conferir contagens e amostra funcional pela própria interface, sem registrar dados em logs externos.

Critério de aceite: segundo dispositivo recebe a base privada correta e fica em estado sincronizado.

## Gate E — teste bidirecional

Usar apenas uma alteração clínica real de baixo risco já necessária à operação ou um registro de teste explicitamente não clínico dentro da área de diagnóstico, quando disponível.

- [ ] Alterar no dispositivo principal e confirmar propagação para o segundo.
- [ ] Alterar no segundo dispositivo e confirmar propagação para o principal.
- [ ] Confirmar ausência de duplicatas.
- [ ] Confirmar ausência de conflito falso.
- [ ] Confirmar que conflito real, se simulado em ambiente seguro, é bloqueado para decisão explícita.

Critério de aceite: sincronização privada bidirecional e idempotente comprovada.

## Gate F — restore real seguro

- [ ] Reutilizar o backup `.rmvault` do Gate A ou gerar novo backup atual.
- [ ] Executar `Testar restore isolado` e confirmar comparação integral dos stores.
- [ ] Não executar restore destrutivo sobre a base ativa apenas para teste; o teste isolado é o gate padrão.
- [ ] Restore sobre a base ativa só deve ocorrer quando houver necessidade real de recuperação e após backup adicional.

Critério de aceite: restore isolado real aprovado com o arquivo de backup do usuário.

## Gate G — desligamento do legado

- [ ] Confirmar que `public-clinical-storage-guard-v251.js` continua ativo.
- [ ] Confirmar que novas gravações não usam `clinic-sync-data`.
- [ ] Confirmar que nenhum segredo GitHub é necessário para a sincronização clínica nova.
- [ ] Remover/revogar credenciais legadas somente depois de A–F aprovados e apenas se não tiverem outra finalidade legítima.
- [ ] Preservar histórico cifrado legado conforme política de retenção; não apagar por impulso.

Critério de aceite: GitHub é code-only e não participa do caminho de escrita clínica.

## Aceite final P0/P5

Marcar `CUTOVER_CONCLUÍDO` somente quando todos forem verdadeiros:

```text
backup_real_verified          = true
workspace_appdata_authorized  = true
private_vault_initialized     = true
second_device_adopted         = true
bidirectional_sync_verified   = true
isolated_restore_verified     = true
legacy_write_path_disabled    = true
```

Qualquer item falso mantém o estado `USER_ACTION_REQUIRED` ou `IN_PROGRESS`. Nenhum CI remoto pode substituir os gates que dependem de navegador, IndexedDB, OAuth e dois dispositivos físicos.
