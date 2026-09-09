-- DIAGNOSTICO SOMENTE LEITURA — CONCLUSAO GUIADA 025
select to_regclass('public.atendimento_financeiro') is not null as financeiro,
  to_regclass('public.atendimento_recebimentos') is not null as recebimentos,
  to_regclass('public.atendimento_recomendacoes_retorno') is not null as retornos;
select proname, prosecdef, proconfig from pg_proc where oid in (
  to_regprocedure('public.registrar_recebimento_atendimento(jsonb)'),
  to_regprocedure('public.definir_isencao_atendimento(jsonb)'),
  to_regprocedure('public.salvar_retornos_atendimento(jsonb)')) order by proname;
select has_table_privilege('anon','public.atendimento_recebimentos','select') anon_select,
 has_table_privilege('authenticated','public.atendimento_recebimentos','insert') authenticated_insert,
 has_table_privilege('service_role','public.atendimento_recebimentos','select,insert') service_role_operacional;
