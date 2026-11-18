# Transicoes entre processos seletivos

Painel executivo / Visao geral / Acompanhamento das turmas de entrada.

A visao acumulada da turma continua disponivel. A nova secao compara sempre o PS de origem com o imediatamente seguinte em tres populacoes: Geral, Calouros e Veteranos. O tipo e o registrado nos vinculos ativos da origem, nao o tipo no destino. CPF com tipos conflitantes ou ausentes entra apenas em Geral, com aviso de quantidade fora das duas categorias.

O filtro Curso do acompanhamento compartilha a selecao do filtro Curso do painel inteiro. Tambem respeita campus, turno e forma de ingresso. Todos os cursos, incluindo Medicina, participam por padrao; nao ha exclusao automatica de Medicina nessa analise.

## Indicadores

- Base: pessoas por CPF unico, com contrato ativo no PS de origem e dentro dos filtros.
- Continuam ativos: pessoas da base localizadas com qualquer contrato ativo no destino, em toda a IES. Uma troca de curso, campus ou ingresso nao equivale a saida.
- Sem vinculo ativo: provaveis concluintes mais demais ausencias no destino. O percentual usa a base inteira da origem como denominador.
- Provaveis concluintes: ausencia no destino e todos os ultimos vinculos ativos em periodo final, pela aproximacao ja utilizada: 10 para os demais cursos e 12 para Medicina. Nao confirma formatura.
- Demais ausencias: pessoas nao localizadas e sem evidencia suficiente de provavel conclusao. O percentual tambem usa a base inteira da origem, nao apenas os elegiveis a renovacao. Nao e taxa confirmada de evasao.

Retornos em um PS posterior nao reescrevem uma ausencia observada no par anterior. Duplicatas nao aumentam a base. Se houver outro vinculo ativo nao concluinte, nao se presume conclusao de toda a pessoa apenas porque um dos cursos estava em periodo final.

## Limites

O primeiro par selecionado e o ultimo com destino anterior ao PS atual. O PS atual permanece selecionavel e identificado como parcial: novas cargas podem diminuir o percentual observado de ausencias. As fontes carregadas sao fotografias dos vinculos, nao comprovantes de desistencias ou diplomas.

Base indisponivel/vazia, contrato ausente ou outra pendencia de classificacao impedem a exibicao da taxa. Nao se pula um semestre faltante para comparar com outro posterior. Ausencia de dados de curso/periodo para avaliar conclusao aparece como alerta separado.

## Verificacao

`node tools/test-semester-transitions.mjs` verifica populacoes, denominadores, CPFs repetidos, Medicina, transferencias, retorno posterior, bases faltantes e periodo parcial.

`node tools/verify-semester-transitions.mjs <pasta-de-pacotes-com-playwright>` verifica as tres visoes, filtro de curso compartilhado, Medicina, ausencia de falsa saida em transferencia interna, erros de fonte e layout em computador/celular com dados ficticios.

Nao requer migracao SQL nem alteracao das fontes no Supabase.
