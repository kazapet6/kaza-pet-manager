-- FIXTURES ISOLADAS — PRIMEIRA CONFIRMACAO REAL DA EDGE FUNCTION
-- Execute manualmente uma unica vez. Nao e migration.

begin;

do $$
begin
  if exists (select 1 from public.clientes where nome = 'TESTE_EDGE_G_CLIENTE')
    or exists (select 1 from public.pets where nome = 'TESTE_EDGE_G_PET')
    or exists (select 1 from public.servicos where nome = 'TESTE_EDGE_G_SERVICO')
    or exists (select 1 from public.funcionarios where nome = 'TESTE_EDGE_G_FUNCIONARIO')
    or exists (select 1 from public.equipamentos where nome = 'TESTE_EDGE_G_EQUIPAMENTO')
  then
    raise exception 'Fixtures TESTE_EDGE_G ja existem; execute primeiro a limpeza.';
  end if;

  if not exists (
    select 1 from public.estabelecimento_blocos where ativo
  ) then
    raise exception 'A agenda nao possui blocos de funcionamento ativos.';
  end if;
end;
$$;

with raca as (
  insert into public.racas (especie, nome, fonte_referencia)
  values ('cao', 'TESTE_EDGE_G_RACA', 'Fixture Edge Function Fase G')
  returning id
), cliente as (
  insert into public.clientes (
    nome, whatsapp, endereco, bairro, cidade, observacoes
  ) values (
    'TESTE_EDGE_G_CLIENTE', '00000000000', '', '', '',
    'Remover com teste_edge_confirmacao_limpeza.sql'
  )
  returning id
)
insert into public.pets (
  cliente_id, nome, especie, raca_id, sexo, porte, pelagem,
  peso, cor, data_nascimento, castrado, temperamento, observacoes
)
select cliente.id, 'TESTE_EDGE_G_PET', 'cao', raca.id,
  'macho', 'pequeno', 'curta', 8, 'teste', '2020-01-01',
  true, 'calmo', 'Fixture Edge Function Fase G'
from cliente cross join raca;

with servico as (
  insert into public.servicos (
    nome, descricao, ativo, preco_base, agendamento_cliente
  ) values (
    'TESTE_EDGE_G_SERVICO', 'Fixture Edge Function Fase G',
    true, 50, false
  )
  returning id
), etapa as (
  insert into public.servico_etapas (
    servico_id, nome, ordem, duracao_minutos, recurso,
    equipamento_id, ativo
  )
  select id, 'TESTE_EDGE_G_ETAPA', 1, 30, 'funcionario', null, true
  from servico
  returning id, servico_id
), recurso as (
  insert into public.servico_etapa_recursos (
    servico_etapa_id, tipo, equipamento_id, quantidade, ativo
  )
  select id, 'funcionario', null, 1, true from etapa
)
insert into public.funcionarios (nome, ativo)
values ('TESTE_EDGE_G_FUNCIONARIO', true);

insert into public.servico_especies (servico_id, especie, ativo)
select servico.id, 'cao', true
from public.servicos servico
where servico.nome = 'TESTE_EDGE_G_SERVICO';

insert into public.servico_portes (servico_id, porte, ativo)
select servico.id, 'pequeno', true
from public.servicos servico
where servico.nome = 'TESTE_EDGE_G_SERVICO';

insert into public.funcionario_jornadas (
  funcionario_id, dia_semana, inicio, fim, ativo
)
select funcionario.id, bloco.dia_semana,
  min(bloco.inicio), max(bloco.fim), true
from public.funcionarios funcionario
cross join public.estabelecimento_blocos bloco
where funcionario.nome = 'TESTE_EDGE_G_FUNCIONARIO'
  and bloco.ativo
group by funcionario.id, bloco.dia_semana;

insert into public.funcionario_servicos (
  funcionario_id, servico_id, ativo
)
select funcionario.id, servico.id, true
from public.funcionarios funcionario
cross join public.servicos servico
where funcionario.nome = 'TESTE_EDGE_G_FUNCIONARIO'
  and servico.nome = 'TESTE_EDGE_G_SERVICO';

insert into public.funcionario_etapas (
  funcionario_id, servico_etapa_id, ativo
)
select funcionario.id, etapa.id, true
from public.funcionarios funcionario
cross join public.servico_etapas etapa
join public.servicos servico on servico.id = etapa.servico_id
where funcionario.nome = 'TESTE_EDGE_G_FUNCIONARIO'
  and servico.nome = 'TESTE_EDGE_G_SERVICO';

commit;

with configuracao as (
  select timezone, horizonte_dias from public.configuracao_agenda where id
), datas_futuras as (
  select dia::date as data
  from configuracao
  cross join lateral generate_series(
    (now() at time zone configuracao.timezone)::date + 1,
    (now() at time zone configuracao.timezone)::date
      + least(configuracao.horizonte_dias, 60),
    interval '1 day'
  ) dia
)
select
  (select versao from public.agenda_versao_configuracao where id)
    as versao_configuracao,
  (select versao from public.agenda_versao_ocupacao where id)
    as versao_ocupacao,
  (select id from public.clientes where nome = 'TESTE_EDGE_G_CLIENTE')
    as cliente_id,
  (select id from public.pets where nome = 'TESTE_EDGE_G_PET') as pet_id,
  (select id from public.servicos where nome = 'TESTE_EDGE_G_SERVICO')
    as servico_id,
  (
    select min(data) from datas_futuras futura
    where exists (
      select 1 from public.estabelecimento_blocos bloco
      where bloco.ativo
        and bloco.dia_semana = extract(dow from futura.data)::integer
    )
      and not exists (
        select 1 from public.estabelecimento_excecoes excecao
        where excecao.data = futura.data and excecao.fechado
      )
  ) as primeira_data_candidata;
