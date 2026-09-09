begin;

-- Token global usado para detectar mudancas de configuracao entre a consulta
-- de disponibilidade e a futura confirmacao em ambiente confiavel.
create table public.agenda_versao_configuracao (
  id boolean primary key default true check (id),
  versao bigint not null default 1 check (versao > 0),
  updated_at timestamptz not null default now()
);

insert into public.agenda_versao_configuracao (id, versao)
values (true, 1)
on conflict (id) do nothing;

create or replace function public.incrementar_agenda_versao_configuracao()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  -- A configuracao local desaparece no commit/rollback. Assim, operacoes que
  -- alteram varias tabelas incrementam a versao apenas uma vez por transacao.
  if current_setting(
    'kaza_pet.agenda_versao_incrementada', true
  ) is distinct from 'true' then
    update public.agenda_versao_configuracao
    set versao = versao + 1,
        updated_at = now()
    where id;

    if not found then
      raise exception 'A versao singleton da configuracao da agenda nao existe.';
    end if;

    perform set_config(
      'kaza_pet.agenda_versao_incrementada', 'true', true
    );
  end if;

  return null;
end;
$$;

revoke all on function public.incrementar_agenda_versao_configuracao()
  from public, anon, authenticated;

-- Triggers de instrucao evitam chamadas por linha; a protecao transacional da
-- funcao tambem consolida alteracoes feitas em tabelas distintas.
do $$
declare
  tabela text;
begin
  foreach tabela in array array[
    'configuracao_agenda',
    'estabelecimento_blocos',
    'estabelecimento_excecoes',
    'estabelecimento_excecao_blocos',
    'servicos',
    'servico_etapas',
    'servico_etapa_recursos',
    'servico_modificadores',
    'servico_regras_preco',
    'servico_dependencias',
    'servico_acoplamentos',
    'servico_especies',
    'servico_portes',
    'servico_racas_bloqueadas',
    'funcionarios',
    'funcionario_jornadas',
    'funcionario_intervalos',
    'funcionario_servicos',
    'funcionario_etapas',
    'equipamentos',
    'equipamento_unidades',
    'equipamento_perfis_capacidade',
    'equipamento_perfil_itens',
    'taxidog_ciclos',
    'taxidog_ciclo_dias',
    'janelas_transporte',
    'racas'
  ]
  loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I '
      || 'for each statement execute function '
      || 'public.incrementar_agenda_versao_configuracao()',
      tabela || '_incrementar_agenda_versao', tabela
    );
  end loop;
end;
$$;

-- Compatibilidade TaxiDog: grupos antigos continuam vinculados a uma janela;
-- grupos novos usam um ciclo e preservam seus dados operacionais em snapshot.
alter table public.grupos_agendamento
  add column taxidog_ciclo_id uuid
    references public.taxidog_ciclos(id) on delete restrict,
  add column taxidog_ciclo_nome_snapshot text,
  add column taxidog_ciclo_ordem_snapshot integer,
  add column taxidog_coleta_inicio_snapshot time,
  add column taxidog_coleta_fim_snapshot time,
  add column taxidog_conclusao_limite_snapshot time,
  add column chave_idempotencia uuid,
  add column hash_requisicao text,
  add column configuracao_versao bigint;

alter table public.grupos_agendamento
  drop constraint grupo_agendamento_modalidade_check,
  add constraint grupo_agendamento_modalidade_check check (
    (
      modalidade = 'normal'
      and horario_chegada_comprometido is not null
      and janela_transporte_id is null
      and taxidog_ciclo_id is null
    )
    or
    (
      modalidade = 'taxidog'
      and horario_chegada_comprometido is null
      and (
        (janela_transporte_id is not null and taxidog_ciclo_id is null)
        or
        (janela_transporte_id is null and taxidog_ciclo_id is not null)
      )
    )
  ),
  add constraint grupo_agendamento_taxidog_snapshots_check check (
    (
      taxidog_ciclo_id is null
      and taxidog_ciclo_nome_snapshot is null
      and taxidog_ciclo_ordem_snapshot is null
      and taxidog_coleta_inicio_snapshot is null
      and taxidog_coleta_fim_snapshot is null
      and taxidog_conclusao_limite_snapshot is null
    )
    or
    (
      taxidog_ciclo_id is not null
      and nullif(btrim(taxidog_ciclo_nome_snapshot), '') is not null
      and taxidog_ciclo_ordem_snapshot is not null
      and taxidog_ciclo_ordem_snapshot > 0
      and taxidog_coleta_inicio_snapshot is not null
      and taxidog_coleta_fim_snapshot is not null
      and taxidog_conclusao_limite_snapshot is not null
      and taxidog_coleta_fim_snapshot > taxidog_coleta_inicio_snapshot
      and taxidog_conclusao_limite_snapshot >= taxidog_coleta_fim_snapshot
    )
  ),
  add constraint grupo_agendamento_idempotencia_check check (
    (
      chave_idempotencia is null
      and hash_requisicao is null
      and configuracao_versao is null
    )
    or
    (
      chave_idempotencia is not null
      and hash_requisicao is not null
      and configuracao_versao is not null
    )
  ),
  add constraint grupo_agendamento_hash_requisicao_check check (
    hash_requisicao is null
    or hash_requisicao ~ '^[0-9a-f]{64}$'
  ),
  add constraint grupo_agendamento_configuracao_versao_check check (
    configuracao_versao is null or configuracao_versao > 0
  ),
  add constraint grupos_agendamento_chave_idempotencia_key
    unique (chave_idempotencia);

create index grupos_agendamento_taxidog_ciclo_data_idx
  on public.grupos_agendamento (taxidog_ciclo_id, data_operacional)
  where taxidog_ciclo_id is not null;

-- O ciclo moderno pertence ao grupo. A coluna legada no atendimento fica nula
-- nesse caso, e o trigger existente continua validando a coerencia do grupo.
alter table public.atendimentos
  drop constraint atendimento_transporte_check,
  add constraint atendimento_transporte_check check (
    transporte or janela_transporte_id is null
  );

-- Chaves compostas impedem que uma contribuicao misture registros pertencentes
-- a atendimentos diferentes.
alter table public.atendimento_etapas
  add constraint atendimento_etapas_id_atendimento_id_key
    unique (id, atendimento_id);

create table public.atendimento_etapa_contribuicoes (
  id uuid primary key default gen_random_uuid(),
  atendimento_id uuid not null,
  atendimento_etapa_id uuid not null,
  atendimento_servico_id uuid not null,
  servico_etapa_origem_id uuid not null
    references public.servico_etapas(id) on delete restrict,
  ordem integer not null check (ordem > 0),
  etapa_nome_snapshot text not null
    check (length(btrim(etapa_nome_snapshot)) > 0),
  duracao_base_snapshot integer not null
    check (duracao_base_snapshot > 0),
  duracao_calculada_snapshot integer not null
    check (duracao_calculada_snapshot >= duracao_base_snapshot),
  recursos_snapshot jsonb not null default '[]'::jsonb
    check (jsonb_typeof(recursos_snapshot) = 'array'),
  habilitacoes_snapshot jsonb not null default '[]'::jsonb
    check (jsonb_typeof(habilitacoes_snapshot) = 'array'),
  created_at timestamptz not null default now(),
  constraint atendimento_etapa_contribuicoes_etapa_fkey
    foreign key (atendimento_etapa_id, atendimento_id)
    references public.atendimento_etapas (id, atendimento_id)
    on delete cascade,
  constraint atendimento_etapa_contribuicoes_servico_fkey
    foreign key (atendimento_servico_id, atendimento_id)
    references public.atendimento_servicos (id, atendimento_id)
    on delete cascade,
  constraint atendimento_etapa_contribuicoes_etapa_servico_key
    unique (atendimento_etapa_id, atendimento_servico_id),
  constraint atendimento_etapa_contribuicoes_etapa_ordem_key
    unique (atendimento_etapa_id, ordem)
);

create index atendimento_etapa_contribuicoes_atendimento_idx
  on public.atendimento_etapa_contribuicoes (atendimento_id);
create index atendimento_etapa_contribuicoes_servico_idx
  on public.atendimento_etapa_contribuicoes (atendimento_servico_id);
create index atendimento_etapa_contribuicoes_origem_idx
  on public.atendimento_etapa_contribuicoes (servico_etapa_origem_id);

alter table public.agenda_versao_configuracao enable row level security;
alter table public.atendimento_etapa_contribuicoes enable row level security;

grant select on public.agenda_versao_configuracao,
  public.atendimento_etapa_contribuicoes to anon, authenticated;

create policy agenda_versao_configuracao_select
  on public.agenda_versao_configuracao
  for select to anon, authenticated using (true);
create policy atendimento_etapa_contribuicoes_select
  on public.atendimento_etapa_contribuicoes
  for select to anon, authenticated using (true);

-- Divida de seguranca deliberada: os grants de escrita direta das tabelas
-- operacionais existentes somente serao revogados depois que RPC e Edge
-- Function tiverem sido implementadas e validadas como caminho oficial.

commit;
