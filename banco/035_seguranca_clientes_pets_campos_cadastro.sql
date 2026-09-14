-- Permanente. Aplicação manual posterior; não contém limpeza/importação.
begin;

alter table public.clientes
  add column email text,
  add column cpf text,
  add column cep text,
  add column numero text,
  add column complemento text,
  add column estado text,
  add column data_nascimento date;
-- Texto preserva zeros, pontuação e valores históricos. Sem UNIQUE e sem
-- defaults que inventem conteúdo. Nenhuma alteração dos IDs ou de WhatsApp.

alter table public.clientes enable row level security;
alter table public.pets enable row level security;

-- Policies permissivas são combinadas por OR. Remover todas as policies dessas
-- duas tabelas evita deixar uma policy antiga abrindo acesso por outro nome.
do $$
declare r record; t text; colunas text;
begin
  for r in select schemaname,tablename,policyname from pg_policies
    where schemaname='public' and tablename in ('clientes','pets')
  loop
    execute format('drop policy %I on %I.%I',r.policyname,r.schemaname,r.tablename);
  end loop;
  foreach t in array array['clientes','pets'] loop
    execute format('revoke all on table public.%I from public, anon, authenticated',t);
    -- Revogar também concessões diretas de coluna, se houver.
    select string_agg(format('%I',attname),', ' order by attnum) into colunas
    from pg_attribute where attrelid=format('public.%I',t)::regclass
      and attnum>0 and not attisdropped;
    execute format('revoke select (%s), insert (%s), update (%s), references (%s)
      on table public.%I from public, anon, authenticated',colunas,colunas,colunas,colunas,t);
    execute format('grant select, insert, update on table public.%I to authenticated',t);
    execute format('grant select, insert, update, delete on table public.%I to service_role',t);
    execute format('create policy %I on public.%I as restrictive for all to authenticated
      using ((auth.jwt()->''app_metadata''->>''role'') = ''internal'')
      with check ((auth.jwt()->''app_metadata''->>''role'') = ''internal'')',t||'_internal_guard',t);
    execute format('create policy %I on public.%I for select to authenticated
      using ((auth.jwt()->''app_metadata''->>''role'') = ''internal'')',t||'_select_internal',t);
    execute format('create policy %I on public.%I for insert to authenticated
      with check ((auth.jwt()->''app_metadata''->>''role'') = ''internal'')',t||'_insert_internal',t);
    execute format('create policy %I on public.%I for update to authenticated
      using ((auth.jwt()->''app_metadata''->>''role'') = ''internal'')
      with check ((auth.jwt()->''app_metadata''->>''role'') = ''internal'')',t||'_update_internal',t);
  end loop;
end;
$$;
revoke all on sequence public.clientes_codigo_seq, public.pets_codigo_seq from public, anon;
revoke update on sequence public.clientes_codigo_seq, public.pets_codigo_seq from authenticated;
grant usage, select on sequence public.clientes_codigo_seq, public.pets_codigo_seq to authenticated;
grant usage, select, update on sequence public.clientes_codigo_seq, public.pets_codigo_seq to service_role;
commit;
