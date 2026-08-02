# Plataforma Clínica Richelmy Murta — v1.5.1

Aplicação clínica estática, local-first e de uso exclusivo do psicólogo, publicada por GitHub Pages.

## Estado da versão
A v1.5.1 mantém o debug estrutural da v1.5.0 e corrige especificamente o travamento observado após a mensagem **“Senha validada. Carregando dados locais...”**.

### Correção principal da v1.5.1
A autenticação e a carga do IndexedDB foram desacopladas.

Agora o fluxo é:
1. validar a senha;
2. abrir imediatamente a interface clínica;
3. carregar os dados locais em segundo plano;
4. atualizar o dashboard e as demais rotas à medida que os registros ficam disponíveis.

Assim, um atraso, bloqueio ou erro no IndexedDB não pode mais deixar toda a aplicação presa na tela de acesso.

Durante a carga é mostrado um aviso discreto no canto inferior direito com a etapa atual. Se os dados locais não puderem ser lidos, a interface continua responsiva e apresenta o erro de forma explícita, sem apagar nenhum registro.

## IndexedDB e persistência
O driver do banco local também foi reforçado:
- conexões são fechadas automaticamente quando ocorre mudança de versão;
- uma tentativa de abertura que falhar não deixa uma Promise rejeitada permanentemente em cache;
- upgrades bloqueados por outra aba produzem mensagem específica;
- transações passam a registrar o evento de conclusão antes de aguardar a requisição;
- descriptografia de registros ocorre em paralelo para reduzir tempo de abertura;
- stores ausentes são tratadas defensivamente;
- nenhuma atualização apaga pacientes ou demais registros existentes.

## Arquitetura atual
- `bootstrap-v151.js`: autenticação imediata, abertura da interface e carga assíncrona dos dados;
- `app-core-v150.js`: shell, rotas, relógio e renderização defensiva;
- `clinical-v136.js`: cadastro ampliado, foto, CPF/RG/endereço, recorrência e agenda;
- `actions-v150.js`: prontuário, notas, conceitualização, plano, tarefas, documentos, consentimentos, backup e diagnóstico;
- `resources-premium.js`: materiais psicoeducativos e PDF profissional;
- `ux-runtime-v150.js`: busca, proteção visual e bloqueio por inatividade.

O arquivo legado `app.js` não participa da inicialização.

## Causa do congelamento global já corrigida
Versões anteriores utilizavam `MutationObserver` global sobre toda a árvore da página. Como a rotina também reescrevia o relógio, a própria atualização do relógio gerava nova mutação e novo ciclo de execução. Esse mecanismo foi removido.

Na arquitetura atual:
- não há `MutationObserver` global em Clínica ou Recursos;
- o relógio pertence exclusivamente ao núcleo;
- existe um único timer de 1 segundo;
- erros de módulos opcionais não congelam a aplicação inteira.

## Acesso
A plataforma utiliza uma senha local única. A senha não é exibida neste README nem armazenada em texto claro no arquivo de estado.

Como a aplicação é estática e executada no navegador, esse mecanismo funciona como controle de acesso local e não substitui autenticação de servidor.

## Dados e banco local
- IndexedDB local e criptografado;
- schema atual: versão 5;
- stores: pacientes, agenda, prontuário, notas, conceitualização, objetivos, tarefas, materiais, documentos, financeiro, consentimentos, comunicações, auditoria e configurações;
- nenhum cadastro, prontuário ou fotografia é enviado ao GitHub;
- upgrades preservam os stores existentes e criam apenas os ausentes;
- datas operacionais usam a data local do navegador.

## Segurança dos dados
- não existe rotina automática para apagar dados clínicos;
- não é necessário apagar IndexedDB para atualizar a interface;
- service workers antigos são desregistrados;
- exclusão de dados clínicos permanece vinculada ao paciente específico;
- não há botão global de exclusão do banco nas Configurações;
- mantenha backups periódicos `.rmvault`.

## Pacientes
- nome completo e nome preferido;
- foto local;
- código interno e status;
- data de nascimento;
- CPF e RG;
- endereço completo;
- telefone com máscara `(XX) XXXXX-XXXX`;
- e-mail;
- modalidade;
- canal preferido;
- valor de referência em reais;
- frequência usual: Avulso, Semanal ou Quinzenal;
- síntese clínica;
- rascunho automático;
- descarte explícito do rascunho;
- agendamento diretamente pelo paciente;
- WhatsApp e e-mail.

## Agenda
- visão semanal;
- navegação entre semanas;
- recorrência avulsa, semanal e quinzenal;
- semanal a cada 7 dias no mesmo horário;
- quinzenal a cada 14 dias no mesmo horário;
- edição e exclusão individual;
- exclusão de série;
- registro da sessão pela própria agenda;
- lembrete por WhatsApp;
- verificação de conflito.

## Prontuário e atendimento
- preparação de sessão;
- registros clínicos e rascunhos;
- finalização e adendos;
- notas restritas;
- conceitualização;
- plano terapêutico e objetivos;
- tarefas;
- timeline;
- consentimentos;
- comunicações;
- financeiro por paciente.

## Recursos psicoeducativos
Biblioteca premium com conteúdos e exercícios sobre ansiedade, pensamentos e interpretações, ativação comportamental, valores, autocompaixão, aterramento, sono e resolução de problemas.

Os materiais podem ser visualizados, associados ao paciente, convertidos em PDF e preparados para WhatsApp ou e-mail.

## PDF e papelaria
Os PDFs utilizam identidade visual profissional, layout A4, texto justificado, exercícios, área de anotações, identificação profissional, contato e QR Code funcional para WhatsApp.

## Diagnóstico e qualidade
Em `Configurações > Executar diagnóstico`, a plataforma verifica sessão, renderização, roteamento, relógio, stores e IndexedDB.

Também existe `tests/self-test.html`, um autoteste não destrutivo.

O workflow `.github/workflows/static-integrity.yml` verifica sintaxe dos arquivos JavaScript e destinos dos imports relativos.

## Integrações Google
A arquitetura permanece preparada para Google Calendar, Google Drive e Gmail por OAuth 2.0. A integração real depende de um OAuth Client ID autorizado para a origem do GitHub Pages.

## Publicação
Origem: branch `main`, pasta `/ (root)`, via GitHub Pages.

Versão de interface: `1.5.1`.
