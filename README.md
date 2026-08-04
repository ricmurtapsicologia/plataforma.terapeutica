# Plataforma Clínica Richelmy Murta — v1.6.0

Aplicação clínica estática, local-first e de uso exclusivo do psicólogo, publicada por GitHub Pages.

## Estado atual
A v1.6.0 mantém o IndexedDB local criptografado e acrescenta sincronização automática entre dispositivos autorizados por meio de um cofre clínico integralmente cifrado.

## Segurança e acesso
- a senha não fica mais validada por hash SHA-256 fixo no JavaScript ativo;
- o acesso depende da abertura bem-sucedida do cofre criptográfico local;
- novos cofres locais usam PBKDF2-HMAC-SHA256 com 600.000 iterações;
- registros locais são protegidos por AES-GCM;
- a chave local permanece somente na sessão do navegador;
- bloqueio por inatividade, máscara de privacidade e proteção ao trocar de aba continuam disponíveis.

## Sincronização notebook ↔ celular
A sincronização usa o mesmo repositório da plataforma, porém os dados ficam isolados na branch `clinic-sync-data`, que não participa da publicação do GitHub Pages.

O arquivo remoto é `.clinic-sync/vault.json` e contém somente um envelope criptográfico. Nenhum campo de paciente é gravado em texto legível no GitHub.

São cifrados em conjunto:
- nome e dados cadastrais;
- CPF, RG e endereço;
- telefone, e-mail e fotografias;
- agenda e recorrências;
- prontuários, notas e conceitualizações;
- objetivos, tarefas e materiais associados;
- documentos e consentimentos;
- comunicações e financeiro.

### Chave remota independente
O cofre remoto usa AES-256-GCM com uma chave aleatória de 256 bits gerada no notebook no momento da primeira inicialização. Essa chave é independente da senha usada para entrar na plataforma.

A chave é apresentada como um `código de sincronização`. No segundo dispositivo, esse código é informado uma única vez. Em cada dispositivo ele passa a ser guardado localmente, cifrado pela chave do cofre local. O código não é incluído no repositório, no arquivo remoto ou no backup clínico.

O GitHub Personal Access Token também é configurado individualmente em cada dispositivo e armazenado localmente de forma criptografada. Token e código de sincronização cumprem funções distintas: o token autoriza leitura/gravação no GitHub; o código descriptografa o cofre clínico.

### Fluxo
1. uma alteração é salva primeiro no IndexedDB local;
2. a plataforma marca a base como pendente;
3. após pequeno debounce, envia uma nova revisão integralmente cifrada;
4. o outro dispositivo consulta a revisão remota aproximadamente a cada 15 segundos e ao recuperar foco;
5. alterações de registros diferentes são mescladas por identificador e `updatedAt`;
6. se o mesmo registro tiver sido alterado nos dois dispositivos desde a última base comum, a sincronização é pausada e o conflito é sinalizado;
7. exclusões geram tombstones para impedir que um dispositivo antigo ressuscite registros apagados;
8. sem internet, a plataforma continua trabalhando localmente e retoma a sincronização quando a conexão volta.

## Proteção da primeira migração
A criação do primeiro cofre remoto é manual e somente é permitida quando o dispositivo possui dados clínicos. Uma base local vazia não pode inicializar automaticamente o remoto.

O notebook que já contém os pacientes deve ser usado como origem da primeira carga. Depois da inicialização, o código de sincronização é guardado e utilizado para autorizar o celular.

Quando um dispositivo local vazio recebe um cofre remoto válido e o código correto, a base remota prevalece. Se os cofres locais forem diferentes e ambos contiverem dados clínicos, a sincronização é bloqueada para impedir sobrescrita silenciosa.

Durante a adoção da base remota, token e código são transportados apenas pela sessão efêmera do navegador durante a recarga necessária e depois são novamente armazenados cifrados com a chave local válida.

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

O código de sincronização deve ser guardado separadamente. Se todos os dispositivos e esse código forem perdidos, o cofre remoto não poderá ser recuperado apenas a partir do GitHub.

### Exportação Excel
A exportação `.xls` é legível e não criptografada. Deve ser tratada como arquivo sensível e não substitui o `.rmvault`.

## Resolução de concorrência
O mecanismo mantém uma baseline local por dispositivo. Se notebook e celular alterarem registros distintos, os dados são mesclados. Se ambos alterarem o mesmo registro depois da última sincronização comum, nenhum lado é sobrescrito automaticamente.

## Compatibilidade de navegador
A correção de `window.open` é restrita às janelas auxiliares de impressão/PDF. Links externos continuam preservando `noopener/noreferrer`.

## Limites de segurança
A arquitetura foi desenhada para que a exposição do repositório público, isoladamente, não revele o conteúdo clínico. Isso não equivale a garantia absoluta contra comprometimento do dispositivo, perda de credenciais, código malicioso ou falhas futuras de implementação/plataforma.

O histórico Git pode conservar revisões antigas do ciphertext. Por isso a proteção depende da preservação da chave aleatória de sincronização e das credenciais dos dispositivos.

## Diagnóstico e qualidade
- diagnóstico interno em Configurações;
- `tests/self-test.html` não destrutivo;
- workflow `.github/workflows/static-integrity.yml` valida sintaxe e imports em `main` e em pull requests.

## Publicação
Código: branch `main`, pasta `/ (root)`, via GitHub Pages.

Cofre sincronizado: branch `clinic-sync-data`, arquivo `.clinic-sync/vault.json`.

Versão de interface: `1.6.0`.
