# Plataforma Clínica Richelmy Murta — v1.6.0

Aplicação clínica estática, local-first e de uso exclusivo do psicólogo, publicada por GitHub Pages.

## Estado atual
A v1.6.0 mantém o IndexedDB local criptografado e acrescenta sincronização automática entre dispositivos autorizados por meio de um cofre clínico integralmente cifrado.

## Segurança e acesso
- a senha não fica mais validada por hash SHA-256 fixo publicado no JavaScript;
- o acesso depende da abertura bem-sucedida do cofre criptográfico local;
- novos cofres locais usam PBKDF2-HMAC-SHA256 com 600.000 iterações;
- registros locais são protegidos por AES-GCM;
- a chave de criptografia permanece somente na sessão do navegador;
- bloqueio por inatividade, máscara de privacidade e proteção ao trocar de aba continuam disponíveis.

## Sincronização notebook ↔ celular
A sincronização usa o mesmo repositório da plataforma, porém os dados ficam isolados na branch `clinic-sync-data`, que não participa da publicação do GitHub Pages.

O arquivo remoto é `.clinic-sync/vault.json` e contém somente um envelope criptográfico. Nenhum dado de paciente é gravado em texto legível no GitHub.

São cifrados em conjunto:
- nome e dados cadastrais;
- CPF, RG e endereço;
- telefone, e-mail e fotografias;
- agenda e recorrências;
- prontuários, notas e conceitualizações;
- objetivos, tarefas e materiais associados;
- documentos e consentimentos;
- comunicações e financeiro.

A camada externa usa AES-256-GCM e chave derivada por PBKDF2-HMAC-SHA256 com 600.000 iterações. O token do GitHub é configurado individualmente em cada dispositivo e fica armazenado localmente de forma criptografada; ele não entra no repositório nem no backup clínico.

### Fluxo
1. alteração é salva primeiro no IndexedDB local;
2. a plataforma marca a base como pendente;
3. após pequeno debounce, envia nova revisão criptografada;
4. o outro dispositivo consulta a revisão remota periodicamente e ao recuperar foco;
5. alterações de registros diferentes são mescladas por identificador e `updatedAt`;
6. se o mesmo registro tiver sido alterado nos dois dispositivos desde a última base comum, a sincronização é pausada e o conflito é sinalizado;
7. exclusões geram tombstones para impedir que um dispositivo antigo ressuscite registros apagados.

A consulta automática ocorre aproximadamente a cada 15 segundos quando a plataforma está aberta e on-line. Alterações locais disparam sincronização antes desse intervalo.

## Proteção da primeira migração
A criação do primeiro cofre remoto é manual e somente é permitida quando o dispositivo possui dados clínicos. Uma base local vazia não pode inicializar automaticamente o remoto.

Quando um dispositivo local vazio encontra uma base remota válida, a base remota prevalece. Se os cofres locais forem diferentes e ambos contiverem dados clínicos, a sincronização é bloqueada para impedir sobrescrita silenciosa.

## Agenda
- visão semanal;
- semana anterior, atual e seguinte;
- recorrência avulsa, semanal e quinzenal;
- edição e exclusão individual;
- registro de sessão pela agenda;
- presença, pagamento e WhatsApp integrados;
- lembretes e avisos de proximidade de sessão.

## Pacientes e atendimento
- cadastro completo;
- foto local;
- CPF, RG e endereço;
- síntese clínica;
- prontuário com finalização e adendos;
- notas restritas;
- conceitualização;
- plano e objetivos;
- tarefas e materiais;
- documentos;
- consentimentos;
- comunicação e financeiro.

## Backup e exportação
### Backup seguro `.rmvault`
Formato restaurável da plataforma, preservando a estrutura criptografada do banco local. Deve continuar sendo gerado periodicamente mesmo com a sincronização ativa.

### Exportação Excel
A exportação `.xls` é legível e não criptografada. Deve ser tratada como arquivo sensível e não substitui o `.rmvault`.

## Resolução de concorrência
O mecanismo mantém uma baseline local por dispositivo. Se notebook e celular alterarem registros distintos, os dados são mesclados. Se ambos alterarem o mesmo registro depois da última sincronização comum, nenhum lado é sobrescrito automaticamente.

## Compatibilidade de navegador
A correção de `window.open` agora é restrita às janelas auxiliares de impressão/PDF. Links externos continuam preservando `noopener/noreferrer`.

## Diagnóstico e qualidade
- diagnóstico interno em Configurações;
- `tests/self-test.html` não destrutivo;
- workflow `.github/workflows/static-integrity.yml` valida sintaxe e imports em `main` e em pull requests.

## Publicação
Código: branch `main`, pasta `/ (root)`, via GitHub Pages.

Cofre sincronizado: branch `clinic-sync-data`, arquivo `.clinic-sync/vault.json`.

Versão de interface: `1.6.0`.
