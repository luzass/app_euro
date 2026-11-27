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

## 11. Inteligencia comercial semanal (privada)

A rota `/app/inteligencia-semanal` e exclusiva de `lucasctdebritto@gmail.com`.
O SQL valida a identidade em `auth.users`, nao apenas o e-mail editavel do perfil.

1. Execute `sql/captacao_inteligencia_semanal.sql` no SQL Editor do projeto.
   Ele depende da estrutura atual do CRM, mas nao altera os contatos nem os dados academicos.
2. Nos **Edge Function Secrets** do Supabase, configure `OPENAI_API_KEY`, `OPENAI_MODEL`
   (um modelo disponivel na conta, compativel com Responses e Structured Outputs) e
   `WEEKLY_ALLOWED_ORIGINS=https://app.vestibulareuro.com.br`.
   A chave da OpenAI nunca deve ter prefixo `VITE_`, aparecer no navegador ou entrar no Git.
3. A partir da raiz deste repositorio, com a CLI autenticada e vinculada ao projeto, publique:

```bash
npm run build:weekly-edge
supabase functions deploy weekly-intelligence
```

O empacotamento reutiliza os calculos de campanha e cadencia em `src/lib` e gera `handler.bundle.js` dentro da
pasta da funcao. Assim a publicacao nao depende de imports fora da pasta de Edge Functions.
Nao basta colar apenas `index.ts` no editor on-line. Nenhuma credencial administrativa e usada pela funcao;
ela valida a sessao e chama os RPCs com a identidade do usuario. Mantenha a verificacao de JWT habilitada.

4. Publique o frontend. Capture uma fotografia, confira o conteudo e autorize a geracao.
   Capturar nao chama a OpenAI. Nao ha polling, cron, envio de WhatsApp ou chamada de IA automatica.

Uma fotografia preserva indicadores, cobertura e amostra redigida dos resumos. Fases do CRM refletem a
captura atual; interacoes usam a data informada no atendimento. Historicos academicos sao cargas preservadas,
nao fotografias dos contratos antigos. Calouros usam contrato ativo e data da matricula, nunca baixa do pagamento.
Resumos ficam fora do envio por padrao. O envio inclui no maximo 40 resumos de 600 caracteres e ate 30 compromissos dos ultimos 28 dias.
A remocao automatica de identificadores em texto livre e parcial:
e obrigatorio revisar o conteudo antes de enviar. Nomes conhecidos, telefones, CPFs, e-mails e links sao redigidos;
outros dados pessoais ou sensiveis precisam ser removidos na origem antes de capturar novamente.

O envio usa a Responses API com `store: false` e JSON Schema. Isso nao equivale a uma garantia de retencao zero
do provedor; confira as politicas da conta. Uma fotografia so recebe um diagnostico concluido, e o banco limita
a dez tentativas em 24 horas. Falhas nao geram relatorios ficticios nem repeticoes pagas automaticas.
Sugestoes precisam de evidencias existentes e aprovacao antes de virar compromissos. As revisoes do plano
preservam a base numerica original e um historico de alteracoes; variacoes nao comprovam causalidade.

Documentacao oficial: [Responses](https://developers.openai.com/api/reference/resources/responses/methods/create),
[Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs),
[secrets de Edge Functions](https://supabase.com/docs/guides/functions/secrets).

Testes locais, sem chamadas pagas:

```bash
node tools/test-weekly-intelligence.mjs
node tools/test-weekly-handler.mjs
node tools/test-weekly-sql.mjs CAMINHO_DO_PGLITE
node tools/verify-weekly-intelligence.mjs DIRETORIO_DOS_PACOTES_PLAYWRIGHT
```
