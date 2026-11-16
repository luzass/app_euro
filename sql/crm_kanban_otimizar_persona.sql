-- SQL - Corrigir timeout da persona do CRM, sem recarregar contatos nem alterar fontes.
-- Execute uma vez no SQL Editor do Supabase. Compativel com a versao ja publicada.
begin;

-- Base desidentificada: busca somente o curso solicitado, sem varrer nomes de colunas por linha.
create or replace function public.crm_kanban_persona_course(p_course text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare ps text; q text:=''; missing text[]:='{}'; result jsonb;
begin
  if not public.crm_kanban_can_read(null) then raise exception 'Acesso negado' using errcode='42501'; end if;
  foreach ps in array array['20241','20242','20251','20252','20261','20262'] loop
    if to_regclass('public.matriculados_'||ps) is null then missing:=array_append(missing,ps);
    else q:=q || case when q='' then '' else ' union all ' end || format('select to_jsonb(m) d from public.%I m','matriculados_'||ps); end if;
  end loop;
  if q='' then return jsonb_build_object('rows','[]'::jsonb,'missing',missing); end if;
  execute $q$
    with raw as ($q$ || q || $q$), scoped as materialized (
      select d from raw
      where ($2::text is null or public.crm_kanban_key(d->>'curso')=public.crm_kanban_key($2))
        and public.crm_kanban_key(d->>'contrato') in ('ativo','contratoativo')
        and public.crm_kanban_key(d->>'tipo_aluno')='calouro'
        and public.crm_kanban_key(d->>'nivel_de_ensino') !~ '(posgraduacao|extensao|mestrado|doutorado)'
    ), cleaned as materialized (
      select d, public.crm_kanban_cpf(d->>'cpf') cpf,
        public.crm_kanban_key(d->>'curso') course_key,
        regexp_replace(coalesce(d->>'periodo_letivo',''),'[^0-9]','','g') ps
      from scoped
    ), people as (
      select distinct on (cpf,course_key) * from cleaned
      where cpf is not null and course_key<>'' and ps in ('20241','20242','20251','20252','20261','20262')
      order by cpf,course_key,ps desc,d::text
    ), features as materialized (
      select row_number() over(order by course_key,ps,cpf) rn, d,ps,
        public.crm_kanban_date(d->>'data_de_nascimento') birth,
        public.crm_kanban_date(d->>'data_de_matricula') enrolled
      from people
    )
    select jsonb_build_object('rows',coalesce(jsonb_agg(jsonb_build_object(
      'cpf',lpad(rn::text,11,'0'),'curso',nullif(btrim(d->>'curso'),''),
      'periodo_letivo',left(ps,4)||'.'||right(ps,1),'tipo_aluno','CALOURO','contrato','ATIVO',
      'filial',coalesce(nullif(btrim(d->>'filial'),''),nullif(btrim(d->>'campus'),'')),
      'turno',nullif(btrim(d->>'turno'),''),
      'tipo_de_ingresso',nullif(btrim(d->>'tipo_de_ingresso'),''),
      'idade_matricula',case when birth is not null and enrolled>=birth then extract(year from age(enrolled,birth))::int
        when coalesce(d->>'idade_matricula','') ~ '^[0-9]{1,3}$' then (d->>'idade_matricula')::int end
    ) order by rn),'[]'), 'missing',to_jsonb($1::text[])) from features
  $q$ into result using missing,p_course;
  return result;
end $$;

-- Mantem clientes publicados anteriormente funcionando com a mesma consulta otimizada.
create or replace function public.crm_kanban_persona_rows() returns jsonb
language sql security definer set search_path = '' as $$
  select public.crm_kanban_persona_course(null)
$$;

revoke all on function public.crm_kanban_persona_course(text) from public,anon,authenticated;
revoke all on function public.crm_kanban_persona_rows() from public,anon,authenticated;
grant execute on function public.crm_kanban_persona_course(text),public.crm_kanban_persona_rows() to authenticated;
notify pgrst,'reload schema';
commit;
