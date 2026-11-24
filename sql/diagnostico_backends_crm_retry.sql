-- SQL Editor / Database. Fotografia somente de leitura para conferir PIDs atuais.
-- Nao cancela processos. Nao usar PIDs antigos sem conferir backend_start.
begin read only;
set local statement_timeout='5s';
select jsonb_build_object(
  'coletado_em',statement_timestamp(),
  'transacoes_do_banco',(
    select jsonb_build_object('commits',xact_commit,'rollbacks',xact_rollback,'estatisticas_resetadas_em',stats_reset)
    from pg_stat_database where datname=current_database()
  ),
  'backends_em_atividade',(
    select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from (
      select pid,backend_start,query_start,xact_start,state,application_name,
        wait_event_type,wait_event,pg_blocking_pids(pid) as bloqueado_por,
        to_jsonb(a)->>'query_id' as query_id,
        case
          when query ilike '%crm_kanban_document_cancel%' then 'crm_kanban_document_cancel'
          when query ilike '%crm_kanban_document_save%' then 'crm_kanban_document_save'
          when query ilike '%crm_kanban_save%' then 'crm_kanban_save'
          when query ilike '%crm_kanban_activity_v2%' then 'crm_kanban_activity_v2'
          when query ilike '%crm_kanban_resume_cadence%' then 'crm_kanban_resume_cadence'
          when query ilike '%crm_kanban_reason_save%' then 'crm_kanban_reason_save'
          when query ilike '%crm_kanban_close_loss%' then 'crm_kanban_close_loss'
          when query ilike '%crm_kanban_reopen_loss%' then 'crm_kanban_reopen_loss'
          when query ilike '%set_config%' then 'Preparacao do contexto PostgREST'
          else 'Outra consulta'
        end as rotina
      from pg_stat_activity a
      where datname=current_database() and usename='authenticator'
        and state in ('active','idle in transaction','idle in transaction (aborted)')
        and pid<>pg_backend_pid()
      order by backend_start limit 20
    ) s
  )
) as backends;
commit;
