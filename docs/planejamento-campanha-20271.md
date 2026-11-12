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

### Calculos revisados em 12/11/2026

O antigo ajuste pelo inverso da fracao historica no corte foi retirado da previsao principal. Poucas matriculas historicas no inicio faziam a concentracao atual em Medicina ser multiplicada indevidamente. O indice de desempenho no corte permanece apenas descritivo.

- Estoque conhecido: CPFs com data ate o corte, incluindo registros do mesmo PS anteriores ao inicio da campanha.
- Ritmo diario: eventos entre inicio e corte divididos por todos os dias corridos dessa janela, incluindo dias zerados.
- Inscritos: estoque conhecido + mediana do saldo de inscricoes ocorrido depois do corte equivalente nos PS anteriores, ate o encerramento escolhido.
- A demanda e separada entre Medicina e demais cursos antes da projecao; CPF em ambos fica uma unica vez, em Medicina.
- Conversao historica dos demais cursos: CPFs inscritos que tambem possuem matricula ativa no mesmo PS, divididos pelos CPFs inscritos. Sem cruzamento por CPF, nao se presume conversao.
- Calouros dos demais cursos: demanda prevista desses cursos x mediana das conversoes historicas. Preserva-se o piso de matriculas confirmadas; confirmados fora da coorte de inscritos sao acrescidos e sinalizados para conciliacao.
- Medicina sem capacidade confirmada: preserva somente as matriculas conhecidas ate o corte. Nao extrapola o ritmo nem inventa novas vagas. Calouros e total sao cenarios parciais.
- Medicina com capacidade confirmada: demanda x conversao historica, limitada pela capacidade e nunca abaixo do realizado conhecido. Capacidade inferior ao realizado exige conferencia e mantem o cenario parcial.
- Veteranos: base elegivel do semestre anterior x retencao historica, mais demais vinculos historicos. Provaveis concluintes sao retirados da base elegivel. Os renovados confirmados sao piso; nao se extrapola uma matricula atual por dia.
- Total: cenario de calouros + cenario de veteranos, com a mesma sinalizacao de parcialidade e indisponibilidade.

Exemplo sem Medicina: 12 inscritos conhecidos e saldo historico mediano de 72 resultam em 84 inscritos previstos. Com conversao historica de 25%, o cenario e 21 calouros, respeitando os confirmados. O fato de haver apenas 8 inscricoes historicas no corte nao multiplica novamente esses 84.

Exigem-se pelo menos dois PS utilizaveis para demanda/conversao e duas transicoes para renovacao. Sem suporte historico suficiente, aparece uma alternativa linear identificada: estoque conhecido + ritmo da janela x dias restantes. Para calouros, apenas o ritmo dos demais cursos e extrapolado; Medicina permanece no realizado. Dados atuais invalidos bloqueiam o indicador com motivo explicito.

Cards e planejamento usam o mesmo modelo. O saldo previsto e distribuido na linha futura pelo formato temporal historico, sem alterar o total calculado. A tabela de base historica exibe os totais integrais carregados de calouros, Medicina e veteranos, antes do recorte de datas, para conciliacao. As faixas sao extremos de cenarios historicos, nao intervalos de confianca. O teste retrospectivo usa somente PS anteriores ao PS testado e dados conhecidos no respectivo corte; Medicina sem capacidade impede validar um fechamento total completo.

Os comparativos .1 de inscritos e calouros ficam sempre visiveis, com todos os PS carregados, cores e conferencia por PS. Registros historicos conhecidos continuam na curva mesmo se houver datas pendentes; as pendencias sao quantificadas e impedem calibracao, nao visualizacao parcial. As auditorias extensas continuam recolhidas.

Os alvos de recomposicao da base e as metas institucionais de calouros ficam apenas na aba Renovacao, junto de concluintes e continuidade da base. As metas mensais operacionais permanecem no planejamento da Projecao.

### Tempo e qualidade

- Semanas ancoradas no inicio escolhido, com 7 dias. Meses de calendario. Intervalo que atravessa o corte separado em realizado parcial e trecho restante.
- Projecoes ancoradas no realizado do corte; nenhum evento atual futuro alimenta C. Eventos historicos posteriores ao corte fazem parte legitima do trecho restante.
- Os cards nao bloqueiam toda a previsao por haver registros antes do inicio: entram no estoque confirmado, mas nao no ritmo extrapolado. Registros atuais posteriores ao corte nao alimentam o cenario, nem seu piso. O realizado na carga permanece sendo o total carregado. Datas atuais invalidas/ausentes continuam bloqueando, com motivo explicito. Historico insuficiente usa alternativa linear identificada, nunca um historico inventado.
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

### Dashboard Historico

"Visao geral" preserva a carga inteira. "Ate a data atual" usa o mesmo dia e mes no ano equivalente de cada PS; em 12/11/2026, 2024.1 e cortado em 12/11/2023 e 2027.1 em 12/11/2026. O corte nunca ultrapassa a data atual. Datas invalidas ficam fora somente da visao temporal e sao informadas.

O filtro de contratos inicia em "Somente ativos" para reconciliar com a base da projecao, com opcao "Todos os contratos". Veteranos so entram no corte temporal com baixa na janela do respectivo PS: a data original antiga de matricula nao comprova renovacao. Este recorte nao reconstroi o estado dos contratos na data antiga. Filtros de semestre, periodos, tipo de aluno, curso, campus, turno e ingresso permanecem combinaveis.

`node tools/test-campaign-planning.mjs` verifica formulas, periodos, cortes, deduplicacao, campos de data, indisponibilidade e as metas oficiais. As suites executivas anteriores continuam cobrindo renovacao, persona, exclusoes academicas e atualizacao automatica.

`tools/verify-executive-dashboard.mjs` verifica o fluxo com dados ficticios no navegador, incluindo controles, metas, graficos, desktop/mobile e ausencia de estouro horizontal da pagina.

`tools/test-capture-coherence.mjs` reproduz bases ficticias de 689, 689 e 427 calouros, com inicio concentrado em Medicina; verifica demanda/conversao, parcialidade, CPF unico, preservacao do estoque, exclusao de datas futuras e cortes do Historico. `tools/verify-capture-history.mjs` verifica esses fluxos no navegador em desktop/mobile. Esses testes nao substituem a conferencia autenticada das tabelas reais.

O modelo e uma heuristica operacional, nao uma probabilidade individual de matricula nem uma garantia de fechamento.
