-- DIAGNOSTICO SOMENTE LEITURA — VENDA E2E 02/09/2026
-- Identifica a venda mais recente do cenário informado e resume o estado da
-- materialização sem criar, corrigir ou excluir qualquer registro.
with contrato_alvo as (
  select c.id, c.created_at
  from public.contratos c
  where c.pet_id = 'PET-000011'
    and c.pacote_id = '3a5b5698-e37b-45cb-9c80-df72617a469d'::uuid
    and c.data_ancora = date '2026-09-02'
    and c.modalidade_transporte = 'sem_transporte'
    and c.horario_fixo = time '09:00'
  order by c.created_at desc, c.id desc
  limit 1
), ciclos as (
  select c.*
  from public.contrato_ciclos c
  join contrato_alvo a on a.id = c.contrato_id
), ocorrencias as (
  select o.*
  from public.contrato_ciclo_ocorrencias o
  join ciclos c on c.id = o.ciclo_id
), itens_por_ocorrencia as (
  select oi.ocorrencia_id,
    count(*) as itens_comerciais,
    array_agg(ci.servico_nome_snapshot order by ci.ordem_snapshot) as servicos_comerciais
  from public.contrato_ciclo_ocorrencia_itens oi
  join public.contrato_itens ci on ci.id = oi.contrato_item_id
  join ocorrencias o on o.id = oi.ocorrencia_id
  group by oi.ocorrencia_id
)
select
  a.id as contrato_id,
  a.created_at as contrato_criado_em,
  c.id as ciclo_id,
  c.numero as ciclo_numero,
  c.estado as ciclo_estado,
  o.id as ocorrencia_id,
  o.ordem as ocorrencia_ordem,
  o.data_operacional,
  o.horario_apresentado,
  o.inicio_operacional,
  o.conclusao_prevista,
  o.estado as ocorrencia_estado,
  o.atendimento_id,
  (o.atendimento_id is not null and at.id is not null) as atendimento_persistido,
  coalesce(i.itens_comerciais, 0) as itens_comerciais,
  coalesce(i.servicos_comerciais, array[]::text[]) as servicos_comerciais,
  count(*) over () as total_ocorrencias,
  count(*) filter (where o.estado = 'reservada' and o.atendimento_id is null) over () as reservas_virtuais,
  count(*) filter (where o.atendimento_id is not null) over () as ocorrencias_vinculadas
from contrato_alvo a
left join ciclos c on true
left join ocorrencias o on o.ciclo_id = c.id
left join itens_por_ocorrencia i on i.ocorrencia_id = o.id
left join public.atendimentos at on at.id = o.atendimento_id
order by c.numero, o.ordem;
