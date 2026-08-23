# Plataforma Clínica 3.0 — Governança de arquitetura e releases

## Regra operacional

A plataforma é local-first. O cofre clínico local é a autoridade para paciente, sessão, prontuário e financeiro. Google Calendar é projeção externa da agenda clínica; Google Drive/Meet/Gemini é fonte documental externa; Drive appDataFolder recebe somente estado cifrado de sincronização.

## IA clínica

A automação documental deve permanecer em modo de apoio profissional:

- fonte identificável: Google Meet/Gemini;
- saída intermediária: rascunho assistido;
- ambiguidade de identidade: revisão humana;
- prontuário finalizado: não é sobrescrito automaticamente;
- diagnóstico, risco, alta, encaminhamento e decisão terapêutica: não são automatizados pela plataforma.

## Clinical session identity

Toda sessão passa a possuir `clinicalSessionId`.

A migração v3 somente cria esse campo a partir de identificadores já existentes. Não vincula registros usando similaridade de nomes ou proximidade temporal.

## UX

Navegação global permanece enxuta. O workspace individual do paciente é organizado em seis grupos: Principal, Sessões, Clínica, Tratamento, Recursos e Administração.

Ações frequentes devem ser contextuais; a mesma ação não deve ser repetida em vários cartões da mesma tela sem necessidade operacional.

## Regra de componentes

Cada responsabilidade permanente deve possuir um proprietário:

- runtime/observabilidade/UX transversal: `platform-runtime-v300.js`;
- Calendar: `calendar-adapter-v300.js`;
- Gemini → materialização clínica: `clinical-reconcile-v270.js`;
- sincronização privada: `secure-sync-v260.js`;
- persistência cifrada: `database.js`;
- identidade Gemini: `gemini-identity-v270.mjs`.

Módulos de migração e reparo devem ter critério de retirada e não podem voltar ao entrypoint principal sem justificativa.

## Política de commits

Padrão recomendado:

- `feat:` capacidade nova;
- `fix:` correção;
- `refactor:` consolidação sem mudança de finalidade clínica;
- `security:` privacidade/segurança;
- `test:` regressão;
- `docs:` documentação;
- `ci:` pipelines;
- `release:` publicação.

Evitar commits de marcador (`x`, `temp`, `ignore`, `placeholder`, `cleanup marker`).

## Política de deployment

1. mudanças são acumuladas em branch;
2. testes e gates executam na pull request;
3. correções do mesmo pacote permanecem na mesma branch;
4. produção recebe merge único preferencialmente por squash;
5. um pacote lógico deve produzir um único deployment de produção sempre que possível.

## Gates obrigatórios

- ausência de dado clínico/segredo no repositório;
- JavaScript sintaticamente válido;
- imports locais existentes;
- persistência WebCrypto + IndexedDB verificada;
- sync privado via Drive appDataFolder;
- único reconciliador Gemini;
- único proprietário de Calendar no entrypoint;
- módulos legados proibidos no boot;
- teste de arquitetura v3.

## Próximas retiradas

`legacy-sync-cleanup-v262.js` e `gemini-historical-identity-repair-v272.js` somente podem ser aposentados depois de evidência de que a população de dispositivos/dados históricos não depende mais deles.

A consolidação física dos CSS históricos deve ocorrer em pacote separado, com regressão visual antes/depois, para não misturar uma alteração visual ampla com a migração de arquitetura clínica.
