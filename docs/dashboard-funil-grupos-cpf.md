# Dashboard Funil: acompanhamento por CPF

Selecionar Lead no grafico ou o indicador Leads passa a acompanhar os CPFs desse
grupo nas tres bases. Inscritos e Matriculados mostram as correspondencias encontradas,
em vez de zerarem porque o filtro excluiu as outras etapas. Inscrito e Matriculado
tambem selecionam seus respectivos grupos; limpar o grupo volta a visao geral.

Os graficos de curso, campus, ingresso e turno continuam cruzando os filtros. Para
leads que possuem inscricao vinculada, a projecao analitica usa as combinacoes reais
da inscricao, nao os campos vazios ou um interesse antigo do lead. Sem inscricao,
uma matricula vinculada pode fornecer esses atributos, mas nao cria uma inscricao.
Sem nenhuma correspondencia, o lead conserva seus atributos originais.

Um CPF com varias inscricoes preserva todas as combinacoes de curso/campus/turno;
nao se escolhe uma linha arbitraria nem se misturam campos de inscricoes diferentes.
Os indicadores contam CPFs distintos. O mesmo CPF pode aparecer em mais de um curso,
entao somar as barras por curso nao necessariamente recompora o total de pessoas.

CPFs sao normalizados pelo helper existente. Identificadores vazios ou invalidos nao
geram vinculos entre bases. O cruzamento e uma correspondencia nas bases carregadas,
nao comprova a sequencia temporal lead-inscricao nem atribuicao a uma campanha paga.
As regras existentes de semestre, Medicina, tipo de aluno e escopo permanecem.

Tudo usa os dados ja carregados pela pagina. Nao ha nova consulta ao filtrar,
nenhuma alteracao no Supabase e nenhum SQL novo. O botao Atualizar continua buscando
novamente as tres bases. Publicar o frontend e necessario para ativar em producao.

Verificacoes locais:

- `node tools/test-funnel-cohort.mjs`: grupos, atributos vinculados, CPF formatado,
  curto ou ausente, duplicacao, multiplos cursos, filtros, fallback e imutabilidade.
- `node tools/verify-funnel-cohort.mjs <pasta-com-playwright>`: clique/teclado,
  indicadores e barras, curso/campus/turno, limpeza, atualizacao, ausencia de novas
  consultas por filtro e layouts desktop/mobile, usando apenas dados ficticios.
- `node tools/verify-dashboard-medicine.mjs <pasta-com-playwright>`: regressao dos
  dois dashboards, Medicina, tipo de aluno, selecao de curso e periodo.
- Build de producao aprovado.

ESLint ainda aponta `react-hooks/set-state-in-effect` na chamada inicial de loadData
em DashboardFunil.tsx. A mesma ocorrencia foi confirmada no arquivo do commit anterior;
este ajuste nao altera o carregamento inicial. Nao surgiram erros novos nesse lint.
