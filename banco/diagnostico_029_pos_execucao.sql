-- DIAGNOSTICO SOMENTE LEITURA — VENDA AUTORITATIVA DE CONTRATOS 029
select to_regclass('public.contrato_operacoes_idempotentes') is not null as idempotencia;
select column_name,data_type,is_nullable from information_schema.columns where table_schema='public' and table_name='contrato_itens' and column_name='preco_avulso_base_unitario_snapshot';
select proname,prosecdef,proconfig from pg_proc where oid=to_regprocedure('public.vender_contrato(jsonb)');
select has_function_privilege('authenticated','public.vender_contrato(jsonb)','execute') authenticated_rpc,
 has_function_privilege('service_role','public.vender_contrato(jsonb)','execute') service_role_rpc;
select has_table_privilege('authenticated','public.contrato_operacoes_idempotentes','select,insert,update') authenticated_operacoes,
 has_table_privilege('service_role','public.contrato_operacoes_idempotentes','select,insert,update') service_role_operacoes;
select count(*) contratos from public.contratos;
