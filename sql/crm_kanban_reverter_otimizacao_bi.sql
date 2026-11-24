-- Restaura apenas a RPC de BI anterior a etapa 4, sem alterar dados.
begin;
set local lock_timeout='2s';
set local statement_timeout='15s';

create or replace function public.crm_kanban_bi_snapshot(p_from date,p_to date,p_include_tests boolean default false) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; cutoff timestamptz;
begin
  if not public.crm_kanban_manager() then raise exception 'Visao gerencial restrita a supervisao e reitoria' using errcode='42501'; end if;
  if p_from is null or p_to is null or p_from>p_to or p_to>(now() at time zone 'America/Sao_Paulo')::date then raise exception 'Selecione um intervalo valido, sem datas futuras'; end if;
  cutoff:=(p_to+1)::timestamp at time zone 'America/Sao_Paulo';
  with scoped as materialized (
    select c.* from public.crm_kanban_contacts c where coalesce(p_include_tests,false) or not c.test_only
  ), ev as materialized (
    select e.id,e.contact_id,e.created_at,e.actor_id,e.event_type,
      case when e.event_type='manual_registration' then 'manual' else e.payload->>'source' end source,
      coalesce(e.payload->>'is_test','false')='true' is_test,
      case when e.event_type='source_update' and e.payload->>'source'='matriculados_20271'
        then public.crm_kanban_key(public.crm_kanban_pick(e.payload->'after','contrato')) in ('ativo','contratoativo') end enrollment_active,
      case when e.event_type='source_update' and e.payload->>'source'='matriculados_20271' then md5(e.payload->>'source_key') end source_key,
      case when e.event_type='created' then e.payload->>'stage' end initial_stage,
      case e.event_type
        when 'stage' then jsonb_build_object('from',e.payload->>'from','to',e.payload->>'to','automatic',e.actor_id is null)
        when 'assignment' then jsonb_build_object('from',e.payload->>'from','to',e.payload->>'to')
        when 'loss_closed' then e.payload-'note'
        when 'loss_reopened' then jsonb_build_object('loss_id',e.payload#>>'{previous,id}','automatic',coalesce(e.payload->'automatic','false'))
        when 'cadence_completed' then jsonb_build_object('code',e.payload->>'code','stage',e.payload->>'stage')
        else '{}'::jsonb end detail
    from public.crm_kanban_events e join scoped c on c.id=e.contact_id
    where e.created_at<=now() and e.event_type in ('created','manual_registration','source_update','stage','assignment','loss_closed','loss_reopened','cadence_completed')
  ), entries as (
    select distinct on(contact_id) contact_id,id,created_at,source,initial_stage from ev
    where event_type='manual_registration' or event_type in ('created','source_update') and not is_test
      and source in ('manual','leads_cursos','inscritos_20271')
    order by contact_id,created_at,id
  ), inscriptions as (
    select distinct on(contact_id) contact_id,id,created_at from ev
    where event_type in ('created','source_update') and source='inscritos_20271'
    order by contact_id,created_at,id
  ), enrollments as (
    select distinct on(contact_id) contact_id,id,created_at from ev where enrollment_active
    order by contact_id,created_at,id
  ), latest_sources as (
    select distinct on(contact_id,source_key) contact_id,source_key,enrollment_active from ev
    where enrollment_active is not null and created_at<cutoff order by contact_id,source_key,created_at desc,id desc
  ), confirmed as (
    select contact_id,bool_or(enrollment_active) active from latest_sources group by contact_id
  )
  select jsonb_build_object(
    'version',1,'generated_at',now(),'from',p_from,'to',p_to,'from_at',p_from::timestamp at time zone 'America/Sao_Paulo','cutoff_at',cutoff,'include_tests',coalesce(p_include_tests,false),
    'tracking_started_at',(select min(created_at) from public.crm_kanban_events),
    'sync',(select jsonb_build_object('at',last_sync_at,'result',last_sync_result-'conflict_details') from public.crm_kanban_config where id),
    'contacts',(select coalesce(jsonb_agg(jsonb_build_object(
      'id',c.id,'owner_id',c.owner_id,'stage',c.stage,'archived',c.archived,'test_only',c.test_only,
      'has_inscription',c.has_inscription,'official_enrollment',c.official_enrollment,
      'intake_visible',coalesce((to_jsonb(c)->>'intake_visible')::boolean,true),
      'current_data',jsonb_build_object('nome',c.current_data->>'nome','curso',c.current_data->>'curso','campus',c.current_data->>'campus','turno',c.current_data->>'turno','forma_ingresso',c.current_data->>'forma_ingresso'),
      'loss_data',c.loss_data-'note','created_at',c.created_at,'stage_entered_at',c.stage_entered_at,
      'next_action_at',c.next_action_at,'last_outreach_at',c.last_outreach_at,'last_response_at',c.last_response_at,'last_interaction_at',c.last_interaction_at,'checklist',c.checklist,
      'entry_at',coalesce(en.created_at,c.created_at),'entry_day',to_char(coalesce(en.created_at,c.created_at) at time zone 'America/Sao_Paulo','YYYY-MM-DD'),'entry_event_id',en.id,
      'entry_basis',case when en.id is not null then 'event' when c.test_only then 'test' else 'fallback' end,
      'origin',coalesce(en.source,'unknown'),'entry_stage',case when en.source='inscritos_20271' then 'inscrito' else coalesce(en.initial_stage,'primeiro_contato') end,
      'first_inscription_at',i.created_at,'first_inscription_day',to_char(i.created_at at time zone 'America/Sao_Paulo','YYYY-MM-DD'),'first_inscription_event_id',i.id,
      'first_enrollment_at',m.created_at,'first_enrollment_day',to_char(m.created_at at time zone 'America/Sao_Paulo','YYYY-MM-DD'),'first_enrollment_event_id',m.id,'enrolled_as_of',coalesce(cf.active,false),
      'history_complete',(not c.has_inscription or i.id is not null) and (not c.official_enrollment or m.id is not null)
    ) order by c.id),'[]') from scoped c left join entries en on en.contact_id=c.id left join inscriptions i on i.contact_id=c.id left join enrollments m on m.contact_id=c.id left join confirmed cf on cf.contact_id=c.id),
    'events',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'contact_id',contact_id,'at',created_at,'day',to_char(created_at at time zone 'America/Sao_Paulo','YYYY-MM-DD'),'actor_id',actor_id,'type',event_type,'data',detail) order by created_at,id),'[]') from ev where event_type in ('stage','assignment','loss_closed','loss_reopened','cadence_completed')),
    'activities',(select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'contact_id',a.contact_id,'author_id',a.author_id,'at',a.occurred_at,'day',to_char(a.occurred_at at time zone 'America/Sao_Paulo','YYYY-MM-DD'),'direction',a.direction) order by a.occurred_at,a.id),'[]') from public.crm_kanban_activities a join scoped c on c.id=a.contact_id where a.occurred_at<=now()),
    'members',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'nome',p.nome,'role',p.role) order by p.nome),'[]') from public.profiles p where p.role in ('admin','reitoria','captacao_gerente','captacao','funcionario') or p.id in (select actor_id from ev) or p.id in (select owner_id from scoped) or p.id::text in (select detail->>'from' from ev where event_type='assignment') or p.id::text in (select detail->>'to' from ev where event_type='assignment')),
    'reasons',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'active',active)),'[]') from public.crm_kanban_loss_reasons)
  ) into result;
  return result;
end $$;

notify pgrst,'reload schema';
commit;
