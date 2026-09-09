-- DIAGNOSTICO SOMENTE LEITURA — COMPOSICAO E PRECIFICACAO DE PACOTES 027
select to_regclass('public.unidades_periodo') is not null as unidades,
  to_regclass('public.pacote_servicos') is not null as itens,
  to_regclass('public.pacote_servico_regras_preco') is not null as regras,
  to_regclass('public.pacote_operacoes_idempotentes') is not null as idempotencia;

select codigo,nome,natureza,ordem,ativo from public.unidades_periodo order by ordem;

select column_name,data_type,is_nullable,is_generated,generation_expression
from information_schema.columns
where table_schema='public' and table_name in ('pacotes','pacote_servicos','pacote_servico_regras_preco')
order by table_name,ordinal_position;

select policyname,tablename,cmd,roles,qual,with_check from pg_policies
where schemaname='public' and tablename in ('unidades_periodo','pacote_servicos','pacote_servico_regras_preco')
order by tablename,policyname;

select proname,prosecdef,proconfig from pg_proc
where oid=to_regprocedure('public.salvar_pacote_completo(jsonb)');

select
  has_table_privilege('anon','public.pacote_servicos','select') anon_select,
  has_table_privilege('authenticated','public.pacote_servicos','select') authenticated_select,
  has_table_privilege('authenticated','public.pacote_servicos','insert,update,delete') authenticated_write,
  has_table_privilege('service_role','public.pacote_servicos','select,insert,update,delete') service_role_operacional,
  has_function_privilege('authenticated','public.salvar_pacote_completo(jsonb)','execute') authenticated_rpc,
  has_function_privilege('service_role','public.salvar_pacote_completo(jsonb)','execute') service_role_rpc;

select count(*) filter (where ativo) as pacotes_ativos,
  count(*) filter (where tipo is not null) as pacotes_com_tipo_legado
from public.pacotes;
