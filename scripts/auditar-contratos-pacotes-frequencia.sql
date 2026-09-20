-- Auditoria somente leitura. Não altera contratos, ciclos ou ocorrências.
with contratos_com_quinzenal as (
  select distinct c.id, c.data_ancora
  from public.contratos c
  join public.contrato_itens ci on ci.contrato_id = c.id
  where ci.intervalo_unidade = 'semana'
    and ci.intervalo_quantidade = 2
),
datas_esperadas as (
  select distinct
    c.id as contrato_id,
    (
      c.data_ancora
      + case ci.offset_inicial_unidade
          when 'dia' then make_interval(days => ci.offset_inicial_quantidade)
          when 'semana' then make_interval(weeks => ci.offset_inicial_quantidade)
          when 'mes' then make_interval(months => ci.offset_inicial_quantidade)
          else make_interval(years => ci.offset_inicial_quantidade)
        end
      + case ci.intervalo_unidade
          when 'dia' then make_interval(days => serie.indice * ci.intervalo_quantidade)
          when 'semana' then make_interval(weeks => serie.indice * ci.intervalo_quantidade)
          when 'mes' then make_interval(months => serie.indice * ci.intervalo_quantidade)
          else make_interval(years => serie.indice * ci.intervalo_quantidade)
        end
    )::date as data_operacional
  from contratos_com_quinzenal c
  join public.contrato_itens ci on ci.contrato_id = c.id
  cross join lateral generate_series(0, ci.quantidade_por_ciclo - 1) serie(indice)
),
datas_persistidas as (
  select distinct c.id as contrato_id, o.data_operacional
  from contratos_com_quinzenal c
  join public.contrato_ciclos cc on cc.contrato_id = c.id and cc.numero = 1
  join public.contrato_ciclo_ocorrencias o on o.ciclo_id = cc.id
),
recorrencias_divergentes as (
  select contrato_id
  from (
    (select * from datas_esperadas except select * from datas_persistidas)
    union all
    (select * from datas_persistidas except select * from datas_esperadas)
  ) diferencas
  group by contrato_id
),
taxidog_semantica_antiga as (
  select
    c.id as contrato_id,
    c.data_ancora,
    c.horario_fixo,
    tc.coleta_inicio
  from public.contratos c
  join public.taxidog_ciclos tc on tc.id = c.taxidog_ciclo_id
  where c.modalidade_transporte = 'taxidog'
    and c.horario_fixo <> tc.coleta_inicio
)
select
  'RECORRENCIA_DIVERGENTE'::text as tipo,
  d.contrato_id,
  c.data_ancora,
  null::time as horario_fixo,
  null::time as coleta_inicio
from recorrencias_divergentes d
join public.contratos c on c.id = d.contrato_id

union all

select
  'TAXIDOG_HORARIO_SEMANTICA_ANTIGA'::text as tipo,
  t.contrato_id,
  t.data_ancora,
  t.horario_fixo,
  t.coleta_inicio
from taxidog_semantica_antiga t
order by tipo, data_ancora, contrato_id;
