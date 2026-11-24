-- Reverter somente a otimizacao da sincronizacao de 24/11/2026.
-- Nao reverte atendimentos retroativos, PT409, cadastros ou historico.
-- Use apenas se precisar voltar ao comportamento anterior desta etapa.
begin;
set local lock_timeout='2s';
set local statement_timeout='15s';

create or replace function public.crm_kanban_refresh_intake_scope() returns integer
language plpgsql security definer set search_path='' as $$
declare cfg public.crm_kanban_config; changed integer;
begin
  select * into cfg from public.crm_kanban_config where id;
  -- Le a elegibilidade depois de concluir cadastros manuais concorrentes.
  perform 1 from public.crm_kanban_contacts order by id for update;
  with eligible as (
    select c.id,
      exists(select 1 from public.crm_kanban_sources s where s.contact_id=c.id and (
        s.source='inscritos_20271' and public.crm_kanban_key(s.canonical_data->>'curso')<>'medicina'
        or s.source='leads_cursos' and s.source_date>=cfg.cutoff and not s.is_test
        or cfg.include_history and s.is_test
      )) or exists(select 1 from public.crm_kanban_events e where e.contact_id=c.id and (
        e.event_type='manual_registration' or e.event_type='created' and e.payload->>'source'='manual'
      )) visible
    from public.crm_kanban_contacts c
  ), updated as (
    update public.crm_kanban_contacts c set intake_visible=e.visible,updated_at=now(),version=c.version+1
    from eligible e where c.id=e.id and c.intake_visible is distinct from e.visible returning c.id,c.intake_visible
  )
  insert into public.crm_kanban_events(contact_id,event_type,payload)
    select id,'scope_visibility',jsonb_build_object('visible',intake_visible,'lead_cutoff',cfg.cutoff) from updated;
  get diagnostics changed=row_count;
  return changed;
end $$;

create or replace function public.crm_kanban_sync() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare cfg public.crm_kanban_config; r record; n integer:=0; unchanged integer:=0; failures integer:=0; skipped integer:=0; scope_changes integer:=0; missing text[]:='{}'; result jsonb; conflict_details jsonb:='[]';
begin
  if not public.crm_kanban_manager() and not (auth.uid() is null and
    (coalesce(auth.role(),'')='service_role' or coalesce(auth.role(),'')='' and session_user in ('postgres','supabase_admin'))) then
    raise exception 'Somente gestores ou rotina do banco podem sincronizar' using errcode='42501';
  end if;
  if not pg_try_advisory_xact_lock(hashtextextended('crm_kanban_sync',731)) then return jsonb_build_object('busy',true); end if;
  select * into cfg from public.crm_kanban_config where id for update;
  drop table if exists pg_temp.crm_kanban_queue;
  create temporary table crm_kanban_queue(source text,source_key text,raw jsonb,cpf text,source_date date) on commit drop;
  if to_regclass('public.inscritos_20271') is not null then
    execute $q$insert into pg_temp.crm_kanban_queue
      select 'inscritos_20271',public.crm_kanban_pick(d,'chave_inscricao','id'),d,
        public.crm_kanban_cpf(public.crm_kanban_pick(d,'cpf')),public.crm_kanban_date(public.crm_kanban_pick(d,'data_inscricao'))
      from (select to_jsonb(i) d from public.inscritos_20271 i) x
      where public.crm_kanban_key(public.crm_kanban_pick(d,'curso')) <> 'medicina'$q$;
  else missing:=array_append(missing,'inscritos_20271'); end if;
  if to_regclass('public.leads_cursos') is not null then
    execute $q$insert into pg_temp.crm_kanban_queue
      select 'leads_cursos',public.crm_kanban_pick(d,'id'),d,
        public.crm_kanban_cpf(public.crm_kanban_pick(d,'cpf')),public.crm_kanban_date(public.crm_kanban_pick(d,'created_at','data_criacao','data'))
      from (select to_jsonb(l) d from public.leads_cursos l) x$q$;
  else missing:=array_append(missing,'leads_cursos'); end if;
  -- A data auxiliar nao altera o payload nem a data academica de uma inscricao sem data valida.
  update pg_temp.crm_kanban_queue set source_date=cfg.cutoff where source='inscritos_20271' and source_date is null;
  select count(*) into skipped from pg_temp.crm_kanban_queue where cpf is null or source_date is null or source_key is null;
  delete from pg_temp.crm_kanban_queue where cpf is null or source_date is null or source_key is null;
  if cfg.include_history then
    insert into public.crm_kanban_test_sample(cpf)
    select q.cpf from pg_temp.crm_kanban_queue q
    where q.source='leads_cursos' and q.source_date < cfg.cutoff and not exists(select 1 from public.crm_kanban_test_sample s where s.cpf=q.cpf)
      and not exists(select 1 from pg_temp.crm_kanban_queue real_q where real_q.cpf=q.cpf and (real_q.source='inscritos_20271' or real_q.source_date>=cfg.cutoff))
    group by q.cpf order by max(q.source_date) desc,q.cpf
    limit greatest(0,cfg.history_limit-(select count(*) from public.crm_kanban_test_sample))
    on conflict do nothing;
  end if;
  for r in select q.* from pg_temp.crm_kanban_queue q where q.source='inscritos_20271' or q.source_date>=cfg.cutoff or cfg.include_history and
    (exists(select 1 from public.crm_kanban_test_sample s where s.cpf=q.cpf)
      or exists(select 1 from pg_temp.crm_kanban_queue real_q where real_q.cpf=q.cpf and (real_q.source='inscritos_20271' or real_q.source_date>=cfg.cutoff)))
    order by q.source_date,case q.source when 'leads_cursos' then 1 else 2 end,q.source_key,md5(q.raw::text)
  loop
    begin
      if public.crm_kanban_import(r.source,r.source_key,r.raw,r.source_date,r.source='leads_cursos' and r.source_date<cfg.cutoff) then n:=n+1; else unchanged:=unchanged+1; end if;
    exception when others then
      failures:=failures+1;
      if jsonb_array_length(conflict_details)<20 then conflict_details:=conflict_details || jsonb_build_array(jsonb_build_object('source',r.source,'source_key',r.source_key,'reason',sqlerrm)); end if;
    end;
  end loop;
  -- Matriculas enriquecem apenas pessoas ja existentes: nunca criam novos cards.
  if to_regclass('public.matriculados_20271') is not null then
    for r in execute $q$select d,public.crm_kanban_pick(d,'chave_unica','id') source_key
      from (select to_jsonb(m) d from public.matriculados_20271 m) x
      where public.crm_kanban_key(public.crm_kanban_pick(d,'curso')) <> 'medicina'
        and public.crm_kanban_pick(d,'chave_unica','id') is not null
        and regexp_replace(coalesce(public.crm_kanban_pick(d,'periodo_letivo'),''),'[./[:space:]-]','','g')='20271'
        and exists(select 1 from public.crm_kanban_contacts c where c.cpf=public.crm_kanban_cpf(public.crm_kanban_pick(d,'cpf')))$q$
    loop
      begin
        if public.crm_kanban_import('matriculados_20271',r.source_key,r.d,
          coalesce(public.crm_kanban_date(public.crm_kanban_pick(r.d,'data_baixa_do_pagamento','data_de_matricula')),cfg.cutoff),
          (select test_only from public.crm_kanban_contacts where cpf=public.crm_kanban_cpf(public.crm_kanban_pick(r.d,'cpf')))) then n:=n+1; else unchanged:=unchanged+1; end if;
      exception when others then
        failures:=failures+1;
        if jsonb_array_length(conflict_details)<20 then conflict_details:=conflict_details || jsonb_build_array(jsonb_build_object('source','matriculados_20271','source_key',r.source_key,'reason',sqlerrm)); end if;
      end;
    end loop;
  else missing:=array_append(missing,'matriculados_20271'); end if;
  scope_changes:=public.crm_kanban_refresh_intake_scope();
  result:=jsonb_build_object('updated',n,'unchanged',unchanged,'conflicts',failures,'invalid',skipped,'scope_changes',scope_changes,'missing_sources',missing,'conflict_details',conflict_details);
  update public.crm_kanban_config set last_sync_at=now(),last_sync_result=result where id;
  return result;
end $$;

notify pgrst,'reload schema';
commit;
