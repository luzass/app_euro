# Dashboard Funil: visao geral e filtro de leads

## Retangulos

A pagina abre na visao Geral. Leads conta leads_cursos desde 15/11/2026, inclusive,
sem exigir ano_semestre ou correspondencia academica. Inscritos conta TODOS os CPFs
de inscritos_20271 e Matriculados TODOS os CPFs de matriculados_20271 dentro dos
filtros escolhidos, inclusive quem nao aparece em leads_cursos ou tem lead anterior
ao corte. O grafico Funil por origem mostra os totais independentes dessas tres bases.

Clicar no retangulo Leads ou na barra Lead ativa uma visao separada. So nessa visao,
Inscritos e Matriculados contam a intersecao de CPF com os leads elegiveis. O grafico
muda para Situacao dos leads, com os estados exclusivos descritos abaixo. Os textos
dos indicadores tambem mudam para deixar claro quando se referem a esses leads.

Visao geral, limpar o grupo ou Limpar graficos sai da visao de leads e restaura os
registros academicos que nao pertencem a esse grupo. Os dois primeiros preservam os
filtros de dimensao; Limpar graficos remove esses filtros tambem. Um filtro por curso
na visao geral continua considerando as tres bases, sem restringi-las a leads.

O corte de 15/11 NAO e aplicado as datas de inscricao ou matricula. Filtros de curso,
campus, ingresso, turno, Medicina e tipo de aluno continuam aplicados ao recorte.

## Corte exclusivo dos leads

A origem da data segue a mesma prioridade do CRM: created_at, data_criacao, data.
Timestamps com fuso explicito sao convertidos para America/Sao_Paulo antes de
comparar o dia. Datas sem fuso representam o dia de calendario informado. Assim,
15/11/2026 00:00 em Brasilia entra; 15/11/2026 02:59:59Z ainda e dia 14 e nao entra.

Datas ausentes ou invalidas ficam fora, com quantidade de cadastros sinalizada na
tela. Nao se usa data de inscricao, ano_semestre ou presenca na base academica para
resgatar um lead sem data ou anterior ao corte. Registros academicos do CPF de um
lead elegivel continuam participando mesmo com datas anteriores a 15/11.

O corte e so de leitura/analise no navegador: nao apaga leads antigos, nao muda o
CRM e nao altera tabelas, sincronizacao ou permissoes. Nao ha corte final adicional.

O indicador Inscritos e cumulativo: inclui quem possui inscricao e ja se matriculou.
Uma matricula sem inscricao localizada conta como matricula, sem inventar inscricao.

## Grafico sem sobreposicao na visao de leads

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
Limpar graficos remove todos os filtros dos graficos e volta a visao Geral.

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

- tools/test-funnel-cohort.mjs: corte somente de leads, limite inclusivo em Brasilia,
  totais gerais independentes e distintos dos totais do filtro de leads,
  datas/aliases invalidos, registros academicos anteriores preservados, intersecoes CPF,
  estados exclusivos, soma dos grupos, filtros cumulativos/dimensionais, duplicatas,
  Medicina, tipo de aluno, matricula sem inscricao e identidade pendente.
- tools/verify-funnel-cohort.mjs: leads recentes sem semestre/com semestre antigo,
  abertura em Geral, entrada via card/barra Lead, retorno/limpeza restaurando todos
  os inscritos e matriculados e capturas das duas visoes em desktop/mobile,
  exclusao de leads antigos/sem data apesar de inscricao e matricula, retangulos,
  cliques nas tres situacoes, cursos e filtros, ausencia de consultas extras,
  atualizacao e captura desktop/mobile com dados ficticios.
- tools/verify-dashboard-medicine.mjs: regressao dos dois dashboards e filtros.

Permanece a ocorrencia de ESLint react-hooks/set-state-in-effect na chamada inicial
de loadData em DashboardFunil.tsx, anterior a estas alteracoes. O carregamento inicial
nao foi refatorado neste trabalho.
