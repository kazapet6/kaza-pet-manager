-- DIAGNÓSTICO SOMENTE LEITURA — COMPATIBILIDADE HISTÓRICA E CICLOS 030

-- 1. Estruturas e colunas centrais.
select to_regclass('public.contrato_ciclos') is not null as ciclos,
 to_regclass('public.contrato_ciclo_ocorrencias') is not null as ocorrencias,
 to_regclass('public.contrato_ciclo_ocorrencia_itens') is not null as ocorrencia_itens;
select column_name,data_type,is_nullable from information_schema.columns
where table_schema='public' and table_name in('contrato_ciclos','contrato_ciclo_ocorrencias','contrato_ciclo_ocorrencia_itens')
order by table_name,ordinal_position;

select column_name,data_type,is_nullable,column_default
from information_schema.columns
where table_schema='public' and table_name='contratos'
  and column_name='modelo_operacional_versao';

-- 2. Contratos históricos devem continuar com versão NULL e sem preenchimento
-- artificial de TaxiDog. O detalhamento permite comparar com o inventário
-- capturado antes da 030.
select id,created_at,modalidade_transporte,taxidog_ciclo_id,
 modelo_operacional_versao,data_ancora,dia_semana_fixo,horario_fixo
from public.contratos
where modelo_operacional_versao is null
order by created_at,id;

select count(*) as contratos_historicos,
 count(*) filter(where modalidade_transporte='taxidog' and taxidog_ciclo_id is null) as taxidog_historico_sem_janela,
 count(*) filter(where taxidog_ciclo_id is not null) as historicos_com_referencia_preexistente
from public.contratos
where modelo_operacional_versao is null;

-- 3. Toda venda 030 precisa satisfazer integralmente a modalidade operacional.
select count(*) as contratos_030_invalidos
from public.contratos
where modelo_operacional_versao=30 and not (
 (modalidade_transporte='sem_transporte' and taxidog_ciclo_id is null)
 or (modalidade_transporte='taxidog' and taxidog_ciclo_id is not null)
);

select conname,convalidated,pg_get_constraintdef(oid) as definicao
from pg_constraint
where conrelid='public.contratos'::regclass
  and conname in('contratos_modalidade_taxidog_030_check');

select trigger_name,action_timing,event_manipulation
from information_schema.triggers
where event_object_schema='public'
  and trigger_name in('contratos_validar_modelo_operacional','contrato_itens_validar_desconto_030')
order by event_object_table,trigger_name,event_manipulation;

-- 4. Ciclos, ocorrências e integridade relacional/operacional.
select c.estado,count(*) from public.contrato_ciclos c group by c.estado order by c.estado;
select count(*) as ciclos_sem_contrato
from public.contrato_ciclos c left join public.contratos x on x.id=c.contrato_id
where x.id is null;
select count(*) as ocorrencias_invalidas
from public.contrato_ciclo_ocorrencias o
where o.inicio_operacional>=o.conclusao_prevista
 or (o.estado='reservada' and (o.atendimento_id is not null or o.materializada_em is not null))
 or (o.estado in('materializada','concluida') and (o.atendimento_id is null or o.materializada_em is null));
select count(*) as itens_cruzando_contratos
from public.contrato_ciclo_ocorrencia_itens oi
join public.contrato_ciclos c on c.id=oi.ciclo_id
join public.contrato_itens i on i.id=oi.contrato_item_id
where c.contrato_id<>i.contrato_id;

-- 5. TaxiDog: janela pretendida do Ciclo e janela de cada ocorrência.
select count(*) as ciclos_taxidog_invalidos
from public.contrato_ciclos
where not (
 (modalidade_transporte_pretendida='sem_transporte' and taxidog_ciclo_id_pretendido is null)
 or (modalidade_transporte_pretendida='taxidog' and taxidog_ciclo_id_pretendido is not null)
);

-- 6. RPCs autoritativas, privilégios e configuração segura.
select proname,prosecdef,proconfig from pg_proc where oid in(
 to_regprocedure('public.vender_contrato(jsonb)'),
 to_regprocedure('public.renovar_ciclo_contrato(jsonb)'),
 to_regprocedure('public.vincular_ocorrencia_ciclo_atendimento(uuid,uuid)'),
 to_regprocedure('public.salvar_pacote_completo(jsonb)')) order by proname;
select has_table_privilege('anon','public.contrato_ciclos','select') anon_select,
 has_table_privilege('authenticated','public.contrato_ciclos','select') internal_select,
 has_table_privilege('authenticated','public.contrato_ciclos','insert,update') frontend_write,
 has_table_privilege('service_role','public.contrato_ciclos','select,insert,update') service_role_operacional;

-- 7. Descontos e snapshots: NULL permanece marcador legítimo do legado; novos
-- itens de Contratos 030 não podem perder o snapshot percentual.
select column_name,data_type,is_nullable from information_schema.columns
where table_schema='public' and table_name='pacote_servicos'
  and column_name in('desconto_percentual','preco_pacote_base_unitario');
select column_name,data_type,is_nullable from information_schema.columns
where table_schema='public' and table_name='contrato_itens'
  and column_name='desconto_percentual_snapshot';
select count(*) filter(where p.ativo) pacotes_ativos,
 count(*) filter(where ps.ativo and ps.desconto_percentual is null) itens_legados_pendentes
from public.pacotes p left join public.pacote_servicos ps on ps.pacote_id=p.id;

select count(*) as itens_novos_sem_desconto_snapshot
from public.contrato_itens i
join public.contratos c on c.id=i.contrato_id
where c.modelo_operacional_versao=30 and i.desconto_percentual_snapshot is null;

-- 8. Inventário completo das constraints introduzidas/afetadas pela 030.
select c.conrelid::regclass as tabela,c.conname,c.contype,c.convalidated,
 pg_get_constraintdef(c.oid) as definicao
from pg_constraint c
where c.connamespace='public'::regnamespace
 and c.conrelid in(
  'public.contratos'::regclass,
  'public.pacote_servicos'::regclass,
  'public.contrato_itens'::regclass,
  'public.contrato_ciclos'::regclass,
  'public.contrato_ciclo_ocorrencias'::regclass,
  'public.contrato_ciclo_ocorrencia_itens'::regclass
 )
order by (c.conrelid::regclass)::text,c.conname;
