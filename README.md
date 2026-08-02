# Plataforma Clínica Richelmy Murta — v1.4.3

Aplicação clínica estática, local-first e de uso exclusivo do psicólogo Richelmy Murta, publicada por GitHub Pages.

## Acesso
A plataforma utiliza uma senha local única. A senha não é exibida neste README e não é armazenada em texto claro no arquivo de estado. A autenticação acontece antes do carregamento da interface clínica.

## Arquitetura estável v1.4.3
- o arquivo legado `app.js` não participa mais da inicialização;
- não há transformação dinâmica do código por Blob;
- não há `repairTail` nem correções de sintaxe em tempo de execução;
- `bootstrap-v143.js` cuida somente de autenticação, abertura dos dados locais e inicialização;
- `app-core-v143.js` cuida da interface, rotas, relógio e ações básicas;
- `clinical-v136.js` complementa cadastro de pacientes, recorrência e agenda;
- `resources-premium.js` complementa a biblioteca psicoeducativa;
- a inicialização possui timeout e exibe erro legível se algum módulo não carregar;
- o service worker permanece desativado para não manter versões antigas da interface presas em cache.

## Arquitetura de dados
- dados clínicos armazenados localmente no navegador;
- criptografia local dos registros persistidos;
- nenhum prontuário ou cadastro de paciente é publicado no GitHub;
- exclusão de dados somente por ação explícita do usuário;
- exclusão individual de paciente preserva os demais cadastros.

## Navegação e estabilidade
- Hoje, Agenda, Pacientes, Recursos, Financeiro e Configurações são rotas do núcleo principal;
- navegação sem recarregar a página;
- botões do dashboard usam o mesmo roteamento;
- relógio do cabeçalho atualizado a cada segundo, com data e horário completos;
- relógio reiniciado automaticamente após cada renderização;
- retorno à aba atualiza imediatamente o relógio;
- ações modernizadas de paciente e agenda permanecem delegadas ao módulo clínico atual;
- arquivos novos são carregados com versão no URL para reduzir inconsistências de cache sem apagar os dados clínicos.

## Dashboard
- próximas sessões;
- registros pendentes;
- tarefas abertas;
- pagamentos pendentes;
- agenda próxima;
- gráfico de sessões dos próximos sete dias;
- atalhos para nova sessão, novo paciente, agenda e financeiro.

## Pacientes
- cadastro de nome completo e nome preferido;
- foto do paciente;
- código interno e status;
- data de nascimento;
- CPF e RG;
- endereço completo: CEP, logradouro, número, complemento, bairro, cidade e UF;
- telefone com máscara brasileira `(XX) XXXXX-XXXX`;
- e-mail;
- modalidade de atendimento;
- canal preferido;
- valor de referência em reais;
- frequência usual: avulso, semanal ou quinzenal;
- síntese clínica objetiva;
- rascunho automático do cadastro durante a digitação;
- descarte explícito do rascunho quando desejado;
- exclusão local de um paciente sem apagar os demais cadastros.

## Agenda
- visão semanal em grade por dia e horário;
- navegação entre semana anterior, semana atual e próxima semana;
- agendamento diretamente pelo paciente ou pela agenda;
- recorrência avulsa, semanal ou quinzenal;
- semanal repete no mesmo dia e horário a cada sete dias;
- quinzenal repete no mesmo dia e horário a cada quatorze dias;
- geração automática das ocorrências futuras da série;
- verificação de conflito de horário;
- edição e exclusão de uma sessão;
- exclusão opcional de toda a série recorrente;
- lembrete de sessão por WhatsApp;
- registro da sessão diretamente a partir da agenda.

## Prontuário e acompanhamento
- registros clínicos;
- notas restritas;
- conceitualização;
- plano terapêutico e objetivos;
- tarefas terapêuticas;
- timeline do paciente;
- consentimentos;
- histórico de comunicações;
- financeiro por paciente e visão consolidada.

## Recursos psicoeducativos
Biblioteca de materiais e exercícios com conteúdos sobre ansiedade, pensamentos e interpretações, ativação comportamental, valores, autocompaixão, aterramento, sono, resolução de problemas e outros temas clínicos.

Os materiais podem ser associados ao paciente e preparados para:
- visualização;
- geração de PDF em papelaria profissional;
- envio assistido por WhatsApp;
- envio assistido por e-mail.

## PDF e papelaria
Os materiais em PDF utilizam identidade visual clínica, título, conteúdo psicoeducativo, exercícios estruturados, áreas de reflexão/anotações e QR Code de contato por WhatsApp quando configurado.

No navegador, use **Gerar PDF** e escolha **Salvar como PDF**. O arquivo deve ser anexado manualmente ao WhatsApp ou e-mail, pois uma página estática não pode inserir automaticamente um anexo em outro serviço.

## Comunicações
- abertura de conversa no WhatsApp usando o telefone cadastrado;
- mensagens de lembrete de sessão;
- envio assistido de materiais e documentos;
- abertura do cliente de e-mail usando o endereço cadastrado;
- registro local das comunicações preparadas.

## Interface
- identidade visual Richelmy Murta;
- ícones padronizados;
- data e horário atualizados em tempo real;
- busca de pacientes;
- ocultação de informações sensíveis na tela;
- interface responsiva para desktop e dispositivos móveis.

## Segurança operacional
Não envie para o repositório GitHub backups, PDFs clínicos, fotografias de pacientes, prontuários, capturas de tela com dados identificáveis ou qualquer outro dado clínico real.

Mantenha backups periódicos dos dados locais. Como a aplicação é estática e executada no navegador, a senha funciona como controle de acesso local e não substitui autenticação de servidor.

## Integrações Google
A arquitetura está preparada para Google Calendar, Google Drive e Gmail por OAuth 2.0. A integração real depende da configuração de um OAuth Client ID autorizado para a origem do GitHub Pages.

## Publicação
Origem: branch `main`, pasta `/ (root)`, via GitHub Pages.
