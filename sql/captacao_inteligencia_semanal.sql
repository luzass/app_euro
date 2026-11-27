-- Area privada de Lucas. Nao altera CRM, inscritos, matriculados ou seus agendamentos.
begin;
create or replace function public.weekly_can_access() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users where id=auth.uid() and lower(email)='lucasctdebritto@gmail.com')
$$;
create table if not exists public.captacao_weekly_reports (
 id uuid primary key, cutoff date not null, week_start date not null, created_at timestamptz not null default now(),
 snapshot jsonb not null, analysis jsonb, model text, generated_at timestamptz,
 generation_job uuid, generation_started timestamptz, last_error text,
 check(jsonb_typeof(snapshot)='object')
);
create table if not exists public.captacao_weekly_actions (
 id uuid primary key, report_id uuid not null references public.captacao_weekly_reports(id), suggestion_index integer,
 week_start date not null, title text not null, hypothesis text not null default '', audience text not null default '', plan text not null,
 owner_id uuid references public.profiles(id), due_date date not null, metric_key text not null, baseline numeric, target numeric,
 status text not null default 'planejada' check(status in ('planejada','andamento','concluida','nao_realizada','cancelada')),
 execution text not null default '', review text not null default '', outcome text not null default 'pendente' check(outcome in ('pendente','melhorou','igual','piorou','inconclusivo')),
 version integer not null default 1, updated_at timestamptz not null default now(), unique(report_id,suggestion_index)
);
create table if not exists public.captacao_weekly_action_history (
 id bigint generated always as identity primary key, action_id uuid not null references public.captacao_weekly_actions(id),
 actor_id uuid not null, at timestamptz not null default now(), before_data jsonb, after_data jsonb not null
);
create table if not exists public.captacao_weekly_ai_attempts (
 job uuid primary key, report_id uuid not null references public.captacao_weekly_reports(id), at timestamptz not null default now()
);
create index if not exists weekly_actions_week_idx on public.captacao_weekly_actions(week_start desc);
alter table public.captacao_weekly_reports enable row level security;
alter table public.captacao_weekly_actions enable row level security;
alter table public.captacao_weekly_action_history enable row level security;
alter table public.captacao_weekly_ai_attempts enable row level security;
revoke all on public.captacao_weekly_reports,public.captacao_weekly_actions,public.captacao_weekly_action_history,public.captacao_weekly_ai_attempts from public,anon,authenticated;

create or replace function public.weekly_collect(p_cutoff date) returns jsonb
language plpgsql security definer set search_path='' set statement_timeout='20s' as $$
declare campaigns jsonb:='[]'; warnings jsonb:='[]'; period text; kind text; tab text; rows jsonb; campaign jsonb; contacts jsonb; activities jsonb; members jsonb; documents jsonb; sync jsonb;
begin
 if not public.weekly_can_access() then raise exception 'Area exclusiva de Lucas' using errcode='42501'; end if;
 if p_cutoff is null or p_cutoff<'2026-09-01' or p_cutoff>(now() at time zone 'America/Sao_Paulo')::date then raise exception 'Data de corte invalida'; end if;
 if (select count(*) from public.crm_kanban_contacts where intake_visible and not test_only)>10000 then raise exception 'Base do CRM excede o limite desta coleta; revise o recorte'; end if;
 foreach period in array array['2024.1','2025.1','2026.1','2027.1'] loop
  campaign:=jsonb_build_object('period',period);
  foreach kind in array array['inscritos','matriculados'] loop
   tab:=kind||'_'||replace(period,'.','');
   if to_regclass('public.'||tab) is null then
    campaign:=campaign||jsonb_build_object(kind,'[]'::jsonb,kind||'Error','Base indisponivel');
   else
    execute format($q$
     select coalesce(jsonb_agg(jsonb_build_object('cpf',r->>'cpf','curso',r->>'curso','campus',coalesce(r->>'campus',r->>'filial'),
      'filial',coalesce(r->>'filial',r->>'campus'),'turno',r->>'turno','modalidade',r->>'modalidade',
      'contrato',r->>'contrato','tipo_aluno',r->>'tipo_aluno','tipo_de_ingresso',r->>'tipo_de_ingresso','forma_de_ingresso',r->>'forma_de_ingresso','data_inscricao',r->>'data_inscricao','data_de_matricula',r->>'data_de_matricula')),'[]')
     from (select to_jsonb(t) r from public.%I t) s
     where regexp_replace(coalesce(nullif(r->>%L,''),%L),'[^0-9]','','g')=%L
      and public.crm_kanban_key(coalesce(r->>'nivel_de_ensino','')) !~ '(posgraduacao|extensao)'
      and public.crm_kanban_key(coalesce(r->>'processo_seletivo','')) !~ '(posgraduacao|extensao)'
      and not (%L='2025.1' and coalesce(r->>'codcoligada','')='2' and coalesce(r->>'codigo_do_processo','') in ('316','357'))
    $q$,tab,case when kind='inscritos' then 'ano_semestre' else 'periodo_letivo' end,case when kind='inscritos' then period else '' end,replace(period,'.',''),period) into rows;
    if jsonb_array_length(rows)>30000 then raise exception 'Base academica excede o limite de coleta'; end if;
    campaign:=campaign||jsonb_build_object(kind,rows);
   end if;
  end loop;
  campaigns:=campaigns||jsonb_build_array(campaign);
 end loop;
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'owner_id',c.owner_id,'stage',c.stage,'stage_entered_at',c.stage_entered_at,
  'created_at',c.created_at,'archived',c.archived,'test_only',c.test_only,'intake_visible',c.intake_visible,'has_inscription',c.has_inscription,
  'official_enrollment',c.official_enrollment,'loss_data',c.loss_data-'note','checklist',c.checklist,'next_action_at',c.next_action_at,
  'last_interaction_at',c.last_interaction_at,'last_outreach_at',c.last_outreach_at,'last_response_at',c.last_response_at,
  'current_data',jsonb_build_object('nome',c.current_data->>'nome','curso',c.current_data->>'curso','campus',c.current_data->>'campus'))),'[]')
 into contacts from public.crm_kanban_contacts c where c.intake_visible and not c.test_only;
 select coalesce(jsonb_agg(jsonb_build_object('contact_id',a.contact_id,'author_id',a.author_id,'occurred_at',a.occurred_at,'channel',a.channel,'direction',a.direction,'note',a.note) order by a.occurred_at),'[]')
 into activities from public.crm_kanban_activities a join public.crm_kanban_contacts c on c.id=a.contact_id
 where c.intake_visible and not c.test_only and a.occurred_at>=(p_cutoff-13)::timestamp at time zone 'America/Sao_Paulo'
 and a.occurred_at<(p_cutoff+1)::timestamp at time zone 'America/Sao_Paulo' and a.occurred_at<=now();
 if jsonb_array_length(activities)>20000 then raise exception 'Atendimentos excedem o limite desta coleta'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'nome',nome,'role',role,'alias','Equipe-'||substr(md5(id::text),1,8)) order by id),'[]') into members
 from public.profiles where role in ('captacao','captacao_gerente') or id=auth.uid();
 if to_regclass('public.crm_kanban_documents') is not null then
  execute $q$select jsonb_build_object('pending',count(*) filter(where received_at is null),'completed',count(*) filter(where received_at is not null),
   'average_hours',avg(extract(epoch from(received_at-sent_at))/3600) filter(where received_at is not null))
   from public.crm_kanban_documents d join public.crm_kanban_contacts c on c.id=d.contact_id
   where c.intake_visible and not c.test_only and d.cancelled_at is null$q$ into documents;
 else warnings:=warnings||jsonb_build_array('Documentacao indisponivel.'); end if;
 if to_regclass('public.crm_kanban_config') is not null then
  execute $q$select jsonb_build_object('at',last_sync_at,'missing_sources',coalesce(last_sync_result->'missing_sources','[]')) from public.crm_kanban_config where id$q$ into sync;
 end if;
 return jsonb_build_object('captured_at',now(),'campaigns',campaigns,'contacts',contacts,'activities',activities,'members',members,'documents',documents,'warnings',warnings,'sync',sync);
end $$;

create or replace function public.weekly_snapshot_save(p_id uuid,p_cutoff date,p_snapshot jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result public.captacao_weekly_reports;
begin
 if not public.weekly_can_access() then raise exception 'Area exclusiva de Lucas' using errcode='42501'; end if;
 if p_id is null or p_cutoff is null or p_cutoff<'2026-09-01' or p_cutoff>(now() at time zone 'America/Sao_Paulo')::date
 or coalesce(jsonb_typeof(p_snapshot),'')<>'object' or octet_length(p_snapshot::text)>500000
 or coalesce(p_snapshot->>'version','')<>'1' or p_snapshot->>'cutoff' is distinct from p_cutoff::text
 or coalesce(jsonb_typeof(p_snapshot->'facts'),'')<>'array' then raise exception 'Fotografia invalida'; end if;
 insert into public.captacao_weekly_reports(id,cutoff,week_start,snapshot)
 values(p_id,p_cutoff,date_trunc('week',now() at time zone 'America/Sao_Paulo')::date,p_snapshot) on conflict(id) do nothing;
 select * into result from public.captacao_weekly_reports where id=p_id;
 return to_jsonb(result);
end $$;

create or replace function public.weekly_list() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.weekly_can_access() then raise exception 'Area exclusiva de Lucas' using errcode='42501'; end if;
 return jsonb_build_object('reports',(select coalesce(jsonb_agg(to_jsonb(r) order by created_at desc),'[]') from
  (select id,cutoff,week_start,created_at,generated_at,model,last_error from public.captacao_weekly_reports order by created_at desc limit 60) r),
  'actions',(select coalesce(jsonb_agg(to_jsonb(a) order by week_start desc,updated_at desc),'[]') from
   (select * from public.captacao_weekly_actions order by week_start desc,updated_at desc limit 300) a),
  'members',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'nome',nome,'alias','Equipe-'||substr(md5(id::text),1,8)) order by nome),'[]') from public.profiles where role in ('captacao','captacao_gerente') or id=auth.uid()));
end $$;
create or replace function public.weekly_get(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.weekly_can_access() then raise exception 'Area exclusiva de Lucas' using errcode='42501'; end if;
 return (select to_jsonb(r)-'generation_job' from public.captacao_weekly_reports r where id=p_id);
end $$;

create or replace function public.weekly_ai_claim(p_id uuid,p_job uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.captacao_weekly_reports;
begin
 if not public.weekly_can_access() then raise exception 'Area exclusiva de Lucas' using errcode='42501'; end if;
 if p_job is null then raise exception 'Identificador obrigatorio'; end if;
 select * into r from public.captacao_weekly_reports where id=p_id for update;
 if not found then raise exception 'Fotografia nao encontrada'; end if;
 if r.analysis is not null then return jsonb_build_object('already_done',true,'report',to_jsonb(r)-'generation_job'); end if;
 if r.generation_started>now()-interval '5 minutes' then raise exception 'Analise em andamento. Atualize para conferir.' using errcode='PT409'; end if;
 if (select count(*) from public.captacao_weekly_ai_attempts where at>=now()-interval '24 hours')>=10 then raise exception 'Limite de dez tentativas em 24 horas atingido' using errcode='PT429'; end if;
 insert into public.captacao_weekly_ai_attempts(job,report_id) values(p_job,p_id);
 update public.captacao_weekly_reports set generation_job=p_job,generation_started=now(),last_error=null where id=p_id returning * into r;
 return jsonb_build_object('already_done',false,'report',to_jsonb(r)-'generation_job',
  'actions',(select coalesce(jsonb_agg(to_jsonb(a)),'[]') from (select * from public.captacao_weekly_actions
   where week_start>=r.week_start-28 and report_id<>p_id order by week_start desc,updated_at desc limit 30) a));
end $$;
create or replace function public.weekly_ai_finish(p_id uuid,p_job uuid,p_analysis jsonb,p_model text,p_error text default null) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.weekly_can_access() then raise exception 'Area exclusiva de Lucas' using errcode='42501'; end if;
 if p_analysis is not null and (jsonb_typeof(p_analysis)<>'object' or octet_length(p_analysis::text)>60000 or coalesce(length(p_model),0) not between 1 and 100) then raise exception 'Diagnostico invalido'; end if;
 update public.captacao_weekly_reports set analysis=p_analysis,model=case when p_analysis is not null then p_model end,
  generated_at=case when p_analysis is not null then now() end,last_error=left(p_error,500),generation_job=null,generation_started=null
 where id=p_id and generation_job=p_job and analysis is null;
 if not found then raise exception 'Esta tentativa ja foi finalizada ou substituida' using errcode='PT409'; end if;
end $$;

create or replace function public.weekly_action_save(p_id uuid,p_report uuid,p_version integer,p_patch jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare old public.captacao_weekly_actions; result public.captacao_weekly_actions; snapshot jsonb; owner uuid; week date; due date; v_target numeric; v_baseline numeric; metric text; idx integer;
begin
 if not public.weekly_can_access() then raise exception 'Area exclusiva de Lucas' using errcode='42501'; end if;
 if p_id is null or coalesce(jsonb_typeof(p_patch),'')<>'object' or exists(select 1 from jsonb_object_keys(p_patch) k where k not in
  ('week_start','title','hypothesis','audience','plan','owner_id','due_date','metric_key','target','status','execution','review','outcome','suggestion_index')) then raise exception 'Acao invalida'; end if;
 if coalesce(length(btrim(p_patch->>'title')),0) not between 1 and 200 or coalesce(length(btrim(p_patch->>'plan')),0) not between 1 and 4000
 or greatest(length(p_patch->>'hypothesis'),length(p_patch->>'audience'),length(p_patch->>'execution'),length(p_patch->>'review'))>4000
 or coalesce(p_patch->>'status','') not in ('planejada','andamento','concluida','nao_realizada','cancelada')
 or coalesce(p_patch->>'outcome','') not in ('pendente','melhorou','igual','piorou','inconclusivo') then raise exception 'Confira titulo, plano, situacao e limites dos textos'; end if;
 week:=(p_patch->>'week_start')::date; due:=(p_patch->>'due_date')::date;
 if week is null or due is null or extract(isodow from week)<>1 or due<week or due>week+90 then raise exception 'Use segunda-feira para a semana e um prazo de ate 90 dias'; end if;
 owner:=nullif(p_patch->>'owner_id','')::uuid;
 if owner is not null and not exists(select 1 from public.profiles where id=owner and (role in ('captacao','captacao_gerente') or id=auth.uid())) then raise exception 'Responsavel invalido'; end if;
 if p_patch->>'status' in ('concluida','nao_realizada') and coalesce(length(btrim(p_patch->>'execution')),0)=0 then raise exception 'Registre o que foi feito ou por que nao foi realizado'; end if;
 if p_patch->>'outcome'<>'pendente' and coalesce(length(btrim(p_patch->>'review')),0)=0 then raise exception 'Descreva a avaliacao do resultado'; end if;
 metric:=p_patch->>'metric_key'; v_target:=nullif(p_patch->>'target','')::numeric; idx:=nullif(p_patch->>'suggestion_index','')::integer;
 if v_target<0 or v_target>1000000000 or idx<0 or idx>4 then raise exception 'Meta ou sugestao invalida'; end if;
 select * into old from public.captacao_weekly_actions where id=p_id for update;
 if found and (p_version is null or old.version<>p_version or old.report_id<>p_report or old.metric_key<>metric or old.suggestion_index is distinct from idx) then raise exception 'Acao atualizada. Recarregue antes de salvar.' using errcode='PT409'; end if;
 if old.id is null and p_version is not null then raise exception 'Acao nao encontrada'; end if;
 select r.snapshot into snapshot from public.captacao_weekly_reports r where r.id=p_report;
 if idx is not null and not exists(select 1 from public.captacao_weekly_reports r where r.id=p_report and jsonb_typeof(r.analysis->'suggestions')='array' and jsonb_array_length(r.analysis->'suggestions')>idx) then raise exception 'Sugestao nao encontrada no diagnostico'; end if;
 if snapshot is null or not exists(select 1 from jsonb_array_elements(snapshot->'facts') f where f->>'key'=metric and jsonb_typeof(f->'value')='number') then raise exception 'Indicador indisponivel na fotografia'; end if;
 select (f->>'value')::numeric into v_baseline from jsonb_array_elements(snapshot->'facts') f where f->>'key'=metric limit 1;
 if old.id is null then
  insert into public.captacao_weekly_actions(id,report_id,suggestion_index,week_start,title,hypothesis,audience,plan,owner_id,due_date,metric_key,baseline,target,status,execution,review,outcome)
  values(p_id,p_report,idx,week,btrim(p_patch->>'title'),coalesce(p_patch->>'hypothesis',''),coalesce(p_patch->>'audience',''),btrim(p_patch->>'plan'),owner,due,metric,v_baseline,v_target,p_patch->>'status',coalesce(p_patch->>'execution',''),coalesce(p_patch->>'review',''),p_patch->>'outcome') returning * into result;
 else
  update public.captacao_weekly_actions set week_start=week,title=btrim(p_patch->>'title'),hypothesis=coalesce(p_patch->>'hypothesis',''),audience=coalesce(p_patch->>'audience',''),plan=btrim(p_patch->>'plan'),owner_id=owner,due_date=due,target=v_target,status=p_patch->>'status',execution=coalesce(p_patch->>'execution',''),review=coalesce(p_patch->>'review',''),outcome=p_patch->>'outcome',version=version+1,updated_at=now() where id=p_id returning * into result;
 end if;
 insert into public.captacao_weekly_action_history(action_id,actor_id,before_data,after_data) values(p_id,auth.uid(),case when old.id is not null then to_jsonb(old) end,to_jsonb(result));
 return to_jsonb(result);
exception when unique_violation then raise exception 'Esta sugestao ja esta no plano. Atualize a lista.' using errcode='PT409';
end $$;

revoke all on function public.weekly_can_access(),public.weekly_collect(date),public.weekly_snapshot_save(uuid,date,jsonb),public.weekly_list(),public.weekly_get(uuid),public.weekly_ai_claim(uuid,uuid),public.weekly_ai_finish(uuid,uuid,jsonb,text,text),public.weekly_action_save(uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.weekly_can_access(),public.weekly_collect(date),public.weekly_snapshot_save(uuid,date,jsonb),public.weekly_list(),public.weekly_get(uuid),public.weekly_ai_claim(uuid,uuid),public.weekly_ai_finish(uuid,uuid,jsonb,text,text),public.weekly_action_save(uuid,uuid,integer,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
