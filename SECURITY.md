# Política de Segurança

Este repositório é uma superfície pública de código. Ele não deve ser utilizado como prontuário, repositório de respostas de formulários, arquivo de sessões, backup clínico ou depósito de credenciais.

## Regra de dados

Podem permanecer públicos: código-fonte, estilos, assets não sensíveis, schemas genéricos, documentação técnica e dados exclusivamente sintéticos.

Não devem ser commitados: cofres clínicos, exports ou backups reais, bancos locais, credenciais, tokens, chaves, arquivos de pacientes, respostas reais de instrumentos ou documentos produzidos em atendimento.

## Vulnerabilidades

Não publique em Issues ou Pull Requests conteúdo clínico, credenciais ou outros dados sensíveis. Ao investigar uma falha, use dados sintéticos e descreva apenas o comportamento técnico necessário para reprodução.

## P0

O workflow `P0 Public Repo Guard` bloqueia categorias de arquivos e padrões de segredo incompatíveis com um repositório público. Esse controle é preventivo e não substitui a revisão de permissões no Google Drive, OAuth e demais serviços externos.
