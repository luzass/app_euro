# Sincronizacao otimizada do CRM

## Aplicar na base existente

1. Execute `sql/crm_kanban_otimizar_sincronizacao.sql` no SQL Editor / Database.
2. Execute `sql/crm_kanban_conferir_sincronizacao.sql` e guarde o resultado.
3. Sem modificar as fontes, execute a conferenca novamente e compare os resultados.

A migracao substitui somente `crm_kanban_sync()` e `crm_kanban_refresh_intake_scope()`.
Nao executa uma sincronizacao durante a instalacao, nao cria outro cron e nao exige
publicar o frontend. Mantem assinaturas, OIDs, permissoes e os formatos de retorno.
Nao reexecute a estrutura completa em uma base existente.

O assistente nao aplicou esta migracao no Supabase real. Os testes usam banco local
e dados ficticios. Nao houve commit/push automatico desta etapa.

## O que muda

- Calcula o hash de cada payload uma vez na fila temporaria.
- Compara hash, CPF, data, marca de teste e data inferida antes de importar.
- Origens identicas e unicas contam como `unchanged`, mas nao chamam a importacao
  nem pegam seus bloqueios por CPF/origem.
- Ordena/importa somente o restante. Chaves repetidas conservam todas as tentativas,
  sem descartar uma variante por ela coincidir com o snapshot anterior.
- Usa o mesmo atalho para matriculas, que continuam apenas enriquecendo cards existentes.
- Os bloqueios de visibilidade ficam limitados aos candidatos a mudanca. A elegibilidade
  e lida de novo apos o bloqueio para preservar cadastros manuais concorrentes.
- Mantem a trava que impede duas sincronizacoes simultaneas.

## O que nao muda

- Inscritos sem filtro de data, exclusao de Medicina, leads desde 15/11/2026 no fuso
  de Brasilia, amostra historica quando habilitada e CPF unico.
- Responsaveis, dados manuais, historico de origem e tratamento de CPF divergente.
- Contratos cancelados ou alterados retroativamente continuam sendo processados.
- Fonte ausente nao e interpretada como ordem para apagar dados. A remocao de testes
  continua exigindo o procedimento proprio, com preservacao de historico.
- Cadencias, atendimentos retroativos, PT409, documentacao e BI nao sao redefinidos.

## Interpretar a conferencia

A consulta de conferencia EXECUTA uma sincronizacao normal; nao e somente leitura.
`duracao_ms` mede so essa execucao, nao RAM. O resultado continua incluindo `updated`,
`unchanged`, `conflicts`, `invalid`, `scope_changes` e `missing_sources`.

Se as fontes/cadastros nao mudarem entre duas execucoes, a segunda deve normalmente
ter `updated=0`. Chaves repetidas com conteudos diferentes podem continuar gerando
alteracoes como antes; esses casos precisam de revisao, nao de um atalho silencioso.
`busy=true` significa que outra sincronizacao ja esta em andamento.

Nao ha novos contadores de importacao em producao. A prova de menos chamadas foi feita
por instrumentacao em testes locais: 30 chamadas para 30 origens identicas antes,
zero depois. Isso nao e uma porcentagem medida de reducao de CPU ou RAM no Supabase.

## Limites e proximas etapas

Esta ainda nao e uma sincronizacao incremental por timestamp: as fontes continuam
sendo lidas e os payloads comparados, permitindo detectar alteracoes retroativas.
O extrator generico de campos continua existindo para manter compatibilidade de cabecalhos.
Variacoes auxiliares, como `data_referencia_perfil`, ainda geram alteracao de origem;
a separacao entre auditoria bruta e versao operacional e uma etapa posterior.
BI, catalogo de cursos e carregamento compacto dos cards tambem ficam para depois.

Os testes locais validam regras e idempotencia, mas nao simulam duas conexoes de banco
executando ao mesmo tempo. O comportamento sob concorrencia real e o ganho de recursos
devem ser acompanhados no ambiente publicado.

## Voltar somente esta etapa

Se houver regressao, execute `sql/crm_kanban_reverter_otimizacao_sincronizacao.sql`.
Ele restaura apenas essas duas funcoes anteriores. Nao apaga dados nem desfaz os
hotfixes de atendimento retroativo e de conflitos PT409. Depois da reversao, o custo
anterior da sincronizacao tambem retorna.

## Testes

- `tools/test-crm-sync-optimization.mjs`: instalacao, metadados/ACLs, reaplicacao,
  reversao, conferencia, nenhuma importacao sem mudancas, atualizacoes pontuais,
  matriculas, datas inferidas, duplicatas, CPF divergente, dados manuais e permissoes.
- `tools/test-crm-intake-scope-sql.mjs`: regras de recorte e preservacao do historico.
- `tools/audit-crm-workload.mjs`: prova local da eliminacao das importacoes identicas;
  continua explicitando as ineficiencias que esta etapa nao corrige.
