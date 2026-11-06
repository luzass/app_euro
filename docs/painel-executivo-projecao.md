# Painel executivo e projecao do PS 2027.1

## Organizacao

Um item lateral, Painel Executivo, concentra Visao geral, Projecao 2027.1,
Renovacao e Perfil. URLs antigas de perfil e renovacao redirecionam para as
secoes correspondentes. As mesmas permissoes anteriores sao preservadas;
a reitoria passa a abrir neste painel. Spike continua restrita ao trafego pago.
As secoes compartilham uma leitura das bases, sem consultar tudo novamente
ao trocar de secao.

## Calendario

- Inicio informado: 29/09/2026.
- Data-alvo inicial: 31/03/2027. O usuario informou marco; o ultimo dia foi
  adotado como hipotese editavel, e nao como encerramento oficial confirmado.
- Corte: dia da consulta, no fuso America/Sao_Paulo.
- Calendario salvo apenas no navegador, sem modificar o Supabase.

## Populacao e datas

Inscritos usam CPF unico e data_inscricao na tabela do respectivo PS.
Matriculas usam periodo_letivo, CPF unico, contrato ATIVO ou CONTRATO ATIVO
e tipo_aluno explicitamente CALOURO ou VETERANO. Classificacoes conflitantes
no mesmo CPF ficam pendentes, sem decidir silenciosamente por um dos tipos.
Calouros usam data_de_matricula, com data_baixa_do_pagamento como alternativa.
A primeira data valida do CPF no recorte e mantida.

Datas originais de matricula dos veteranos nao representam renovacao.
Por isso, a projecao de veteranos nao extrapola essas datas.

## Inscritos e calouros

As referencias iniciais sao 2024.1, 2025.1 e 2026.1. A janela da campanha atual
e deslocada por ano para cada referencia; nao se presume que a campanha
historica realmente tenha encerrado na mesma data. Sao janelas comparaveis
ate a data-alvo escolhida, e nao os totais necessariamente integrais de cada PS.

Para cada referencia:

1. Calcular a fracao de tempo transcorrida na janela atual.
2. Localizar o corte proporcional na janela historica.
3. Contar CPFs ate esse corte e ate o fim da janela historica.
4. Dividir o realizado atual pela fracao de volume historico ja realizada no corte.

Sao exigidas pelo menos duas referencias utilizaveis. Datas invalidas, CPF
ausente, classificacoes de aluno indefinidas e registros atuais fora da janela
impedem a estimativa afetada. Bases vazias nao geram projecoes finais zero.

## Veteranos e total

As referencias sao transicoes de segundo para primeiro semestre com dados
em ambos os lados. Para cada par, calcular:

- Elegiveis anteriores: ativos, excluindo provaveis concluintes pela regra atual
  de 10o periodo ou 12o em Medicina. A regra deve futuramente usar o curriculo
  oficial de cada curso; nao confirma conclusao real.
- Taxa de renovacao como veterano: elegiveis com vinculo ativo VETERANO no destino.
- Demais veteranos: veteranos do destino fora desse conjunto de elegiveis.

O cenario aplica a taxa historica aos elegiveis atuais e acrescenta os demais
veteranos do par historico. Esses demais vinculos podem incluir retornos,
ingressos como veterano ou pessoas fora da base elegivel. Os dois componentes
tem como piso o que ja foi observado na carga atual. Nao sao estimados
cancelamentos futuros nem uma curva diaria de renovacao.

Sao exigidos dois pares comparaveis. O total soma os cenarios de calouros e
veteranos; se algum deles nao estiver disponivel, a soma projetada fica pendente.
O total observado continua mostrando todos os CPFs ativos, incluindo os ainda
nao classificados, com alerta da diferenca de classificacao.

## Cenarios e verificacao

Conservador e expansivo sao os extremos dos cenarios historicos; a referencia
e a mediana. Nao sao intervalos de confianca nem probabilidades calibradas.
Com tres referencias utilizaveis, o teste retrospectivo de inscritos e calouros
estima a ultima referencia usando apenas as anteriores. O resultado final da
referencia reservada serve somente para avaliar o erro, nao para ajustar a
previsao desse teste. Um unico teste nao demonstra precisao futura.

Fundamentacao sobre comparacao temporal, sazonalidade e avaliacao:
[Forecasting: Principles and Practice](https://otexts.com/fpp3/).
O modelo implementado e uma aproximacao operacional propria.

## Visao geral

Variacao da base ativa usa a diferenca de CPFs entre os dois periodos letivos.
Entradas sao ativos atuais ausentes no periodo anterior. Retornos sao entradas
ja vistas em um periodo mais antigo. Primeira aparicao no historico disponivel
nao e sinonimo de primeiro ingresso na instituicao.

Turmas de entrada usam calouros explicitamente identificados e acompanham
a presenca ativa dos mesmos CPFs nos periodos posteriores. Os recortes podem
mudar a interpretacao: migracao para fora de um curso nao e evasao da instituicao.
Ausencia de vinculo ativo nao confirma evasao, trancamento ou conclusao.

## Limitacoes de dados

Tabelas atualmente carregadas nao substituem retratos historicos da mesma data
de corte. Bases antigas filtradas para ativos podem excluir cancelamentos e
introduzir vies de sobrevivencia. Mudancas de preco, bolsas, oferta, marketing
ou coleta nao sao variaveis explicativas do modelo. A leitura e indicativa;
as premissas e a qualidade das cargas precisam ser conferidas antes de decidir
investimento ou metas institucionais.
