alter table public.matriculados_20262
add column if not exists vendedor text;

alter table public.matriculados_20262
drop constraint if exists matriculados_20262_vendedor_check;

alter table public.matriculados_20262
add constraint matriculados_20262_vendedor_check
check (
  vendedor is null
  or vendedor in ('Tony', 'William', 'Gustavo', 'Jordana')
);
