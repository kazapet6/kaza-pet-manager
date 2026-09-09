-- DIAGNÓSTICO SOMENTE LEITURA — MATERIALIZAÇÃO DE CICLOS 031
select
  to_regprocedure('public.materializar_ciclo_contrato(uuid,uuid,jsonb)') is not null as rpc_materializacao,
  to_regclass('public.contrato_ocorrencia_atendimento_unico_031_idx') is not null as indice_atendimento_unico;

select proname,prosecdef,proconfig
from pg_proc
where oid=to_regprocedure('public.materializar_ciclo_contrato(uuid,uuid,jsonb)');

select
  has_function_privilege('anon','public.materializar_ciclo_contrato(uuid,uuid,jsonb)','execute') as anon_executa,
  has_function_privilege('authenticated','public.materializar_ciclo_contrato(uuid,uuid,jsonb)','execute') as authenticated_executa,
  has_function_privilege('service_role','public.materializar_ciclo_contrato(uuid,uuid,jsonb)','execute') as service_role_executa;

select indexname,indexdef
from pg_indexes
where schemaname='public' and tablename='contrato_ciclo_ocorrencias'
  and indexname='contrato_ocorrencia_atendimento_unico_031_idx';

select
  count(*) filter(where estado='reservada' and atendimento_id is null) as reservas_virtuais,
  count(*) filter(where estado in('materializada','concluida') and atendimento_id is not null) as ocorrencias_vinculadas,
  count(*) filter(where
    (estado='reservada' and (atendimento_id is not null or materializada_em is not null))
    or (estado in('materializada','concluida') and (atendimento_id is null or materializada_em is null))
  ) as estados_incoerentes
from public.contrato_ciclo_ocorrencias;

select atendimento_id,count(*) as quantidade
from public.contrato_ciclo_ocorrencias
where atendimento_id is not null
group by atendimento_id having count(*)>1;

select o.id as ocorrencia_id,o.ciclo_id,o.atendimento_id
from public.contrato_ciclo_ocorrencias o
left join public.atendimentos a on a.id=o.atendimento_id
where o.atendimento_id is not null and a.id is null;
