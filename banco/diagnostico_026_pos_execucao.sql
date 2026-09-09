-- DIAGNÓSTICO SOMENTE LEITURA — CATÁLOGO DE PACOTES 026
select to_regclass('public.pacotes') is not null as pacotes;

select column_name, data_type, is_nullable, is_generated, generation_expression
from information_schema.columns
where table_schema = 'public' and table_name = 'pacotes'
order by ordinal_position;

select indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename = 'pacotes'
order by indexname;

select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'pacotes'
order by policyname;

select
  has_table_privilege('anon', 'public.pacotes', 'select') as anon_select,
  has_table_privilege('authenticated', 'public.pacotes', 'select') as authenticated_select,
  has_table_privilege('authenticated', 'public.pacotes', 'insert,update') as authenticated_write,
  has_table_privilege('service_role', 'public.pacotes', 'select,insert,update') as service_role_operacional;

select trigger_name, action_timing, event_manipulation
from information_schema.triggers
where event_object_schema = 'public' and event_object_table = 'pacotes'
order by trigger_name;
