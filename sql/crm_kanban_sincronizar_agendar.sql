-- SQL - Sincronizar e agendar o CRM Kanban a cada 10 minutos
-- Execute depois de crm_kanban_estrutura.sql. Nao modifica as tabelas de origem.
-- No Supabase, habilite pg_cron em Database / Extensions antes deste script.
do $$ begin
  if not exists(select 1 from pg_extension where extname='pg_cron') then
    raise exception 'Habilite a extensao pg_cron no Supabase antes de agendar o CRM. Pode testar pelo botao Sincronizar do aplicativo enquanto isso.';
  end if;
end $$;
select public.crm_kanban_sync() as primeira_sincronizacao;
select cron.schedule('crm-unieuro-kanban-sync','*/10 * * * *','select public.crm_kanban_sync();') as job_id;
