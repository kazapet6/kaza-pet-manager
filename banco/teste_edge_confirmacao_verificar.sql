-- VERIFICACAO SOMENTE LEITURA — PRIMEIRA CONFIRMACAO EDGE G

select
  grupo.id as grupo_id, grupo.chave_idempotencia, grupo.hash_requisicao,
  grupo.configuracao_versao, grupo.modalidade, grupo.data_operacional,
  grupo.created_at, cliente.nome as cliente_marcador
from public.grupos_agendamento grupo
join public.clientes cliente on cliente.id = grupo.cliente_id
where cliente.nome = 'TESTE_EDGE_G_CLIENTE'
order by grupo.created_at, grupo.id;

select
  atendimento.id as atendimento_id,
  atendimento.grupo_agendamento_id, atendimento.status,
  atendimento.inicio_operacional_planejado,
  atendimento.conclusao_operacional_prevista,
  atendimento.valor_calculado, atendimento.valor_final,
  pet.nome as pet_marcador
from public.atendimentos atendimento
join public.pets pet on pet.id = atendimento.pet_id
where pet.nome = 'TESTE_EDGE_G_PET'
order by atendimento.created_at, atendimento.id;

select
  materializado.atendimento_id, materializado.id as atendimento_servico_id,
  materializado.servico_id, materializado.nome_snapshot,
  materializado.origem, materializado.ordem,
  materializado.preco_base_snapshot, materializado.valor_calculado,
  materializado.valor_final,
  materializado.originado_por_atendimento_servico_id,
  count(origem.atendimento_servico_id) as arestas_diretas
from public.atendimento_servicos materializado
join public.servicos servico on servico.id = materializado.servico_id
left join public.atendimento_servico_origens origem
  on origem.atendimento_servico_id = materializado.id
where servico.nome = 'TESTE_EDGE_G_SERVICO'
group by materializado.id
order by materializado.atendimento_id, materializado.ordem;

select
  etapa.atendimento_id, etapa.id as atendimento_etapa_id,
  etapa.nome_snapshot, etapa.inicio_planejado, etapa.fim_planejado,
  funcionario.nome as funcionario_marcador,
  reserva_funcionario.inicio_planejado as funcionario_inicio,
  reserva_funcionario.fim_planejado as funcionario_fim,
  reserva_equipamento.id as reserva_equipamento_id,
  supervisao.id as supervisao_id
from public.atendimento_etapas etapa
join public.servico_etapas etapa_catalogo
  on etapa_catalogo.id = etapa.servico_etapa_id
join public.servicos servico on servico.id = etapa_catalogo.servico_id
left join public.atendimento_etapa_funcionarios reserva_funcionario
  on reserva_funcionario.atendimento_etapa_id = etapa.id
left join public.funcionarios funcionario
  on funcionario.id = reserva_funcionario.funcionario_id
left join public.atendimento_etapa_equipamentos reserva_equipamento
  on reserva_equipamento.atendimento_etapa_id = etapa.id
left join public.atendimento_etapa_equipamento_supervisoes supervisao
  on supervisao.atendimento_etapa_equipamento_id = reserva_equipamento.id
where servico.nome = 'TESTE_EDGE_G_SERVICO'
order by etapa.inicio_planejado, etapa.id;

select
  (select versao from public.agenda_versao_configuracao where id)
    as versao_configuracao_atual,
  (select versao from public.agenda_versao_ocupacao where id)
    as versao_ocupacao_atual,
  (select count(*) from public.clientes
    where nome = 'TESTE_EDGE_G_CLIENTE') as clientes_fixture,
  (select count(*) from public.pets
    where nome = 'TESTE_EDGE_G_PET') as pets_fixture,
  (select count(*) from public.servicos
    where nome = 'TESTE_EDGE_G_SERVICO') as servicos_fixture,
  (select count(*) from public.funcionarios
    where nome = 'TESTE_EDGE_G_FUNCIONARIO') as funcionarios_fixture,
  (select count(*) from public.equipamentos
    where nome = 'TESTE_EDGE_G_EQUIPAMENTO') as equipamentos_fixture;
