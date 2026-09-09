-- LIMPEZA ISOLADA — PRIMEIRA CONFIRMACAO EDGE G
-- Execute somente depois de capturar todos os resultados.

begin;

delete from public.atendimentos
where pet_id in (
  select id from public.pets where nome = 'TESTE_EDGE_G_PET'
);

delete from public.grupos_agendamento
where cliente_id in (
  select id from public.clientes where nome = 'TESTE_EDGE_G_CLIENTE'
);

delete from public.servico_especies
where servico_id in (
  select id from public.servicos where nome = 'TESTE_EDGE_G_SERVICO'
);

delete from public.servico_portes
where servico_id in (
  select id from public.servicos where nome = 'TESTE_EDGE_G_SERVICO'
);

delete from public.servicos where nome = 'TESTE_EDGE_G_SERVICO';
delete from public.funcionarios where nome = 'TESTE_EDGE_G_FUNCIONARIO';
delete from public.equipamentos where nome = 'TESTE_EDGE_G_EQUIPAMENTO';

delete from public.pets
where nome = 'TESTE_EDGE_G_PET'
  and observacoes = 'Fixture Edge Function Fase G';

delete from public.clientes
where nome = 'TESTE_EDGE_G_CLIENTE'
  and observacoes = 'Remover com teste_edge_confirmacao_limpeza.sql';

delete from public.racas
where nome = 'TESTE_EDGE_G_RACA'
  and fonte_referencia = 'Fixture Edge Function Fase G';

commit;

select
  (select count(*) from public.grupos_agendamento grupo
    join public.clientes cliente on cliente.id = grupo.cliente_id
    where cliente.nome = 'TESTE_EDGE_G_CLIENTE') as grupos_restantes,
  (select count(*) from public.atendimentos atendimento
    join public.pets pet on pet.id = atendimento.pet_id
    where pet.nome = 'TESTE_EDGE_G_PET') as atendimentos_restantes,
  (select count(*) from public.clientes
    where nome = 'TESTE_EDGE_G_CLIENTE') as clientes_restantes,
  (select count(*) from public.pets
    where nome = 'TESTE_EDGE_G_PET') as pets_restantes,
  (select count(*) from public.servicos
    where nome = 'TESTE_EDGE_G_SERVICO') as servicos_restantes,
  (select count(*) from public.funcionarios
    where nome = 'TESTE_EDGE_G_FUNCIONARIO') as funcionarios_restantes,
  (select count(*) from public.equipamentos
    where nome = 'TESTE_EDGE_G_EQUIPAMENTO') as equipamentos_restantes,
  (select count(*) from public.racas
    where nome = 'TESTE_EDGE_G_RACA') as racas_restantes;
