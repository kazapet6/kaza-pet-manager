-- RPC 018 — CONCORRENCIA — SESSAO A
-- Abra em um SQL Editor separado e execute o arquivo inteiro. Assim que a
-- primeira linha "AGUARDANDO_SESSAO_B" aparecer, execute a Sessao B.

create or replace function pg_temp.plano_concorrente_rpc018(
  p_cenario text,
  p_ator text
)
returns jsonb
language sql
volatile
set search_path = pg_catalog, pg_temp
as $$
  with dados as (
    select cliente.id as cliente_id, pet.id as pet_id,
      pet.raca_id, servico.id as servico_id,
      etapa.id as servico_etapa_id,
      funcionario.id as funcionario_id,
      unidade.id as equipamento_unidade_id,
      (select versao from public.agenda_versao_configuracao where id)
        as configuracao_versao,
      case p_cenario
        when 'FUNCIONARIO' then '2099-02-01'::date
        when 'EQUIPAMENTO' then '2099-02-02'::date
        else '2099-02-03'::date
      end as data_operacional,
      gen_random_uuid() as atendimento_servico_id,
      gen_random_uuid() as atendimento_etapa_id,
      gen_random_uuid() as reserva_id
    from public.clientes cliente
    join public.pets pet on pet.cliente_id = cliente.id
    cross join public.servicos servico
    join public.servico_etapas etapa on etapa.servico_id = servico.id
    left join public.funcionarios funcionario
      on funcionario.nome = case
        when p_cenario = 'FUNCIONARIO' then 'TESTE_RPC_018_CONC_FUNC_A'
        when p_ator = 'A' then 'TESTE_RPC_018_CONC_FUNC_A'
        else 'TESTE_RPC_018_CONC_FUNC_B'
      end
    left join public.equipamento_unidades unidade
      on unidade.nome = case
        when p_cenario = 'EQUIPAMENTO' then 'TESTE_RPC_018_CONC_UNIDADE_A'
        when p_ator = 'A' then 'TESTE_RPC_018_CONC_UNIDADE_A'
        else 'TESTE_RPC_018_CONC_UNIDADE_B'
      end
    where cliente.nome = 'TESTE_RPC_018_CONC_CLIENTE'
      and pet.nome = 'TESTE_RPC_018_CONC_PET'
      and servico.nome = 'TESTE_RPC_018_CONC_SERVICO'
      and etapa.nome = 'TESTE_RPC_018_CONC_ETAPA'
  ), plano as (
    select dados.*,
      (data_operacional::text || 'T10:00:00+00:00')::timestamptz inicio,
      (data_operacional::text || 'T10:30:00+00:00')::timestamptz fim
    from dados
  )
  select jsonb_build_object(
    'grupo', jsonb_build_object(
      'chaveIdempotencia', gen_random_uuid(),
      'hashRequisicao', md5(gen_random_uuid()::text)
        || md5(gen_random_uuid()::text),
      'configuracaoVersao', configuracao_versao,
      'clienteId', cliente_id, 'modalidade', 'normal',
      'dataOperacional', data_operacional,
      'horarioChegadaComprometido', inicio,
      'retiradaPrevista', fim,
      'observacoes', 'TESTE_RPC_018_CONC_' || p_cenario || '_' || p_ator
    ),
    'atendimento', jsonb_build_object(
      'petId', pet_id, 'inicioOperacionalPlanejado', inicio,
      'conclusaoOperacionalPrevista', fim,
      'preferenciaFuncionario', 'automatico',
      'funcionarioPreferidoId', null,
      'petNomeSnapshot', 'TESTE_RPC_018_CONC_PET',
      'petEspecieSnapshot', 'cao', 'petRacaIdSnapshot', raca_id,
      'petRacaNomeSnapshot', 'TESTE_RPC_018_CONC_RACA',
      'petSexoSnapshot', 'macho', 'petPorteSnapshot', 'pequeno',
      'petPelagemSnapshot', 'curta', 'petPesoSnapshot', 8,
      'petTemperamentoSnapshot', 'calmo',
      'valorCalculado', 50, 'valorFinal', 50,
      'observacoes', 'TESTE_RPC_018_CONC_' || p_cenario || '_' || p_ator
    ),
    'servicos', jsonb_build_array(jsonb_build_object(
      'id', atendimento_servico_id, 'servico_id', servico_id,
      'ordem', 1, 'origem', 'solicitado', 'pai_canonico_id', null,
      'nome_snapshot', 'TESTE_RPC_018_CONC_SERVICO',
      'preco_base_snapshot', 50, 'valor_calculado', 50,
      'valor_final', 50
    )),
    'origens', '[]'::jsonb, 'acrescimos', '[]'::jsonb,
    'etapas', jsonb_build_array(jsonb_build_object(
      'id', atendimento_etapa_id, 'servico_etapa_id', servico_etapa_id,
      'inicio_planejado', inicio, 'fim_planejado', fim,
      'atendimento_servico_id', atendimento_servico_id,
      'nome_snapshot', 'TESTE_RPC_018_CONC_ETAPA',
      'ordem_snapshot', 1, 'duracao_minutos_snapshot', 30,
      'recursos_snapshot', '[]'::jsonb
    )),
    'contribuicoes', '[]'::jsonb,
    'funcionarios', case when p_cenario in ('FUNCIONARIO', 'COMPATIVEL')
      then jsonb_build_array(jsonb_build_object(
        'id', gen_random_uuid(), 'atendimento_etapa_id', atendimento_etapa_id,
        'funcionario_id', funcionario_id,
        'inicio_planejado', inicio, 'fim_planejado', fim
      )) else '[]'::jsonb end,
    'equipamentos', case when p_cenario in ('EQUIPAMENTO', 'COMPATIVEL')
      then jsonb_build_array(jsonb_build_object(
        'id', reserva_id, 'atendimento_etapa_id', atendimento_etapa_id,
        'equipamento_unidade_id', equipamento_unidade_id,
        'inicio_planejado', inicio, 'fim_planejado', fim
      )) else '[]'::jsonb end,
    'supervisoes', '[]'::jsonb, 'esperas', '[]'::jsonb
  )
  from plano;
$$;

-- Cada transacao segura os locks por 15 segundos para a Sessao B disputar.
begin;
select 'FUNCIONARIO_A' as teste,
  public.confirmar_agendamento_transacional(
    pg_temp.plano_concorrente_rpc018('FUNCIONARIO', 'A')
  ) as resposta;
select 'AGUARDANDO_SESSAO_B_FUNCIONARIO' as estado, pg_sleep(15);
commit;

begin;
select 'EQUIPAMENTO_A' as teste,
  public.confirmar_agendamento_transacional(
    pg_temp.plano_concorrente_rpc018('EQUIPAMENTO', 'A')
  ) as resposta;
select 'AGUARDANDO_SESSAO_B_EQUIPAMENTO' as estado, pg_sleep(15);
commit;

begin;
select 'COMPATIVEL_A' as teste,
  public.confirmar_agendamento_transacional(
    pg_temp.plano_concorrente_rpc018('COMPATIVEL', 'A')
  ) as resposta;
select 'AGUARDANDO_SESSAO_B_COMPATIVEL' as estado, pg_sleep(15);
commit;

select observacoes, count(*) as grupos
from public.grupos_agendamento
where observacoes like 'TESTE_RPC_018_CONC_%'
group by observacoes
order by observacoes;

select versao as ocupacao_apos_concorrencia
from public.agenda_versao_ocupacao
where id;
