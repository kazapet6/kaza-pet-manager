-- DIAGNÓSTICO SOMENTE LEITURA — ANTES DE REEXECUTAR A MIGRATION 030
-- Execute o arquivo inteiro antes da nova tentativa. Nenhuma consulta escreve.

-- 1. Contratos e combinações hoje existentes. A 029 admite especialmente
-- taxidog + NULL. to_jsonb permite inspecionar a coluna opcional da 030 sem
-- falhar quando ela não existe.
select modalidade_transporte,
  taxidog_ciclo_id is null as ciclo_taxidog_ausente,
  count(*) as contratos
from public.contratos
group by modalidade_transporte,taxidog_ciclo_id is null
order by modalidade_transporte,ciclo_taxidog_ausente;

select c.id,c.created_at,c.cliente_id,c.pet_id,c.modalidade_transporte,c.taxidog_ciclo_id,
 nullif(to_jsonb(c)->>'modelo_operacional_versao','') as modelo_operacional_versao,
 c.data_ancora,c.dia_semana_fixo,c.horario_fixo
from public.contratos c
where not (
 (c.modalidade_transporte='sem_transporte' and c.taxidog_ciclo_id is null)
 or (c.modalidade_transporte='taxidog' and c.taxidog_ciclo_id is not null)
)
order by c.created_at,c.id;

select count(*) as contratos_total,
 count(*) filter(where nullif(to_jsonb(c)->>'modelo_operacional_versao','') is null) as sem_versao_030,
 count(*) filter(where nullif(to_jsonb(c)->>'modelo_operacional_versao','')='30') as com_versao_030,
 count(*) filter(where not (
   (c.modalidade_transporte='sem_transporte' and c.taxidog_ciclo_id is null)
   or (c.modalidade_transporte='taxidog' and c.taxidog_ciclo_id is not null)
 )) as violariam_regra_estrita_030
from public.contratos c;

-- 2. Inventário para comprovar rollback ou detectar estado parcial inesperado.
select to_regclass('public.contrato_ciclos') as contrato_ciclos,
 to_regclass('public.contrato_ciclo_ocorrencias') as contrato_ciclo_ocorrencias,
 to_regclass('public.contrato_ciclo_ocorrencia_itens') as contrato_ciclo_ocorrencia_itens;

with esperadas(table_name,column_name) as (values
 ('pacote_servicos','desconto_percentual'),
 ('contrato_itens','desconto_percentual_snapshot'),
 ('contratos','modelo_operacional_versao')
)
select e.table_name,e.column_name,(c.column_name is not null) as presente,
 c.data_type,c.is_nullable,c.column_default
from esperadas e
left join information_schema.columns c
 on c.table_schema='public' and c.table_name=e.table_name and c.column_name=e.column_name
order by e.table_name,e.column_name;

select conrelid::regclass as tabela,conname,convalidated,
 pg_get_constraintdef(oid) as definicao
from pg_constraint
where connamespace='public'::regnamespace
 and (conname like '%_030_%' or conrelid in(
   coalesce(to_regclass('public.contrato_ciclos')::oid,0::oid),
   coalesce(to_regclass('public.contrato_ciclo_ocorrencias')::oid,0::oid),
   coalesce(to_regclass('public.contrato_ciclo_ocorrencia_itens')::oid,0::oid)
 ))
order by (conrelid::regclass)::text,conname;

with esperadas(tabela,conname) as (values
 ('contratos','contratos_modalidade_taxidog_030_check')
)
select e.tabela,e.conname,(c.oid is not null) as presente,
 c.convalidated,case when c.oid is null then null else pg_get_constraintdef(c.oid) end as definicao
from esperadas e
left join pg_constraint c
 on c.connamespace='public'::regnamespace
 and c.conrelid=to_regclass('public.'||e.tabela)
 and c.conname=e.conname
order by e.tabela,e.conname;

with esperados(trigger_name) as (values
 ('contratos_validar_modelo_operacional'),
 ('contrato_itens_validar_desconto_030'),
 ('contrato_ocorrencia_item_validar')
)
select e.trigger_name,(t.trigger_name is not null) as presente,
 t.event_object_table,t.action_timing,t.event_manipulation
from esperados e
left join information_schema.triggers t
 on t.event_object_schema='public' and t.trigger_name=e.trigger_name
order by e.trigger_name,t.event_manipulation;

with esperadas(assinatura) as (values
 ('public.renovar_ciclo_contrato(jsonb)'),
 ('public.vincular_ocorrencia_ciclo_atendimento(uuid,uuid)'),
 ('public.validar_modelo_operacional_contrato()'),
 ('public.validar_desconto_snapshot_contrato_030()')
)
select assinatura,to_regprocedure(assinatura) is not null as presente
from esperadas
order by assinatura;

-- RPCs que já existiam antes também são classificadas pela implementação,
-- evitando confundir a versão 029 com a substituição prevista pela 030.
select 'public.vender_contrato(jsonb)' as assinatura,
 to_regprocedure('public.vender_contrato(jsonb)') is not null as presente,
 coalesce(position('modelo_operacional_versao' in
   pg_get_functiondef(to_regprocedure('public.vender_contrato(jsonb)'))) > 0,false) as implementacao_030
union all
select 'public.salvar_pacote_completo(jsonb)',
 to_regprocedure('public.salvar_pacote_completo(jsonb)') is not null,
 coalesce(position('desconto_percentual' in
   pg_get_functiondef(to_regprocedure('public.salvar_pacote_completo(jsonb)'))) > 0,false);

-- 3. Dependências que precisam existir antes da criação das estruturas 030.
select to_regclass('public.contratos') as contratos,
 to_regclass('public.contrato_itens') as contrato_itens,
 to_regclass('public.taxidog_ciclos') as taxidog_ciclos,
 to_regclass('public.atendimentos') as atendimentos,
 to_regclass('public.agenda_versao_ocupacao') as agenda_versao_ocupacao,
 to_regclass('public.agenda_versao_configuracao') as agenda_versao_configuracao;

select dependencia,to_regclass('public.'||dependencia) is not null as presente
from (values
 ('contratos'),('contrato_itens'),('taxidog_ciclos'),('atendimentos'),
 ('agenda_versao_ocupacao'),('agenda_versao_configuracao')
) as d(dependencia)
order by dependencia;

-- 4. Impacto comercial deliberado: estes Pacotes serão desativados, sem que
-- preços absolutos legados sejam convertidos silenciosamente em percentual.
select p.id,p.nome,p.ativo,
 count(*) filter(
   where ps.ativo and nullif(to_jsonb(ps)->>'desconto_percentual','') is null
 ) as itens_ativos_sem_percentual
from public.pacotes p
join public.pacote_servicos ps on ps.pacote_id=p.id
where p.ativo and ps.ativo
group by p.id,p.nome,p.ativo
having count(*) filter(
  where ps.ativo and nullif(to_jsonb(ps)->>'desconto_percentual','') is null
)>0
order by p.nome;

-- 5. Resumo objetivo do estado da tentativa anterior. Zero objetos 030 é
-- compatível com rollback integral; qualquer subconjunto é estado parcial.
with inventario as (
 select
  ((select count(*) from information_schema.columns
    where table_schema='public' and (
      (table_name='pacote_servicos' and column_name='desconto_percentual')
      or (table_name='contrato_itens' and column_name='desconto_percentual_snapshot')
      or (table_name='contratos' and column_name='modelo_operacional_versao')
    )))
  + (to_regclass('public.contrato_ciclos') is not null)::integer
  + (to_regclass('public.contrato_ciclo_ocorrencias') is not null)::integer
  + (to_regclass('public.contrato_ciclo_ocorrencia_itens') is not null)::integer
  + (exists(select 1 from pg_constraint where connamespace='public'::regnamespace
      and conname='contratos_modalidade_taxidog_030_check'))::integer
  + ((select count(*) from information_schema.triggers where event_object_schema='public'
      and trigger_name in('contratos_validar_modelo_operacional','contrato_itens_validar_desconto_030','contrato_ocorrencia_item_validar')))
  + ((select count(*) from pg_proc where pronamespace='public'::regnamespace
      and proname in('renovar_ciclo_contrato','vincular_ocorrencia_ciclo_atendimento',
        'validar_modelo_operacional_contrato','validar_desconto_snapshot_contrato_030')))
  as objetos_030_encontrados
)
select objetos_030_encontrados,
 case
  when objetos_030_encontrados=0 then 'COMPATIVEL_COM_ROLLBACK_INTEGRAL'
  when objetos_030_encontrados=14 then 'TODOS_OS_OBJETOS_030_ENCONTRADOS_VERIFICAR_SE_JA_APLICADA'
  else 'ESTADO_PARCIAL_NAO_REEXECUTAR_030'
 end as avaliacao
from inventario;

-- 6. Anomalias que tornam insegura uma nova tentativa.
select 'DEPENDENCIA_AUSENTE' as tipo,dependencia as detalhe
from (values
 ('contratos'),('contrato_itens'),('taxidog_ciclos'),('atendimentos'),
 ('agenda_versao_ocupacao'),('agenda_versao_configuracao')
) as d(dependencia)
where to_regclass('public.'||dependencia) is null
union all
select 'SEM_TRANSPORTE_COM_CICLO_TAXIDOG',id::text
from public.contratos
where modalidade_transporte='sem_transporte' and taxidog_ciclo_id is not null
union all
select 'MODELO_OPERACIONAL_DESCONHECIDO',id::text
from public.contratos c
where nullif(to_jsonb(c)->>'modelo_operacional_versao','') is not null
 and nullif(to_jsonb(c)->>'modelo_operacional_versao','')<>'30'
order by tipo,detalhe;
