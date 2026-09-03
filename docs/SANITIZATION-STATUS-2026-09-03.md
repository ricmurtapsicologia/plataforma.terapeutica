# Plataforma Clínica — Status de Saneamento

Data: 2026-09-03
Estado: CONDITIONAL
Versão canônica: 3.7.5

## Concluído automaticamente

- [x] `APP_VERSION` unificado em `3.7.5`.
- [x] `index.html`, entrypoint, cache tags e README alinhados à versão canônica.
- [x] Teste de sessão atualizado para derivar a versão da fonte canônica e evitar assertivas obsoletas de semver.
- [x] Static integrity: GREEN.
- [x] Clinical regression tests: GREEN.
- [x] Browser persistence and agenda probes do CI: GREEN.
- [x] Local import targets: GREEN.
- [x] Index local assets: GREEN.
- [x] Architecture invariants: GREEN.
- [x] Application version consistency: GREEN.
- [x] P0 Public Repo Guard: GREEN.
- [x] Ecosystem sanitation: GREEN na execução posterior ao saneamento de versão.
- [x] GitHub Pages build/deploy: GREEN.

## Gates físicos ainda obrigatórios

Estes itens não podem ser certificados por CI remoto e não devem ser marcados como concluídos sem execução real:

- [ ] Gerar backup `.rmvault` real no dispositivo principal.
- [ ] Executar `Testar restore isolado` usando esse backup real.
- [ ] Confirmar `google-drive-appdata` / `appDataFolder` no dispositivo principal.
- [ ] Adotar o cofre em segundo dispositivo real.
- [ ] Validar sincronização notebook → celular.
- [ ] Validar sincronização celular → notebook.
- [ ] Confirmar ausência de duplicidade e conflito falso.
- [ ] Simular conflito real seguro e confirmar bloqueio para decisão explícita.
- [ ] Validar visualmente fluxos críticos em celular real.
- [ ] Executar fluxo controlado `Agenda → Iniciar sessão → Meet → cronômetro → Encerrar → prontuário`.
- [ ] Executar fluxo controlado `Calendar → Gemini/Meet → rascunho → revisão humana → prontuário → auditoria`.
- [ ] Validar confirmação administrativa WhatsApp T−6h em cenário controlado e sem dados sensíveis em logs.

## Regra de certificação

A plataforma somente pode ser promovida a `GREEN` quando:

```text
ci_green                     = true
backup_real_verified         = true
isolated_restore_verified    = true
workspace_appdata_authorized = true
second_device_adopted        = true
bidirectional_sync_verified  = true
clinical_e2e_verified        = true
gemini_e2e_verified          = true
p0_open                      = false
```

Enquanto qualquer gate físico obrigatório estiver sem evidência, o estado permanece `CONDITIONAL`.

## Política de evidência

Não registrar neste documento nomes de pacientes, conteúdo clínico, telefones, credenciais, tokens, chaves, código de sincronização ou dados de saúde. A evidência do gate deve ser apenas o resultado operacional necessário, sem conteúdo clínico identificável.
