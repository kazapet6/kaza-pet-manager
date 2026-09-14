-- Diagnóstico somente leitura. Não executado automaticamente nem nesta entrega.
-- Exportar todos os resultados para armazenamento privado, fora do Git.
begin transaction isolation level repeatable read read only;

-- Inventário de todas as tabelas de aplicação, inclusive fora de public.
select n.nspname as schema, c.relname as tabela, c.relkind,
       c.relrowsecurity as rls, c.reltuples::bigint as estimativa_linhas
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where c.relkind in ('r','p') and n.nspname not in ('pg_catalog','information_schema')
  and n.nspname not like 'pg_toast%' order by 1,2;

-- Colunas, nulabilidade, defaults e geração de IDs.
select table_schema, table_name, ordinal_position, column_name, data_type,
       udt_schema, udt_name, is_nullable, column_default, is_identity, is_generated
from information_schema.columns
where table_schema='public' order by table_name,ordinal_position;

-- Todas as constraints que partem de OU chegam à aplicação.
select con.conname, con.contype, con.conrelid::regclass::text as origem,
       nullif(con.confrelid,0)::regclass::text as destino,
       pg_get_constraintdef(con.oid,true) as definicao
from pg_constraint con
where con.connamespace='public'::regnamespace
   or con.confrelid in (select c.oid from pg_class c where c.relnamespace='public'::regnamespace)
order by origem,con.conname;

-- Necessário auditar efeitos de DELETE e INSERT, inclusive triggers append-only.
select t.tgrelid::regclass::text as tabela, t.tgname, t.tgenabled,
       pg_get_triggerdef(t.oid,true) as trigger,
       pg_get_functiondef(t.tgfoid) as funcao
from pg_trigger t
where not t.tgisinternal and t.tgrelid in
  (select c.oid from pg_class c where c.relnamespace='public'::regnamespace)
order by tabela,t.tgname;

select * from pg_policies where schemaname='public' order by tablename,policyname;
select schemaname,tablename,indexname,indexdef from pg_indexes
where schemaname='public' order by tablename,indexname;
select sequence_schema,sequence_name,data_type,start_value,minimum_value,maximum_value,increment
from information_schema.sequences where sequence_schema='public';

-- Somente catálogo de raças: nenhuma informação pessoal de clientes/pets.
select id,especie,nome,ativo from public.racas order by especie,nome;
select raca_id,especie,nome,ativo from public.raca_sinonimos order by especie,nome;
rollback;
