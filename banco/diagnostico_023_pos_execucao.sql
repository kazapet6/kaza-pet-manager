-- DIAGNOSTICO SOMENTE LEITURA — REMARCACAO TRANSACIONAL 023
select to_regclass('public.atendimento_remarcacoes') is not null as possui_idempotencia,
  to_regprocedure('public.remarcar_atendimento_transacional(jsonb)') is not null as possui_rpc;

select p.prosecdef as security_definer, p.proconfig,
  has_function_privilege('anon', p.oid, 'execute') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated_execute,
  has_function_privilege('service_role', p.oid, 'execute') as service_role_execute
from pg_proc p where p.oid = to_regprocedure('public.remarcar_atendimento_transacional(jsonb)');

select has_table_privilege('anon','public.atendimento_remarcacoes','select') as anon_select,
  has_table_privilege('authenticated','public.atendimento_remarcacoes','select') as authenticated_select,
  has_table_privilege('service_role','public.atendimento_remarcacoes','select,insert') as service_role_operacional;

select strpos(pg_get_functiondef('public.remarcar_atendimento_transacional(jsonb)'::regprocedure), 'for update') > 0 as possui_lock,
  strpos(pg_get_functiondef('public.remarcar_atendimento_transacional(jsonb)'::regprocedure), 'v_quantidade_grupo = 1') > 0 as trata_grupo_unico,
  strpos(pg_get_functiondef('public.remarcar_atendimento_transacional(jsonb)'::regprocedure), 'delete from public.atendimento_esperas') > 0 as substitui_plano;
