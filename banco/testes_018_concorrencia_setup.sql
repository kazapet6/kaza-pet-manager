-- RPC 018 — PREPARACAO DOS TESTES DE CONCORRENCIA
-- Executar uma unica vez como postgres. Este arquivo faz COMMIT porque as
-- duas sessoes precisam enxergar as mesmas fixtures. Execute a limpeza ao fim.

begin;

do $$
begin
  if exists (
    select 1 from public.servicos
    where nome = 'TESTE_RPC_018_CONC_SERVICO'
  ) then
    raise exception
      'Fixtures TESTE_RPC_018_CONC ja existem; execute primeiro a limpeza.';
  end if;
end;
$$;

with raca as (
  insert into public.racas (especie, nome, fonte_referencia)
  values ('cao', 'TESTE_RPC_018_CONC_RACA', 'Teste concorrente RPC 018')
  returning id
), cliente as (
  insert into public.clientes (
    nome, whatsapp, endereco, bairro, cidade, observacoes
  ) values (
    'TESTE_RPC_018_CONC_CLIENTE', '00000000000', '', '', '',
    'Remover com testes_018_concorrencia_limpeza.sql'
  )
  returning id
)
insert into public.pets (
  cliente_id, nome, especie, raca_id, sexo, porte, pelagem,
  peso, cor, data_nascimento, castrado, temperamento, observacoes
)
select cliente.id, 'TESTE_RPC_018_CONC_PET', 'cao', raca.id,
  'macho', 'pequeno', 'curta', 8, 'teste', '2020-01-01',
  true, 'calmo', 'Fixture concorrente RPC 018'
from cliente cross join raca;

with servico as (
  insert into public.servicos (
    nome, descricao, ativo, preco_base, agendamento_cliente
  ) values (
    'TESTE_RPC_018_CONC_SERVICO', 'Fixture concorrente RPC 018',
    true, 50, false
  )
  returning id
)
insert into public.servico_etapas (
  servico_id, nome, ordem, duracao_minutos, recurso,
  equipamento_id, ativo
)
select id, 'TESTE_RPC_018_CONC_ETAPA', 1, 30, 'nenhum', null, true
from servico;

insert into public.funcionarios (nome, ativo)
values
  ('TESTE_RPC_018_CONC_FUNC_A', true),
  ('TESTE_RPC_018_CONC_FUNC_B', true);

with equipamentos as (
  insert into public.equipamentos (
    nome, tipo, quantidade_unidades, ativo,
    separar_por_sexo, exige_supervisao_humana
  ) values
    ('TESTE_RPC_018_CONC_EQUIP_A', 'teste', 1, true, false, false),
    ('TESTE_RPC_018_CONC_EQUIP_B', 'teste', 1, true, false, false)
  returning id, nome
), unidades as (
  insert into public.equipamento_unidades (
    equipamento_id, numero, nome, ativo
  )
  select id, 1, replace(nome, 'EQUIP', 'UNIDADE'), true
  from equipamentos
  returning id, equipamento_id
), perfis as (
  insert into public.equipamento_perfis_capacidade (
    equipamento_id, nome, ativo
  )
  select id, nome || '_CAPACIDADE_1', true
  from equipamentos
  returning id
)
insert into public.equipamento_perfil_itens (
  perfil_id, porte, quantidade, ativo
)
select id, 'pequeno', 1, true from perfis;

commit;

select
  (select versao from public.agenda_versao_ocupacao where id)
    as ocupacao_antes_concorrencia,
  (select count(*) from public.clientes
    where nome = 'TESTE_RPC_018_CONC_CLIENTE') as clientes_fixture,
  (select count(*) from public.pets
    where nome = 'TESTE_RPC_018_CONC_PET') as pets_fixture,
  (select count(*) from public.servicos
    where nome = 'TESTE_RPC_018_CONC_SERVICO') as servicos_fixture,
  (select count(*) from public.funcionarios
    where nome like 'TESTE_RPC_018_CONC_FUNC_%') as funcionarios_fixture,
  (select count(*) from public.equipamentos
    where nome like 'TESTE_RPC_018_CONC_EQUIP_%') as equipamentos_fixture;
