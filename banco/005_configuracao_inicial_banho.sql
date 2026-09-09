begin;

-- Permite que opcionais do atendimento sejam configurados pelo mesmo CRUD de
-- modificadores já usado pela tela Serviços.
alter table public.servico_modificadores
  drop constraint if exists servico_modificadores_criterio_check;

alter table public.servico_modificadores
  add constraint servico_modificadores_criterio_check
  check (criterio in ('porte', 'raca', 'peso', 'temperamento', 'adicional'));

with banho as (
  select id from public.servicos where nome = 'Banho'
), maquina_secagem as (
  select id from public.equipamentos
  where tipo = 'secagem'
  order by created_at
  limit 1
), configuracao (ordem, nome, duracao_minutos, recurso, equipamento_id) as (
  values
    (1, 'Banho', 15, 'funcionario', null::uuid),
    (2, 'Secagem em máquina', 45, 'equipamento', (select id from maquina_secagem)),
    (3, 'Finalização', 10, 'funcionario', null::uuid)
)
insert into public.servico_etapas (
  servico_id, nome, ordem, duracao_minutos, recurso, equipamento_id, ativo
)
select banho.id, configuracao.nome, configuracao.ordem,
  configuracao.duracao_minutos, configuracao.recurso,
  configuracao.equipamento_id, true
from banho cross join configuracao
on conflict (servico_id, ordem) do update
set nome = excluded.nome,
    duracao_minutos = excluded.duracao_minutos,
    recurso = excluded.recurso,
    equipamento_id = excluded.equipamento_id,
    ativo = excluded.ativo;

with banho as (
  select id from public.servicos where nome = 'Banho'
), etapa_banho as (
  select etapa.id, etapa.servico_id
  from public.servico_etapas etapa
  join banho on banho.id = etapa.servico_id
  where etapa.ordem = 1
), adicionais (valor, acrescimo_minutos) as (
  values ('Hidratação', 5), ('Escovação de dentes', 0)
)
insert into public.servico_modificadores (
  servico_id, servico_etapa_id, criterio, valor, acrescimo_minutos, ativo
)
select etapa_banho.servico_id, etapa_banho.id, 'adicional',
  adicionais.valor, adicionais.acrescimo_minutos, true
from etapa_banho cross join adicionais
on conflict (servico_etapa_id, criterio, valor) do update
set acrescimo_minutos = excluded.acrescimo_minutos,
    ativo = excluded.ativo;

commit;
