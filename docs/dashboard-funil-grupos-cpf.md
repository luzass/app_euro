# Dashboard Funil: base completa de leads

## Retangulos

Leads conta toda a base leads_cursos, sem exigir ano_semestre nem correspondencia
academica. A base inclui leads antigos. Inscritos e Matriculados contam somente os
CPFs desses leads encontrados nas respectivas tabelas de 2027.1, nunca candidatos
que existem apenas nas bases academicas. Filtros de curso, campus, ingresso, turno,
Medicina, tipo de aluno e grupo continuam aplicados ao recorte analitico.

O indicador Inscritos e cumulativo: inclui quem possui inscricao e ja se matriculou.
Uma matricula sem inscricao localizada conta como matricula, sem inventar inscricao.

## Grafico sem sobreposicao

A situacao de cada lead tem prioridade:

1. Matriculados: CPF encontrado em matriculados_20271 no recorte.
2. Inscritos sem matricula: tem inscricao, mas nao matricula no recorte.
3. Nao inscritos: nao foi encontrado em nenhuma das duas bases academicas no recorte.

Se existirem leads sem CPF utilizavel, aparece adicionalmente Sem CPF para cruzar.
Ausencia de identidade nao e prova de nao conversao. Esses cadastros sao contados
individualmente pelo ID, sem associacao por telefone ou nome. Com CPF, a contagem e
por pessoa distinta, mesmo com varias linhas de origem ou varias inscricoes.

Exemplo: 100 leads, 30 com inscricao e 10 matriculados (todos com inscricao).
Retangulos: 100 / 30 / 10. Grafico: 70 nao inscritos / 20 inscritos sem matricula /
10 matriculados. A soma dos grupos do grafico recompõe o total de leads.

Clicar em uma barra seleciona somente aquele grupo e atualiza os retangulos e os
outros graficos. Os retangulos permitem acompanhar o total, inscritos cumulativos
ou matriculados; mudar entre retangulo e situacao limpa a outra selecao para nao
produzir uma intersecao acidental. Limpar o grupo conserva os filtros dimensionais;
Limpar graficos remove todos os filtros dos graficos.

## Dimensoes e limites

A projecao analitica de um lead vinculado usa as combinacoes reais de inscricao e
matricula. Um CPF pode estar em varios cursos; nao se misturam curso e campus de
linhas diferentes. Os registros originais nao sao alterados. Sem correspondencia,
os atributos proprios do lead sao mantidos e campos vazios aparecem como Nao informado.
A soma de barras por curso pode exceder o total de pessoas por causa de multiplos cursos.

O cruzamento e correspondencia por CPF nas bases carregadas, nao evidencia da ordem
temporal lead-inscricao nem de atribuicao a anuncio. Por isso foi retirado o antigo
botao Somente trafego pago, que apenas testava presenca na base de leads, sem provar
origem paga. Meta/Google/UTMs e datas de captacao serao uma analise separada.

Nao ha SQL novo nem novas consultas ao clicar nos filtros. A pagina reutiliza as
tres bases ja carregadas. O botao Atualizar busca novamente as tres. E necessario
publicar o frontend para ativar em producao.

## Verificacao

- tools/test-funnel-cohort.mjs: base independente de conversao, intersecoes CPF,
  estados exclusivos, soma dos grupos, filtros cumulativos/dimensionais, duplicatas,
  Medicina, tipo de aluno, matricula sem inscricao e identidade pendente.
- tools/verify-funnel-cohort.mjs: leads sem semestre/com semestre antigo, retangulos,
  cliques nas tres situacoes, cursos e filtros, ausencia de consultas extras,
  atualizacao e captura desktop/mobile com dados ficticios.
- tools/verify-dashboard-medicine.mjs: regressao dos dois dashboards e filtros.

Permanece a ocorrencia de ESLint react-hooks/set-state-in-effect na chamada inicial
de loadData em DashboardFunil.tsx, anterior a estas alteracoes. O carregamento inicial
nao foi refatorado neste trabalho.
