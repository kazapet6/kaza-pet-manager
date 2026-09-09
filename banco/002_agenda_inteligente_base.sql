begin;

create extension if not exists pgcrypto;

alter table public.pets
  add column if not exists temperamento text not null default 'calmo';

alter table public.pets
  add constraint pets_temperamento_check
  check (temperamento in ('calmo', 'moderado', 'dificil'));

create table public.funcionarios (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  constraint funcionarios_nome_check check (length(btrim(nome)) > 0)
);

create table public.funcionario_jornadas (
  id uuid primary key default gen_random_uuid(),
  funcionario_id uuid not null references public.funcionarios(id) on delete cascade,
  dia_semana smallint not null check (dia_semana between 0 and 6),
  inicio time not null,
  fim time not null,
  constraint funcionario_jornada_horario_check check (fim > inicio),
  unique (funcionario_id, dia_semana)
);

create table public.funcionario_intervalos (
  id uuid primary key default gen_random_uuid(),
  funcionario_id uuid not null references public.funcionarios(id) on delete cascade,
  dia_semana smallint not null check (dia_semana between 0 and 6),
  inicio time not null,
  fim time not null,
  descricao text not null default '',
  constraint funcionario_intervalo_horario_check check (fim > inicio)
);

create table public.equipamentos (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  tipo text not null,
  quantidade_unidades integer not null default 1 check (quantidade_unidades > 0),
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.equipamento_perfis_capacidade (
  id uuid primary key default gen_random_uuid(),
  equipamento_id uuid not null references public.equipamentos(id) on delete cascade,
  nome text not null,
  unique (equipamento_id, nome)
);

create table public.equipamento_perfil_itens (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references public.equipamento_perfis_capacidade(id) on delete cascade,
  porte text not null check (porte in ('mini', 'pequeno', 'medio', 'grande', 'gigante')),
  quantidade integer not null check (quantidade > 0),
  unique (perfil_id, porte)
);

create table public.servicos (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  descricao text not null default '',
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.servico_etapas (
  id uuid primary key default gen_random_uuid(),
  servico_id uuid not null references public.servicos(id) on delete cascade,
  nome text not null,
  ordem integer not null check (ordem > 0),
  duracao_minutos integer not null check (duracao_minutos > 0),
  recurso text not null check (recurso in ('funcionario', 'equipamento', 'nenhum')),
  equipamento_id uuid references public.equipamentos(id) on delete restrict,
  unique (servico_id, ordem),
  constraint servico_etapa_equipamento_check check (
    (recurso = 'equipamento' and equipamento_id is not null)
    or (recurso <> 'equipamento' and equipamento_id is null)
  )
);

create table public.servico_modificadores (
  id uuid primary key default gen_random_uuid(),
  servico_id uuid not null references public.servicos(id) on delete cascade,
  criterio text not null check (criterio in ('porte', 'raca', 'peso', 'temperamento')),
  valor text not null,
  acrescimo_minutos integer not null default 0 check (acrescimo_minutos >= 0),
  unique (servico_id, criterio, valor)
);

create table public.funcionario_servicos (
  funcionario_id uuid not null references public.funcionarios(id) on delete cascade,
  servico_id uuid not null references public.servicos(id) on delete cascade,
  primary key (funcionario_id, servico_id)
);

create table public.janelas_transporte (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  coleta_inicio time not null,
  coleta_fim time not null,
  operacao_inicio time not null,
  operacao_fim time not null,
  entrega_inicio time,
  ativo boolean not null default true,
  constraint janela_coleta_check check (coleta_fim > coleta_inicio),
  constraint janela_operacao_check check (operacao_fim > operacao_inicio)
);

create table public.atendimentos (
  id uuid primary key default gen_random_uuid(),
  pet_id text not null references public.pets(id) on update cascade on delete restrict,
  servico_id uuid not null references public.servicos(id) on delete restrict,
  inicio_planejado timestamptz,
  status text not null default 'agendado' check (
    status in ('agendado', 'confirmado', 'em_atendimento', 'concluido', 'faltou', 'cancelado')
  ),
  transporte boolean not null default false,
  janela_transporte_id uuid references public.janelas_transporte(id) on delete restrict,
  valor_transporte numeric(10, 2) not null default 0 check (valor_transporte >= 0),
  observacoes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint atendimento_transporte_check check (
    (transporte and janela_transporte_id is not null)
    or (not transporte and janela_transporte_id is null)
  )
);

create table public.atendimento_etapas (
  id uuid primary key default gen_random_uuid(),
  atendimento_id uuid not null references public.atendimentos(id) on delete cascade,
  servico_etapa_id uuid not null references public.servico_etapas(id) on delete restrict,
  inicio_planejado timestamptz not null,
  fim_planejado timestamptz not null,
  funcionario_id uuid references public.funcionarios(id) on delete restrict,
  equipamento_id uuid references public.equipamentos(id) on delete restrict,
  unidade_equipamento integer check (unidade_equipamento > 0),
  constraint atendimento_etapa_horario_check check (fim_planejado > inicio_planejado),
  constraint atendimento_etapa_unidade_check check (
    equipamento_id is not null or unidade_equipamento is null
  )
);

create or replace function public.atualizar_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger atendimentos_updated_at
before update on public.atendimentos
for each row execute function public.atualizar_updated_at();

create index servico_etapas_servico_idx on public.servico_etapas (servico_id, ordem);
create index servico_modificadores_servico_idx on public.servico_modificadores (servico_id);
create index funcionario_jornadas_funcionario_idx on public.funcionario_jornadas (funcionario_id);
create index funcionario_intervalos_funcionario_idx on public.funcionario_intervalos (funcionario_id);
create index equipamento_perfis_equipamento_idx on public.equipamento_perfis_capacidade (equipamento_id);
create index atendimentos_inicio_idx on public.atendimentos (inicio_planejado);
create index atendimentos_pet_idx on public.atendimentos (pet_id);
create index atendimentos_status_idx on public.atendimentos (status);
create index atendimento_etapas_periodo_idx on public.atendimento_etapas (inicio_planejado, fim_planejado);
create index atendimento_etapas_funcionario_idx on public.atendimento_etapas (funcionario_id);
create index atendimento_etapas_equipamento_idx on public.atendimento_etapas (equipamento_id, unidade_equipamento);

insert into public.funcionarios (nome)
values ('Funcionário operacional')
on conflict do nothing;

insert into public.equipamentos (nome, tipo, quantidade_unidades)
values ('Máquina de secagem', 'secagem', 2)
on conflict (nome) do update set quantidade_unidades = excluded.quantidade_unidades;

with equipamento as (
  select id from public.equipamentos where nome = 'Máquina de secagem'
)
insert into public.equipamento_perfis_capacidade (equipamento_id, nome)
select id, perfil
from equipamento
cross join (
  values
    ('2 minis'),
    ('1 mini + 1 pequeno'),
    ('2 pequenos'),
    ('1 médio + 1 mini'),
    ('1 médio + 1 pequeno'),
    ('1 grande'),
    ('1 gigante')
) as perfis(perfil)
on conflict (equipamento_id, nome) do nothing;

insert into public.equipamento_perfil_itens (perfil_id, porte, quantidade)
select perfil.id, itens.porte, itens.quantidade
from public.equipamento_perfis_capacidade perfil
join public.equipamentos equipamento on equipamento.id = perfil.equipamento_id
join (values
  ('2 minis', 'mini', 2),
  ('1 mini + 1 pequeno', 'mini', 1),
  ('1 mini + 1 pequeno', 'pequeno', 1),
  ('2 pequenos', 'pequeno', 2),
  ('1 médio + 1 mini', 'medio', 1),
  ('1 médio + 1 mini', 'mini', 1),
  ('1 médio + 1 pequeno', 'medio', 1),
  ('1 médio + 1 pequeno', 'pequeno', 1),
  ('1 grande', 'grande', 1),
  ('1 gigante', 'gigante', 1)
) as itens(perfil_nome, porte, quantidade) on itens.perfil_nome = perfil.nome
where equipamento.nome = 'Máquina de secagem'
on conflict (perfil_id, porte) do update set quantidade = excluded.quantidade;

insert into public.janelas_transporte (
  nome, coleta_inicio, coleta_fim, operacao_inicio, operacao_fim, entrega_inicio
)
values
  ('Coleta da manhã', '08:00', '09:00', '09:00', '12:00', '13:00'),
  ('Coleta da tarde', '13:00', '14:00', '14:00', '18:00', null)
on conflict (nome) do nothing;

alter table public.funcionarios enable row level security;
alter table public.funcionario_jornadas enable row level security;
alter table public.funcionario_intervalos enable row level security;
alter table public.equipamentos enable row level security;
alter table public.equipamento_perfis_capacidade enable row level security;
alter table public.equipamento_perfil_itens enable row level security;
alter table public.servicos enable row level security;
alter table public.servico_etapas enable row level security;
alter table public.servico_modificadores enable row level security;
alter table public.funcionario_servicos enable row level security;
alter table public.janelas_transporte enable row level security;
alter table public.atendimentos enable row level security;
alter table public.atendimento_etapas enable row level security;

grant select, insert, update on all tables in schema public to anon, authenticated;

do $$
declare
  tabela text;
begin
  foreach tabela in array array[
    'funcionarios', 'funcionario_jornadas', 'funcionario_intervalos',
    'equipamentos', 'equipamento_perfis_capacidade', 'equipamento_perfil_itens',
    'servicos', 'servico_etapas', 'servico_modificadores', 'funcionario_servicos',
    'janelas_transporte', 'atendimentos', 'atendimento_etapas'
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
