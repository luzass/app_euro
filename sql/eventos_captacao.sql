-- Area privada de eventos. Execute no SQL Editor do Supabase.
-- Nao altera leads_cursos, CRM, inscritos ou matriculados.
begin;

create or replace function public.eventos_key(v text) returns text
language sql immutable set search_path='' as $$
  select btrim(regexp_replace(translate(lower(coalesce(v,'')), 'áàãâäéèêëíìîïóòõôöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn'), '[^a-z0-9]+',' ','g'))
$$;
create or replace function public.eventos_phone(v text) returns text
language sql immutable set search_path='' as $$
  with raw as (select regexp_replace(coalesce(v,''),'[^0-9]','','g') d), local as (
    select case when length(d) in (12,13) and left(d,2)='55' then substr(d,3) else d end d from raw
  ) select case when length(d) in (10,11) and d !~ '^([0-9])\1+$' then d end from local
$$;
create or replace function public.eventos_email(v text) returns text
language sql immutable set search_path='' as $$
  select case when btrim(v) ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then lower(btrim(v)) end
$$;
create or replace function public.eventos_cpf(v text) returns text
language sql immutable set search_path='' as $$
  with d as (select regexp_replace(coalesce(v,''),'[^0-9]','','g') v)
  select case when v ~ '^[0-9]{1,11}$' and v !~ '^0+$' then lpad(v,11,'0') end from d
$$;
create or replace function public.eventos_can_access() returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from auth.users u where u.id=auth.uid()
    and lower(u.email) in ('lucasdtbritto@gmail.com','diego.eger@unieuro.edu.br'))
$$;

create table if not exists public.eventos_importacoes (
  id uuid primary key default gen_random_uuid(), arquivo_chave text not null unique,
  arquivo_nome text not null, evento_padrao text, criado_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  check(arquivo_chave ~ '^[a-f0-9]{64}$'), check(length(arquivo_nome) between 1 and 255)
);
create table if not exists public.eventos_leads (
  id uuid primary key default gen_random_uuid(), importacao_id uuid not null references public.eventos_importacoes(id) on delete cascade,
  linha_origem integer not null check(linha_origem between 2 and 5001),
  nome text, telefone text, email text, curso text, escolaridade text,
  nome_responsavel text, telefone_responsavel text, evento text,
  evento_chave text generated always as (public.eventos_key(evento)) stored,
  telefone_chave text generated always as (public.eventos_phone(telefone)) stored,
  email_chave text generated always as (public.eventos_email(email)) stored,
  criado_em timestamptz not null default now(), unique(importacao_id,linha_origem),
  check(greatest(length(nome),length(telefone),length(email),length(curso),length(escolaridade),length(nome_responsavel),length(telefone_responsavel),length(evento))<=2000)
);
create index if not exists eventos_leads_evento_idx on public.eventos_leads(evento_chave,criado_em,id);
create table if not exists public.eventos_relatorios (
  periodo text primary key, atualizado_em timestamptz, fontes_ausentes jsonb not null default '[]'
);
create table if not exists public.eventos_cruzamentos (
  periodo text not null references public.eventos_relatorios(periodo) on delete cascade,
  lead_id uuid not null references public.eventos_leads(id) on delete cascade,
  situacao text not null, cpf text, criterio text, candidatos integer not null default 0,
  inscrito boolean not null, matriculado boolean not null, cursos_inscricao text[], cursos_matricula text[],
  primary key(periodo,lead_id)
);

alter table public.eventos_importacoes enable row level security;
alter table public.eventos_leads enable row level security;
alter table public.eventos_relatorios enable row level security;
alter table public.eventos_cruzamentos enable row level security;
revoke all on public.eventos_importacoes,public.eventos_leads,public.eventos_relatorios,public.eventos_cruzamentos from public,anon,authenticated;
-- All reads and writes go through the guarded RPCs below, including reports.

create or replace function public.eventos_importar(p_chave text,p_arquivo text,p_evento text,p_linhas jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare batch uuid; inserted integer; ignored integer; total integer; v_row jsonb; field text;
begin
  if not public.eventos_can_access() then raise exception 'Acesso restrito a Lucas e Diego' using errcode='42501'; end if;
  if p_chave is null or p_chave !~ '^[a-f0-9]{64}$' or coalesce(length(p_arquivo),0) not between 1 and 255
    or coalesce(jsonb_typeof(p_linhas),'')<>'array' then raise exception 'Arquivo ou lote invalido' using errcode='22023'; end if;
  if jsonb_array_length(p_linhas) not between 1 and 250 then raise exception 'Envie entre 1 e 250 linhas por lote' using errcode='22023'; end if;
  for v_row in select value from jsonb_array_elements(p_linhas) loop
    if jsonb_typeof(v_row)<>'object' or coalesce(v_row->>'linha','') !~ '^[0-9]{1,4}$'
      or (v_row->>'linha')::integer not between 2 and 5001 then raise exception 'Linha de origem invalida' using errcode='22023'; end if;
    if exists(select 1 from jsonb_object_keys(v_row) k where k not in ('linha','nome','telefone','email','curso','escolaridade','nome_responsavel','telefone_responsavel','evento')) then
      raise exception 'Coluna de importacao invalida' using errcode='22023'; end if;
    foreach field in array array['nome','telefone','email','curso','escolaridade','nome_responsavel','telefone_responsavel','evento'] loop
      if length(v_row->>field)>2000 or (v_row ? field and jsonb_typeof(v_row->field) not in ('string','null')) then
        raise exception 'Valor invalido na coluna %',field using errcode='22023'; end if;
    end loop;
  end loop;
  if length(p_evento)>2000 then raise exception 'Nome do evento muito longo' using errcode='22023'; end if;
  insert into public.eventos_importacoes(arquivo_chave,arquivo_nome,evento_padrao,criado_por)
    values(p_chave,p_arquivo,nullif(btrim(p_evento),''),auth.uid()) on conflict(arquivo_chave) do nothing;
  select id into batch from public.eventos_importacoes where arquivo_chave=p_chave;
  if exists(select 1 from public.eventos_importacoes where id=batch and public.eventos_key(evento_padrao) is distinct from public.eventos_key(p_evento)) then
    raise exception 'O arquivo ja foi iniciado com outro evento padrao' using errcode='PT409'; end if;
  with rows as (select value r from jsonb_array_elements(p_linhas)), meaningful as (
    select r from rows where exists(select 1 from jsonb_each_text(r) e where e.key<>'linha' and nullif(btrim(e.value),'') is not null)
  ) insert into public.eventos_leads(importacao_id,linha_origem,nome,telefone,email,curso,escolaridade,nome_responsavel,telefone_responsavel,evento)
    select batch,(r->>'linha')::integer,nullif(btrim(r->>'nome'),''),nullif(btrim(r->>'telefone'),''),nullif(btrim(r->>'email'),''),
      nullif(btrim(r->>'curso'),''),nullif(btrim(r->>'escolaridade'),''),nullif(btrim(r->>'nome_responsavel'),''),
      nullif(btrim(r->>'telefone_responsavel'),''),coalesce(nullif(btrim(r->>'evento'),''),nullif(btrim(p_evento),'')) from meaningful
    on conflict(importacao_id,linha_origem) do nothing;
  get diagnostics inserted=row_count;
  select count(*) into total from public.eventos_leads where importacao_id=batch;
  ignored:=jsonb_array_length(p_linhas)-inserted;
  if inserted>0 then delete from public.eventos_relatorios; end if;
  return jsonb_build_object('importados',inserted,'ignorados',ignored,'total_arquivo',total,'importacao_id',batch);
end $$;

create or replace function public.eventos_atualizar(p_periodo text,p_forcar boolean default false) returns void
language plpgsql security definer set search_path='' set statement_timeout='20s' as $$
declare tab text; kind text; suffix text; source_sql text:=''; missing jsonb:='[]'; stamp timestamptz;
begin
  if not public.eventos_can_access() then raise exception 'Acesso restrito a Lucas e Diego' using errcode='42501'; end if;
  if p_periodo is null or p_periodo not in ('2024.1','2024.2','2025.1','2025.2','2026.1','2026.2','2027.1') then raise exception 'Periodo invalido' using errcode='22023'; end if;
  insert into public.eventos_relatorios(periodo) values(p_periodo) on conflict do nothing;
  select atualizado_em into stamp from public.eventos_relatorios where periodo=p_periodo for update;
  if not coalesce(p_forcar,false) and stamp>now()-interval '24 hours' then return; end if;
  suffix:=replace(p_periodo,'.','');
  foreach kind in array array['inscritos','matriculados'] loop
    tab:=kind||'_'||suffix;
    if to_regclass('public.'||tab) is null then missing:=missing||jsonb_build_array(kind); continue; end if;
    if source_sql<>'' then source_sql:=source_sql||' union all '; end if;
    source_sql:=source_sql||format($q$
      select %L::text kind,public.eventos_cpf(r->>'cpf') cpf,public.eventos_email(r->>'email') email,
        array_remove(array[public.eventos_phone(r->>'telefone'),public.eventos_phone(r->>'contato_principal'),public.eventos_phone(r->>'contato_2'),public.eventos_phone(r->>'celular')],null) phones,
        public.eventos_key(r->>'contrato') contract,public.eventos_key(r->>'tipo_aluno') student_type,nullif(btrim(r->>'curso'),'') course
      from (select to_jsonb(t) r from public.%I t) src
      where regexp_replace(coalesce(r->>%L,''),'[^0-9]','','g')=%L
        and public.eventos_key(coalesce(r->>'nivel_de_ensino',r->>'nivel_ensino')) !~ '(pos ?graduacao|extensao)'
        and public.eventos_key(r->>'processo_seletivo') !~ '(pos ?graduacao|extensao)'
        and not (%L='inscritos' and coalesce(r->>'codcoligada','')='2' and ((%L='20242' and coalesce(r->>'codigo_do_processo','') in ('292','294')) or (%L='20251' and coalesce(r->>'codigo_do_processo','') in ('316','357'))))
    $q$,kind,tab,case when kind='inscritos' then 'ano_semestre' else 'periodo_letivo' end,suffix,kind,suffix,suffix);
  end loop;
  if source_sql='' then source_sql:='select null::text kind,null::text cpf,null::text email,null::text[] phones,null::text contract,null::text student_type,null::text course where false'; end if;
  delete from public.eventos_cruzamentos where periodo=p_periodo;
  execute format($q$
    with raw as materialized (%s), eligible as (
      select cpf from raw where kind='matriculados' and cpf is not null and contract in ('ativo','contrato ativo')
      group by cpf having bool_and(student_type='calouro')
    ), sources as materialized (
      select r.* from raw r where r.cpf is not null and (r.kind='inscritos' or r.contract in ('ativo','contrato ativo') and r.cpf in (select cpf from eligible))
    ), tokens as materialized (
      select distinct cpf,'e:'||email token from sources where email is not null
      union select distinct cpf,'t:'||p from sources cross join lateral unnest(phones) p
    ), matches as (
      select l.id,l.email_chave,l.telefone_chave,
        coalesce(array_agg(distinct t.cpf) filter(where t.token='e:'||l.email_chave),'{}') emails,
        coalesce(array_agg(distinct t.cpf) filter(where t.token='t:'||l.telefone_chave),'{}') phones
      from public.eventos_leads l left join tokens t on t.token in ('e:'||l.email_chave,'t:'||l.telefone_chave)
      group by l.id
    ), candidates as (
      select m.*,case when cardinality(emails)>0 and cardinality(phones)>0 then
        array(select unnest(emails) intersect select unnest(phones))
        when cardinality(emails)>0 then emails else phones end ids
      from matches m
    ), resolved as (
      select c.*,case when cardinality(ids)=1 then ids[1] end resolved_cpf,
        case when email_chave is null and telefone_chave is null then 'sem_identificador'
          when cardinality(emails)>0 and cardinality(phones)>0 and cardinality(ids)=0 then 'conflito'
          when cardinality(ids)>1 then 'ambiguo' when cardinality(ids)=1 then 'identificado' else 'nao_encontrado' end status
      from candidates c
    ) insert into public.eventos_cruzamentos(periodo,lead_id,situacao,cpf,criterio,candidatos,inscrito,matriculado,cursos_inscricao,cursos_matricula)
      select $1,id,status,resolved_cpf,
        case when resolved_cpf is null then null when cardinality(emails)>0 and cardinality(phones)>0 then 'email_telefone' when cardinality(emails)>0 then 'email' else 'telefone' end,
        greatest(cardinality(ids),cardinality(emails),cardinality(phones)),
        exists(select 1 from sources where kind='inscritos' and cpf=resolved_cpf),
        exists(select 1 from sources where kind='matriculados' and cpf=resolved_cpf),
        array(select distinct course from sources where kind='inscritos' and cpf=resolved_cpf and course is not null),
        array(select distinct course from sources where kind='matriculados' and cpf=resolved_cpf and course is not null)
      from resolved
  $q$,source_sql) using p_periodo;
  update public.eventos_relatorios set atualizado_em=now(),fontes_ausentes=missing where periodo=p_periodo;
end $$;

create or replace function public.eventos_painel(p_periodo text default '2027.1',p_forcar boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare cache public.eventos_relatorios; events jsonb;
begin
  if not public.eventos_can_access() then raise exception 'Acesso restrito a Lucas e Diego' using errcode='42501'; end if;
  perform public.eventos_atualizar(p_periodo,p_forcar);
  select * into cache from public.eventos_relatorios where periodo=p_periodo;
  select coalesce(jsonb_agg(to_jsonb(e) order by leads desc,nome),'[]') into events from (
    select l.evento_chave chave,coalesce(min(nullif(l.evento,'')),'Evento não informado') nome,count(*) leads,
      case when cache.fontes_ausentes ? 'inscritos' then null else count(distinct m.cpf) filter(where m.inscrito) end inscritos,
      case when cache.fontes_ausentes ? 'matriculados' then null else count(distinct m.cpf) filter(where m.matriculado) end matriculados,
      count(*) filter(where m.situacao='sem_identificador') sem_identificador,
      count(*) filter(where m.situacao in ('ambiguo','conflito')) revisar,
      count(*) filter(where m.situacao='nao_encontrado') nao_encontrados,
      count(*) filter(where m.situacao='identificado')-count(distinct m.cpf) filter(where m.situacao='identificado') repeticoes_identificadas
    from public.eventos_leads l left join public.eventos_cruzamentos m on m.lead_id=l.id and m.periodo=p_periodo group by l.evento_chave
  ) e;
  return jsonb_build_object('periodo',p_periodo,'atualizado_em',cache.atualizado_em,'fontes_ausentes',cache.fontes_ausentes,'eventos',events);
end $$;

create or replace function public.eventos_listar(p_periodo text,p_evento text,p_situacao text default '',p_pagina integer default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; total bigint; cache public.eventos_relatorios;
begin
  if not public.eventos_can_access() then raise exception 'Acesso restrito a Lucas e Diego' using errcode='42501'; end if;
  if p_pagina is null or p_pagina<0 or p_pagina>10000 or p_situacao is null or p_situacao not in ('','identificado','ambiguo','conflito','sem_identificador','nao_encontrado','inscrito','matriculado') then raise exception 'Filtro invalido' using errcode='22023'; end if;
  perform public.eventos_atualizar(p_periodo,false);
  select * into cache from public.eventos_relatorios where periodo=p_periodo;
  with filtered as materialized (
    select l.id,l.nome,l.telefone,l.email,l.curso,l.escolaridade,l.nome_responsavel,l.telefone_responsavel,l.evento,
      l.linha_origem,l.criado_em,i.arquivo_nome,m.situacao,m.criterio,m.candidatos,m.cursos_inscricao,m.cursos_matricula,
      case when cache.fontes_ausentes ? 'inscritos' then null else m.inscrito end inscrito,
      case when cache.fontes_ausentes ? 'matriculados' then null else m.matriculado end matriculado
    from public.eventos_leads l join public.eventos_importacoes i on i.id=l.importacao_id
      join public.eventos_cruzamentos m on m.lead_id=l.id and m.periodo=p_periodo
    where l.evento_chave=coalesce(p_evento,'') and (p_situacao='' or m.situacao=p_situacao
      or p_situacao='inscrito' and m.inscrito or p_situacao='matriculado' and m.matriculado)
  ), page as (select * from filtered order by criado_em desc,id limit 50 offset p_pagina*50)
  select (select count(*) from filtered),(select coalesce(jsonb_agg(to_jsonb(p) order by criado_em desc,id),'[]') from page p) into total,result;
  return jsonb_build_object('total',total,'linhas',result,'pagina',p_pagina,'fontes_ausentes',cache.fontes_ausentes);
end $$;

-- Prevent PUBLIC/anon from calling helpers that read private source tables.
revoke all on function public.eventos_can_access(),public.eventos_importar(text,text,text,jsonb),public.eventos_atualizar(text,boolean),public.eventos_painel(text,boolean),public.eventos_listar(text,text,text,integer) from public,anon,authenticated;
grant execute on function public.eventos_can_access(),public.eventos_importar(text,text,text,jsonb),public.eventos_atualizar(text,boolean),public.eventos_painel(text,boolean),public.eventos_listar(text,text,text,integer) to authenticated;
commit;
