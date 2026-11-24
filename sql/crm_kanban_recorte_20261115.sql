-- CRM: todos os inscritos (sem Medicina), leads desde 15/11/2026 no fuso de Brasilia.
-- Oculta contatos fora do recorte sem apagar fontes, responsaveis ou historico.
begin;
do $$ begin
  if to_regprocedure('public.crm_kanban_close_loss(uuid,integer,uuid,text,text)') is null then
    raise exception 'Instale antes a estrutura atual do CRM, funil/cadencias e motivos de desistencia';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('crm_kanban_sync',731));
end $$;
alter table public.crm_kanban_contacts add column if not exists intake_visible boolean not null default true;
alter table public.crm_kanban_sources add column if not exists source_date_inferred boolean not null default false;
alter table public.crm_kanban_config alter column cutoff set default '2026-11-15';
alter table public.crm_kanban_config alter column include_history set default false;

create or replace function public.crm_kanban_refresh_intake_scope() returns integer
language plpgsql security definer set search_path='' as $$
declare cfg public.crm_kanban_config; changed integer:=0; candidate uuid; person public.crm_kanban_contacts; visible boolean;
begin
  select * into cfg from public.crm_kanban_config where id;
  for candidate in
    select c.id from public.crm_kanban_contacts c
    where c.intake_visible is distinct from (
      exists(select 1 from public.crm_kanban_sources s where s.contact_id=c.id and (
        s.source='inscritos_20271' and public.crm_kanban_key(s.canonical_data->>'curso')<>'medicina'
        or s.source='leads_cursos' and s.source_date>=cfg.cutoff and not s.is_test
        or cfg.include_history and s.is_test
      )) or exists(select 1 from public.crm_kanban_events e where e.contact_id=c.id and (
        e.event_type='manual_registration' or e.event_type='created' and e.payload->>'source'='manual'
      ))
    ) order by c.id
  loop
    select * into person from public.crm_kanban_contacts where id=candidate for update;
    if not found then continue; end if;
    -- Nova leitura depois do lock enxerga um cadastro manual que acabou de concluir.
    select exists(select 1 from public.crm_kanban_sources s where s.contact_id=candidate and (
      s.source='inscritos_20271' and public.crm_kanban_key(s.canonical_data->>'curso')<>'medicina'
      or s.source='leads_cursos' and s.source_date>=cfg.cutoff and not s.is_test
      or cfg.include_history and s.is_test
    )) or exists(select 1 from public.crm_kanban_events e where e.contact_id=candidate and (
      e.event_type='manual_registration' or e.event_type='created' and e.payload->>'source'='manual'
    )) into visible;
    if person.intake_visible is distinct from visible then
      update public.crm_kanban_contacts set intake_visible=visible,updated_at=now(),version=version+1 where id=candidate;
      insert into public.crm_kanban_events(contact_id,event_type,payload)
        values(candidate,'scope_visibility',jsonb_build_object('visible',visible,'lead_cutoff',cfg.cutoff));
      changed:=changed+1;
    end if;
  end loop;
  return changed;
end $$;

create or replace function public.crm_kanban_manual_intake_scope() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.event_type='manual_registration' or new.event_type='created' and new.payload->>'source'='manual' then
    update public.crm_kanban_contacts set intake_visible=true,version=version+1,updated_at=now()
      where id=new.contact_id and not intake_visible;
    if found then insert into public.crm_kanban_events(contact_id,event_type,payload)
      values(new.contact_id,'scope_visibility',jsonb_build_object('visible',true,'reason','manual_registration')); end if;
  end if;
  return new;
end $$;
drop trigger if exists crm_kanban_manual_intake_scope on public.crm_kanban_events;
create trigger crm_kanban_manual_intake_scope after insert on public.crm_kanban_events
for each row when (new.event_type in ('created','manual_registration')) execute function public.crm_kanban_manual_intake_scope();

create or replace function public.crm_kanban_import(p_source text,p_key text,p_raw jsonb,p_date date,p_test boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
declare person public.crm_kanban_contacts; old_source public.crm_kanban_sources; v_cpf text; v_hash text; hint text; v_owner uuid; enrolled boolean;
begin
  v_cpf := public.crm_kanban_cpf(public.crm_kanban_pick(p_raw,'cpf'));
  if v_cpf is null then raise exception 'CPF invalido'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_cpf,731));
  select * into old_source from public.crm_kanban_sources where source=p_source and source_key=p_key for update;
  if found and (select cpf from public.crm_kanban_contacts where id=old_source.contact_id) <> v_cpf then
    raise exception 'A chave de origem mudou de CPF; precisa de revisao, sem mesclagem automatica';
  end if;
  v_hash := md5(p_raw::text);
  if old_source.payload_hash = v_hash and old_source.source_date is not distinct from p_date and old_source.is_test is not distinct from p_test
    and old_source.source_date_inferred is not distinct from (p_source='inscritos_20271' and public.crm_kanban_date(public.crm_kanban_pick(p_raw,'data_inscricao')) is null) then return false; end if;
  select * into person from public.crm_kanban_contacts where cpf=v_cpf for update;
  if not found then
    -- Aproveita o responsavel da landing page somente com correspondencia unica no perfil.
    hint := public.crm_kanban_key(public.crm_kanban_pick(p_raw,'vendedor_crm','vendedor'));
    if hint <> '' then
      select case when count(*)=1 then (array_agg(id))[1] end into v_owner from public.profiles
      where role in ('captacao','funcionario','captacao_gerente')
        and (public.crm_kanban_key(nome)=hint or public.crm_kanban_key(split_part(nome,' ',1))=hint);
    end if;
    insert into public.crm_kanban_contacts(cpf,owner_id,test_only,stage) values(v_cpf,v_owner,p_test,case when p_source='inscritos_20271' then 'inscrito' else 'primeiro_contato' end) returning * into person;
    insert into public.crm_kanban_events(contact_id,event_type,payload)
      values(person.id,'created',jsonb_build_object('source',p_source,'stage',person.stage,'is_test',p_test));
  end if;
  insert into public.crm_kanban_sources(source,source_key,contact_id,source_date,is_test,payload,payload_hash,canonical_data,source_date_inferred)
    values(p_source,p_key,person.id,p_date,p_test,p_raw,v_hash,public.crm_kanban_canonical(p_source,p_raw),p_source='inscritos_20271' and public.crm_kanban_date(public.crm_kanban_pick(p_raw,'data_inscricao')) is null)
  on conflict(source,source_key) do update set payload=excluded.payload,payload_hash=excluded.payload_hash,
    source_date=excluded.source_date,is_test=excluded.is_test,canonical_data=excluded.canonical_data,source_date_inferred=excluded.source_date_inferred,observed_at=now();
  insert into public.crm_kanban_events(contact_id,event_type,payload) values(person.id,'source_update',
    jsonb_build_object('source',p_source,'source_key',p_key,'before',old_source.payload,'after',p_raw,'is_test',p_test));
  update public.crm_kanban_contacts set test_only=test_only and p_test where id=person.id;
  perform public.crm_kanban_refresh(person.id);
  if p_source='matriculados_20271' then
    select exists(select 1 from public.crm_kanban_sources s where s.contact_id=person.id and s.source='matriculados_20271'
      and public.crm_kanban_key(public.crm_kanban_pick(s.payload,'contrato')) in ('ativo','contratoativo')) into enrolled;
    if enrolled and not person.official_enrollment and person.stage <> 'matriculado' then
      insert into public.crm_kanban_events(contact_id,event_type,payload) values(person.id,'stage',
        jsonb_build_object('from',person.stage,'to','matriculado','reason','Matrícula ativa localizada na base oficial'));
      update public.crm_kanban_contacts set stage='matriculado',stage_entered_at=now(),position=-nextval('public.crm_kanban_position_seq')::double precision*1024 where id=person.id;
    end if;
    update public.crm_kanban_contacts set official_enrollment=enrolled where id=person.id;
  end if;
  return true;
end $$;

create or replace function public.crm_kanban_create(p_cpf text,p_data jsonb,p_owner uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_cpf text; c public.crm_kanban_contacts; v_owner uuid;
begin
  if not public.crm_kanban_can_read(null) or auth.uid() is null then raise exception 'Acesso negado' using errcode='42501'; end if;
  v_cpf:=public.crm_kanban_cpf(p_cpf);
  if v_cpf is null or length(regexp_replace(coalesce(p_cpf,''),'[^0-9]','','g'))<>11 then raise exception 'CPF obrigatorio com 11 digitos'; end if;
  perform public.crm_kanban_validate_data(p_data);
  if coalesce(btrim(p_data->>'nome'),'')='' then raise exception 'Informe o nome'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_cpf,731));
  select * into c from public.crm_kanban_contacts where cpf=v_cpf for update;
  if found then
    if not public.crm_kanban_can_read(c.owner_id) then raise exception 'Este CPF ja possui atendimento. Procure o gestor para conferir o responsavel.' using errcode='42501'; end if;
    select coalesce(jsonb_object_agg(k,v),'{}') into p_data from jsonb_each(p_data) e(k,v)
      where v<>'null'::jsonb and nullif(btrim(v#>>'{}'),'') is not null;
    perform public.crm_kanban_save(c.id,jsonb_build_object('manual_data',p_data,'owner_id',case when public.crm_kanban_manager() then coalesce(p_owner,c.owner_id) else auth.uid() end),c.version);
    update public.crm_kanban_contacts set test_only=false where id=c.id returning * into c;
    insert into public.crm_kanban_events(contact_id,event_type,actor_id,payload) values(c.id,'manual_registration',auth.uid(),jsonb_build_object('source','manual','data',p_data));
    select contact.* into c from public.crm_kanban_contacts contact where contact.id=c.id;
    return to_jsonb(c);
  end if;
  v_owner:=case when public.crm_kanban_manager() then p_owner else auth.uid() end;
  if not public.crm_kanban_manager() and p_owner is not null and p_owner<>auth.uid() then raise exception 'Vendedor nao pode atribuir outro responsavel' using errcode='42501'; end if;
  if v_owner is not null and not exists(select 1 from public.profiles where id=v_owner and role in ('captacao','funcionario','captacao_gerente')) then raise exception 'Responsavel nao habilitado'; end if;
  insert into public.crm_kanban_contacts(cpf,manual_data,owner_id) values(v_cpf,p_data,v_owner) returning * into c;
  insert into public.crm_kanban_events(contact_id,event_type,actor_id,payload) values(c.id,'created',auth.uid(),jsonb_build_object('source','manual','stage',c.stage,'data',p_data));
  return to_jsonb(c);
end $$;

create or replace function public.crm_kanban_sync() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare cfg public.crm_kanban_config; r record; n integer:=0; unchanged integer:=0; failures integer:=0; skipped integer:=0; scope_changes integer:=0; missing text[]:='{}'; result jsonb; conflict_details jsonb:='[]'; ignored integer;
begin
  if not public.crm_kanban_manager() and not (auth.uid() is null and
    (coalesce(auth.role(),'')='service_role' or coalesce(auth.role(),'')='' and session_user in ('postgres','supabase_admin'))) then
    raise exception 'Somente gestores ou rotina do banco podem sincronizar' using errcode='42501';
  end if;
  if not pg_try_advisory_xact_lock(hashtextextended('crm_kanban_sync',731)) then return jsonb_build_object('busy',true); end if;
  select * into cfg from public.crm_kanban_config where id for update;
  drop table if exists pg_temp.crm_kanban_queue;
  create temporary table crm_kanban_queue(
    source text,source_key text,raw jsonb,cpf text,source_date date,raw_hash text,
    date_inferred boolean not null default false,is_test boolean not null default false,
    queue_order bigint generated always as identity
  ) on commit drop;
  if to_regclass('public.inscritos_20271') is not null then
    execute $q$insert into pg_temp.crm_kanban_queue(source,source_key,raw,cpf,source_date,raw_hash)
      select 'inscritos_20271',public.crm_kanban_pick(d,'chave_inscricao','id'),d,
        public.crm_kanban_cpf(public.crm_kanban_pick(d,'cpf')),public.crm_kanban_date(public.crm_kanban_pick(d,'data_inscricao')),md5(d::text)
      from (select to_jsonb(i) d from public.inscritos_20271 i) x
      where public.crm_kanban_key(public.crm_kanban_pick(d,'curso')) <> 'medicina'$q$;
  else missing:=array_append(missing,'inscritos_20271'); end if;
  if to_regclass('public.leads_cursos') is not null then
    execute $q$insert into pg_temp.crm_kanban_queue(source,source_key,raw,cpf,source_date,raw_hash)
      select 'leads_cursos',public.crm_kanban_pick(d,'id'),d,
        public.crm_kanban_cpf(public.crm_kanban_pick(d,'cpf')),public.crm_kanban_date(public.crm_kanban_pick(d,'created_at','data_criacao','data')),md5(d::text)
      from (select to_jsonb(l) d from public.leads_cursos l) x$q$;
  else missing:=array_append(missing,'leads_cursos'); end if;
  update pg_temp.crm_kanban_queue set source_date=cfg.cutoff,date_inferred=true where source='inscritos_20271' and source_date is null;
  select count(*) into skipped from pg_temp.crm_kanban_queue where cpf is null or source_date is null or source_key is null;
  delete from pg_temp.crm_kanban_queue where cpf is null or source_date is null or source_key is null;
  create index on pg_temp.crm_kanban_queue(cpf);
  create index on pg_temp.crm_kanban_queue(source,source_key);
  if cfg.include_history then
    insert into public.crm_kanban_test_sample(cpf)
    select q.cpf from pg_temp.crm_kanban_queue q
    where q.source='leads_cursos' and q.source_date < cfg.cutoff and not exists(select 1 from public.crm_kanban_test_sample s where s.cpf=q.cpf)
      and not exists(select 1 from pg_temp.crm_kanban_queue real_q where real_q.cpf=q.cpf and (real_q.source='inscritos_20271' or real_q.source_date>=cfg.cutoff))
    group by q.cpf order by max(q.source_date) desc,q.cpf
    limit greatest(0,cfg.history_limit-(select count(*) from public.crm_kanban_test_sample))
    on conflict do nothing;
  end if;
  delete from pg_temp.crm_kanban_queue q where not (q.source='inscritos_20271' or q.source_date>=cfg.cutoff or cfg.include_history and
    (exists(select 1 from public.crm_kanban_test_sample s where s.cpf=q.cpf)
      or exists(select 1 from pg_temp.crm_kanban_queue real_q where real_q.cpf=q.cpf and (real_q.source='inscritos_20271' or real_q.source_date>=cfg.cutoff))));
  update pg_temp.crm_kanban_queue set is_test=source='leads_cursos' and source_date<cfg.cutoff;
  -- Origem repetida nao usa o atalho: todas as versoes seguem para a importacao.
  with repeated as materialized (
    select source,source_key from pg_temp.crm_kanban_queue group by source,source_key having count(*)>1
  )
  delete from pg_temp.crm_kanban_queue q using public.crm_kanban_sources s,public.crm_kanban_contacts c
  where s.source=q.source and s.source_key=q.source_key and c.id=s.contact_id and c.cpf=q.cpf
    and s.payload_hash=q.raw_hash and s.source_date=q.source_date and s.is_test=q.is_test
    and s.source_date_inferred=q.date_inferred
    and not exists(select 1 from repeated d where d.source=q.source and d.source_key=q.source_key);
  get diagnostics ignored=row_count;
  unchanged:=unchanged+ignored;
  for r in select * from pg_temp.crm_kanban_queue
    order by source_date,case source when 'leads_cursos' then 1 else 2 end,source_key,raw_hash
  loop
    begin
      if public.crm_kanban_import(r.source,r.source_key,r.raw,r.source_date,r.is_test) then n:=n+1; else unchanged:=unchanged+1; end if;
    exception when others then
      failures:=failures+1;
      if jsonb_array_length(conflict_details)<20 then conflict_details:=conflict_details || jsonb_build_array(jsonb_build_object('source',r.source,'source_key',r.source_key,'reason',sqlerrm)); end if;
    end;
  end loop;
  -- Matriculas apenas enriquecem pessoas ja existentes. Reutiliza a fila temporaria.
  truncate pg_temp.crm_kanban_queue;
  if to_regclass('public.matriculados_20271') is not null then
    execute $q$insert into pg_temp.crm_kanban_queue(source,source_key,raw,cpf,source_date,raw_hash,is_test)
      select 'matriculados_20271',public.crm_kanban_pick(d,'chave_unica','id'),d,c.cpf,
        coalesce(public.crm_kanban_date(public.crm_kanban_pick(d,'data_baixa_do_pagamento','data_de_matricula')),$1),md5(d::text),c.test_only
      from (select to_jsonb(m) d from public.matriculados_20271 m) x
      join public.crm_kanban_contacts c on c.cpf=public.crm_kanban_cpf(public.crm_kanban_pick(d,'cpf'))
      where public.crm_kanban_key(public.crm_kanban_pick(d,'curso')) <> 'medicina'
        and public.crm_kanban_pick(d,'chave_unica','id') is not null
        and regexp_replace(coalesce(public.crm_kanban_pick(d,'periodo_letivo'),''),'[./[:space:]-]','','g')='20271'$q$ using cfg.cutoff;
    with repeated as materialized (
      select source,source_key from pg_temp.crm_kanban_queue group by source,source_key having count(*)>1
    )
    delete from pg_temp.crm_kanban_queue q using public.crm_kanban_sources s,public.crm_kanban_contacts c
    where s.source=q.source and s.source_key=q.source_key and c.id=s.contact_id and c.cpf=q.cpf
      and s.payload_hash=q.raw_hash and s.source_date=q.source_date and s.is_test=q.is_test
      and s.source_date_inferred=q.date_inferred
      and not exists(select 1 from repeated d where d.source=q.source and d.source_key=q.source_key);
    get diagnostics ignored=row_count;
    unchanged:=unchanged+ignored;
    for r in select * from pg_temp.crm_kanban_queue order by queue_order
    loop
      begin
        if public.crm_kanban_import(r.source,r.source_key,r.raw,r.source_date,r.is_test) then n:=n+1; else unchanged:=unchanged+1; end if;
      exception when others then
        failures:=failures+1;
        if jsonb_array_length(conflict_details)<20 then conflict_details:=conflict_details || jsonb_build_array(jsonb_build_object('source',r.source,'source_key',r.source_key,'reason',sqlerrm)); end if;
      end;
    end loop;
  else missing:=array_append(missing,'matriculados_20271'); end if;
  scope_changes:=public.crm_kanban_refresh_intake_scope();
  result:=jsonb_build_object('updated',n,'unchanged',unchanged,'conflicts',failures,'invalid',skipped,'scope_changes',scope_changes,'missing_sources',missing,'conflict_details',conflict_details);
  update public.crm_kanban_config set last_sync_at=now(),last_sync_result=result where id;
  return result;
end $$;

create or replace function public.crm_kanban_bi_snapshot(p_from date,p_to date,p_include_tests boolean default false) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; cutoff timestamptz; start_at timestamptz;
begin
  if not public.crm_kanban_manager() then raise exception 'Visao gerencial restrita a supervisao e reitoria' using errcode='42501'; end if;
  if p_from is null or p_to is null or p_from>p_to or p_to>(now() at time zone 'America/Sao_Paulo')::date then raise exception 'Selecione um intervalo valido, sem datas futuras'; end if;
  start_at:=p_from::timestamp at time zone 'America/Sao_Paulo';
  cutoff:=(p_to+1)::timestamp at time zone 'America/Sao_Paulo';
  with scoped as materialized (
    select c.id,c.owner_id,c.stage,c.archived,c.test_only,c.has_inscription,c.official_enrollment,c.intake_visible,
      jsonb_build_object('nome',c.current_data->>'nome','curso',c.current_data->>'curso','campus',c.current_data->>'campus','turno',c.current_data->>'turno','forma_ingresso',c.current_data->>'forma_ingresso') current_data,
      c.loss_data-'note' loss_data,c.created_at,c.stage_entered_at,c.next_action_at,
      c.last_outreach_at,c.last_response_at,c.last_interaction_at,c.checklist
    from public.crm_kanban_contacts c where coalesce(p_include_tests,false) or not c.test_only
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
  ), first_outreach as materialized (
    -- Uma referencia anterior ao periodo impede tratar um recontato como primeiro contato.
    select a.id from scoped c left join entries en on en.contact_id=c.id
    cross join lateral (
      select a.id from public.crm_kanban_activities a
      where a.contact_id=c.id and a.direction='outbound'
        and a.occurred_at>=coalesce(en.created_at,c.created_at)
        and a.occurred_at<cutoff and a.occurred_at<=now()
      order by a.occurred_at,a.id limit 1
    ) a
  ), selected_activity_ids as materialized (
    select a.id from public.crm_kanban_activities a join scoped c on c.id=a.contact_id
    where a.occurred_at>=start_at and a.occurred_at<cutoff and a.occurred_at<=now()
    union select id from first_outreach
  )
  select jsonb_build_object(
    'version',1,'generated_at',now(),'from',p_from,'to',p_to,'from_at',p_from::timestamp at time zone 'America/Sao_Paulo','cutoff_at',cutoff,'include_tests',coalesce(p_include_tests,false),
    'tracking_started_at',(select min(created_at) from public.crm_kanban_events),
    'sync',(select jsonb_build_object('at',last_sync_at,'result',last_sync_result-'conflict_details') from public.crm_kanban_config where id),
    'contacts',(select coalesce(jsonb_agg(jsonb_build_object(
      'id',c.id,'owner_id',c.owner_id,'stage',c.stage,'archived',c.archived,'test_only',c.test_only,
      'has_inscription',c.has_inscription,'official_enrollment',c.official_enrollment,
      'intake_visible',c.intake_visible,
      'current_data',c.current_data,
      'loss_data',c.loss_data,'created_at',c.created_at,'stage_entered_at',c.stage_entered_at,
      'next_action_at',c.next_action_at,'last_outreach_at',c.last_outreach_at,'last_response_at',c.last_response_at,'last_interaction_at',c.last_interaction_at,'checklist',c.checklist,
      'entry_at',coalesce(en.created_at,c.created_at),'entry_day',to_char(coalesce(en.created_at,c.created_at) at time zone 'America/Sao_Paulo','YYYY-MM-DD'),'entry_event_id',en.id,
      'entry_basis',case when en.id is not null then 'event' when c.test_only then 'test' else 'fallback' end,
      'origin',coalesce(en.source,'unknown'),'entry_stage',case when en.source='inscritos_20271' then 'inscrito' else coalesce(en.initial_stage,'primeiro_contato') end,
      'first_inscription_at',i.created_at,'first_inscription_day',to_char(i.created_at at time zone 'America/Sao_Paulo','YYYY-MM-DD'),'first_inscription_event_id',i.id,
      'first_enrollment_at',m.created_at,'first_enrollment_day',to_char(m.created_at at time zone 'America/Sao_Paulo','YYYY-MM-DD'),'first_enrollment_event_id',m.id,'enrolled_as_of',coalesce(cf.active,false),
      'history_complete',(not c.has_inscription or i.id is not null) and (not c.official_enrollment or m.id is not null)
    ) order by c.id),'[]') from scoped c left join entries en on en.contact_id=c.id left join inscriptions i on i.contact_id=c.id left join enrollments m on m.contact_id=c.id left join confirmed cf on cf.contact_id=c.id),
    'events',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'contact_id',contact_id,'at',created_at,'day',to_char(created_at at time zone 'America/Sao_Paulo','YYYY-MM-DD'),'actor_id',actor_id,'type',event_type,'data',detail) order by created_at,id),'[]') from ev where event_type in ('assignment','loss_closed') or event_type in ('stage','loss_reopened','cadence_completed') and created_at>=start_at and created_at<cutoff),
    'activities',(select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'contact_id',a.contact_id,'author_id',a.author_id,'at',a.occurred_at,'day',to_char(a.occurred_at at time zone 'America/Sao_Paulo','YYYY-MM-DD'),'direction',a.direction) order by a.occurred_at,a.id),'[]') from public.crm_kanban_activities a join selected_activity_ids selected on selected.id=a.id),
    'members',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'nome',p.nome,'role',p.role) order by p.nome),'[]') from public.profiles p where p.role in ('admin','reitoria','captacao_gerente','captacao','funcionario') or p.id in (select actor_id from ev) or p.id in (select owner_id from scoped) or p.id::text in (select detail->>'from' from ev where event_type='assignment') or p.id::text in (select detail->>'to' from ev where event_type='assignment')),
    'reasons',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'active',active)),'[]') from public.crm_kanban_loss_reasons)
  ) into result;
  return result;
end $$;

revoke all on function public.crm_kanban_refresh_intake_scope(),public.crm_kanban_manual_intake_scope(),public.crm_kanban_import(text,text,jsonb,date,boolean),public.crm_kanban_create(text,jsonb,uuid),public.crm_kanban_sync(),public.crm_kanban_bi_snapshot(date,date,boolean) from public,anon,authenticated;
grant execute on function public.crm_kanban_create(text,jsonb,uuid),public.crm_kanban_sync(),public.crm_kanban_bi_snapshot(date,date,boolean) to authenticated;
grant execute on function public.crm_kanban_sync() to service_role;
update public.crm_kanban_config set cutoff='2026-11-15',include_history=false where id;
select public.crm_kanban_sync() as sincronizacao;
select count(*) filter(where intake_visible) as contatos_no_recorte,
  count(*) filter(where not intake_visible) as contatos_ocultos_com_historico_preservado,
  count(*) filter(where intake_visible and has_inscription) as inscritos_no_recorte,
  count(*) filter(where intake_visible and owner_id is not null) as contatos_com_responsavel
from public.crm_kanban_contacts;
notify pgrst,'reload schema';
commit;
