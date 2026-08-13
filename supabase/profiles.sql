create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null,
  email text not null unique,
  role text not null default 'captacao' check (
    role in (
      'admin',
      'reitoria',
      'coordenador',
      'spike',
      'captacao',
      'captacao_gerente',
      'funcionario'
    )
  ),
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
on public.profiles
for select
to authenticated
using (auth.uid() = id);
