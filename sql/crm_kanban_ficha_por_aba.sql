-- Instalar antes de publicar a ficha com carregamento por aba.
-- Preserva a RPC anterior para clientes que ainda estiverem abertos.
begin;
set local lock_timeout='2s';
set local statement_timeout='15s';
do $$ begin
  if to_regprocedure('public.crm_kanban_detail(uuid,bigint)') is null then
    raise exception 'Instale primeiro a estrutura e o funil do CRM';
  end if;
end $$;

create or replace function public.crm_kanban_detail_section(p_id uuid,p_section text,p_cursor jsonb default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c public.crm_kanban_contacts; rows jsonb:='[]'; cursor_next jsonb; phases jsonb:='[]';
begin
  select * into c from public.crm_kanban_contacts where id=p_id;
  if not found or not public.crm_kanban_can_read(c.owner_id) then
    raise exception 'Contato indisponivel' using errcode='42501';
  end if;
  if p_section is null or p_section not in ('contact','activities','events','sources') then
    raise exception 'Aba de ficha invalida' using errcode='22023';
  end if;
  if p_cursor is not null and (jsonb_typeof(p_cursor)<>'object'
    or p_section='contact'
    or p_section='events' and not (p_cursor ? 'id')
    or p_section='activities' and not (p_cursor ?& array['at','id'])
    or p_section='sources' and not (p_cursor ?& array['date','source','key'])
    or exists(select 1 from jsonb_each(p_cursor) x where x.value='null'::jsonb)) then
    raise exception 'Cursor de ficha invalido' using errcode='22023';
  end if;
  if p_section='activities' then
    with candidates as materialized (
      select a.* from public.crm_kanban_activities a where a.contact_id=p_id
        and (p_cursor is null or (a.occurred_at,a.id)<((p_cursor->>'at')::timestamptz,(p_cursor->>'id')::uuid))
      order by a.occurred_at desc,a.id desc limit 51
    ), page as materialized (select * from candidates order by occurred_at desc,id desc limit 50)
    select coalesce((select jsonb_agg(to_jsonb(p) order by occurred_at desc,id desc) from page p),'[]'),
      case when (select count(*) from candidates)>50 then
        (select jsonb_build_object('at',occurred_at,'id',id) from page order by occurred_at,id limit 1) end
    into rows,cursor_next;
  elsif p_section='events' then
    with candidates as materialized (
      select e.* from public.crm_kanban_events e where e.contact_id=p_id
        and (p_cursor is null or e.id<(p_cursor->>'id')::bigint) order by e.id desc limit 51
    ), page as materialized (select * from candidates order by id desc limit 50)
    select coalesce((select jsonb_agg(to_jsonb(p) order by id desc) from page p),'[]'),
      case when (select count(*) from candidates)>50 then
        (select jsonb_build_object('id',id) from page order by id limit 1) end
    into rows,cursor_next;
    select coalesce(jsonb_agg(distinct phase),'[]') into phases from (
      select payload->>'from' phase from public.crm_kanban_events where contact_id=p_id and event_type='stage' and actor_id is not null
      union select payload->>'to' from public.crm_kanban_events where contact_id=p_id and event_type='stage'
      union select case when payload->>'source'='inscritos_20271' then 'inscrito' else payload->>'stage' end from public.crm_kanban_events where contact_id=p_id and event_type='created'
      union select c.stage
    ) visited where phase is not null;
  elsif p_section='sources' then
    with candidates as materialized (
      select source,source_key,source_date,source_date_inferred,is_test,payload,observed_at
      from public.crm_kanban_sources where contact_id=p_id and (p_cursor is null
        or source_date<(p_cursor->>'date')::date
        or source_date=(p_cursor->>'date')::date and (source,source_key)>(p_cursor->>'source',p_cursor->>'key'))
      order by source_date desc,source,source_key limit 11
    ), page as materialized (select * from candidates order by source_date desc,source,source_key limit 10)
    select coalesce((select jsonb_agg(to_jsonb(p) order by source_date desc,source,source_key) from page p),'[]'),
      case when (select count(*) from candidates)>10 then
        (select jsonb_build_object('date',source_date,'source',source,'key',source_key) from page order by source_date,source desc,source_key desc limit 1) end
    into rows,cursor_next;
  end if;
  return jsonb_build_object('contact',to_jsonb(c)-'source_data'-'manual_data',
    'section',p_section,'items',rows,'next_cursor',cursor_next,'visited_stages',phases);
end $$;
revoke all on function public.crm_kanban_detail_section(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.crm_kanban_detail_section(uuid,text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
