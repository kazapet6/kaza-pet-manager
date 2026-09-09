-- Diagnóstico somente leitura após aplicar a Migration 033.

select
  to_regclass('public.atendimentos_funcionario_responsavel_inicio_idx') as indice_atendimentos,
  to_regclass('public.contrato_ciclos_funcionario_responsavel_idx') as indice_ciclos,
  exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='atendimentos'
      and column_name='funcionario_responsavel_id'
  ) as coluna_atendimento,
  exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='contrato_ciclos'
      and column_name='funcionario_responsavel_padrao_id'
  ) as coluna_ciclo;

select
  count(*) filter (where funcionario_responsavel_id is not null) as com_responsavel,
  count(*) filter (where funcionario_responsavel_id is null) as sem_responsavel
from public.atendimentos;

-- Casos que corretamente permaneceram sem backfill: zero ou múltiplos humanos.
select a.id, a.pet_nome_snapshot, count(distinct aef.funcionario_id) as funcionarios_humanos
from public.atendimentos a
left join public.atendimento_etapas ae on ae.atendimento_id=a.id
left join public.atendimento_etapa_funcionarios aef on aef.atendimento_etapa_id=ae.id
where a.funcionario_responsavel_id is null
group by a.id, a.pet_nome_snapshot
order by funcionarios_humanos desc, a.pet_nome_snapshot;

-- Evidência esperada para o atendimento real de Juca em 08/09/2026:
-- se houver exatamente uma pessoa distinta nas etapas, responsável deve ser ela.
select a.id, a.pet_nome_snapshot, a.funcionario_responsavel_id,
       fr.nome as responsavel,
       count(distinct aef.funcionario_id) as funcionarios_humanos,
       string_agg(distinct fe.nome, ', ' order by fe.nome) as nomes_alocados
from public.atendimentos a
join public.grupos_agendamento g on g.id=a.grupo_agendamento_id
left join public.funcionarios fr on fr.id=a.funcionario_responsavel_id
left join public.atendimento_etapas ae on ae.atendimento_id=a.id
left join public.atendimento_etapa_funcionarios aef on aef.atendimento_etapa_id=ae.id
left join public.funcionarios fe on fe.id=aef.funcionario_id
where g.data_operacional=date '2026-09-08'
  and lower(a.pet_nome_snapshot)=lower('Juca')
group by a.id, a.pet_nome_snapshot, a.funcionario_responsavel_id, fr.nome;

-- Consistência de ciclos materializados: exceções administrativas por ocorrência
-- são permitidas; por isso divergências são evidenciadas, não tratadas como erro.
select c.id as ciclo_id, c.numero, c.funcionario_responsavel_padrao_id,
       count(distinct a.funcionario_responsavel_id) filter (where a.funcionario_responsavel_id is not null) as responsaveis_nas_ocorrencias,
       count(*) filter (where a.funcionario_responsavel_id is null) as ocorrencias_sem_responsavel
from public.contrato_ciclos c
left join public.contrato_ciclo_ocorrencias o on o.ciclo_id=c.id
left join public.atendimentos a on a.id=o.atendimento_id
group by c.id, c.numero, c.funcionario_responsavel_padrao_id
order by c.id, c.numero;
