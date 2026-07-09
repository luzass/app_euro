create table if not exists public.spike_leads_resumo_20262 (
  lead_id bigint primary key,
  data_referencia date not null,
  cpf text null,
  telefone text null,
  nome text null,
  tem_inscricao boolean not null default false,
  tem_matricula boolean not null default false,
  status_crm text null,
  objecao text null,
  observacoes_perda text null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_spike_leads_resumo_20262_data
  on public.spike_leads_resumo_20262 (data_referencia);

create index if not exists idx_spike_leads_resumo_20262_cpf
  on public.spike_leads_resumo_20262 (cpf);

create index if not exists idx_spike_leads_resumo_20262_telefone
  on public.spike_leads_resumo_20262 (telefone);

create index if not exists idx_spike_leads_resumo_20262_status
  on public.spike_leads_resumo_20262 (status_crm);

alter table public.spike_leads_resumo_20262 enable row level security;

drop policy if exists "read spike leads resumo 20262" on public.spike_leads_resumo_20262;
create policy "read spike leads resumo 20262"
on public.spike_leads_resumo_20262
for select
to authenticated
using (true);

create or replace function public.normalizar_cpf_spike(valor text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(coalesce(valor, ''), '\D', '', 'g'), '');
$$;

create or replace function public.normalizar_telefone_spike(valor text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(coalesce(valor, ''), '\D', '', 'g'), '');
$$;

create or replace function public.parse_data_spike(valor text)
returns date
language plpgsql
immutable
as $$
declare
  texto text := trim(coalesce(valor, ''));
begin
  if texto = '' then
    return null;
  end if;

  if texto ~ '^\d{4}-\d{2}-\d{2}$' then
    return texto::date;
  end if;

  if texto ~ '^\d{4}-\d{2}-\d{2}[ T]' then
    return texto::timestamp::date;
  end if;

  if texto ~ '^\d{2}/\d{2}/\d{4}$' then
    return to_date(texto, 'DD/MM/YYYY');
  end if;

  if texto ~ '^\d{2}/\d{2}/\d{4}[ T]' then
    return to_timestamp(texto, 'DD/MM/YYYY HH24:MI:SS')::date;
  end if;

  return null;
exception
  when others then
    return null;
end;
$$;

create or replace function public.recalcular_spike_leads_resumo_20262()
returns void
language plpgsql
as $$
begin
  delete from public.spike_leads_resumo_20262
  where lead_id is not null;

  with leads_base as (
    select
      l.id::bigint as lead_id,
      (l.created_at at time zone 'America/Sao_Paulo')::date as data_referencia,
      public.normalizar_cpf_spike(l.cpf::text) as cpf,
      public.normalizar_telefone_spike(l.telefone::text) as telefone,
      nullif(trim(l.nome::text), '') as nome
    from public.leads_cursos l
  ),
  inscritos_base as (
    select distinct public.normalizar_cpf_spike(cpf::text) as cpf
    from public.inscritos_20262
    where public.normalizar_cpf_spike(cpf::text) is not null
  ),
  matriculados_base as (
    select distinct public.normalizar_cpf_spike(cpf::text) as cpf
    from public.matriculados_20262
    where public.normalizar_cpf_spike(cpf::text) is not null
      and upper(trim(coalesce(tipo_aluno, ''))) = 'CALOURO'
  ),
  crm_base as (
    select
      public.normalizar_cpf_spike("CPF"::text) as cpf,
      public.normalizar_telefone_spike("Telefone da pessoa"::text) as telefone,
      nullif(trim("Status"), '') as status_crm,
      nullif(trim("Objeção"), '') as objecao,
      nullif(trim("Observações da perda"), '') as observacoes_perda,
      coalesce(
        public.parse_data_spike("Data da criação"::text),
        public.parse_data_spike("Data da atividade"::text),
        public.parse_data_spike("Momento do último ganho"::text),
        public.parse_data_spike("Momento da última perda"::text)
      ) as data_referencia
    from public.registro_crm
  ),
  crm_por_cpf as (
    select cpf, status_crm, objecao, observacoes_perda
    from (
      select
        cpf,
        status_crm,
        objecao,
        observacoes_perda,
        row_number() over (
          partition by cpf
          order by data_referencia desc nulls last
        ) as rn
      from crm_base
      where cpf is not null
    ) ranked
    where rn = 1
  ),
  crm_por_telefone as (
    select telefone, status_crm, objecao, observacoes_perda
    from (
      select
        telefone,
        status_crm,
        objecao,
        observacoes_perda,
        row_number() over (
          partition by telefone
          order by data_referencia desc nulls last
        ) as rn
      from crm_base
      where telefone is not null
    ) ranked
    where rn = 1
  )
  insert into public.spike_leads_resumo_20262 (
    lead_id,
    data_referencia,
    cpf,
    telefone,
    nome,
    tem_inscricao,
    tem_matricula,
    status_crm,
    objecao,
    observacoes_perda,
    updated_at
  )
  select
    l.lead_id,
    l.data_referencia,
    l.cpf,
    l.telefone,
    l.nome,
    exists (
      select 1
      from inscritos_base i
      where i.cpf = l.cpf
    ) as tem_inscricao,
    exists (
      select 1
      from matriculados_base m
      where m.cpf = l.cpf
    ) as tem_matricula,
    coalesce(cpf_crm.status_crm, tel_crm.status_crm, 'Não informado') as status_crm,
    coalesce(cpf_crm.objecao, tel_crm.objecao, 'Não informada') as objecao,
    coalesce(cpf_crm.observacoes_perda, tel_crm.observacoes_perda, 'Não informada') as observacoes_perda,
    now() as updated_at
  from leads_base l
  left join crm_por_cpf cpf_crm
    on cpf_crm.cpf = l.cpf
  left join crm_por_telefone tel_crm
    on tel_crm.telefone = l.telefone;
end;
$$;

select public.recalcular_spike_leads_resumo_20262();
