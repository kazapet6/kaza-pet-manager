begin;

-- A versao de ocupacao e independente da configuracao. Mudancas nela exigem
-- revalidacao, mas nao tornam uma opcao automaticamente invalida.
create table public.agenda_versao_ocupacao (
  id boolean primary key default true check (id),
  versao bigint not null default 1 check (versao > 0),
  updated_at timestamptz not null default now()
);

insert into public.agenda_versao_ocupacao (id, versao)
values (true, 1)
on conflict (id) do nothing;

create or replace function public.incrementar_agenda_versao_ocupacao()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if current_setting(
    'kaza_pet.agenda_versao_ocupacao_incrementada', true
  ) is distinct from 'true' then
    update public.agenda_versao_ocupacao
    set versao = versao + 1,
        updated_at = now()
    where id;

    if not found then
      raise exception 'A versao singleton de ocupacao da agenda nao existe.';
    end if;

    perform set_config(
      'kaza_pet.agenda_versao_ocupacao_incrementada', 'true', true
    );
  end if;

  return null;
end;
$$;

revoke all on function public.incrementar_agenda_versao_ocupacao()
  from public, anon, authenticated;

-- A disponibilidade existente e derivada do status do atendimento, do
-- vinculo das etapas e das duas tabelas de reservas efetivas.
create trigger atendimentos_incrementar_agenda_versao_ocupacao
after insert or update or delete on public.atendimentos
for each statement
execute function public.incrementar_agenda_versao_ocupacao();

create trigger atendimento_etapas_incrementar_agenda_versao_ocupacao
after insert or update or delete on public.atendimento_etapas
for each statement
execute function public.incrementar_agenda_versao_ocupacao();

create trigger atendimento_etapa_funcionarios_incrementar_versao_ocupacao
after insert or update or delete on public.atendimento_etapa_funcionarios
for each statement
execute function public.incrementar_agenda_versao_ocupacao();

create trigger atendimento_etapa_equipamentos_incrementar_versao_ocupacao
after insert or update or delete on public.atendimento_etapa_equipamentos
for each statement
execute function public.incrementar_agenda_versao_ocupacao();

-- Congela se a reserva exigia supervisao no momento em que foi criada. O
-- default preserva reservas anteriores sem inventar informacao historica.
alter table public.atendimento_etapa_equipamentos
  add column exige_supervisao_humana_snapshot boolean not null default false;

create or replace function public.preencher_snapshot_supervisao_equipamento()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  exige_supervisao boolean;
begin
  if tg_op = 'INSERT'
    or new.equipamento_unidade_id is distinct from old.equipamento_unidade_id
  then
    select equipamento.exige_supervisao_humana
    into exige_supervisao
    from public.equipamento_unidades unidade
    join public.equipamentos equipamento
      on equipamento.id = unidade.equipamento_id
    where unidade.id = new.equipamento_unidade_id;

    if not found then
      raise exception 'A unidade de equipamento da reserva nao existe.';
    end if;

    new.exige_supervisao_humana_snapshot = exige_supervisao;
  else
    new.exige_supervisao_humana_snapshot =
      old.exige_supervisao_humana_snapshot;
  end if;

  return new;
end;
$$;

revoke all on function public.preencher_snapshot_supervisao_equipamento()
  from public, anon, authenticated;

create trigger atendimento_etapa_equipamentos_snapshot_supervisao
before insert or update on public.atendimento_etapa_equipamentos
for each row
execute function public.preencher_snapshot_supervisao_equipamento();

-- Supervisao e uma cobertura compartilhavel, separada do trabalho humano
-- exclusivo. Uma reserva pode ser coberta por varios segmentos e o mesmo
-- funcionario pode supervisionar mais de um equipamento simultaneamente.
create table public.atendimento_etapa_equipamento_supervisoes (
  id uuid primary key default gen_random_uuid(),
  atendimento_etapa_equipamento_id uuid not null
    references public.atendimento_etapa_equipamentos(id) on delete cascade,
  funcionario_id uuid not null
    references public.funcionarios(id) on delete restrict,
  inicio timestamptz not null,
  fim timestamptz not null,
  created_at timestamptz not null default now(),
  constraint atend_equip_supervisoes_horario_check
    check (fim > inicio),
  constraint atend_equip_supervisoes_segmento_key
    unique (
      atendimento_etapa_equipamento_id,
      funcionario_id,
      inicio,
      fim
    )
);

create or replace function public.validar_segmento_supervisao_equipamento()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  reserva public.atendimento_etapa_equipamentos%rowtype;
begin
  select item.*
  into reserva
  from public.atendimento_etapa_equipamentos item
  where item.id = new.atendimento_etapa_equipamento_id;

  if not found then
    raise exception 'A reserva de equipamento supervisionada nao existe.';
  end if;

  if not reserva.exige_supervisao_humana_snapshot then
    raise exception 'A reserva de equipamento nao exige supervisao humana.';
  end if;

  if new.inicio < reserva.inicio_planejado
    or new.fim > reserva.fim_planejado
  then
    raise exception 'O segmento de supervisao deve estar contido na reserva.';
  end if;

  return new;
end;
$$;

revoke all on function public.validar_segmento_supervisao_equipamento()
  from public, anon, authenticated;

create trigger atend_equip_supervisao_validar_segmento
before insert or update
on public.atendimento_etapa_equipamento_supervisoes
for each row
execute function public.validar_segmento_supervisao_equipamento();

create or replace function public.validar_cobertura_supervisao_equipamento(
  p_reserva_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  reserva public.atendimento_etapa_equipamentos%rowtype;
  inicio_cobertura timestamptz;
  fim_cobertura timestamptz;
  possui_lacuna boolean;
  quantidade_segmentos integer;
begin
  select item.*
  into reserva
  from public.atendimento_etapa_equipamentos item
  where item.id = p_reserva_id;

  -- A exclusao da reserva elimina os segmentos por cascade e nao precisa ser
  -- validada. A transacao que a remove ainda incrementa a versao de ocupacao.
  if not found then
    return;
  end if;

  select
    count(*)::integer,
    min(segmento.inicio),
    max(segmento.fim)
  into quantidade_segmentos, inicio_cobertura, fim_cobertura
  from public.atendimento_etapa_equipamento_supervisoes segmento
  where segmento.atendimento_etapa_equipamento_id = p_reserva_id;

  if not reserva.exige_supervisao_humana_snapshot then
    if quantidade_segmentos > 0 then
      raise exception 'Uma reserva sem exigencia de supervisao possui segmentos.';
    end if;
    return;
  end if;

  if quantidade_segmentos = 0
    or inicio_cobertura <> reserva.inicio_planejado
    or fim_cobertura <> reserva.fim_planejado
  then
    raise exception 'A supervisao nao cobre integralmente a reserva.';
  end if;

  select exists (
    select 1
    from (
      select
        segmento.inicio,
        max(segmento.fim) over (
          order by segmento.inicio, segmento.fim
          rows between unbounded preceding and 1 preceding
        ) as fim_coberto_antes
      from public.atendimento_etapa_equipamento_supervisoes segmento
      where segmento.atendimento_etapa_equipamento_id = p_reserva_id
    ) ordenado
    where ordenado.fim_coberto_antes is not null
      and ordenado.inicio > ordenado.fim_coberto_antes
  ) into possui_lacuna;

  if possui_lacuna then
    raise exception 'Existe uma lacuna entre segmentos de supervisao.';
  end if;
end;
$$;

revoke all on function public.validar_cobertura_supervisao_equipamento(uuid)
  from public, anon, authenticated;

create or replace function public.revalidar_cobertura_supervisao_por_reserva()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op <> 'DELETE' then
    perform public.validar_cobertura_supervisao_equipamento(new.id);
  end if;

  if tg_op <> 'INSERT'
    and (
      tg_op = 'DELETE'
      or old.id is distinct from new.id
    )
  then
    perform public.validar_cobertura_supervisao_equipamento(old.id);
  end if;

  return null;
end;
$$;

revoke all on function public.revalidar_cobertura_supervisao_por_reserva()
  from public, anon, authenticated;

create or replace function public.revalidar_cobertura_supervisao_por_segmento()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op <> 'DELETE' then
    perform public.validar_cobertura_supervisao_equipamento(
      new.atendimento_etapa_equipamento_id
    );
  end if;

  if tg_op <> 'INSERT'
    and (
      tg_op = 'DELETE'
      or old.atendimento_etapa_equipamento_id is distinct from
        new.atendimento_etapa_equipamento_id
    )
  then
    perform public.validar_cobertura_supervisao_equipamento(
      old.atendimento_etapa_equipamento_id
    );
  end if;

  return null;
end;
$$;

revoke all on function public.revalidar_cobertura_supervisao_por_segmento()
  from public, anon, authenticated;

-- A validacao e adiada ate o commit para permitir inserir primeiro a reserva
-- e depois todos os segmentos que, em conjunto, formam sua cobertura.
create constraint trigger atend_equip_validar_cobertura_supervisao
after insert or update or delete on public.atendimento_etapa_equipamentos
deferrable initially deferred
for each row
execute function public.revalidar_cobertura_supervisao_por_reserva();

create constraint trigger atend_equip_supervisao_validar_cobertura
after insert or update or delete
on public.atendimento_etapa_equipamento_supervisoes
deferrable initially deferred
for each row
execute function public.revalidar_cobertura_supervisao_por_segmento();

create index atend_equip_supervisoes_reserva_periodo_idx
  on public.atendimento_etapa_equipamento_supervisoes
  (atendimento_etapa_equipamento_id, inicio, fim);

create index atend_equip_supervisoes_funcionario_periodo_idx
  on public.atendimento_etapa_equipamento_supervisoes
  (funcionario_id, inicio, fim);

alter table public.agenda_versao_ocupacao enable row level security;
alter table public.atendimento_etapa_equipamento_supervisoes
  enable row level security;

grant select on public.agenda_versao_ocupacao,
  public.atendimento_etapa_equipamento_supervisoes
  to anon, authenticated;

create policy agenda_versao_ocupacao_select
  on public.agenda_versao_ocupacao
  for select to anon, authenticated using (true);

create policy atend_equip_supervisoes_select
  on public.atendimento_etapa_equipamento_supervisoes
  for select to anon, authenticated using (true);

commit;
