-- CRM: qualificacao opcional de outra IES e acompanhamento de documentacao por curso.
-- Metadados apenas: nenhum arquivo ou documento pessoal e armazenado neste fluxo.
begin;
do $$ begin
  if to_regprocedure('public.crm_kanban_close_loss(uuid,integer,uuid,text,text)') is null then raise exception 'Instale a estrutura atual do CRM, funil e motivos antes da documentacao'; end if;
  if not exists(select 1 from pg_attribute where attrelid='public.crm_kanban_contacts'::regclass and attname='intake_visible' and not attisdropped) then raise exception 'Instale antes crm_kanban_recorte_20261115.sql'; end if;
end $$;

create or replace function public.crm_kanban_validate_data(p jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare k text; v jsonb;
begin
  if jsonb_typeof(p)<>'object' then raise exception 'Dados do contato invalidos'; end if;
  for k,v in select * from jsonb_each(p) loop
    if k not in ('nome','telefone','curso','campus','turno','forma_ingresso','email','data_de_nascimento','bairro','cidade','estado','observacao','primeira_graduacao','via_ingresso_opcao','situacao_graduacao','ingressante_outra_ies','ies_origem')
      or jsonb_typeof(v) not in ('string','null') or length(coalesce(v#>>'{}',''))>10000 then raise exception 'Campo nao permitido ou invalido: %',k; end if;
  end loop;
  if p ? 'nome' and coalesce(btrim(p->>'nome'),'')='' then raise exception 'Informe o nome'; end if;
  if p ? 'telefone' and coalesce(p->>'telefone','')<>'' and length(regexp_replace(p->>'telefone','[^0-9]','','g')) not between 10 and 15 then raise exception 'Telefone invalido'; end if;
  if coalesce(p->>'data_de_nascimento','')<>'' and public.crm_kanban_date(p->>'data_de_nascimento') is null then raise exception 'Nascimento invalido'; end if;
  if p ? 'ingressante_outra_ies' and coalesce(p->>'ingressante_outra_ies','') not in ('','Sim','Não') then raise exception 'Informe Sim, Nao ou deixe outra IES em branco'; end if;
  if length(coalesce(p->>'ies_origem',''))>200 then raise exception 'IES de origem deve ter ate 200 caracteres'; end if;
  return p;
end $$;

create table if not exists public.crm_kanban_documents (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.crm_kanban_contacts(id) on delete cascade,
  course text not null check(length(btrim(course)) between 1 and 200),
  description text not null check(length(btrim(description)) between 1 and 500),
  sent_at timestamptz not null,
  received_at timestamptz check(received_at is null or received_at>=sent_at),
  note text not null default '' check(length(note)<=2000),
  receipt_note text not null default '' check(length(receipt_note)<=2000),
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  version integer not null default 1,
  cancelled_at timestamptz,cancelled_by uuid references public.profiles(id),cancel_reason text,
  check(cancelled_at is null or nullif(btrim(cancel_reason),'') is not null)
);
create index if not exists crm_documents_contact_idx on public.crm_kanban_documents(contact_id,sent_at desc,id);

create or replace function public.crm_kanban_document_save(p_contact uuid,p_id uuid,p_course text,p_description text,p_sent timestamptz,p_received timestamptz,p_note text,p_receipt_note text,p_version integer,p_reason text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.crm_kanban_contacts; old_d public.crm_kanban_documents; d public.crm_kanban_documents; is_new boolean; completion boolean;
begin
  select * into c from public.crm_kanban_contacts where id=p_contact for update;
  if not found or auth.uid() is null or not coalesce(public.crm_kanban_manager() or c.owner_id=auth.uid(),false) then raise exception 'Documentacao nao permitida: assuma a ficha ou procure o responsavel' using errcode='42501'; end if;
  if p_id is null then raise exception 'Identificador do envio obrigatorio'; end if;
  p_course:=regexp_replace(btrim(coalesce(p_course,'')),'\s+',' ','g'); p_description:=btrim(coalesce(p_description,''));
  p_note:=coalesce(p_note,'');p_receipt_note:=coalesce(p_receipt_note,'');p_reason:=nullif(btrim(p_reason),'');
  if public.crm_kanban_key(p_course)='' or length(p_course)>200 or length(p_description) not between 1 and 500 or length(p_note)>2000 or length(p_receipt_note)>2000 or length(coalesce(p_reason,''))>2000 then raise exception 'Confira curso, descricao e tamanho das observacoes'; end if;
  if p_sent is null or p_sent>now()+interval '5 minutes' or p_received>now()+interval '5 minutes' or p_received<p_sent then raise exception 'Use datas ja ocorridas; o retorno nao pode ser anterior ao envio'; end if;
  if p_received is null and p_receipt_note<>'' then raise exception 'Registre a data do retorno antes da observacao do recebimento'; end if;
  select * into old_d from public.crm_kanban_documents where id=p_id for update;
  is_new:=not found;
  if not is_new and old_d.contact_id<>p_contact then raise exception 'Envio nao pertence a esta ficha' using errcode='42501'; end if;
  if is_new then
    if p_version is not null then raise exception 'Envio nao encontrado'; end if;
    if c.archived or c.loss_data is not null or not c.intake_visible then raise exception 'Reabra o atendimento antes de registrar um novo envio'; end if;
    insert into public.crm_kanban_documents(id,contact_id,course,description,sent_at,received_at,note,receipt_note,created_by,updated_by)
      values(p_id,p_contact,p_course,p_description,p_sent,p_received,p_note,p_receipt_note,auth.uid(),auth.uid()) returning * into d;
  else
    if old_d.cancelled_at is not null then raise exception 'Envio cancelado; registre um novo envio se necessario'; end if;
    if old_d.course=p_course and old_d.description=p_description and old_d.sent_at=p_sent and old_d.received_at is not distinct from p_received and old_d.note=p_note and old_d.receipt_note=p_receipt_note then
      if p_version is null and old_d.created_by<>auth.uid() then raise exception 'Identificador do envio ja utilizado'; end if;
      return jsonb_build_object('document',to_jsonb(old_d),'contact',to_jsonb(c));
    end if;
    if p_version is null or old_d.version<>p_version then raise exception 'Este envio foi atualizado. Recarregue antes de salvar.' using errcode='PT409'; end if;
    completion:=old_d.received_at is null and p_received is not null and old_d.course=p_course and old_d.description=p_description and old_d.sent_at=p_sent and old_d.note=p_note;
    if not completion and p_reason is null then raise exception 'Informe o motivo da correcao para preservar a auditoria'; end if;
    update public.crm_kanban_documents set course=p_course,description=p_description,sent_at=p_sent,received_at=p_received,note=p_note,receipt_note=p_receipt_note,updated_by=auth.uid(),updated_at=now(),version=version+1 where id=p_id returning * into d;
  end if;
  insert into public.crm_kanban_events(contact_id,event_type,actor_id,payload) values(p_contact,'document_saved',auth.uid(),jsonb_build_object('before',case when is_new then null else to_jsonb(old_d) end,'after',to_jsonb(d),'reason',p_reason));
  update public.crm_kanban_contacts set version=version+1,updated_at=now() where id=p_contact returning * into c;
  return jsonb_build_object('document',to_jsonb(d),'contact',to_jsonb(c));
end $$;

create or replace function public.crm_kanban_document_cancel(p_id uuid,p_version integer,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.crm_kanban_contacts; d public.crm_kanban_documents; old_d public.crm_kanban_documents; contact_id uuid;
begin
  select x.contact_id into contact_id from public.crm_kanban_documents x where x.id=p_id;
  select * into c from public.crm_kanban_contacts where id=contact_id for update;
  if not found or auth.uid() is null or not coalesce(public.crm_kanban_manager() or c.owner_id=auth.uid(),false) then raise exception 'Cancelamento de documentacao nao permitido' using errcode='42501'; end if;
  select * into old_d from public.crm_kanban_documents where id=p_id for update;
  if p_version is null or old_d.version<>p_version then raise exception 'Este envio foi atualizado. Recarregue antes de cancelar.' using errcode='PT409'; end if;
  if old_d.cancelled_at is not null then raise exception 'Envio ja cancelado'; end if;
  p_reason:=btrim(coalesce(p_reason,''));
  if length(p_reason) not between 1 and 2000 then raise exception 'Informe o motivo do cancelamento'; end if;
  update public.crm_kanban_documents set cancelled_at=now(),cancelled_by=auth.uid(),cancel_reason=p_reason,updated_by=auth.uid(),updated_at=now(),version=version+1 where id=p_id returning * into d;
  insert into public.crm_kanban_events(contact_id,event_type,actor_id,payload) values(c.id,'document_cancelled',auth.uid(),jsonb_build_object('before',to_jsonb(old_d),'after',to_jsonb(d),'reason',p_reason));
  update public.crm_kanban_contacts set version=version+1,updated_at=now() where id=c.id returning * into c;
  return jsonb_build_object('document',to_jsonb(d),'contact',to_jsonb(c));
end $$;

create or replace function public.crm_kanban_documents(p_contact uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare person public.crm_kanban_contacts; courses jsonb; extra jsonb; source_table text;
begin
  select * into person from public.crm_kanban_contacts where id=p_contact;
  if not found or auth.uid() is null or not public.crm_kanban_can_read(person.owner_id) then raise exception 'Ficha indisponivel' using errcode='42501'; end if;
  select coalesce(jsonb_agg(distinct current_data->>'curso'),'[]') into courses from public.crm_kanban_contacts;
  foreach source_table in array array['leads_cursos','inscritos_20271','matriculados_20271'] loop
    if to_regclass('public.'||source_table) is not null then
      execute format('select coalesce(jsonb_agg(distinct public.crm_kanban_pick(to_jsonb(t),''curso'')),''[]'') from public.%I t',source_table) into extra;
      courses:=courses||extra;
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
      where d.cancelled_at is null and not c.test_only and public.crm_kanban_can_read(c.owner_id)
      group by public.crm_kanban_key(d.course)
    ) s)
  );
end $$;

alter table public.crm_kanban_documents enable row level security;
revoke all on public.crm_kanban_documents from public,anon,authenticated;
grant select on public.crm_kanban_documents to authenticated;
drop policy if exists crm_documents_read on public.crm_kanban_documents;
create policy crm_documents_read on public.crm_kanban_documents for select to authenticated using(exists(select 1 from public.crm_kanban_contacts c where c.id=contact_id and public.crm_kanban_can_read(c.owner_id)));
revoke all on function public.crm_kanban_document_save(uuid,uuid,text,text,timestamptz,timestamptz,text,text,integer,text),public.crm_kanban_document_cancel(uuid,integer,text),public.crm_kanban_documents(uuid) from public,anon,authenticated;
grant execute on function public.crm_kanban_document_save(uuid,uuid,text,text,timestamptz,timestamptz,text,text,integer,text),public.crm_kanban_document_cancel(uuid,integer,text),public.crm_kanban_documents(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
