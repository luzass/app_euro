# Planejamento e projecao 2027.1

## Referencias de negocio

- `metas_27.1.xlsx`, aba Dashboard: planejamento de 307 regulares e 204 PROUNI.
- `Politica_Bonificacao_Unieuro_2027_1_Final.pdf`, paginas 2 e 4: quatro faixas regulares mensais e tres faixas PROUNI no processo inteiro.
- Medicina excluida das metas de captacao por orientacao do usuario. O piso institucional de recomposicao da base continua incluindo Medicina.
- A Meta 01 mensal soma 306, contra 307 no total regular. Os valores foram preservados, sem redistribuicao automatica. Em 11/11/2026, o usuario pediu remover o aviso dessa diferenca da interface.
- Nenhum dos arquivos define metas por curso/campus. Nao se inventa um rateio institucional.
- Este trabalho nao altera calculos de pagamento individual, do gerente ou do setor de matricula.

## Direcao da campanha

O painel existente de projecao ganhou um planejamento por curso, campus, curso/campus ou forma de ingresso. Os periodos historicos sao selecionados no filtro de referencias, sempre anteriores e do mesmo semestre. A visualizacao compara cada PS, acumulados e volumes diarios, semanais ou mensais.

A data padrao das matriculas passa a ser a baixa do pagamento, coerente com a politica. O seletor permite analisar estritamente a data de matricula; nao ha fallback silencioso entre as duas datas. Metas mensais continuam sempre pela baixa, independentemente dessa selecao.

Inscricoes usam `data_inscricao`. Matriculas usam `periodo_letivo`, contratos ativos e classificacao CALOURO explicita. Veteranos continuam no modelo separado de renovacao por coorte, pois sua data original nao representa a renovacao atual. CPF unico no total e em cada grupo; uma pessoa em dois cursos pode aparecer nos dois grupos, sem duplicar o geral.

### Calculos

- C: eventos atuais desde o inicio da campanha ate o corte.
- D: dias corridos observados, incluindo dias zerados.
- R: dias restantes ate a data-alvo.
- Hc: media historica de eventos ate o mesmo dia/mes nos anos anteriores.
- Hr: media historica dos eventos posteriores ao corte e anteriores ao encerramento equivalente.
- Ritmo diario: C / D.
- Projecao linear: C + (C / D) * R.
- Indice frente ao historico: C / Hc.
- Projecao ajustada: C + (C / Hc) * Hr.

Exemplo: 12 eventos em 12 dias = 1/dia. Se o historico tinha media 8 no corte e depois realizou mais 72, o indice e 1,5. O ajuste indica 12 + 1,5 * 72 = 120. Multiplicar novamente o ritmo atual pelo mesmo indice duplicaria o efeito do desempenho.

O ajuste exige 3 eventos atuais, 2 PS historicos utilizaveis e 10 CPFs historicos somados no corte. Esses limites sao salvaguardas operacionais, nao validacao estatistica. Sem suporte suficiente, o ajuste fica pendente e a referencia linear continua visivel quando suas datas sao utilizaveis. Os extremos dos cenarios historicos nao sao intervalos de confianca.

Os cards superiores usam a mediana dos cenarios sazonais quando existem duas referencias utilizaveis. Sem isso, com dados atuais validos, apresentam o cenario linear com esse nome e o motivo, sem fabricar intervalo historico. O total identifica a combinacao de calouros lineares com veteranos por coorte. Dados atuais invalidos continuam bloqueando o indicador. Uma falha historica nao bloqueia as demais fontes saudaveis de calouros.

Os comparativos .1 de inscritos e calouros ficam sempre visiveis, com todos os PS carregados, cores e conferencia por PS. Registros historicos conhecidos continuam na curva mesmo se houver datas pendentes; as pendencias sao quantificadas e impedem calibracao, nao visualizacao parcial. As auditorias extensas continuam recolhidas.

Os alvos de recomposicao da base e as metas institucionais de calouros ficam apenas na aba Renovacao, junto de concluintes e continuidade da base. As metas mensais operacionais permanecem no planejamento da Projecao.

### Tempo e qualidade

- Semanas ancoradas no inicio escolhido, com 7 dias. Meses de calendario. Intervalo que atravessa o corte separado em realizado parcial e trecho restante.
- Projecoes ancoradas no realizado do corte; nenhum evento atual futuro alimenta C. Eventos historicos posteriores ao corte fazem parte legitima do trecho restante.
- Os cards de referencia nao bloqueiam toda a previsao por haver registros atuais antes do inicio ou depois do corte. Esses CPFs sao contados separadamente e exibidos no card; o ritmo e o piso projetado usam somente a janela. O realizado na carga permanece sendo o total carregado. Datas atuais invalidas/ausentes continuam bloqueando, com motivo explicito. Historico insuficiente usa alternativa linear identificada, nunca um historico inventado.
- Dias sem evento = corte menos ultima data valida, por grupo. Sem evento conhecido, informa toda a janela observada.
- Pendencias de CPF/data impedem alerta automatico. Base indisponivel nao e convertida em zero.
- Grupos historicos sem eventos atuais permanecem na tabela, para nao esconder cursos parados.
- Inatividade de eventos nao prova falta de atendimento, evasao ou que a carga esta atualizada.
- Historicos sao a carga preservada hoje, nao fotografias dos contratos na data antiga.
- A atualizacao automatica existente a cada 5 minutos continua buscando somente 2027.1; o corte avanca por dia e os calculos reagem aos novos dados.

## Controles do planejamento

Os filtros superiores de curso/campus/turno/ingresso afetam todo o recorte analitico da aba, incluindo os cards. Os controles internos do planejamento nao mudam esses filtros globais. Indicador escolhe inscricoes ou matriculas de calouros; Detalhamento define os grupos disponiveis; Grupo no grafico escolhe um deles ou o geral. Intervalo muda somente a agregacao temporal, e Grafico muda somente a visualizacao. Referencias historicas selecionam apenas a calibracao da previsao, nao escondem os PS do comparativo.

O clique nas barras de volume nao troca mais o grafico para outro modo. No comparativo de PS, o clique destaca a curva e Ctrl/Cmd acumula destaques, sem alterar as referencias do calculo. Isso evita que um clique deixe apenas uma referencia e faca a previsao historica desaparecer. Datas futuras aparecem sem volume realizado, nao como valores zerados conhecidos.

O acompanhamento de inatividade tem agrupamento proprio por curso/campus, curso ou campus, independentemente do grupo Geral da projecao. Duas listas separam inscricoes e matriculas, ordenadas pelos dias sem eventos, com badges de alerta e ultima data. O clique num grupo focaliza o grafico, mas nao reduz o acompanhamento a uma unica linha. No celular, a ultima data vai abaixo do nome para preservar a leitura dos dias sem rolagem horizontal.

## Verificacao

`node tools/test-campaign-planning.mjs` verifica formulas, periodos, cortes, deduplicacao, campos de data, indisponibilidade e as metas oficiais. As suites executivas anteriores continuam cobrindo renovacao, persona, exclusoes academicas e atualizacao automatica.

`tools/verify-executive-dashboard.mjs` verifica o fluxo com dados ficticios no navegador, incluindo controles, metas, graficos, desktop/mobile e ausencia de estouro horizontal da pagina.

Referencia metodologica geral para separar cenarios de precisao validada e testar apenas com dados disponiveis no corte: [Forecasting: Principles and Practice, capitulo 5](https://otexts.com/fpp3/toolbox.html). O ajuste acima e uma heuristica operacional especifica deste aplicativo, nao uma formula atribuida ao livro.
