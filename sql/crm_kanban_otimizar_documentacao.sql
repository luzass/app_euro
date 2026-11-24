-- Etapa 3: catalogo le apenas colunas de curso, sem serializar linhas inteiras.
-- Preserva contrato da RPC, estatisticas, permissoes e todos os documentos.
begin;
set local lock_timeout='2s';
set local statement_timeout='15s';
do $$ begin
  if to_regprocedure('public.crm_kanban_documents(uuid)') is null then
    raise exception 'Instale primeiro a documentacao do CRM';
  end if;
end $$;

create or replace function public.crm_kanban_documents(p_contact uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare person public.crm_kanban_contacts; courses jsonb; extra jsonb; source_table text; course_columns text; viewer uuid:=auth.uid(); manager boolean;
begin
  select * into person from public.crm_kanban_contacts where id=p_contact;
  if not found or viewer is null or not public.crm_kanban_can_read(person.owner_id) then raise exception 'Ficha indisponivel' using errcode='42501'; end if;
  manager:=public.crm_kanban_manager();
  select coalesce(jsonb_agg(distinct current_data->>'curso'),'[]') into courses from public.crm_kanban_contacts;
  foreach source_table in array array['leads_cursos','inscritos_20271','matriculados_20271'] loop
    if to_regclass('public.'||source_table) is not null then
      -- Preserva os aliases de curso e sua precedencia, sem carregar CPF/contatos.
      select string_agg(format('to_jsonb(t.%I) as %I',a.attname,a.attname),',' order by a.attnum)
      into course_columns from pg_attribute a
      where a.attrelid=to_regclass('public.'||source_table) and a.attnum>0 and not a.attisdropped
        and public.crm_kanban_key(a.attname)='curso';
      if course_columns is not null then
        execute format('select coalesce(jsonb_agg(distinct public.crm_kanban_pick(to_jsonb(course_row),''curso'')),''[]'') from (select distinct %s from public.%I t) course_row',course_columns,source_table) into extra;
        courses:=courses||extra;
      end if;
    end if;
  end loop;
  select coalesce(jsonb_agg(label order by label),'[]') into courses from (
    select min(btrim(value)) label from jsonb_array_elements_text(courses) where nullif(btrim(value),'') is not null group by public.crm_kanban_key(value)
  ) course_list;
  return jsonb_build_object('generated_at',now(),'courses',courses,
    'documents',(select coalesce(jsonb_agg(to_jsonb(d) order by sent_at desc,id),'[]') from public.crm_kanban_documents d where d.contact_id=p_contact),
    'stats',(select coalesce(jsonb_agg(to_jsonb(s) order by course),'[]') from (
      select min(d.course) course,
        count(*) filter(where d.received_at is not null) completed,
        count(*) filter(where d.received_at is null and c.intake_visible) pending,
        avg(extract(epoch from(d.received_at-d.sent_at))/3600) filter(where d.received_at is not null) mean_hours,
        percentile_cont(.5) within group(order by extract(epoch from(d.received_at-d.sent_at))/3600) filter(where d.received_at is not null) median_hours,
        max(greatest(0,extract(epoch from(now()-d.sent_at))/3600)) filter(where d.received_at is null and c.intake_visible) oldest_hours
      from public.crm_kanban_documents d join public.crm_kanban_contacts c on c.id=d.contact_id
      where d.cancelled_at is null and not c.test_only and (manager or c.owner_id=viewer or c.owner_id is null)
      group by public.crm_kanban_key(d.course)
    ) s)
  );
end $$;

notify pgrst,'reload schema';
commit;
