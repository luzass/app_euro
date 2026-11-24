-- Explorer / fonte Logs (ClickHouse). Selecionar "Last 15 minutes" na interface.
-- Contagem apenas: nao retorna mensagens, SQL, parametros, tokens ou IPs.
select
  log_attributes['parsed.sql_state_code'] as codigo,
  log_attributes['parsed.process_id'] as process_id,
  log_attributes['parsed.user_name'] as usuario,
  count() as ocorrencias,
  min(timestamp) as primeira_ocorrencia,
  max(timestamp) as ultima_ocorrencia
from logs
where source='postgres_logs'
  and timestamp >= now('UTC') - interval 15 minute
  and timestamp < now('UTC')
  and log_attributes['parsed.sql_state_code'] in ('40001','PT409')
group by codigo, process_id, usuario
order by ocorrencias desc
limit 20;
