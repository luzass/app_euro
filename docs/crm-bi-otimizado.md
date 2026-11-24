# BI do CRM com resposta reduzida

## Aplicacao em uma instalacao existente

1. Executar `sql/crm_kanban_otimizar_bi.sql` no SQL Editor do Supabase.
2. Abrir Gestao do CRM e clicar em Atualizar indicadores.

A migracao exige o BI e o recorte de 15/11/2026 instalados. E repetivel e substitui
somente `crm_kanban_bi_snapshot(date,date,boolean)`. Nao apaga nem modifica contatos,
atendimentos, eventos ou fontes. Preserva assinatura, permissoes e o formato usado
pelo aplicativo atual; esta etapa nao depende de nova publicacao do frontend.

O botao manual e importante porque uma resposta anterior pode continuar no cache
em memoria por 24 horas. Nao foi criado cache compartilhado, cron ou polling novo.

## O que muda

- A consulta intermediaria dos contatos usa somente as colunas necessarias ao BI,
  sem materializar copias brutas e campos privados de perfil.
- Movimentos de fase, reaberturas e cadencias retornam somente dentro do periodo.
- Atendimentos retornam dentro do periodo, mais o primeiro contato de saida valido
  de cada candidato antes do corte, mesmo anterior ao inicio do periodo.
- Trocas de responsavel e encerramentos historicos continuam disponiveis para
  atribuicao e opcoes de filtros. Entrada, inscricao e contratos continuam usando
  o historico necessario para calcular a conversao e a matricula ativa no corte.

Manter o primeiro atendimento anterior evita classificar um recontato como primeiro
contato. Contratos distintos, cancelamentos, testes, limites de dia em Sao Paulo e
responsavel na data do evento preservam o comportamento anterior. Carteira e alertas
continuam atuais; esta alteracao nao os transforma em estoque historico.

## Limites

A funcao ainda consulta fatos historicos e faz agregacoes no banco. O ganho visado
e reduzir a largura dos dados intermediarios, a construcao/transferencia de JSON e
o processamento no navegador. Nao e uma agregacao integral no servidor nem prova
de que o alerta de comprometimento de memoria de 1,5 GB foi resolvido. Tempo e RAM
em producao precisam ser observados separadamente, sob carga comparavel.

## Verificacao local

- `node tools/test-crm-bi-optimization.mjs <caminho-do-pglite>`: 320 comparacoes do
  modelo completo contra a funcao anterior, com datas, responsaveis e filtros;
  verifica tambem permissoes, metadados da funcao, privacidade, reversao e reaplicacao.
- No cenario ficticio desse teste, eventos retornados passaram de 409 para 8 e
  atendimentos de 411 para 8. Esses numeros nao representam a base de producao.
- Passaram tambem `test-crm-management-sql.mjs`, `test-crm-intake-scope-sql.mjs`,
  `test-crm-management.mjs`, `test-crm-refresh-cache.mjs` e `audit-crm-workload.mjs`.

## Reversao

Executar `sql/crm_kanban_reverter_otimizacao_bi.sql` e atualizar os indicadores.
Isso restaura somente a versao anterior desta consulta; nao desfaz as otimizacoes
de sincronizacao, quadro ou documentacao, nem altera dados de candidatos.

As tres copias de instalacao da funcao permanecem equivalentes: estrutura inicial,
migracao de BI e recorte de 15/11/2026. Os testes conferem essa equivalencia.
