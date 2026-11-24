-- Executa UMA sincronizacao normal e mostra resultado/duracao. Nao e somente leitura.
-- Depois da migracao, rodar duas vezes sem mudar as fontes entre as execucoes.
-- A segunda deve ter updated=0 se nenhum dado/cadastro mudou nesse intervalo.
with started as materialized (
  select clock_timestamp() as inicio
), synced as materialized (
  select s.inicio,public.crm_kanban_sync() as resultado from started s
)
select clock_timestamp() as coletado_em,
  round(extract(epoch from (clock_timestamp()-inicio))*1000,2) as duracao_ms,
  resultado
from synced;
