-- SQL - Corrigir jornadas de lead/inscrito e habilitar lembretes no CRM.
-- Nao altera fontes academicas e nao envia mensagens. Preserve os contatos existentes.
begin;

alter table public.crm_kanban_config add column if not exists workflow_version integer not null default 1;
alter table public.crm_kanban_contacts add column if not exists last_outreach_at timestamptz;
alter table public.crm_kanban_contacts add column if not exists last_response_at timestamptz;
alter table public.crm_kanban_contacts add column if not exists last_interaction_at timestamptz;
alter table public.crm_kanban_activities add column if not exists direction text not null default 'unknown'
  check(direction in ('outbound','inbound','note','unknown'));
alter table public.crm_kanban_contacts drop constraint if exists crm_kanban_contacts_stage_check;
alter table public.crm_kanban_contacts add constraint crm_kanban_contacts_stage_check
  check(stage in ('primeiro_contato','abordagem','negociacao','fechamento','inscrito','vestibular','aguardando_matricula','matriculado'));

create or replace function public.crm_kanban_progress_fields(p_source text,p jsonb) returns jsonb
language sql immutable set search_path='' as $$
  select case when p_source='inscritos_20271' then jsonb_strip_nulls(jsonb_build_object(
    'data_prova',nullif(btrim(p->>'data_hora_realizacao_prova'),''),
    'boleto_matricula',nullif(btrim(p->>'boleto_de_matricula'),''),
    'matricula_idlan',nullif(btrim(p->>'idlan'),''),
    'matricula_codcontrato',nullif(btrim(p->>'codcontrato'),''),
    'matricula_data_baixa',nullif(btrim(p->>'data_da_baixa'),''))) else '{}'::jsonb end
$$;

create or replace function public.crm_kanban_canonical(p_source text, p jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'nome',public.crm_kanban_pick(p,'nome','candidato','aluno','nome_completo','name'),
    'telefone',public.crm_kanban_pick(p,'contato_principal','contato_2','telefone','celular','whatsapp','phone'),
    'curso',public.crm_kanban_pick(p,'curso','curso_interesse','Curso de interesse','nome_curso'), 'campus',public.crm_kanban_pick(p,'campus','filial','unidade','local'),
    'turno',public.crm_kanban_pick(p,'turno'),
    'forma_ingresso',public.crm_kanban_pick(p,'forma_de_ingresso','tipo_de_ingresso','forma_ingresso'),
    'email',public.crm_kanban_pick(p,'email'), 'data_de_nascimento',public.crm_kanban_pick(p,'data_de_nascimento'),
    'bairro',public.crm_kanban_pick(p,'bairro'), 'cidade',public.crm_kanban_pick(p,'cidade'),
    'estado',public.crm_kanban_pick(p,'estado'), 'observacao',public.crm_kanban_pick(p,'observacao_captacao'),
    'data_inscricao',case when p_source = 'inscritos_20271' then public.crm_kanban_pick(p,'data_inscricao') end,
    'etapa_atual',case when p_source = 'inscritos_20271' then public.crm_kanban_pick(p,'etapa_atual') end,
    'data_matricula',case when p_source = 'matriculados_20271' then public.crm_kanban_pick(p,'data_baixa_do_pagamento','data_de_matricula') end
  )) || public.crm_kanban_progress_fields(p_source,p)
$$;

create or replace function public.crm_kanban_validate_data(p jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare k text; v jsonb;
begin
  if jsonb_typeof(p)<>'object' then raise exception 'Dados do contato invalidos'; end if;
  for k,v in select * from jsonb_each(p) loop
    if k not in ('nome','telefone','curso','campus','turno','forma_ingresso','email','data_de_nascimento','bairro','cidade','estado','observacao','primeira_graduacao','via_ingresso_opcao','situacao_graduacao')
      or jsonb_typeof(v) not in ('string','null') or length(coalesce(v#>>'{}',''))>10000 then raise exception 'Campo nao permitido ou invalido: %',k; end if;
  end loop;
  if p ? 'nome' and coalesce(btrim(p->>'nome'),'')='' then raise exception 'Informe o nome'; end if;
  if p ? 'telefone' and coalesce(p->>'telefone','')<>'' and length(regexp_replace(p->>'telefone','[^0-9]','','g')) not between 10 and 15 then raise exception 'Telefone invalido'; end if;
  if coalesce(p->>'data_de_nascimento','')<>'' and public.crm_kanban_date(p->>'data_de_nascimento') is null then raise exception 'Nascimento invalido'; end if;
  return p;
end $$;

create or replace function public.crm_kanban_save(p_id uuid,p_patch jsonb,p_version integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c public.crm_kanban_contacts; after_c public.crm_kanban_contacts; v_owner uuid; k text;
begin
  select * into c from public.crm_kanban_contacts where id=p_id for update;
  if not found or not public.crm_kanban_can_read(c.owner_id) then raise exception 'Contato indisponivel para este usuario' using errcode='42501'; end if;
  if p_version is null or c.version<>p_version then raise exception 'Este contato foi atualizado. Atualize o quadro e tente novamente.' using errcode='PT409'; end if;
  if jsonb_typeof(p_patch)<>'object' then raise exception 'Alteracao invalida'; end if;
  for k in select jsonb_object_keys(p_patch) loop
    if k not in ('owner_id','stage','position','manual_data','next_action_at','archived','checklist') then raise exception 'Alteracao nao permitida: %',k; end if;
  end loop;
  v_owner:=c.owner_id;
  if p_patch ? 'owner_id' then
    v_owner:=nullif(p_patch->>'owner_id','')::uuid;
    if not public.crm_kanban_manager() and not (c.owner_id is null and v_owner=auth.uid()) and v_owner is distinct from c.owner_id then
      raise exception 'Vendedores nao podem transferir responsaveis' using errcode='42501';
    end if;
    if v_owner is not null and not exists(select 1 from public.profiles where id=v_owner and role in ('captacao','funcionario','captacao_gerente')) then raise exception 'Responsavel nao habilitado para captacao'; end if;
  end if;
  if not public.crm_kanban_manager() and (v_owner is null or v_owner<>auth.uid()) then raise exception 'Assuma o contato antes de registrar atendimento' using errcode='42501'; end if;
  if p_patch ? 'manual_data' then perform public.crm_kanban_validate_data(p_patch->'manual_data'); end if;
  if p_patch->>'stage'='vestibular' and public.crm_kanban_key(c.current_data->>'forma_ingresso') like '%enem%' then
    raise exception 'Ingresso ENEM nao exige prova online. Use Inscrito ou Aguardando matricula conforme a pendencia confirmada.';
  end if;
  if p_patch ? 'checklist' and exists(select 1 from (
    select jsonb_object_keys(c.checklist || (p_patch->'checklist')) key
  ) keys where key like 'cadence%' and c.checklist->key is distinct from (p_patch->'checklist')->key) then
    raise exception 'Cadencias exigem um atendimento registrado ou retomada explicita';
  end if;
  if p_patch ? 'position' and coalesce(p_patch->>'position','') !~ '^-?[0-9]+(\.[0-9]+)?$' then raise exception 'Posicao invalida'; end if;
  update public.crm_kanban_contacts set owner_id=v_owner,
    stage=case when p_patch ? 'stage' then p_patch->>'stage' else stage end,
    stage_entered_at=case when p_patch ? 'stage' and stage<>p_patch->>'stage' then now() else stage_entered_at end,
    position=case when p_patch ? 'position' then (p_patch->>'position')::double precision
      when p_patch ? 'stage' and stage<>p_patch->>'stage' then -nextval('public.crm_kanban_position_seq')::double precision*1024 else position end,
    manual_data=manual_data || coalesce(p_patch->'manual_data','{}'),
    next_action_at=case when p_patch ? 'next_action_at' then nullif(p_patch->>'next_action_at','')::timestamptz else next_action_at end,
    archived=case when p_patch ? 'archived' then (p_patch->>'archived')::boolean else archived end,
    checklist=case when p_patch ? 'checklist' then p_patch->'checklist' else checklist end,
    version=version+1,updated_at=now() where id=p_id returning * into after_c;
  if c.stage<>after_c.stage then
    insert into public.crm_kanban_events(contact_id,event_type,actor_id,payload) values(p_id,'stage',auth.uid(),jsonb_build_object('from',c.stage,'to',after_c.stage));
  end if;
  if c.owner_id is distinct from after_c.owner_id then
    insert into public.crm_kanban_events(contact_id,event_type,actor_id,payload) values(p_id,'assignment',auth.uid(),jsonb_build_object('from',c.owner_id,'to',after_c.owner_id));
  end if;
  if (p_patch - 'stage' - 'owner_id' - 'position')<>'{}' then
    insert into public.crm_kanban_events(contact_id,event_type,actor_id,payload) values(p_id,'edited',auth.uid(),jsonb_build_object('before',c.current_data,'after',after_c.current_data,'changes',p_patch-'manual_data'));
  end if;
  return to_jsonb(after_c);
end $$;

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
  if old_source.payload_hash = v_hash then return false; end if;
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
  insert into public.crm_kanban_sources(source,source_key,contact_id,source_date,is_test,payload,payload_hash,canonical_data)
    values(p_source,p_key,person.id,p_date,p_test,p_raw,v_hash,public.crm_kanban_canonical(p_source,p_raw))
  on conflict(source,source_key) do update set payload=excluded.payload,payload_hash=excluded.payload_hash,
    source_date=excluded.source_date,is_test=excluded.is_test,canonical_data=excluded.canonical_data,observed_at=now();
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

create or replace function public.crm_kanban_detail(p_id uuid,p_before bigint default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare c public.crm_kanban_contacts;
begin
  select * into c from public.crm_kanban_contacts where id=p_id;
  if not found or not public.crm_kanban_can_read(c.owner_id) then raise exception 'Contato indisponivel' using errcode='42501'; end if;
  return jsonb_build_object('contact',to_jsonb(c),
    'sources',(select coalesce(jsonb_agg(to_jsonb(s) order by source_date desc),'[]') from public.crm_kanban_sources s where contact_id=p_id),
    'activities',(select coalesce(jsonb_agg(to_jsonb(a) order by occurred_at desc),'[]') from public.crm_kanban_activities a where contact_id=p_id),
    'events',(select coalesce(jsonb_agg(to_jsonb(e) order by id desc),'[]') from
      (select * from public.crm_kanban_events where contact_id=p_id and (p_before is null or id<p_before) order by id desc limit 50) e),
    'visited_stages',(select coalesce(jsonb_agg(distinct phase),'[]') from (
      select payload->>'from' phase from public.crm_kanban_events where contact_id=p_id and event_type='stage' and actor_id is not null
      union select payload->>'to' from public.crm_kanban_events where contact_id=p_id and event_type='stage'
      union select case when payload->>'source'='inscritos_20271' then 'inscrito' else payload->>'stage' end from public.crm_kanban_events where contact_id=p_id and event_type='created'
      union select c.stage
    ) phases where phase is not null));
end $$;

create or replace function public.crm_kanban_route_contact(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare c public.crm_kanban_contacts; target text;
begin
  select * into c from public.crm_kanban_contacts where id=p_id for update;
  if not found or not c.has_inscription or c.archived or c.official_enrollment or c.stage='matriculado' then return; end if;
  -- A rotina original de importacao confirma matriculas ativas e registra sua propria transicao.
  if exists(select 1 from public.crm_kanban_sources s where s.contact_id=p_id and s.source='matriculados_20271'
    and public.crm_kanban_key(s.payload->>'contrato') in ('ativo','contratoativo')) then return; end if;
  target:=case when public.crm_kanban_key(c.current_data->>'etapa_atual') like 'aprovad%'
    or (nullif(c.current_data->>'matricula_idlan','') is not null or nullif(c.current_data->>'matricula_codcontrato','') is not null)
      and public.crm_kanban_key(c.current_data->>'boleto_matricula') in ('emaberto','baixado')
    or public.crm_kanban_date(c.current_data->>'matricula_data_baixa') is not null
    then 'aguardando_matricula' else 'inscrito' end;
  if c.stage in ('primeiro_contato','abordagem','negociacao','fechamento')
    or target='aguardando_matricula' and c.stage in ('inscrito','vestibular')
    or c.stage='vestibular' and public.crm_kanban_key(c.current_data->>'forma_ingresso') like '%enem%' then
    update public.crm_kanban_contacts set stage=target,stage_entered_at=now(),
      position=-nextval('public.crm_kanban_position_seq')::double precision*1024,version=version+1,updated_at=now() where id=p_id;
    insert into public.crm_kanban_events(contact_id,event_type,payload) values(p_id,'stage',
      jsonb_build_object('from',c.stage,'to',target,'reason','Situação confirmada na base de inscritos; etapas anteriores não foram presumidas'));
  end if;
end $$;
create or replace function public.crm_kanban_route_source() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.has_inscription is distinct from old.has_inscription or
    jsonb_build_array(new.source_data->'etapa_atual',new.source_data->'boleto_matricula',new.source_data->'matricula_idlan',new.source_data->'matricula_codcontrato',new.source_data->'matricula_data_baixa')
    is distinct from jsonb_build_array(old.source_data->'etapa_atual',old.source_data->'boleto_matricula',old.source_data->'matricula_idlan',old.source_data->'matricula_codcontrato',old.source_data->'matricula_data_baixa') then
    perform public.crm_kanban_route_contact(new.id);
  end if;
  return new;
end $$;
drop trigger if exists crm_kanban_source_progress on public.crm_kanban_contacts;
create trigger crm_kanban_source_progress after update of source_data,has_inscription on public.crm_kanban_contacts
  for each row execute function public.crm_kanban_route_source();

create or replace function public.crm_kanban_interaction_clock() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  update public.crm_kanban_contacts c set
    last_outreach_at=(select max(occurred_at) from public.crm_kanban_activities a where a.contact_id=c.id and a.direction='outbound'),
    last_response_at=(select max(occurred_at) from public.crm_kanban_activities a where a.contact_id=c.id and a.direction='inbound'),
    last_interaction_at=(select max(occurred_at) from public.crm_kanban_activities a where a.contact_id=c.id and a.direction<>'note')
  where c.id=new.contact_id;
  return new;
end $$;
drop trigger if exists crm_kanban_activity_clock on public.crm_kanban_activities;
create trigger crm_kanban_activity_clock after insert or update on public.crm_kanban_activities
  for each row execute function public.crm_kanban_interaction_clock();

create or replace function public.crm_kanban_activity_v2(p_contact uuid,p_note text,p_channel text,p_occurred timestamptz,
  p_activity uuid default null,p_direction text default 'outbound',p_code text default null,p_anchor timestamptz default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare c public.crm_kanban_contacts; a public.crm_kanban_activities; activity_id uuid; task_key text; prefix text; allowed_codes text[];
begin
  select * into c from public.crm_kanban_contacts where id=p_contact for update;
  if not found or not public.crm_kanban_can_read(c.owner_id) or not coalesce(public.crm_kanban_manager() or c.owner_id=auth.uid(),false) then raise exception 'Atendimento nao permitido' using errcode='42501'; end if;
  if p_direction not in ('outbound','inbound','note','unknown') or p_direction is null then raise exception 'Tipo de interacao invalido'; end if;
  if p_occurred is null or p_occurred>now()+interval '5 minutes' then raise exception 'Use uma data de atendimento ja realizado'; end if;
  prefix:=c.stage||':'||floor(extract(epoch from c.stage_entered_at)*1000)::bigint::text;
  if p_code is not null then
    allowed_codes:=case c.stage when 'primeiro_contato' then array['C1'] when 'abordagem' then array['A1','A2','A3']
      when 'negociacao' then array['N1','N2','N3'] when 'fechamento' then array['F1'] when 'inscrito' then array['I1']
      when 'vestibular' then array['P1','P2','P3'] when 'aguardando_matricula' then array['V1','V2','V3'] else '{}'::text[] end;
    if p_anchor is distinct from c.stage_entered_at or p_direction<>'outbound' or p_activity is not null or not(p_code=any(allowed_codes)) then
      raise exception 'Cadencia desatualizada. Confira a fase atual do contato.' using errcode='PT409'; end if;
    -- Contato anterior a esta fase entra no historico, sem concluir a cadencia atual.
    if p_occurred>=c.stage_entered_at then
      task_key:='cadence:'||prefix||':'||p_code;
      if c.checklist->>('cadence-paused:'||prefix)='true' then raise exception 'Cadencia pausada apos resposta do candidato'; end if;
      if c.checklist->>task_key='true' then raise exception 'Esta cadencia ja foi registrada'; end if;
    end if;
  end if;
  if p_activity is not null then
    select * into a from public.crm_kanban_activities where id=p_activity and contact_id=p_contact for update;
    if not found or not coalesce(public.crm_kanban_manager() or a.author_id=auth.uid(),false) then raise exception 'Edicao de atendimento nao permitida' using errcode='42501'; end if;
    -- Uma cadencia concluida tem seu atendimento preservado; corrigir texto/data nao desmarca o envio.
    if p_direction is distinct from a.direction and exists(select 1 from public.crm_kanban_events e where e.contact_id=p_contact
      and e.event_type='cadence_completed' and e.payload->>'activity_id'=p_activity::text) then raise exception 'Um envio de cadencia nao pode virar anotacao ou resposta'; end if;
    update public.crm_kanban_activities set note=btrim(p_note),channel=p_channel,occurred_at=p_occurred,direction=p_direction,updated_at=now() where id=p_activity;
    activity_id:=p_activity;
  else
    insert into public.crm_kanban_activities(contact_id,author_id,note,channel,occurred_at,direction)
      values(p_contact,auth.uid(),btrim(p_note),p_channel,p_occurred,p_direction) returning id into activity_id;
  end if;
  insert into public.crm_kanban_events(contact_id,event_type,actor_id,payload) values(p_contact,'activity',auth.uid(),
    jsonb_build_object('activity_id',activity_id,'before',to_jsonb(a),'note',btrim(p_note),'channel',p_channel,'occurred_at',p_occurred,'direction',p_direction)
      ||case when p_code is not null and p_occurred<c.stage_entered_at then
        jsonb_build_object('retroactive_cadence',jsonb_build_object('code',p_code,'anchor',p_anchor,'reason','before_stage_entry')) else '{}'::jsonb end);
  update public.crm_kanban_contacts set version=version+1,updated_at=now(),
    next_action_at=case when p_direction='outbound' and next_action_at<=p_occurred then null else next_action_at end,
    checklist=case when task_key is not null then checklist||jsonb_build_object(task_key,true)
      when p_direction='inbound' and p_occurred>=stage_entered_at then checklist||jsonb_build_object('cadence-paused:'||prefix,true) else checklist end
    where id=p_contact;
  if task_key is not null then
    insert into public.crm_kanban_events(contact_id,event_type,actor_id,payload) values(p_contact,'cadence_completed',auth.uid(),
      jsonb_build_object('code',p_code,'stage',c.stage,'activity_id',activity_id,'occurred_at',p_occurred));
  elsif p_direction='inbound' and p_occurred>=c.stage_entered_at then
    insert into public.crm_kanban_events(contact_id,event_type,actor_id,payload) values(p_contact,'cadence_paused',auth.uid(),
      jsonb_build_object('stage',c.stage,'reason','Resposta do candidato registrada; combinar proximo retorno'));
  end if;
  if p_direction='outbound' and c.next_action_at<=p_occurred then
    insert into public.crm_kanban_events(contact_id,event_type,actor_id,payload) values(p_contact,'callback_completed',auth.uid(),jsonb_build_object('activity_id',activity_id,'due_at',c.next_action_at));
  end if;
  return activity_id;
end $$;

create or replace function public.crm_kanban_resume_cadence(p_id uuid,p_version integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.crm_kanban_contacts; pause_key text;
begin
  select * into c from public.crm_kanban_contacts where id=p_id for update;
  if not found or not public.crm_kanban_can_read(c.owner_id) or not coalesce(public.crm_kanban_manager() or c.owner_id=auth.uid(),false) then raise exception 'Atendimento nao permitido' using errcode='42501'; end if;
  if p_version is null or p_version<>c.version then raise exception 'Contato atualizado. Reabra a ficha.' using errcode='PT409'; end if;
  pause_key:='cadence-paused:'||c.stage||':'||floor(extract(epoch from c.stage_entered_at)*1000)::bigint::text;
  update public.crm_kanban_contacts set checklist=checklist-pause_key,version=version+1,updated_at=now() where id=p_id returning * into c;
  insert into public.crm_kanban_events(contact_id,event_type,actor_id,payload) values(p_id,'cadence_resumed',auth.uid(),jsonb_build_object('stage',c.stage));
  return to_jsonb(c);
end $$;

-- A carga diaria nao conta como conversa. Datas abaixo vem somente de atendimentos registrados.
update public.crm_kanban_contacts c set
  last_outreach_at=(select max(occurred_at) from public.crm_kanban_activities a where a.contact_id=c.id and a.direction='outbound'),
  last_response_at=(select max(occurred_at) from public.crm_kanban_activities a where a.contact_id=c.id and a.direction='inbound'),
  last_interaction_at=(select max(occurred_at) from public.crm_kanban_activities a where a.contact_id=c.id and a.direction<>'note');
update public.crm_kanban_sources set canonical_data=canonical_data||public.crm_kanban_progress_fields(source,payload)
  where source='inscritos_20271';
do $$ declare c uuid; begin
  for c in select distinct contact_id from public.crm_kanban_sources where source='inscritos_20271' loop
    perform public.crm_kanban_refresh(c);
    if (select workflow_version<2 from public.crm_kanban_config where id) then perform public.crm_kanban_route_contact(c); end if;
  end loop;
end $$;

revoke all on function public.crm_kanban_progress_fields(text,jsonb),public.crm_kanban_route_contact(uuid),public.crm_kanban_route_source(),public.crm_kanban_interaction_clock(),public.crm_kanban_activity_v2(uuid,text,text,timestamptz,uuid,text,text,timestamptz),public.crm_kanban_resume_cadence(uuid,integer) from public,anon,authenticated;
update public.crm_kanban_config set workflow_version=2 where id;
alter table public.crm_kanban_config alter column workflow_version set default 2;
grant execute on function public.crm_kanban_activity_v2(uuid,text,text,timestamptz,uuid,text,text,timestamptz),public.crm_kanban_resume_cadence(uuid,integer) to authenticated;
notify pgrst,'reload schema';
commit;
