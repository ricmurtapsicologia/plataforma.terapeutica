# Plataforma Clínica Richelmy Murta — v1.5.0

Aplicação clínica estática, local-first e de uso exclusivo do psicólogo, publicada por GitHub Pages.

## Estado da versão
A v1.5.0 resulta de um debug estrutural da aplicação. O objetivo desta versão é eliminar travamentos globais, separar responsabilidades entre módulos, restaurar controladores que haviam ficado órfãos e tornar erros localizados incapazes de congelar toda a interface.

### Causa do congelamento corrigida
O módulo clínico utilizava um `MutationObserver` sobre toda a árvore da página. A rotina acionada pelo observer também reescrevia o relógio no DOM; essa reescrita gerava nova mutação, que acionava novamente o observer. O resultado era um ciclo de microtarefas que podia deixar a página visualmente renderizada, porém com relógio congelado e cliques sem resposta.

Na v1.5.0:
- o `MutationObserver` global foi removido do módulo clínico;
- o `MutationObserver` global também foi removido da biblioteca premium de recursos;
- o relógio pertence exclusivamente ao núcleo da interface e é atualizado a cada segundo por um único timer;
- complementos de paciente/agenda são acionados somente por eventos explícitos de renderização;
- falha em um módulo opcional não impede o núcleo de abrir.

## Arquitetura v1.5.0

### Inicialização
- `bootstrap-v150.js`: autenticação, abertura do IndexedDB, leitura dos dados e carregamento dos módulos;
- `app-core-v150.js`: shell, menu, rotas, relógio, formulários básicos e renderização defensiva;
- `clinical-v136.js`: cadastro clínico ampliado, foto, CPF/RG/endereço, recorrência e agenda;
- `actions-v150.js`: prontuário, notas, conceitualização, plano, tarefas, documentos, consentimentos, backup e diagnóstico;
- `resources-premium.js`: materiais psicoeducativos e PDF profissional.

O arquivo legado `app.js` não participa da inicialização.

### Isolamento de falhas
Os complementos clínicos, ações e recursos são carregados separadamente. Se um complemento falhar, o núcleo continua disponível e a falha é registrada para diagnóstico. Cada rota também possui tratamento de erro próprio.

## Acesso
A plataforma utiliza uma senha local única. A senha não é exibida neste README nem armazenada em texto claro no arquivo de estado. A autenticação ocorre antes do carregamento dos dados clínicos.

Como a aplicação é estática e executada no navegador, esse mecanismo funciona como controle de acesso local e não substitui autenticação de servidor.

## Dados e banco local
- IndexedDB local e criptografado;
- nenhum cadastro, prontuário ou fotografia é enviado ao GitHub;
- schema atual: versão 5;
- stores: pacientes, agenda, prontuário, notas, conceitualização, objetivos, tarefas, materiais, documentos, financeiro, consentimentos, comunicações, auditoria e configurações;
- a store `goals` passou a fazer parte formal do banco na v1.5.0;
- upgrade do IndexedDB preserva os stores existentes e cria apenas os que estiverem ausentes;
- migrações de paciente, agenda e prontuário são persistidas no banco;
- datas operacionais usam a data local do navegador, evitando deslocamento de dia provocado por UTC.

## Segurança dos dados
- não há rotina automática para excluir dados clínicos;
- não há necessidade de apagar IndexedDB para atualizar a interface;
- service workers antigos são desregistrados;
- a exclusão de dados clínicos permanece vinculada ao paciente específico;
- a Configuração não apresenta botão global de exclusão do banco clínico;
- mantenha backups periódicos `.rmvault`.

## Backup
- geração de backup `.rmvault`;
- verificação antes de restauração;
- restauração assistida;
- o verificador aceita o formato atualmente gerado pela própria plataforma (`rm-local-backup`) e o formato legado compatível (`rmvault-indexed`);
- exportação criptografada de um paciente selecionado continua disponível.

## Navegação e interface
- Hoje;
- Agenda;
- Pacientes;
- Recursos;
- Financeiro;
- Configurações.

O menu utiliza um único roteador do núcleo. Os listeners principais são registrados uma única vez. O relógio exibe data local e horário com segundos e é atualizado a cada segundo.

## Dashboard
- próximas sessões;
- registros pendentes;
- tarefas abertas;
- pagamentos pendentes;
- agenda próxima;
- gráfico dos próximos sete dias;
- atalhos para agenda, paciente e financeiro.

## Pacientes
- nome completo e nome preferido;
- foto local do paciente;
- código interno;
- status;
- data de nascimento;
- CPF;
- RG;
- endereço completo: CEP, logradouro, número, complemento, bairro, cidade e UF;
- telefone com máscara brasileira `(XX) XXXXX-XXXX`;
- e-mail;
- modalidade;
- canal preferido;
- valor de referência em reais;
- frequência usual: Avulso, Semanal ou Quinzenal;
- síntese clínica objetiva;
- rascunho automático enquanto o cadastro é preenchido;
- descarte explícito do rascunho;
- agendamento diretamente no contexto do paciente;
- WhatsApp e e-mail a partir dos dados cadastrados.

## Agenda
- visão semanal;
- semana anterior, semana atual e próxima semana;
- posicionamento do paciente no dia e horário agendados;
- edição de agendamento;
- exclusão de sessão individual;
- exclusão de série recorrente;
- registro de sessão diretamente pela agenda;
- lembrete pelo WhatsApp;
- recorrência Avulsa, Semanal e Quinzenal;
- semanal: repetição a cada 7 dias no mesmo horário;
- quinzenal: repetição a cada 14 dias no mesmo horário;
- verificação de conflito antes de salvar a série.

## Prontuário e atendimento
- fluxo de preparação da sessão;
- registro clínico;
- salvamento de rascunho;
- finalização de registro;
- adendos;
- notas restritas;
- conceitualização;
- objetivos do plano terapêutico;
- tarefas;
- timeline;
- consentimentos;
- comunicações;
- financeiro por paciente.

## Recursos psicoeducativos
Biblioteca premium com materiais sobre ansiedade, pensamentos e interpretações, ativação comportamental, valores, autocompaixão, aterramento, sono e resolução de problemas.

Cada material pode incluir:
- conteúdo psicoeducativo;
- exercício estruturado;
- perguntas para reflexão;
- associação ao paciente;
- geração de PDF;
- preparação para WhatsApp;
- preparação para e-mail.

## PDF e papelaria
Os PDFs utilizam identidade visual profissional, conteúdo em layout A4, texto justificado, exercício, área de anotações, identificação profissional, contato e QR Code funcional para WhatsApp.

O navegador gera o PDF por impressão. O arquivo deve ser anexado manualmente ao WhatsApp ou e-mail; uma página estática não pode inserir silenciosamente um anexo em outro serviço.

## Diagnóstico
Em `Configurações > Executar diagnóstico`, a plataforma verifica:
- sessão autenticada;
- núcleo de renderização;
- roteamento;
- presença do relógio;
- disponibilidade de cada store;
- acesso ao IndexedDB.

Há também `tests/self-test.html`, um autoteste não destrutivo que não abre o banco clínico. Ele verifica criptografia, IndexedDB temporário, schema, store de objetivos, data local, arquivos críticos publicados e ausência dos `MutationObserver` que provocavam o congelamento.

## Qualidade de código
O repositório contém `.github/workflows/static-integrity.yml`. A cada alteração relevante na branch `main`, o workflow verifica:
- sintaxe de todos os arquivos JavaScript com Node;
- existência dos destinos de imports relativos locais.

Isso reduz o risco de publicar novamente um módulo com erro sintático ou import quebrado.

## Integrações Google
A arquitetura continua preparada para Google Calendar, Google Drive e Gmail por OAuth 2.0. A integração real depende de um OAuth Client ID autorizado para a origem do GitHub Pages; nenhuma integração fictícia é apresentada como funcional.

## Publicação
Origem: branch `main`, pasta `/ (root)`, via GitHub Pages.

Versão de interface: `1.5.0`.
