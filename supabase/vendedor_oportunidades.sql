create table if not exists public.vendedor_oportunidades (
  id uuid primary key default gen_random_uuid(),
  vendedor text not null check (vendedor in ('Agestone', 'William', 'Gustavo', 'Jordana')),
  nome text not null,
  curso text null,
  forma_ingresso text null,
  campus text null,
  temperatura text not null default 'Frio' check (temperatura in ('Frio', 'Morno', 'Quente')),
  proximo_passo text null,
  data_acao date null,
  historico jsonb not null default '[]'::jsonb,
  created_by uuid null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_vendedor_oportunidades_vendedor
  on public.vendedor_oportunidades (vendedor);

create index if not exists idx_vendedor_oportunidades_temperatura
  on public.vendedor_oportunidades (temperatura);

create index if not exists idx_vendedor_oportunidades_data_acao
  on public.vendedor_oportunidades (data_acao);

create or replace function public.touch_vendedor_oportunidades_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_vendedor_oportunidades_updated_at on public.vendedor_oportunidades;
create trigger trg_touch_vendedor_oportunidades_updated_at
before update on public.vendedor_oportunidades
for each row
execute function public.touch_vendedor_oportunidades_updated_at();

alter table public.vendedor_oportunidades enable row level security;

drop policy if exists "vendedor_oportunidades_select_authenticated" on public.vendedor_oportunidades;
create policy "vendedor_oportunidades_select_authenticated"
on public.vendedor_oportunidades
for select
to authenticated
using (true);

drop policy if exists "vendedor_oportunidades_insert_authenticated" on public.vendedor_oportunidades;
create policy "vendedor_oportunidades_insert_authenticated"
on public.vendedor_oportunidades
for insert
to authenticated
with check (true);

drop policy if exists "vendedor_oportunidades_update_authenticated" on public.vendedor_oportunidades;
create policy "vendedor_oportunidades_update_authenticated"
on public.vendedor_oportunidades
for update
to authenticated
using (true)
with check (true);
