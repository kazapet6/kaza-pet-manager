-- DIAGNOSTICO SOMENTE LEITURA — OBSERVACOES DO ATENDIMENTO 024
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'atendimentos'
  and column_name in ('observacao_operacional', 'observacoes_versao')
order by ordinal_position;

select to_regclass('public.atendimento_ocorrencias') is not null as possui_ocorrencias,
  to_regprocedure('public.salvar_observacoes_atendimento(jsonb)') is not null as possui_rpc;

select p.prosecdef as security_definer, p.proconfig,
  has_function_privilege('anon', p.oid, 'execute') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated_execute,
  has_function_privilege('service_role', p.oid, 'execute') as service_role_execute
from pg_proc p
where p.oid = to_regprocedure('public.salvar_observacoes_atendimento(jsonb)');

select has_table_privilege('anon','public.atendimento_ocorrencias','select') as anon_select,
  has_table_privilege('authenticated','public.atendimento_ocorrencias','select') as authenticated_select,
  has_table_privilege('service_role','public.atendimento_ocorrencias','select,insert,delete') as service_role_operacional;
