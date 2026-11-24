-- HOTFIX: conflitos de versao do CRM devem retornar HTTP 409, nao SQLSTATE 40001.
-- Executar no SQL Editor / Database, depois das migracoes ja instaladas.
-- Corrige somente o codigo do erro nas oito RPCs conhecidas, preservando a versao
-- instalada, assinaturas, mensagens, controle de concorrencia e permissoes.
-- Nao altera cadastros, nao cancela sessoes e nao reseta estatisticas.
-- Referencia: Supabase KB / high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b
begin;
set local lock_timeout = '2s';
set local statement_timeout = '20s';

do $$
declare
  signature text;
  target oid;
  definition text;
  corrected text;
begin
  if to_regprocedure('public.crm_kanban_save(uuid,jsonb,integer)') is null then
    raise exception 'A estrutura do CRM nao foi encontrada neste banco. Confira o projeto.';
  end if;
  foreach signature in array array[
    'public.crm_kanban_save(uuid,jsonb,integer)',
    'public.crm_kanban_activity_v2(uuid,text,text,timestamptz,uuid,text,text,timestamptz)',
    'public.crm_kanban_resume_cadence(uuid,integer)',
    'public.crm_kanban_reason_save(uuid,text,boolean,boolean,integer)',
    'public.crm_kanban_close_loss(uuid,integer,uuid,text,text)',
    'public.crm_kanban_reopen_loss(uuid,integer,text)',
    'public.crm_kanban_document_save(uuid,uuid,text,text,timestamptz,timestamptz,text,text,integer,text)',
    'public.crm_kanban_document_cancel(uuid,integer,text)'
  ] loop
    target := to_regprocedure(signature);
    if target is null then continue; end if;
    definition := pg_get_functiondef(target);
    corrected := regexp_replace(definition,
      $pattern$(errcode[[:space:]]*=[[:space:]]*)'40001'$pattern$,
      $replacement$\1'PT409'$replacement$, 'gi');
    if corrected <> definition then execute corrected; end if;
    if (select prosrc from pg_proc where oid=target) ~* $pattern$errcode[[:space:]]*=[[:space:]]*'40001'$pattern$ then
      raise exception 'A correcao nao foi concluida para %. Transacao revertida.', signature;
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';

select p.oid::regprocedure::text as funcao,
  p.prosrc ~* $pattern$errcode[[:space:]]*=[[:space:]]*'40001'$pattern$ as erro_40001_ainda_presente,
  p.prosrc ~* $pattern$errcode[[:space:]]*=[[:space:]]*'PT409'$pattern$ as conflito_http_409
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in (
  'crm_kanban_save','crm_kanban_activity_v2','crm_kanban_resume_cadence',
  'crm_kanban_reason_save','crm_kanban_close_loss','crm_kanban_reopen_loss',
  'crm_kanban_document_save','crm_kanban_document_cancel'
)
order by p.proname;

commit;
