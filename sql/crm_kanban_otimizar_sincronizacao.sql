-- Etapa 2: evita importacoes identicas e bloqueia apenas mudancas de visibilidade.
-- Nao apaga fontes, contatos ou historico. Nao altera o agendamento existente.
begin;
set local lock_timeout='2s';
set local statement_timeout='15s';
do $$ begin
  if to_regprocedure('public.crm_kanban_sync()') is null
    or to_regprocedure('public.crm_kanban_refresh_intake_scope()') is null
    or not exists(select 1 from pg_attribute where attrelid=to_regclass('public.crm_kanban_contacts') and attname='intake_visible' and not attisdropped) then
    raise exception 'Instale primeiro o recorte do CRM de 15/11/2026';
  end if;
end $$;

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

notify pgrst,'reload schema';
commit;
