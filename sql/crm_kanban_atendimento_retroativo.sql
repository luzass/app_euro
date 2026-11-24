-- HOTFIX: permite contato anterior a entrada na fase sem concluir a cadencia atual.
-- Compativel com a interface ja publicada. Nao altera registros existentes.
begin;
set local lock_timeout='2s';
set local statement_timeout='10s';
do $$ begin
  if to_regprocedure('public.crm_kanban_activity_v2(uuid,text,text,timestamptz,uuid,text,text,timestamptz)') is null then
    raise exception 'Instale o funil/cadencias do CRM antes deste hotfix';
  end if;
end $$;

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

notify pgrst,'reload schema';
commit;
