# Comparacao de campanhas, perfil e projecao

## Onde aparece

Na pagina existente Painel executivo, sem nova entrada na barra lateral:

- Projecao 2027.1: curvas de inscritos e calouros na mesma data, variacao
  contra cada PS, ultimos sete dias e cenarios de inscritos, calouros,
  veteranos/renovacoes e total.
- Perfil do matriculado: aderencia descritiva dos inscritos atuais ao perfil
  historico do seu curso, seguida do perfil demografico ja existente.

## Datas e contagens

A campanha atual inicia em 29/09/2026. A data-alvo padrao e 31/03/2027,
ajustavel no navegador, pois o usuario informou encerramento em marco.
A data de corte acompanha o dia corrente em America/Sao_Paulo.

Os anos anteriores usam exatamente o mesmo dia e mes, e nao a fracao do
tempo transcorrido. O intervalo de campanha e deslocado por ano. Em ano
nao bissexto, 29/02 corresponde a 28/02. Nao pressupomos conhecer a data
efetiva de inicio de cada campanha historica: a comparacao e por calendario.

Inscritos sao CPFs unicos por processo, respeitando ANO/SEMESTRE recebido
quando preenchido. Assim, os registros de 2025.1 encontrados na tabela
2025.2 nao viram inscritos de outro PS; repeticoes de CPF nao inflam curvas.
Matriculas usam periodo letivo e contrato ativo; as curvas de captacao
incluem apenas calouros. A data original do veterano nao e uma data de renovacao.

As bases historicas disponiveis hoje nao sao fotografias do estado dos
contratos em cada data passada. As curvas indicam eventos datados dos
registros preservados na carga atual, nao uma reconstituicao integral do
que a equipe sabia naquele dia. Datas/CPF invalidos nao entram nas curvas;
ha aviso de cobertura. Uma fonte inacessivel aparece indisponivel, nao zero.

## Projecoes

Mantem-se o metodo de cenarios auditavel: realizado atual dividido pela
fracao historica acumulada no corte para cada referencia utilizavel.
Minimo, mediana e maximo desses cenarios formam a faixa, limitada pelo
realizado. Nao sao intervalos de confianca. Referencias historicas podem
ser selecionadas em lista ou pelas linhas dos graficos.

Veteranos usam as transicoes de renovacao descritas no painel anterior,
nao uma curva baseada em datas antigas de matricula. O total soma as
projecoes de calouros e veteranos. Faltas de qualidade relevantes continuam
bloqueando a estimativa em vez de gerar numeros sem suporte.

## Aderencia nao e probabilidade

A referencia contem apenas calouros ativos com periodo letivo anterior
ao processo atual, um CPF por curso. Em repeticoes historicas, fica o
registro do periodo mais recente. Nenhum matriculado de 2027.1 alimenta
essa referencia. Matricula atual aparece apenas como situacao, nao como
caracteristica do indice.

Dimensoes: faixa etaria no evento, campus, turno e forma de ingresso.
Sexo, nacionalidade, informacoes financeiras e idade atual nao participam.
Escola/bairro nao foram inferidos nos inscritos quando nao existem campos
comparaveis; nao se atribui zero por falta de informacao.

Para cada dimensao, o indice usa frequencia da categoria dividida pela
frequencia da categoria mais comum no curso, e tira a media das razoes.
Exige 20 CPFs de referencia, tres dimensoes utilizaveis e dez observacoes
conhecidas em cada dimensao considerada. Os cortes 40/70 sao convencoes
operacionais explicitadas na interface, nao limites validados de conversao.
Com dados insuficientes, nao ha indice. A lista e unica por CPF e curso,
buscavel, filtravel e paginada em blocos de 20.

Este indice descreve semelhanca, nao chance de matricula e nao deve
decidir admissao, negar atendimento ou excluir candidatos de oportunidades.
Uma probabilidade requer modelar inscritos convertidos e nao convertidos,
validacao temporal, controle de vazamento, calibracao e avaliacao de vies.
Por isso o indice nao e multiplicado pelas projecoes de volume.

## Atualizacao

Enquanto a pagina estiver visivel, novas cargas de inscritos_20271 e
matriculados_20271 sao consultadas a cada cinco minutos e ao voltar para
a pagina apos pelo menos um minuto. Recalcula-se com o que ja foi gravado
no Supabase; o app nao executa o n8n nem altera registros.

O historico e o cache de CEP ficam em memoria durante a sessao, evitando
reler todos os anos a cada ciclo. Atualizar relê todas as fontes, inclusive
correcoes historicas. A data mostrada e a consulta do app, nao o horario
da carga original. Nao se guarda uma serie de versoes das previsoes passadas.

## Fora do escopo de graduacao

Na leitura compartilhada dos dashboards, excluem-se os processos da
coligada 2: 292/294 em 2024.2 e 316/357 em 2025.1, incluindo quando estiverem
armazenados em outra tabela. Sao os 23 registros de pos-graduacao, extensao
e Ex Officio que o usuario decidiu manter no banco e nao usar nos dashboards.
Nivel/processo explicitamente marcado como pos-graduacao/extensao tambem
fica fora. E uma regra de visualizacao, nao uma alteracao de RLS ou exclusao SQL.

## Verificacao

Testes de cenarios anteriores e novos testes de data equivalente, bissexto,
atualizacao de volume, CPF duplicado, semestre misto, exclusoes, referencia
temporal da persona e dados faltantes. Verificacao visual e funcional com
Playwright em desktop/mobile e dados ficticios, incluindo busca, paginacao,
falha de leitura e atualizacao de somente duas fontes no ciclo automatico.

## Metas, recomposicao e ritmo diario

Atualizacao apos definicao do usuario: primeira meta de 2027.1 e 307
calouros nao PROUNI e 204 PROUNI, ambos SEM Medicina. Essas metas estao
em `initialEnrollmentGoals`, separadas do piso institucional de recomposicao.
Este piso inclui Medicina e corresponde aos CPFs ativos do periodo anterior,
nao ao tamanho da base elegivel depois de retirar os provaveis concluintes.

O painel calcula o saldo ate esse piso, quantos CPFs da origem continuam
ativos e quantos entraram em relacao a origem. A reposicao dos provaveis
concluintes e um cenario condicional: se todos os elegiveis renovarem e os
concluintes sairem, precisamos de tantas entradas quanto concluintes.
Nao e uma previsao de formatura. Um ponto percentual de renovacao equivale
a elegiveis / 100 pessoas, aproximadamente.

Metas usam CPF unico, calouro explicitamente identificado e contrato ativo.
Um CPF com ingressos PROUNI e nao PROUNI simultaneos, ou ingresso ausente,
nao e alocado automaticamente a nenhum grupo. Nao somamos as 511 matriculas
novamente ao piso total: elas sao um componente da base, nao outro estoque.
Metas institucionais nao mudam com filtros analiticos de curso/campus.

Dois benchmarks complementam a projecao sazonal ja existente:

- Ritmo atual: realizado no corte + media diaria dos ultimos 14 dias
  corridos (incluindo dias com zero) x dias restantes. Exige pelo menos
  sete dias da campanha. Nao trata datas antigas de veteranos como renovacoes.
- Historico restante: realizado atual + media das taxas diarias historicas
  entre o corte equivalente e a data-alvo x dias restantes atuais.
  Exige duas referencias utilizaveis; nao extrapola a media da campanha
  inteira como se todas as etapas fossem iguais.

As faixas nao PROUNI/PROUNI desses benchmarks tambem excluem Medicina.
O total de calouros continua incluindo todos os cursos. Nao se somam os
benchmarks segmentados a projecao principal. Divergencias entre metodos
geram um alerta, nao uma media arbitraria nem um compromisso comercial.

Os tres metodos sao avaliados nos mesmos exercicios historicos: so entram
testes com duas referencias ANTERIORES ao PS testado. O ritmo do PS testado
usa apenas eventos ate o corte. Mostramos erro absoluto medio em pessoas
e quantidade de exercicios; poucos testes nao autorizam escolher um vencedor.
Referencia metodologica de benchmarks e validacao temporal:
https://otexts.com/fpp3/toolbox.html#time-series-cross-validation
Os benchmarks especificos deste painel sao aproximacoes operacionais,
nao um modelo estatistico calibrado da probabilidade individual.

A fila por curso cruza CPF + curso com vinculo ativo na carga atual, dentro
da janela de inscricao. Mostra pendentes, correspondencias e espera mediana
desde a inscricao, nao tempo sem contato. A prioridade por volume de fila
nao implica que aqueles candidatos estejam mais propensos a matricular.

Filtros da aderencia agora combinam nome, curso, forma de ingresso e
presenca de matricula ativa no curso. A fila nao muda a nota de aderencia.

Proximas analises de maior valor, sem prometer resultados antes da validacao:
conversao em 7/14/30 dias com coortes de mesma maturidade; tempo ate pagamento;
saldo liquido de crescimento por curso/campus; diferenca entre demanda e
conversao; e custo por matricula atribuida quando os gastos forem integrados.
