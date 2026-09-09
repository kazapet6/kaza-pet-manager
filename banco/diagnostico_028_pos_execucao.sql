-- DIAGNOSTICO SOMENTE LEITURA — CONTRATOS E SNAPSHOTS COMERCIAIS 028
select to_regclass('public.contratos') is not null as contratos,
  to_regclass('public.contrato_itens') is not null as itens,
  to_regclass('public.contrato_item_regras_aplicadas') is not null as regras_aplicadas,
  to_regclass('public.contrato_eventos') is not null as eventos;

select table_name,column_name,data_type,is_nullable,is_generated,generation_expression
from information_schema.columns
where table_schema='public' and table_name in (
  'contratos','contrato_itens','contrato_item_regras_aplicadas','contrato_eventos'
)
order by table_name,ordinal_position;

select indexname,indexdef from pg_indexes
where schemaname='public' and tablename in (
  'contratos','contrato_itens','contrato_item_regras_aplicadas','contrato_eventos'
)
order by tablename,indexname;

select policyname,tablename,cmd,roles,qual,with_check from pg_policies
where schemaname='public' and tablename in (
  'contratos','contrato_itens','contrato_item_regras_aplicadas','contrato_eventos'
)
order by tablename,policyname;

select trigger_name,event_object_table,action_timing,event_manipulation
from information_schema.triggers
where event_object_schema='public' and event_object_table in (
  'contratos','contrato_itens','contrato_item_regras_aplicadas','contrato_eventos'
)
order by event_object_table,trigger_name,event_manipulation;

select
  has_table_privilege('anon','public.contratos','select') as anon_select,
  has_table_privilege('authenticated','public.contratos','select') as authenticated_select,
  has_table_privilege('authenticated','public.contratos','insert,update,delete') as authenticated_write,
  has_table_privilege('service_role','public.contratos','select,insert,update') as service_role_contratos,
  has_table_privilege('service_role','public.contrato_itens','select,insert') as service_role_itens,
  has_table_privilege('service_role','public.contrato_itens','update,delete') as service_role_muta_itens;

select count(*) as contratos_existentes from public.contratos;
