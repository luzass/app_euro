-- Execute se a migracao de eventos ja foi aplicada com o email anterior.
-- Preserva os dados e restringe o acesso aos dois logins confirmados.
begin;
create or replace function public.eventos_can_access() returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from auth.users u where u.id=auth.uid()
    and lower(u.email) in ('lucasctdebritto@gmail.com','diego.eger@unieuro.edu.br'))
$$;
revoke all on function public.eventos_can_access() from public,anon,authenticated;
grant execute on function public.eventos_can_access() to authenticated;
commit;
