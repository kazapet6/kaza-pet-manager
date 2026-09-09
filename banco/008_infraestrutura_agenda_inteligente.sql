begin;

-- Configuracao geral e calendario proprio do estabelecimento.
create table public.configuracao_agenda (
  id boolean primary key default true check (id),
  timezone text not null default 'America/Sao_Paulo'
    check (length(btrim(timezone)) > 0),
  granularidade_minutos integer not null default 5
    check (granularidade_minutos between 1 and 60),
  horizonte_dias integer not null default 90
    check (horizonte_dias > 0),
  antecedencia_minutos integer not null default 0
    check (antecedencia_minutos >= 0),
  espera_encaixe_minutos integer not null default 15
    check (espera_encaixe_minutos >= 0),
  espera_pos_secagem_minutos integer not null default 60
    check (espera_pos_secagem_minutos >= 0),
  concluir_no_mesmo_bloco boolean not null default true,
  encaixe_interno_ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.configuracao_agenda (id)
values (true)
on conflict (id) do nothing;

create table public.estabelecimento_blocos (
  id uuid primary key default gen_random_uuid(),
  dia_semana smallint not null check (dia_semana between 0 and 6),
  inicio time not null,
  fim time not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  constraint estabelecimento_bloco_horario_check check (fim > inicio),
  unique (dia_semana, inicio, fim)
);

create table public.estabelecimento_excecoes (
  id uuid primary key default gen_random_uuid(),
  data date not null unique,
  fechado boolean not null default true,
  descricao text not null default '',
  created_at timestamptz not null default now()
);

create table public.estabelecimento_excecao_blocos (
  id uuid primary key default gen_random_uuid(),
  excecao_id uuid not null references public.estabelecimento_excecoes(id)
    on delete cascade,
  inicio time not null,
  fim time not null,
  constraint estabelecimento_excecao_bloco_horario_check check (fim > inicio),
  unique (excecao_id, inicio, fim)
);

-- O funcionamento oficial deve ser configurado separadamente. A ausencia de
-- blocos significa que a Agenda ainda nao foi configurada.

-- Uma unidade fisica e a fronteira independente de capacidade e sexo.
create table public.equipamento_unidades (
  id uuid primary key default gen_random_uuid(),
  equipamento_id uuid not null references public.equipamentos(id) on delete cascade,
  numero integer not null check (numero > 0),
  nome text not null default '',
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (equipamento_id, numero)
);

with limites as (
  select equipamento.id as equipamento_id,
    greatest(
      equipamento.quantidade_unidades,
      coalesce(max(etapa.unidade_equipamento), 0)
    ) as quantidade
  from public.equipamentos equipamento
  left join public.atendimento_etapas etapa
    on etapa.equipamento_id = equipamento.id
  group by equipamento.id, equipamento.quantidade_unidades
)
insert into public.equipamento_unidades (equipamento_id, numero, nome)
select limite.equipamento_id, numero,
  'Unidade ' || numero::text
from limites limite
cross join lateral generate_series(1, limite.quantidade) numero
on conflict (equipamento_id, numero) do nothing;

-- Requisitos configuraveis permitem combinacoes e quantidades de recursos.
create table public.servico_etapa_recursos (
  id uuid primary key default gen_random_uuid(),
  servico_etapa_id uuid not null references public.servico_etapas(id)
    on delete cascade,
  tipo text not null check (tipo in ('funcionario', 'equipamento')),
  equipamento_id uuid references public.equipamentos(id) on delete restrict,
  quantidade integer not null default 1 check (quantidade > 0),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  constraint servico_etapa_recurso_tipo_check check (
    (tipo = 'funcionario' and equipamento_id is null)
    or (tipo = 'equipamento' and equipamento_id is not null)
  )
);

create unique index servico_etapa_recurso_funcionario_uidx
  on public.servico_etapa_recursos (servico_etapa_id, tipo)
  where tipo = 'funcionario';
create unique index servico_etapa_recurso_equipamento_uidx
  on public.servico_etapa_recursos (servico_etapa_id, equipamento_id)
  where tipo = 'equipamento';

insert into public.servico_etapa_recursos (
  servico_etapa_id, tipo, equipamento_id, quantidade, ativo
)
select etapa.id, etapa.recurso, etapa.equipamento_id, 1, etapa.ativo
from public.servico_etapas etapa
where etapa.recurso in ('funcionario', 'equipamento')
on conflict do nothing;

-- Um grupo representa uma unica operacao de reserva do mesmo tutor.
create table public.grupos_agendamento (
  id uuid primary key default gen_random_uuid(),
  cliente_id text not null references public.clientes(id)
    on update cascade on delete restrict,
  modalidade text not null default 'normal'
    check (modalidade in ('normal', 'taxidog')),
  origem text not null default 'interno'
    check (origem in ('interno', 'autoagendamento')),
  data_operacional date not null,
  horario_chegada_comprometido timestamptz,
  janela_transporte_id uuid references public.janelas_transporte(id)
    on delete restrict,
  janela_nome_snapshot text,
  coleta_inicio_snapshot time,
  coleta_fim_snapshot time,
  operacao_inicio_snapshot time,
  operacao_fim_snapshot time,
  retirada_prevista timestamptz,
  observacoes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint grupo_agendamento_modalidade_check check (
    (modalidade = 'normal' and horario_chegada_comprometido is not null
      and janela_transporte_id is null)
    or
    (modalidade = 'taxidog' and horario_chegada_comprometido is null
      and janela_transporte_id is not null)
  )
);

-- Campos novos convivem com servico_id, inicio_planejado e transporte.
alter table public.atendimentos
  add column grupo_agendamento_id uuid
    references public.grupos_agendamento(id) on delete restrict,
  add column horario_chegada_comprometido timestamptz,
  add column inicio_operacional_planejado timestamptz,
  add column conclusao_operacional_prevista timestamptz,
  add column retirada_prevista timestamptz,
  add column tipo_planejamento text not null default 'regular'
    check (tipo_planejamento in ('regular', 'encaixe', 'freestyle')),
  add column freestyle_motivo text,
  add column preferencia_funcionario text not null default 'automatico'
    check (preferencia_funcionario in ('automatico', 'preferencial', 'obrigatorio')),
  add column funcionario_preferido_id uuid
    references public.funcionarios(id) on delete restrict,
  add column pet_nome_snapshot text,
  add column pet_especie_snapshot text
    check (pet_especie_snapshot in ('cao', 'gato')),
  add column pet_raca_id_snapshot uuid references public.racas(id) on delete restrict,
  add column pet_raca_nome_snapshot text,
  add column pet_sexo_snapshot text
    check (pet_sexo_snapshot in ('macho', 'femea')),
  add column pet_porte_snapshot text
    check (pet_porte_snapshot in ('mini', 'pequeno', 'medio', 'grande', 'gigante')),
  add column pet_pelagem_snapshot text
    check (pet_pelagem_snapshot in ('curta', 'media', 'longa')),
  add column pet_peso_snapshot numeric(8, 2)
    check (pet_peso_snapshot is null or pet_peso_snapshot >= 0),
  add column pet_temperamento_snapshot text
    check (pet_temperamento_snapshot in ('calmo', 'moderado', 'dificil')),
  add column valor_calculado numeric(10, 2) not null default 0,
  add column desconto_valor numeric(10, 2) not null default 0,
  add column valor_manual numeric(10, 2),
  add column valor_final numeric(10, 2) not null default 0,
  add column motivo_alteracao_valor text,
  add column alteracao_valor_autorizada boolean not null default false,
  add column valor_alterado_por uuid;

update public.atendimentos atendimento
set inicio_operacional_planejado = atendimento.inicio_planejado,
    horario_chegada_comprometido = case
      when atendimento.transporte then null
      else atendimento.inicio_planejado
    end,
    pet_nome_snapshot = pet.nome,
    pet_especie_snapshot = pet.especie,
    pet_raca_id_snapshot = pet.raca_id,
    pet_raca_nome_snapshot = raca.nome,
    pet_sexo_snapshot = pet.sexo,
    pet_porte_snapshot = pet.porte,
    pet_pelagem_snapshot = pet.pelagem,
    pet_peso_snapshot = pet.peso,
    pet_temperamento_snapshot = pet.temperamento,
    valor_calculado = servico.preco_base,
    valor_final = servico.preco_base
from public.pets pet
join public.racas raca on raca.id = pet.raca_id
join public.servicos servico on true
where pet.id = atendimento.pet_id
  and servico.id = atendimento.servico_id;

-- Substitui apenas a regra de dominio do status. O valor legado e convertido.
update public.atendimentos
set status = 'confirmado'
where status = 'em_atendimento';

alter table public.atendimentos
  drop constraint if exists atendimentos_status_check;
alter table public.atendimentos
  add constraint atendimentos_status_check check (
    status in (
      'agendado', 'confirmado', 'aguardando_retirada',
      'aguardando_entrega', 'concluido', 'cancelado', 'faltou'
    )
  ),
  add constraint atendimento_freestyle_motivo_check check (
    tipo_planejamento <> 'freestyle'
    or nullif(btrim(freestyle_motivo), '') is not null
  ),
  add constraint atendimento_preferencia_funcionario_check check (
    (preferencia_funcionario = 'automatico' and funcionario_preferido_id is null)
    or
    (preferencia_funcionario in ('preferencial', 'obrigatorio')
      and funcionario_preferido_id is not null)
  ),
  add constraint atendimento_valores_check check (
    valor_calculado >= 0
    and desconto_valor >= 0
    and desconto_valor <= valor_calculado
    and (valor_manual is null or valor_manual >= 0)
    and (desconto_valor = 0 or valor_manual is null)
    and valor_final >= 0
    and valor_final = case
      when valor_manual is not null then valor_manual
      else valor_calculado - desconto_valor
    end
  ),
  add constraint atendimento_alteracao_valor_check check (
    (desconto_valor = 0 and valor_manual is null)
    or (
      nullif(btrim(motivo_alteracao_valor), '') is not null
      and (
        valor_manual is null
        or alteracao_valor_autorizada
      )
    )
  );

-- Cada atendimento legado recebe um grupo proprio; nenhum dado e descartado.
insert into public.grupos_agendamento (
  id, cliente_id, modalidade, origem, data_operacional,
  horario_chegada_comprometido, janela_transporte_id,
  janela_nome_snapshot, coleta_inicio_snapshot, coleta_fim_snapshot,
  operacao_inicio_snapshot, operacao_fim_snapshot, retirada_prevista,
  observacoes, created_at, updated_at
)
select atendimento.id, pet.cliente_id,
  case when atendimento.transporte then 'taxidog' else 'normal' end,
  'interno',
  coalesce(
    (atendimento.inicio_planejado at time zone configuracao.timezone)::date,
    atendimento.created_at::date
  ),
  case when atendimento.transporte then null else
    coalesce(atendimento.inicio_planejado, atendimento.created_at)
  end,
  atendimento.janela_transporte_id,
  janela.nome, janela.coleta_inicio, janela.coleta_fim,
  janela.operacao_inicio, janela.operacao_fim,
  atendimento.retirada_prevista,
  atendimento.observacoes, atendimento.created_at, atendimento.updated_at
from public.atendimentos atendimento
join public.pets pet on pet.id = atendimento.pet_id
cross join public.configuracao_agenda configuracao
left join public.janelas_transporte janela
  on janela.id = atendimento.janela_transporte_id
on conflict (id) do nothing;

update public.atendimentos
set grupo_agendamento_id = id
where grupo_agendamento_id is null;

alter table public.atendimentos
  alter column grupo_agendamento_id set not null;

-- Servicos efetivos, inclusive dependencias, serao materializados aqui.
create table public.atendimento_servicos (
  id uuid primary key default gen_random_uuid(),
  atendimento_id uuid not null references public.atendimentos(id) on delete cascade,
  servico_id uuid not null references public.servicos(id) on delete restrict,
  ordem integer not null check (ordem > 0),
  origem text not null default 'solicitado'
    check (origem in ('solicitado', 'dependencia')),
  originado_por_atendimento_servico_id uuid,
  nome_snapshot text not null check (length(btrim(nome_snapshot)) > 0),
  preco_base_snapshot numeric(10, 2) not null check (preco_base_snapshot >= 0),
  valor_calculado numeric(10, 2) not null check (valor_calculado >= 0),
  desconto_valor numeric(10, 2) not null default 0 check (desconto_valor >= 0),
  valor_manual numeric(10, 2) check (valor_manual is null or valor_manual >= 0),
  valor_final numeric(10, 2) not null check (valor_final >= 0),
  motivo_alteracao_valor text,
  alteracao_valor_autorizada boolean not null default false,
  valor_alterado_por uuid,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  constraint atendimento_servico_origem_check check (
    (origem = 'solicitado' and originado_por_atendimento_servico_id is null)
    or
    (origem = 'dependencia' and originado_por_atendimento_servico_id is not null)
  ),
  constraint atendimento_servico_valores_check check (
    desconto_valor <= valor_calculado
    and (desconto_valor = 0 or valor_manual is null)
    and valor_final = case
      when valor_manual is not null then valor_manual
      else valor_calculado - desconto_valor
    end
  ),
  constraint atendimento_servico_alteracao_valor_check check (
    (desconto_valor = 0 and valor_manual is null)
    or (
      nullif(btrim(motivo_alteracao_valor), '') is not null
      and (valor_manual is null or alteracao_valor_autorizada)
    )
  ),
  unique (id, atendimento_id),
  constraint atendimento_servico_origem_mesmo_atendimento_fkey
    foreign key (originado_por_atendimento_servico_id, atendimento_id)
    references public.atendimento_servicos (id, atendimento_id)
    on delete restrict,
  unique (atendimento_id, servico_id),
  unique (atendimento_id, ordem)
);

insert into public.atendimento_servicos (
  atendimento_id, servico_id, ordem, origem, nome_snapshot,
  preco_base_snapshot, valor_calculado, valor_final, created_at
)
select atendimento.id, servico.id, 1, 'solicitado', servico.nome,
  servico.preco_base, servico.preco_base, servico.preco_base,
  atendimento.created_at
from public.atendimentos atendimento
join public.servicos servico on servico.id = atendimento.servico_id
on conflict (atendimento_id, servico_id) do nothing;

-- Dependencias configuradas tornam-se servicos reais do atendimento legado.
update public.atendimento_servicos
set ordem = 2147483647
where origem = 'solicitado';

with recursive dependencias as (
  select raiz.id as atendimento_servico_raiz_id,
    raiz.atendimento_id,
    dependencia.dependencia_servico_id as servico_id,
    1 as profundidade,
    array[raiz.servico_id, dependencia.dependencia_servico_id]::uuid[] as caminho
  from public.atendimento_servicos raiz
  join public.servico_dependencias dependencia
    on dependencia.servico_id = raiz.servico_id
   and dependencia.ativo
  where raiz.origem = 'solicitado'

  union all

  select anterior.atendimento_servico_raiz_id,
    anterior.atendimento_id,
    dependencia.dependencia_servico_id,
    anterior.profundidade + 1,
    anterior.caminho || dependencia.dependencia_servico_id
  from dependencias anterior
  join public.servico_dependencias dependencia
    on dependencia.servico_id = anterior.servico_id
   and dependencia.ativo
  where not dependencia.dependencia_servico_id = any(anterior.caminho)
), unicas as (
  select distinct on (atendimento_id, servico_id)
    atendimento_servico_raiz_id, atendimento_id, servico_id, profundidade
  from dependencias
  order by atendimento_id, servico_id, profundidade desc
), ordenadas as (
  select unicas.*,
    row_number() over (
      partition by atendimento_id
      order by profundidade desc, servico_id
    )::integer as ordem
  from unicas
)
insert into public.atendimento_servicos (
  atendimento_id, servico_id, ordem, origem,
  originado_por_atendimento_servico_id, nome_snapshot,
  preco_base_snapshot, valor_calculado, valor_final
)
select ordenada.atendimento_id, servico.id, ordenada.ordem, 'dependencia',
  ordenada.atendimento_servico_raiz_id, servico.nome,
  servico.preco_base, servico.preco_base, servico.preco_base
from ordenadas ordenada
join public.servicos servico on servico.id = ordenada.servico_id
on conflict (atendimento_id, servico_id) do nothing;

update public.atendimento_servicos solicitado
set ordem = dependencias.quantidade + 1
from (
  select atendimento_id, count(*)::integer as quantidade
  from public.atendimento_servicos
  where origem = 'dependencia'
  group by atendimento_id
) dependencias
where solicitado.atendimento_id = dependencias.atendimento_id
  and solicitado.origem = 'solicitado';

update public.atendimento_servicos
set ordem = 1
where origem = 'solicitado'
  and ordem = 2147483647;

update public.atendimentos atendimento
set valor_calculado = totais.valor_calculado,
    valor_final = totais.valor_calculado
from (
  select atendimento_servico.atendimento_id,
    sum(atendimento_servico.valor_calculado)::numeric(10, 2) as valor_calculado
  from public.atendimento_servicos atendimento_servico
  where atendimento_servico.ativo
  group by atendimento_servico.atendimento_id
) totais
where totais.atendimento_id = atendimento.id;

create table public.atendimento_servico_acrescimos (
  id uuid primary key default gen_random_uuid(),
  atendimento_servico_id uuid not null
    references public.atendimento_servicos(id) on delete cascade,
  tipo text not null check (tipo in ('preco', 'duracao')),
  criterio text not null
    check (criterio in ('porte', 'pelagem', 'raca', 'peso', 'temperamento')),
  regra_preco_id uuid references public.servico_regras_preco(id) on delete restrict,
  modificador_id uuid references public.servico_modificadores(id) on delete restrict,
  descricao_snapshot text not null,
  valor_referencia_snapshot text,
  acrescimo_valor numeric(10, 2) not null default 0
    check (acrescimo_valor >= 0),
  acrescimo_minutos integer not null default 0
    check (acrescimo_minutos >= 0),
  created_at timestamptz not null default now(),
  constraint atendimento_servico_acrescimo_tipo_check check (
    (tipo = 'preco' and regra_preco_id is not null and modificador_id is null
      and acrescimo_minutos = 0)
    or
    (tipo = 'duracao' and modificador_id is not null and regra_preco_id is null
      and acrescimo_valor = 0)
  )
);

alter table public.atendimento_etapas
  add column atendimento_servico_id uuid
    references public.atendimento_servicos(id) on delete cascade,
  add column nome_snapshot text,
  add column ordem_snapshot integer check (ordem_snapshot is null or ordem_snapshot > 0),
  add column duracao_minutos_snapshot integer
    check (duracao_minutos_snapshot is null or duracao_minutos_snapshot > 0),
  add column recursos_snapshot jsonb not null default '[]'::jsonb
    check (jsonb_typeof(recursos_snapshot) = 'array');

update public.atendimento_etapas atendimento_etapa
set atendimento_servico_id = atendimento_servico.id,
    nome_snapshot = servico_etapa.nome,
    ordem_snapshot = servico_etapa.ordem,
    duracao_minutos_snapshot = greatest(1, ceil(extract(
      epoch from (atendimento_etapa.fim_planejado - atendimento_etapa.inicio_planejado)
    ) / 60.0)::integer),
    recursos_snapshot = coalesce((
      select jsonb_agg(jsonb_build_object(
        'tipo', recurso.tipo,
        'equipamento_id', recurso.equipamento_id,
        'quantidade', recurso.quantidade
      ) order by recurso.tipo, recurso.equipamento_id)
      from public.servico_etapa_recursos recurso
      where recurso.servico_etapa_id = servico_etapa.id
        and recurso.ativo
    ), '[]'::jsonb)
from public.servico_etapas servico_etapa
join public.atendimento_servicos atendimento_servico
  on atendimento_servico.servico_id = servico_etapa.servico_id
where servico_etapa.id = atendimento_etapa.servico_etapa_id
  and atendimento_servico.atendimento_id = atendimento_etapa.atendimento_id;

with limites as (
  select etapa.atendimento_id,
    min(etapa.inicio_planejado) as inicio_operacional,
    max(etapa.fim_planejado) as conclusao_operacional
  from public.atendimento_etapas etapa
  group by etapa.atendimento_id
)
update public.atendimentos atendimento
set inicio_operacional_planejado = limites.inicio_operacional,
    conclusao_operacional_prevista = limites.conclusao_operacional
from limites
where limites.atendimento_id = atendimento.id;

with retiradas as (
  select atendimento.grupo_agendamento_id,
    max(atendimento.conclusao_operacional_prevista) as retirada_prevista
  from public.atendimentos atendimento
  join public.grupos_agendamento grupo
    on grupo.id = atendimento.grupo_agendamento_id
  where grupo.modalidade = 'normal'
  group by atendimento.grupo_agendamento_id
)
update public.grupos_agendamento grupo
set retirada_prevista = retirada.retirada_prevista
from retiradas retirada
where retirada.grupo_agendamento_id = grupo.id;

update public.atendimentos atendimento
set retirada_prevista = grupo.retirada_prevista
from public.grupos_agendamento grupo
where grupo.id = atendimento.grupo_agendamento_id
  and grupo.modalidade = 'normal';

-- Alocacoes efetivas sao separadas dos requisitos e aceitam multiplos recursos.
create table public.atendimento_etapa_funcionarios (
  id uuid primary key default gen_random_uuid(),
  atendimento_etapa_id uuid not null
    references public.atendimento_etapas(id) on delete cascade,
  funcionario_id uuid not null references public.funcionarios(id) on delete restrict,
  inicio_planejado timestamptz not null,
  fim_planejado timestamptz not null,
  created_at timestamptz not null default now(),
  constraint atendimento_etapa_funcionario_horario_check
    check (fim_planejado > inicio_planejado),
  unique (atendimento_etapa_id, funcionario_id)
);

insert into public.atendimento_etapa_funcionarios (
  atendimento_etapa_id, funcionario_id, inicio_planejado, fim_planejado
)
select id, funcionario_id, inicio_planejado, fim_planejado
from public.atendimento_etapas
where funcionario_id is not null
on conflict (atendimento_etapa_id, funcionario_id) do nothing;

create table public.atendimento_etapa_equipamentos (
  id uuid primary key default gen_random_uuid(),
  atendimento_etapa_id uuid not null
    references public.atendimento_etapas(id) on delete cascade,
  equipamento_unidade_id uuid not null
    references public.equipamento_unidades(id) on delete restrict,
  inicio_planejado timestamptz not null,
  fim_planejado timestamptz not null,
  porte_snapshot text not null
    check (porte_snapshot in ('mini', 'pequeno', 'medio', 'grande', 'gigante')),
  sexo_snapshot text not null check (sexo_snapshot in ('macho', 'femea')),
  created_at timestamptz not null default now(),
  constraint atendimento_etapa_equipamento_horario_check
    check (fim_planejado > inicio_planejado),
  unique (atendimento_etapa_id, equipamento_unidade_id)
);

insert into public.atendimento_etapa_equipamentos (
  atendimento_etapa_id, equipamento_unidade_id,
  inicio_planejado, fim_planejado, porte_snapshot, sexo_snapshot
)
select etapa.id, unidade.id, etapa.inicio_planejado, etapa.fim_planejado,
  atendimento.pet_porte_snapshot, atendimento.pet_sexo_snapshot
from public.atendimento_etapas etapa
join public.atendimentos atendimento on atendimento.id = etapa.atendimento_id
join public.equipamento_unidades unidade
  on unidade.equipamento_id = etapa.equipamento_id
 and unidade.numero = etapa.unidade_equipamento
where etapa.equipamento_id is not null
  and etapa.unidade_equipamento is not null
  and atendimento.pet_porte_snapshot is not null
  and atendimento.pet_sexo_snapshot is not null
on conflict (atendimento_etapa_id, equipamento_unidade_id) do nothing;

create table public.atendimento_esperas (
  id uuid primary key default gen_random_uuid(),
  atendimento_id uuid not null references public.atendimentos(id) on delete cascade,
  etapa_anterior_id uuid references public.atendimento_etapas(id) on delete restrict,
  etapa_seguinte_id uuid references public.atendimento_etapas(id) on delete restrict,
  inicio timestamptz not null,
  fim timestamptz not null,
  motivo text not null check (motivo in ('operacional', 'encaixe', 'pos_secagem')),
  created_at timestamptz not null default now(),
  constraint atendimento_espera_horario_check check (fim > inicio),
  constraint atendimento_espera_etapas_check check (
    etapa_anterior_id is not null or etapa_seguinte_id is not null
  )
);

create or replace function public.validar_atendimento_grupo()
returns trigger
language plpgsql
as $$
declare
  grupo_atual public.grupos_agendamento%rowtype;
  cliente_pet text;
begin
  select grupo.* into grupo_atual
  from public.grupos_agendamento grupo
  where grupo.id = new.grupo_agendamento_id;

  select pet.cliente_id into cliente_pet
  from public.pets pet
  where pet.id = new.pet_id;

  if grupo_atual.id is null or cliente_pet is null then
    raise exception 'Grupo ou pet do atendimento nao foi encontrado.';
  end if;

  if grupo_atual.cliente_id <> cliente_pet then
    raise exception 'Todos os pets do grupo devem pertencer ao mesmo tutor.';
  end if;

  if (grupo_atual.modalidade = 'taxidog') <> new.transporte then
    raise exception 'A modalidade do atendimento deve ser a mesma do grupo.';
  end if;

  if grupo_atual.modalidade = 'taxidog'
    and grupo_atual.janela_transporte_id is distinct from new.janela_transporte_id
  then
    raise exception 'A janela TaxiDog do atendimento deve ser a mesma do grupo.';
  end if;

  return new;
end;
$$;

-- Locks transacionais serializam reservas do mesmo recurso. Freestyle pode
-- ultrapassar as validacoes, mas continua visivel para reservas posteriores.
create or replace function public.validar_reserva_funcionario()
returns trigger
language plpgsql
as $$
declare
  atendimento_atual public.atendimentos%rowtype;
begin
  select atendimento.* into atendimento_atual
  from public.atendimentos atendimento
  join public.atendimento_etapas etapa
    on etapa.atendimento_id = atendimento.id
  where etapa.id = new.atendimento_etapa_id;

  perform pg_advisory_xact_lock(hashtextextended(new.funcionario_id::text, 0));

  if atendimento_atual.tipo_planejamento = 'freestyle' then
    return new;
  end if;

  if exists (
    select 1
    from public.atendimento_etapa_funcionarios reserva
    join public.atendimento_etapas etapa
      on etapa.id = reserva.atendimento_etapa_id
    join public.atendimentos atendimento on atendimento.id = etapa.atendimento_id
    where reserva.funcionario_id = new.funcionario_id
      and reserva.id <> coalesce(new.id, gen_random_uuid())
      and atendimento.status in (
        'agendado', 'confirmado', 'aguardando_retirada', 'aguardando_entrega'
      )
      and tstzrange(reserva.inicio_planejado, reserva.fim_planejado, '[)')
        && tstzrange(new.inicio_planejado, new.fim_planejado, '[)')
  ) then
    raise exception 'O funcionario ja possui uma reserva conflitante.';
  end if;

  return new;
end;
$$;

create or replace function public.validar_capacidade_unidade_equipamento()
returns trigger
language plpgsql
as $$
declare
  atendimento_atual public.atendimentos%rowtype;
  equipamento_atual public.equipamentos%rowtype;
  ponto timestamptz;
  capacidade_valida boolean;
begin
  select atendimento.* into atendimento_atual
  from public.atendimentos atendimento
  join public.atendimento_etapas etapa
    on etapa.atendimento_id = atendimento.id
  where etapa.id = new.atendimento_etapa_id;

  select equipamento.* into equipamento_atual
  from public.equipamentos equipamento
  join public.equipamento_unidades unidade
    on unidade.equipamento_id = equipamento.id
  where unidade.id = new.equipamento_unidade_id
    and unidade.ativo
    and equipamento.ativo;

  if not found then
    raise exception 'A unidade de equipamento nao esta ativa.';
  end if;

  if atendimento_atual.pet_porte_snapshot is null
    or atendimento_atual.pet_sexo_snapshot is null
  then
    raise exception 'O atendimento nao possui snapshots de porte e sexo.';
  end if;

  -- O chamador nao define os dados usados na capacidade. O trigger sempre os
  -- copia dos snapshots confiaveis persistidos no atendimento.
  new.porte_snapshot = atendimento_atual.pet_porte_snapshot;
  new.sexo_snapshot = atendimento_atual.pet_sexo_snapshot;

  perform pg_advisory_xact_lock(
    hashtextextended(new.equipamento_unidade_id::text, 0)
  );

  if atendimento_atual.tipo_planejamento = 'freestyle' then
    return new;
  end if;

  for ponto in
    select instante
    from (
      select new.inicio_planejado as instante
      union
      select greatest(reserva.inicio_planejado, new.inicio_planejado)
      from public.atendimento_etapa_equipamentos reserva
      join public.atendimento_etapas etapa
        on etapa.id = reserva.atendimento_etapa_id
      join public.atendimentos atendimento on atendimento.id = etapa.atendimento_id
      where reserva.equipamento_unidade_id = new.equipamento_unidade_id
        and reserva.id <> coalesce(new.id, gen_random_uuid())
        and atendimento.status in (
          'agendado', 'confirmado', 'aguardando_retirada', 'aguardando_entrega'
        )
        and tstzrange(reserva.inicio_planejado, reserva.fim_planejado, '[)')
          && tstzrange(new.inicio_planejado, new.fim_planejado, '[)')
    ) instantes
  loop
    if equipamento_atual.separar_por_sexo and (
      select count(distinct ocupacao.sexo) > 1
      from (
        select new.sexo_snapshot as sexo
        union all
        select reserva.sexo_snapshot
        from public.atendimento_etapa_equipamentos reserva
        join public.atendimento_etapas etapa
          on etapa.id = reserva.atendimento_etapa_id
        join public.atendimentos atendimento on atendimento.id = etapa.atendimento_id
        where reserva.equipamento_unidade_id = new.equipamento_unidade_id
          and reserva.id <> coalesce(new.id, gen_random_uuid())
          and atendimento.status in (
            'agendado', 'confirmado', 'aguardando_retirada', 'aguardando_entrega'
          )
          and reserva.inicio_planejado <= ponto
          and reserva.fim_planejado > ponto
      ) ocupacao
    ) then
      raise exception 'A unidade exige separacao por sexo neste intervalo.';
    end if;

    select exists (
      select 1
      from public.equipamento_perfis_capacidade perfil
      where perfil.equipamento_id = equipamento_atual.id
        and perfil.ativo
        and not exists (
          select 1
          from (
            select ocupacao.porte, count(*)::integer as quantidade
            from (
              select new.porte_snapshot as porte
              union all
              select reserva.porte_snapshot
              from public.atendimento_etapa_equipamentos reserva
              join public.atendimento_etapas etapa
                on etapa.id = reserva.atendimento_etapa_id
              join public.atendimentos atendimento
                on atendimento.id = etapa.atendimento_id
              where reserva.equipamento_unidade_id = new.equipamento_unidade_id
                and reserva.id <> coalesce(new.id, gen_random_uuid())
                and atendimento.status in (
                  'agendado', 'confirmado',
                  'aguardando_retirada', 'aguardando_entrega'
                )
                and reserva.inicio_planejado <= ponto
                and reserva.fim_planejado > ponto
            ) ocupacao
            group by ocupacao.porte
          ) consumo
          left join public.equipamento_perfil_itens item
            on item.perfil_id = perfil.id
           and item.porte = consumo.porte
           and item.ativo
          where consumo.quantidade > coalesce(item.quantidade, 0)
        )
    ) into capacidade_valida;

    if not capacidade_valida then
      raise exception 'A composicao excede os perfis ativos da unidade.';
    end if;
  end loop;

  return new;
end;
$$;

create or replace function public.revalidar_reservas_ao_ativar_atendimento()
returns trigger
language plpgsql
as $$
begin
  if new.tipo_planejamento <> 'freestyle'
    and new.status in (
      'agendado', 'confirmado', 'aguardando_retirada', 'aguardando_entrega'
    )
    and (
      old.tipo_planejamento = 'freestyle'
      or old.status in ('concluido', 'cancelado', 'faltou')
    )
  then
    update public.atendimento_etapa_funcionarios reserva
    set inicio_planejado = reserva.inicio_planejado
    from public.atendimento_etapas etapa
    where etapa.atendimento_id = new.id
      and reserva.atendimento_etapa_id = etapa.id;

    update public.atendimento_etapa_equipamentos reserva
    set inicio_planejado = reserva.inicio_planejado
    from public.atendimento_etapas etapa
    where etapa.atendimento_id = new.id
      and reserva.atendimento_etapa_id = etapa.id;
  end if;

  return new;
end;
$$;

create trigger atendimento_etapa_funcionarios_validar_reserva
before insert or update of funcionario_id, inicio_planejado, fim_planejado
on public.atendimento_etapa_funcionarios
for each row execute function public.validar_reserva_funcionario();

create trigger atendimento_etapa_equipamentos_validar_capacidade
before insert or update of atendimento_etapa_id, equipamento_unidade_id,
  inicio_planejado, fim_planejado, porte_snapshot, sexo_snapshot
on public.atendimento_etapa_equipamentos
for each row execute function public.validar_capacidade_unidade_equipamento();

create trigger atendimentos_revalidar_ao_ativar
after update of status, tipo_planejamento on public.atendimentos
for each row execute function public.revalidar_reservas_ao_ativar_atendimento();

create trigger atendimentos_validar_grupo
before insert or update of grupo_agendamento_id, pet_id, transporte,
  janela_transporte_id on public.atendimentos
for each row execute function public.validar_atendimento_grupo();

create trigger configuracao_agenda_updated_at
before update on public.configuracao_agenda
for each row execute function public.atualizar_updated_at();

create trigger grupos_agendamento_updated_at
before update on public.grupos_agendamento
for each row execute function public.atualizar_updated_at();

-- Indices das consultas de disponibilidade e dos cards futuros.
create index estabelecimento_blocos_dia_idx
  on public.estabelecimento_blocos (dia_semana, ativo, inicio, fim);
create index estabelecimento_excecoes_data_idx
  on public.estabelecimento_excecoes (data);
create index equipamento_unidades_equipamento_idx
  on public.equipamento_unidades (equipamento_id, ativo, numero);
create index servico_etapa_recursos_etapa_idx
  on public.servico_etapa_recursos (servico_etapa_id, ativo);
create index grupos_agendamento_cliente_data_idx
  on public.grupos_agendamento (cliente_id, data_operacional);
create index grupos_agendamento_janela_data_idx
  on public.grupos_agendamento (janela_transporte_id, data_operacional)
  where modalidade = 'taxidog';
create index atendimentos_grupo_idx
  on public.atendimentos (grupo_agendamento_id);
create index atendimentos_inicio_operacional_idx
  on public.atendimentos (inicio_operacional_planejado);
create index atendimentos_conclusao_idx
  on public.atendimentos (conclusao_operacional_prevista);
create index atendimento_servicos_atendimento_idx
  on public.atendimento_servicos (atendimento_id, ordem, ativo);
create index atendimento_servico_acrescimos_servico_idx
  on public.atendimento_servico_acrescimos (atendimento_servico_id);
create index atendimento_etapas_atendimento_servico_idx
  on public.atendimento_etapas (atendimento_servico_id, ordem_snapshot);
create index atendimento_etapa_funcionarios_periodo_idx
  on public.atendimento_etapa_funcionarios
  (funcionario_id, inicio_planejado, fim_planejado);
create index atendimento_etapa_equipamentos_periodo_idx
  on public.atendimento_etapa_equipamentos
  (equipamento_unidade_id, inicio_planejado, fim_planejado);
create index atendimento_esperas_atendimento_idx
  on public.atendimento_esperas (atendimento_id, inicio);

-- Mantem o mesmo estagio de seguranca das tabelas operacionais existentes.
alter table public.configuracao_agenda enable row level security;
alter table public.estabelecimento_blocos enable row level security;
alter table public.estabelecimento_excecoes enable row level security;
alter table public.estabelecimento_excecao_blocos enable row level security;
alter table public.equipamento_unidades enable row level security;
alter table public.servico_etapa_recursos enable row level security;
alter table public.grupos_agendamento enable row level security;
alter table public.atendimento_servicos enable row level security;
alter table public.atendimento_servico_acrescimos enable row level security;
alter table public.atendimento_etapa_funcionarios enable row level security;
alter table public.atendimento_etapa_equipamentos enable row level security;
alter table public.atendimento_esperas enable row level security;

grant select, insert, update on public.configuracao_agenda,
  public.estabelecimento_blocos, public.estabelecimento_excecoes,
  public.estabelecimento_excecao_blocos, public.equipamento_unidades,
  public.servico_etapa_recursos, public.grupos_agendamento,
  public.atendimento_servicos, public.atendimento_servico_acrescimos,
  public.atendimento_etapa_funcionarios,
  public.atendimento_etapa_equipamentos, public.atendimento_esperas
  to anon, authenticated;

do $$
declare
  tabela text;
begin
  foreach tabela in array array[
    'configuracao_agenda', 'estabelecimento_blocos',
    'estabelecimento_excecoes', 'estabelecimento_excecao_blocos',
    'equipamento_unidades', 'servico_etapa_recursos',
    'grupos_agendamento', 'atendimento_servicos',
    'atendimento_servico_acrescimos', 'atendimento_etapa_funcionarios',
    'atendimento_etapa_equipamentos', 'atendimento_esperas'
  ]
  loop
    execute format(
      'create policy %I on public.%I for select to anon, authenticated using (true)',
      tabela || '_select_sem_autenticacao', tabela
    );
    execute format(
      'create policy %I on public.%I for insert to anon, authenticated with check (true)',
      tabela || '_insert_sem_autenticacao', tabela
    );
    execute format(
      'create policy %I on public.%I for update to anon, authenticated using (true) with check (true)',
      tabela || '_update_sem_autenticacao', tabela
    );
  end loop;
end;
$$;

commit;
