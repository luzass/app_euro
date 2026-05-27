# Dashboard Interno

App web moderno criado com React, Vite, TypeScript, Tailwind CSS, Supabase, Recharts e React Router.

## Stack

- React + Vite + TypeScript
- Tailwind CSS
- Supabase Auth + tabela `profiles`
- Recharts
- Lucide React

## Estrutura do projeto

```text
src/
  lib/
    calculations.ts
    formatters.ts
    navigation.ts
    supabase.ts
    types.ts
    utils.ts
  hooks/
    useAuth.ts
    useProfile.ts
  components/
    Layout/
      Header.tsx
      ProtectedLayout.tsx
      Sidebar.tsx
    UI/
      EmptyState.tsx
      KpiCard.tsx
      Loading.tsx
  pages/
    CriarUsuario.tsx
    DashboardEuro.tsx
    Login.tsx
    NotFound.tsx
    TrafegoPagoSpike.tsx
  routes/
    AppRoutes.tsx
  App.tsx
  main.tsx
  index.css
supabase/
  functions/
    create-user/
      index.ts
  profiles.sql
```

## 1. Instalar dependencias

Abra a pasta do projeto no VS Code:

```bash
cd dashboard-app
```

Depois instale tudo:

```bash
npm install
```

Se o npm reaproveitar dependencias quebradas, faca uma instalacao limpa:

```bash
Remove-Item -Recurse -Force node_modules
Remove-Item -Force package-lock.json
npm install
```

## 2. Criar o `.env`

Copie o arquivo de exemplo:

```bash
cp .env.example .env
```

Preencha com os dados do seu projeto Supabase:

```env
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-anon
```

## 3. Rodar localmente

```bash
npm run dev
```

Depois abra a URL mostrada no terminal, normalmente:

```text
http://localhost:5173
```

## 4. Configurar Supabase

Voce precisa ter:

- Auth com login por e-mail e senha habilitado
- Usuarios cadastrados no Supabase Auth
- Tabela `profiles` criada
- Tabela `campanha_euro_20262` com dados publicados

O app faz:

- login com `signInWithPassword`
- leitura do perfil do usuario em `profiles`
- leitura da campanha em `campanha_euro_20262`

## 5. Criar tabela `profiles`

Use o SQL abaixo no Supabase SQL Editor, ou rode o arquivo [supabase/profiles.sql](/C:/Users/Lucas/Documents/App/dashboard-app/supabase/profiles.sql):

```sql
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null,
  email text not null unique,
  role text not null default 'captacao' check (role in ('admin', 'reitoria', 'spike', 'captacao', 'funcionario')),
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
on public.profiles
for select
to authenticated
using (auth.uid() = id);
```

## 6. Tabela `campanha_euro_20262`

O dashboard espera uma tabela com estas colunas:

- `client_id`
- `valor_usado`
- `impressoes`
- `alcance`
- `frequencia`
- `cpm`
- `cliques_no_link`
- `cpc`
- `ctr`
- `lp_views`
- `cplpv`
- `connect_rate`
- `mensagens`
- `custo_por_mensagem`
- `contatos`
- `custo_por_contato`
- `lead`
- `custo_por_lead`
- `seguidores`
- `custo_por_seguidor`
- `data_inicio`
- `data_fim`
- `id`

Mesmo que alguns campos estejam salvos como texto, o frontend converte os valores antes de consolidar os KPIs.

## 7. Roles e permissoes

Hoje o menu esta assim:

- `admin`: Trafego Pago - Spike, Dashboard - Euro, Criar Usuario
- `reitoria`: Trafego Pago - Spike e Dashboard - Euro
- `spike`: Trafego Pago - Spike
- `captacao`: Dashboard - Euro
- `funcionario`: Dashboard - Euro (legado)

Esse controle esta centralizado em [src/lib/navigation.ts](/C:/Users/Lucas/Documents/App/dashboard-app/src/lib/navigation.ts).

## 8. Criar Usuario com Edge Function

A tela [CriarUsuario.tsx](/C:/Users/Lucas/Documents/App/dashboard-app/src/pages/CriarUsuario.tsx) chama a Edge Function `create-user`, que:

- valida se o usuario atual e `admin`
- cria o novo acesso no `auth.users`
- grava o perfil na tabela `profiles`

O codigo da function esta em [supabase/functions/create-user/index.ts](/C:/Users/Lucas/Documents/App/dashboard-app/supabase/functions/create-user/index.ts).

### Publicar a Edge Function

1. Instale e autentique a CLI do Supabase.
2. Vincule o projeto:

```bash
supabase link --project-ref SEU_PROJECT_REF
```

3. Garanta o secret usado para validar a sessao:

```bash
supabase secrets set SUPABASE_ANON_KEY=sua-chave-anon
```

4. Publique a function:

```bash
supabase functions deploy create-user
```

Depois disso, a tela de criacao de usuario passa a funcionar de verdade no frontend.

## 9. Deploy na Vercel

1. Suba o projeto para um repositorio Git.
2. Importe o repositorio na Vercel.
3. Configure as variaveis:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy.

As configuracoes padrao do Vite ja sao compativeis com a Vercel.

## 10. O que ja esta pronto

- Login com Supabase Auth
- Layout protegido com sidebar responsiva
- Exibicao de nome, e-mail e role no menu lateral
- Controle de acesso por role
- Redirecionamento inicial por perfil
- Dashboard Trafego Pago - Spike integrado ao Supabase
- KPIs consolidados com recalculo de metricas
- Filtros por data
- Graficos com Recharts
- Tabela detalhada
- Dashboard - Euro com abas e comparativos
- Pagina Criar Usuario integrada a Edge Function segura
