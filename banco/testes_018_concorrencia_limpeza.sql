-- RPC 018 — LIMPEZA SEGURA DAS FIXTURES DE CONCORRENCIA
-- Execute somente depois que as sessoes A e B tiverem terminado.

begin;

-- Atendimentos referenciam o grupo com RESTRICT; seus filhos operacionais
-- sao removidos pelos cascades definidos no schema.
delete from public.atendimentos
where grupo_agendamento_id in (
  select id from public.grupos_agendamento
  where observacoes like 'TESTE_RPC_018_CONC_%'
);

delete from public.grupos_agendamento
where observacoes like 'TESTE_RPC_018_CONC_%';

delete from public.servico_etapas
where servico_id in (
  select id from public.servicos
  where nome = 'TESTE_RPC_018_CONC_SERVICO'
);

delete from public.servicos
where nome = 'TESTE_RPC_018_CONC_SERVICO';

delete from public.equipamento_perfil_itens
where perfil_id in (
  select perfil.id
  from public.equipamento_perfis_capacidade perfil
  join public.equipamentos equipamento
    on equipamento.id = perfil.equipamento_id
  where equipamento.nome like 'TESTE_RPC_018_CONC_EQUIP_%'
);

delete from public.equipamento_perfis_capacidade
where equipamento_id in (
  select id from public.equipamentos
  where nome like 'TESTE_RPC_018_CONC_EQUIP_%'
);

delete from public.equipamento_unidades
where equipamento_id in (
  select id from public.equipamentos
  where nome like 'TESTE_RPC_018_CONC_EQUIP_%'
);

delete from public.equipamentos
where nome like 'TESTE_RPC_018_CONC_EQUIP_%';

delete from public.funcionarios
where nome like 'TESTE_RPC_018_CONC_FUNC_%';

delete from public.pets
where nome = 'TESTE_RPC_018_CONC_PET'
  and observacoes = 'Fixture concorrente RPC 018';

delete from public.clientes
where nome = 'TESTE_RPC_018_CONC_CLIENTE'
  and observacoes = 'Remover com testes_018_concorrencia_limpeza.sql';

delete from public.racas
where nome = 'TESTE_RPC_018_CONC_RACA'
  and fonte_referencia = 'Teste concorrente RPC 018';

commit;

select
  (select count(*) from public.grupos_agendamento
    where observacoes like 'TESTE_RPC_018_CONC_%') as grupos_restantes,
  (select count(*) from public.clientes
    where nome = 'TESTE_RPC_018_CONC_CLIENTE') as clientes_restantes,
  (select count(*) from public.pets
    where nome = 'TESTE_RPC_018_CONC_PET') as pets_restantes,
  (select count(*) from public.servicos
    where nome = 'TESTE_RPC_018_CONC_SERVICO') as servicos_restantes,
  (select count(*) from public.funcionarios
    where nome like 'TESTE_RPC_018_CONC_FUNC_%') as funcionarios_restantes,
  (select count(*) from public.equipamentos
    where nome like 'TESTE_RPC_018_CONC_EQUIP_%') as equipamentos_restantes;
