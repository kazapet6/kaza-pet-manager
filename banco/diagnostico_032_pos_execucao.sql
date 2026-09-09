-- DIAGNÓSTICO SOMENTE LEITURA — CICLO DE VIDA DOS CRÉDITOS 032
select
  to_regclass('public.atendimento_status_eventos') is not null as eventos_status,
  to_regclass('public.contrato_credito_eventos') is not null as eventos_credito,
  to_regclass('public.contrato_credito_operacoes_idempotentes') is not null as idempotencia;

select table_name,column_name,data_type,is_nullable,column_default
from information_schema.columns
where table_schema='public' and (
  (table_name='contrato_ciclo_ocorrencia_itens' and column_name like 'estado_comercial%')
  or (table_name='contrato_ciclos' and column_name in ('encerramento_pendente','versao_creditos'))
)
order by table_name,column_name;

select c.conrelid::regclass as tabela,c.conname,pg_get_constraintdef(c.oid) as definicao
from pg_constraint c
where c.connamespace='public'::regnamespace
  and c.conrelid in ('public.contrato_ciclos'::regclass,
    'public.contrato_ciclo_ocorrencias'::regclass,
    'public.contrato_ciclo_ocorrencia_itens'::regclass,
    'public.atendimento_status_eventos'::regclass,
    'public.contrato_credito_eventos'::regclass)
order by c.conrelid::regclass::text,c.conname;

select event_object_table,trigger_name,action_timing,event_manipulation
from information_schema.triggers
where event_object_schema='public' and trigger_name in (
  'atendimentos_sincronizar_creditos_032',
  'atendimento_status_eventos_append_only_032',
  'contrato_credito_eventos_append_only_032',
  'contrato_credito_inicializar_032'
)
order by event_object_table,trigger_name,event_manipulation;

select p.proname,p.prosecdef,p.proconfig
from pg_proc p
where p.oid in (
  to_regprocedure('public.alterar_status_atendimento_com_creditos(jsonb)'),
  to_regprocedure('public.reverter_conclusao_atendimento(jsonb)'),
  to_regprocedure('public.decidir_credito_contrato(jsonb)'),
  to_regprocedure('public.recalcular_encerramento_ciclo_032(uuid,uuid)')
)
order by p.proname;

select
  has_table_privilege('anon','public.contrato_credito_eventos','select') as anon_eventos_select,
  has_table_privilege('authenticated','public.contrato_credito_eventos','select') as authenticated_eventos_select,
  has_table_privilege('authenticated','public.contrato_credito_eventos','insert,update,delete') as authenticated_eventos_write,
  has_table_privilege('service_role','public.contrato_credito_eventos','select,insert') as service_role_eventos,
  has_function_privilege('authenticated','public.decidir_credito_contrato(jsonb)','execute') as authenticated_rpc,
  has_function_privilege('service_role','public.decidir_credito_contrato(jsonb)','execute') as service_role_rpc;

select estado_comercial,count(*) as quantidade
from public.contrato_ciclo_ocorrencia_itens
group by estado_comercial
order by estado_comercial;

-- Evidencia que conclusões anteriores à 032 não foram convertidas silenciosamente.
select
  count(*) filter (where a.status='concluido') as atendimentos_concluidos_vinculados,
  count(*) filter (where a.status='concluido' and i.estado_comercial='revisao_legado') as creditos_em_revisao_legado,
  count(*) filter (where e.tipo='credito_revisao_legado') as eventos_revisao_legado
from public.contrato_ciclo_ocorrencia_itens i
join public.contrato_ciclo_ocorrencias o on o.id=i.ocorrencia_id
left join public.atendimentos a on a.id=o.atendimento_id
left join public.contrato_credito_eventos e
  on e.ocorrencia_id=i.ocorrencia_id and e.contrato_item_id=i.contrato_item_id
  and e.tipo='credito_revisao_legado';

-- Deve retornar zero em todas as linhas.
select verificacao,quantidade
from (
  select 'credito_sem_evento_inicial'::text as verificacao,count(*)::bigint as quantidade
  from public.contrato_ciclo_ocorrencia_itens i
  where not exists(select 1 from public.contrato_credito_eventos e
    where e.ocorrencia_id=i.ocorrencia_id and e.contrato_item_id=i.contrato_item_id)
  union all
  select 'concluido_sem_baixa_ou_revisao_legado',count(*)::bigint
  from public.contrato_ciclo_ocorrencia_itens i
  join public.contrato_ciclo_ocorrencias o on o.id=i.ocorrencia_id
  join public.atendimentos a on a.id=o.atendimento_id
  where a.status='concluido' and i.estado_comercial not in ('consumido','revisao_legado')
  union all
  select 'consumido_com_atendimento_nao_concluido',count(*)::bigint
  from public.contrato_ciclo_ocorrencia_itens i
  join public.contrato_ciclo_ocorrencias o on o.id=i.ocorrencia_id
  left join public.atendimentos a on a.id=o.atendimento_id
  where i.estado_comercial='consumido' and a.status is distinct from 'concluido'
  union all
  select 'falta_sem_destino_comercial_valido',count(*)::bigint
  from public.contrato_ciclo_ocorrencia_itens i
  join public.contrato_ciclo_ocorrencias o on o.id=i.ocorrencia_id
  join public.atendimentos a on a.id=o.atendimento_id
  where a.status='faltou' and i.estado_comercial not in ('aguardando_decisao','perdido','disponivel')
  union all
  select 'ciclo_concluido_com_saldo_sem_pendencia',count(*)::bigint
  from public.contrato_ciclos c
  where c.estado='concluido' and not c.encerramento_pendente and exists(
    select 1 from public.contrato_ciclo_ocorrencia_itens i
    where i.ciclo_id=c.id and i.estado_comercial not in ('consumido','perdido'))
  union all
  select 'item_com_ciclo_divergente_da_ocorrencia',count(*)::bigint
  from public.contrato_ciclo_ocorrencia_itens i
  join public.contrato_ciclo_ocorrencias o on o.id=i.ocorrencia_id
  where i.ciclo_id<>o.ciclo_id
) diagnostico
order by verificacao;

select c.id as ciclo_id,c.contrato_id,c.numero,c.estado,c.encerramento_pendente,
  count(i.ocorrencia_id) as contratados,
  count(*) filter(where i.estado_comercial='consumido') as consumidos,
  count(*) filter(where i.estado_comercial='perdido') as perdidos,
  count(*) filter(where i.estado_comercial in ('reservado','disponivel')) as disponiveis,
  count(*) filter(where i.estado_comercial in ('aguardando_decisao','revisao_legado')) as pendentes
from public.contrato_ciclos c
left join public.contrato_ciclo_ocorrencia_itens i on i.ciclo_id=c.id
group by c.id,c.contrato_id,c.numero,c.estado,c.encerramento_pendente
order by c.contrato_id,c.numero desc;
