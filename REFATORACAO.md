# Relatório de refatoração

## Alterações principais

- migração do arquivo monolítico para módulos estáticos;
- IndexedDB como armazenamento principal;
- criptografia individual de registros;
- seleção explícita do paciente;
- modo paciente com saída protegida e bloqueio do cofre;
- separação entre prontuário e notas restritas;
- adendos em registros finalizados;
- central de consentimentos;
- comunicação assistida por WhatsApp, e-mail, cópia e Web Share;
- geração de ICS;
- pacote do paciente em HTML simples ou protegido;
- resposta criptografada `.rmresponse`;
- backup `.rmvault`;
- trilha local com encadeamento de hashes;
- PWA estática com cache apenas do shell;
- identidade visual baseada no banner fornecido;
- área de autoteste não destrutivo.

## Limitações mantidas de forma explícita

- ausência de backend;
- ausência de sincronização remota;
- ausência de autenticação remota do paciente;
- ausência de Web Push remoto;
- ausência de confirmação técnica de envio, entrega ou leitura;
- backup automático limitado pelas permissões do navegador;
- trilha local não equivalente a auditoria independente.

## Testes executados no ambiente de geração

- verificação sintática dos arquivos JavaScript com `node --check`;
- inspeção da árvore de arquivos;
- verificação de referências relativas;
- criação do autoteste para Web Crypto, IndexedDB, validações e recursos do navegador.

A execução integral em navegador deve ser repetida no endereço do GitHub Pages, em desktop e celular.
