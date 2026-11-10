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
