# Quadro e Documentacao com carregamento enxuto

## Aplicacao

O quadro agora pede uma lista explicita de colunas, sem `source_data` e `manual_data`.
Essas copias brutas continuam no banco e na resposta completa de detalhe; nao sao
apagadas. `current_data` permanece inteiro para preservar busca, qualificacao,
persona e edicao sem perder campos. Portanto esta etapa nao e ainda uma projecao
minima de todos os campos de perfil por card.

O filtro `intake_visible=true` passa a ser enviado ao Supabase. Contatos fora do
recorte continuam com seu historico no banco, mas nao sao transferidos ao quadro.
Situacao de atendimento, desistencias, responsaveis, curso e demais filtros atuais
continuam funcionando. As permissoes de linha do banco nao foram modificadas.

Esta parte exige publicar o aplicativo. Nao exige nova coluna ou RPC.

## Documentacao no banco

Execute apenas `sql/crm_kanban_otimizar_documentacao.sql` no SQL Editor para atualizar
a consulta instalada. Ela continua compativel com o aplicativo ja publicado, sem
trocar o nome, os parametros ou o formato de resposta da RPC.

Para montar o catalogo de cursos, a consulta agora:

- Identifica no catalogo do Postgres somente as colunas equivalentes a `curso`.
- Le somente essas colunas nas fontes, nao nome, CPF, telefone ou outros campos.
- Remove combinacoes repetidas antes de usar o extrator generico de aliases.
- Preserva precedencia entre aliases, valores vazios e cabecalhos antigos.

As estatisticas usam usuario e permissao de gestor calculados uma vez na consulta,
em vez de consultar os helpers de perfil para cada documento. O acesso a ficha e
validado antes; o filtro por responsavel conserva exatamente a regra anterior.
Media, mediana, pendencias, cancelados, testes e historico concluido nao mudam.

Nao ha exclusao, importacao, novo agendamento ou alteracao de documentos. A migracao
preserva OID, ACLs e identidade da funcao e pode ser reaplicada. Nao foi executada
no Supabase real pelo assistente.

## Conferencia

Depois de aplicar o SQL, abra Documentacao em uma ficha conhecida e confira os
cursos e o SLA com os valores anteriores. Teste tambem um vendedor com acesso
somente a sua carteira. O SQL funciona antes do deploy; o quadro enxuto somente
apos a publicacao do aplicativo.

O script `sql/crm_kanban_reverter_otimizacao_documentacao.sql` restaura apenas a
consulta anterior de Documentacao se necessario, sem desfazer sincronizacao,
registros, historico ou hotfixes.

## Limites

Ainda existe leitura das colunas de curso e agregacao dos documentos acessiveis a
cada atualizacao. Nao foi adicionado cache persistente nem tabela-resumo de SLA.
BI e paginacao de atividades/origens permanecem como proximas etapas.

Os testes locais demonstram menos campos solicitados, ausencia de contatos ocultos
na listagem e equivalencia funcional da consulta. Nao medem RAM real por processo
nem comprovam reducao do alerta de memoria comprometida no Supabase.

## Validacao

- `tools/test-crm-document-query-optimization.mjs`: compara a consulta nova e a
  anterior com 1.200 linhas sinteticas largas, aliases conflitantes, fonte sem
  coluna de curso e fontes ausentes. Valida SLA por perfil, permissoes, dados,
  auditoria, metadados e reaplicacao/reversao.
- `tools/test-crm-documents-sql.mjs`: envio/retorno/correcao/cancelamento e SLA.
- `tools/verify-crm-kanban.mjs`: confere a projecao e o filtro enviados pela API,
  remove de fato as colunas na resposta simulada e testa a interface completa.
- Build, lint dos arquivos de aplicacao alterados e regressoes de sincronizacao
  e atendimento retroativo.
