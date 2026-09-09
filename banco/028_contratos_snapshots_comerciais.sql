begin;

-- 028 — Contratos e snapshots comerciais da venda.
-- Esta unidade nao cria Ciclos, creditos, financeiro nem atendimentos.

create table public.contratos (
  id uuid primary key default gen_random_uuid(),
  cliente_id text not null references public.clientes(id) on update cascade on delete restrict,
  pet_id text not null references public.pets(id) on update cascade on delete restrict,
  pacote_id uuid not null references public.pacotes(id) on delete restrict,
  pacote_versao_snapshot bigint not null check (pacote_versao_snapshot >= 0),
  pacote_nome_snapshot text not null check (
    pacote_nome_snapshot = btrim(pacote_nome_snapshot)
    and char_length(pacote_nome_snapshot) between 1 and 120
  ),

  pet_nome_snapshot text not null check (nullif(btrim(pet_nome_snapshot), '') is not null),
  pet_especie_snapshot text not null check (pet_especie_snapshot in ('cao', 'gato')),
  pet_raca_id_snapshot uuid not null references public.racas(id) on delete restrict,
  pet_raca_nome_snapshot text not null check (nullif(btrim(pet_raca_nome_snapshot), '') is not null),
  pet_porte_snapshot text not null check (pet_porte_snapshot in ('mini', 'pequeno', 'medio', 'grande', 'gigante')),
  pet_pelagem_snapshot text not null check (pet_pelagem_snapshot in ('curta', 'media', 'longa')),
  pet_peso_snapshot numeric(8, 2) check (pet_peso_snapshot is null or pet_peso_snapshot >= 0),
  pet_temperamento_snapshot text not null check (pet_temperamento_snapshot in ('calmo', 'moderado', 'dificil')),

  -- Uma unica serie fixa pertence diretamente ao Contrato.
  data_ancora date not null,
  dia_semana_fixo smallint not null check (dia_semana_fixo between 0 and 6),
  horario_fixo time not null,
  timezone_snapshot text not null check (nullif(btrim(timezone_snapshot), '') is not null),
  modalidade_transporte text not null check (modalidade_transporte in ('sem_transporte', 'taxidog')),
  taxidog_ciclo_id uuid references public.taxidog_ciclos(id) on delete restrict,
  configuracao_agenda_versao_snapshot bigint not null check (configuracao_agenda_versao_snapshot > 0),
  constraint contratos_ancora_dia_semana_check check (
    extract(dow from data_ancora)::smallint = dia_semana_fixo
  ),
  constraint contratos_modalidade_taxidog_check check (
    (modalidade_transporte = 'sem_transporte' and taxidog_ciclo_id is null)
    or (modalidade_transporte = 'taxidog' and taxidog_ciclo_id is not null)
  ),

  renovacao_automatica boolean not null,
  valor_avulso_equivalente_snapshot numeric(12, 2) not null check (valor_avulso_equivalente_snapshot >= 0),
  valor_pacote_calculado_snapshot numeric(12, 2) not null check (valor_pacote_calculado_snapshot >= 0),
  valor_contratado numeric(12, 2) not null check (valor_contratado >= 0),
  diferenca_valor numeric(12, 2) generated always as (
    valor_contratado - valor_pacote_calculado_snapshot
  ) stored,
  motivo_ajuste_valor text,
  valor_ajustado_por uuid,
  criado_por uuid not null,
  constraint contratos_ajuste_valor_check check (
    (valor_contratado = valor_pacote_calculado_snapshot
      and motivo_ajuste_valor is null and valor_ajustado_por is null)
    or
    (valor_contratado <> valor_pacote_calculado_snapshot
      and nullif(btrim(motivo_ajuste_valor), '') is not null
      and valor_ajustado_por is not null)
  ),

  status text not null default 'ativo' check (
    status in ('ativo', 'pausado', 'bloqueado_inadimplencia', 'concluido', 'cancelado')
  ),
  versao bigint not null default 1 check (versao > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  pausado_em timestamptz,
  cancelado_em timestamptz,
  concluido_em timestamptz,
  motivo_cancelamento text,
  cancelado_por uuid,
  constraint contratos_cancelamento_check check (
    (status <> 'cancelado' and cancelado_em is null and motivo_cancelamento is null and cancelado_por is null)
    or
    (status = 'cancelado' and cancelado_em is not null
      and nullif(btrim(motivo_cancelamento), '') is not null and cancelado_por is not null)
  )
);

create index contratos_cliente_idx on public.contratos(cliente_id, status);
create index contratos_pet_idx on public.contratos(pet_id, status);
create index contratos_pacote_idx on public.contratos(pacote_id, pacote_versao_snapshot);

create table public.contrato_itens (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references public.contratos(id) on delete restrict,
  pacote_servico_id_origem uuid references public.pacote_servicos(id) on delete set null,
  servico_id uuid not null references public.servicos(id) on delete restrict,
  servico_nome_snapshot text not null check (nullif(btrim(servico_nome_snapshot), '') is not null),
  ordem_snapshot integer not null check (ordem_snapshot > 0),
  quantidade_por_ciclo integer not null check (quantidade_por_ciclo > 0),
  intervalo_quantidade integer not null check (intervalo_quantidade > 0),
  intervalo_unidade text not null references public.unidades_periodo(codigo) on delete restrict,
  offset_inicial_quantidade integer not null check (offset_inicial_quantidade >= 0),
  offset_inicial_unidade text not null references public.unidades_periodo(codigo) on delete restrict,
  preco_avulso_unitario_snapshot numeric(12, 2) not null check (preco_avulso_unitario_snapshot >= 0),
  preco_pacote_base_unitario_snapshot numeric(12, 2) not null check (preco_pacote_base_unitario_snapshot >= 0),
  preco_pacote_unitario_calculado_snapshot numeric(12, 2) not null check (preco_pacote_unitario_calculado_snapshot >= 0),
  total_avulso_snapshot numeric(12, 2) not null check (
    total_avulso_snapshot = preco_avulso_unitario_snapshot * quantidade_por_ciclo
  ),
  total_pacote_calculado_snapshot numeric(12, 2) not null check (
    total_pacote_calculado_snapshot = preco_pacote_unitario_calculado_snapshot * quantidade_por_ciclo
  ),
  created_at timestamptz not null default now(),
  unique (contrato_id, servico_id),
  unique (contrato_id, ordem_snapshot)
);

create index contrato_itens_contrato_idx on public.contrato_itens(contrato_id, ordem_snapshot);

create table public.contrato_item_regras_aplicadas (
  id uuid primary key default gen_random_uuid(),
  contrato_item_id uuid not null references public.contrato_itens(id) on delete restrict,
  origem text not null check (origem in ('servico_avulso', 'pacote')),
  regra_servico_id_origem uuid references public.servico_regras_preco(id) on delete set null,
  regra_pacote_id_origem uuid references public.pacote_servico_regras_preco(id) on delete set null,
  ordem integer not null check (ordem > 0),
  criterio text not null check (criterio in ('porte', 'pelagem', 'raca', 'peso', 'temperamento')),
  descricao_snapshot text not null check (nullif(btrim(descricao_snapshot), '') is not null),
  valor_referencia_snapshot text not null,
  acrescimo_valor_snapshot numeric(12, 2) not null check (acrescimo_valor_snapshot >= 0),
  created_at timestamptz not null default now(),
  constraint contrato_item_regra_origem_check check (
    (origem = 'servico_avulso' and regra_pacote_id_origem is null)
    or (origem = 'pacote' and regra_servico_id_origem is null)
  ),
  unique (contrato_item_id, origem, ordem)
);

create index contrato_item_regras_item_idx
  on public.contrato_item_regras_aplicadas(contrato_item_id, origem, ordem);

create table public.contrato_eventos (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references public.contratos(id) on delete restrict,
  tipo text not null check (
    tipo = lower(btrim(tipo)) and char_length(tipo) between 1 and 60
  ),
  detalhes jsonb not null default '{}'::jsonb check (jsonb_typeof(detalhes) = 'object'),
  registrado_por uuid not null,
  ocorrido_em timestamptz not null default statement_timestamp(),
  created_at timestamptz not null default now()
);

create index contrato_eventos_contrato_idx
  on public.contrato_eventos(contrato_id, ocorrido_em, id);

create trigger contratos_atualizar_updated_at
before update on public.contratos
for each row execute function public.atualizar_updated_at();

create or replace function public.preservar_snapshot_comercial_contrato()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  if row(
    new.cliente_id, new.pet_id, new.pacote_id, new.pacote_versao_snapshot,
    new.pacote_nome_snapshot, new.pet_nome_snapshot, new.pet_especie_snapshot,
    new.pet_raca_id_snapshot, new.pet_raca_nome_snapshot, new.pet_porte_snapshot,
    new.pet_pelagem_snapshot, new.pet_peso_snapshot, new.pet_temperamento_snapshot,
    new.valor_avulso_equivalente_snapshot, new.valor_pacote_calculado_snapshot,
    new.valor_contratado, new.motivo_ajuste_valor, new.valor_ajustado_por, new.criado_por
  ) is distinct from row(
    old.cliente_id, old.pet_id, old.pacote_id, old.pacote_versao_snapshot,
    old.pacote_nome_snapshot, old.pet_nome_snapshot, old.pet_especie_snapshot,
    old.pet_raca_id_snapshot, old.pet_raca_nome_snapshot, old.pet_porte_snapshot,
    old.pet_pelagem_snapshot, old.pet_peso_snapshot, old.pet_temperamento_snapshot,
    old.valor_avulso_equivalente_snapshot, old.valor_pacote_calculado_snapshot,
    old.valor_contratado, old.motivo_ajuste_valor, old.valor_ajustado_por, old.criado_por
  ) then
    raise exception 'O snapshot comercial do Contrato e imutavel.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger contratos_preservar_snapshot_comercial
before update on public.contratos
for each row execute function public.preservar_snapshot_comercial_contrato();

create or replace function public.impedir_mutacao_historico_contrato()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  raise exception 'Snapshots e eventos do Contrato sao imutaveis.' using errcode = '23514';
end;
$$;

create trigger contrato_itens_imutaveis
before update or delete on public.contrato_itens
for each row execute function public.impedir_mutacao_historico_contrato();
create trigger contrato_item_regras_imutaveis
before update or delete on public.contrato_item_regras_aplicadas
for each row execute function public.impedir_mutacao_historico_contrato();
create trigger contrato_eventos_imutaveis
before update or delete on public.contrato_eventos
for each row execute function public.impedir_mutacao_historico_contrato();

alter table public.contratos enable row level security;
alter table public.contrato_itens enable row level security;
alter table public.contrato_item_regras_aplicadas enable row level security;
alter table public.contrato_eventos enable row level security;

revoke all on public.contratos, public.contrato_itens,
  public.contrato_item_regras_aplicadas, public.contrato_eventos
from public, anon, authenticated;

grant select on public.contratos, public.contrato_itens,
  public.contrato_item_regras_aplicadas, public.contrato_eventos
to authenticated;
grant select, insert, update on public.contratos to service_role;
grant select, insert on public.contrato_itens,
  public.contrato_item_regras_aplicadas, public.contrato_eventos
to service_role;

create policy contratos_select_internal on public.contratos
for select to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'internal');
create policy contrato_itens_select_internal on public.contrato_itens
for select to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'internal');
create policy contrato_item_regras_select_internal on public.contrato_item_regras_aplicadas
for select to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'internal');
create policy contrato_eventos_select_internal on public.contrato_eventos
for select to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'internal');

comment on table public.contratos is
  'Venda imutavel de um Pacote para um pet, com uma unica regra fixa de agendamento.';
comment on column public.contratos.data_ancora is
  'Ancora unica usada futuramente para posicionar as recorrencias proprias dos itens.';
comment on table public.contrato_itens is
  'Composicao e precos autoritativos preservados no momento da venda; nao representa creditos.';
comment on table public.contrato_item_regras_aplicadas is
  'Snapshot das regras efetivamente aplicadas aos precos avulsos e do Pacote.';
comment on table public.contrato_eventos is
  'Historico imutavel de operacoes relevantes do Contrato.';

commit;
