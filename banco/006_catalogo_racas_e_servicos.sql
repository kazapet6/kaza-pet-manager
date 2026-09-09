begin;

create table public.racas (
  id uuid primary key default gen_random_uuid(),
  especie text not null check (especie in ('cao', 'gato')),
  nome text not null check (length(btrim(nome)) > 0),
  ativo boolean not null default true,
  fonte_referencia text,
  codigo_referencia text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, especie)
);

create unique index racas_especie_nome_uidx
  on public.racas (especie, lower(btrim(nome)));
create index racas_busca_idx
  on public.racas (especie, ativo, nome);

create table public.raca_sinonimos (
  id uuid primary key default gen_random_uuid(),
  raca_id uuid not null,
  especie text not null check (especie in ('cao', 'gato')),
  nome text not null check (length(btrim(nome)) > 0),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  constraint raca_sinonimos_raca_especie_fkey
    foreign key (raca_id, especie)
    references public.racas (id, especie) on delete cascade
);

create unique index raca_sinonimos_especie_nome_uidx
  on public.raca_sinonimos (especie, lower(btrim(nome)));
create index raca_sinonimos_raca_idx
  on public.raca_sinonimos (raca_id, ativo);

insert into public.racas (especie, nome, fonte_referencia, codigo_referencia)
values
  ('cao', 'Sem raça definida (SRD)', 'Catálogo interno', 'SRD-CAO'),
  ('gato', 'Sem raça definida (SRD)', 'Catálogo interno', 'SRD-GATO')
on conflict do nothing;

-- Preserva as raças já digitadas nos cadastros atuais sem tratá-las como um
-- catálogo mundial revisado. A origem deixa claro que precisam de curadoria.
insert into public.racas (especie, nome, fonte_referencia)
select especie, nome, 'Migração do cadastro legado'
from (
  select distinct on (pet.especie, lower(btrim(pet.raca)))
    pet.especie, btrim(pet.raca) as nome
  from public.pets pet
  where pet.especie in ('cao', 'gato')
    and nullif(btrim(pet.raca), '') is not null
  order by pet.especie, lower(btrim(pet.raca)), pet.raca
) legado
on conflict do nothing;

alter table public.pets add column raca_id uuid;

update public.pets pet
set raca_id = raca.id
from public.racas raca
where raca.especie = pet.especie
  and lower(btrim(raca.nome)) = lower(btrim(pet.raca));

update public.pets pet
set raca_id = raca.id
from public.racas raca
where pet.raca_id is null
  and raca.especie = pet.especie
  and raca.codigo_referencia = case pet.especie
    when 'cao' then 'SRD-CAO'
    when 'gato' then 'SRD-GATO'
  end;

alter table public.pets alter column raca_id set not null;
alter table public.pets
  add constraint pets_raca_especie_fkey
  foreign key (raca_id, especie)
  references public.racas (id, especie) on delete restrict;
create index pets_raca_idx on public.pets (raca_id);
alter table public.pets drop column raca;

alter table public.servicos
  add column preco_base numeric(10, 2) not null default 0
    check (preco_base >= 0);

alter table public.funcionario_servicos
  add column ativo boolean not null default true;

create table public.servico_especies (
  servico_id uuid not null references public.servicos(id) on delete cascade,
  especie text not null check (especie in ('cao', 'gato')),
  ativo boolean not null default true,
  primary key (servico_id, especie)
);

create table public.servico_portes (
  servico_id uuid not null references public.servicos(id) on delete cascade,
  porte text not null check (porte in ('mini', 'pequeno', 'medio', 'grande', 'gigante')),
  ativo boolean not null default true,
  primary key (servico_id, porte)
);

create table public.servico_racas_bloqueadas (
  servico_id uuid not null references public.servicos(id) on delete cascade,
  raca_id uuid not null references public.racas(id) on delete restrict,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (servico_id, raca_id)
);

create table public.servico_dependencias (
  servico_id uuid not null references public.servicos(id) on delete cascade,
  dependencia_servico_id uuid not null references public.servicos(id) on delete restrict,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (servico_id, dependencia_servico_id),
  constraint servico_dependencia_autorreferencia_check
    check (servico_id <> dependencia_servico_id)
);

create or replace function public.validar_ciclo_dependencia_servico()
returns trigger
language plpgsql
as $$
begin
  if new.ativo and exists (
    with recursive cadeia(servico_id) as (
      select new.dependencia_servico_id
      union
      select dependencia.dependencia_servico_id
      from public.servico_dependencias dependencia
      join cadeia on cadeia.servico_id = dependencia.servico_id
      where dependencia.ativo
    )
    select 1 from cadeia where servico_id = new.servico_id
  ) then
    raise exception 'A dependência criaria um ciclo entre serviços.';
  end if;
  return new;
end;
$$;

create trigger servico_dependencias_validar_ciclo
before insert or update on public.servico_dependencias
for each row execute function public.validar_ciclo_dependencia_servico();

insert into public.servico_especies (servico_id, especie)
select servico.id, especie
from public.servicos servico
cross join (values ('cao'), ('gato')) especies(especie)
on conflict do nothing;

insert into public.servico_portes (servico_id, porte)
select servico.id, porte
from public.servicos servico
cross join (values
  ('mini'), ('pequeno'), ('medio'), ('grande'), ('gigante')
) portes(porte)
on conflict do nothing;

insert into public.servico_dependencias (servico_id, dependencia_servico_id)
select hidratacao.id, banho.id
from public.servicos hidratacao
cross join public.servicos banho
where hidratacao.nome = 'Hidratação'
  and banho.nome = 'Banho'
on conflict do nothing;

-- Converte os 5 minutos antes representados como modificador em uma etapa
-- própria da Hidratação. Não inventa duração para Escovação de dentes.
insert into public.servico_etapas (
  servico_id, nome, ordem, duracao_minutos, recurso, equipamento_id, ativo
)
select servico.id, 'Hidratação', 1, 5, 'funcionario', null, true
from public.servicos servico
where servico.nome = 'Hidratação'
  and not exists (
    select 1 from public.servico_etapas etapa
    where etapa.servico_id = servico.id
  );

delete from public.servico_modificadores modificador
using public.servicos servico
where modificador.servico_id = servico.id
  and servico.nome = 'Banho'
  and modificador.criterio = 'adicional'
  and modificador.valor in ('Hidratação', 'Escovação de dentes');

alter table public.servico_modificadores
  drop constraint if exists servico_modificadores_criterio_check;
alter table public.servico_modificadores
  add constraint servico_modificadores_criterio_check
  check (criterio in ('porte', 'raca', 'peso', 'temperamento'));

alter table public.servico_modificadores
  add column raca_id uuid references public.racas(id) on delete restrict,
  add column porte text check (porte in ('mini', 'pequeno', 'medio', 'grande', 'gigante')),
  add column temperamento text check (temperamento in ('calmo', 'moderado', 'dificil')),
  add column peso_min numeric(8, 2) check (peso_min >= 0),
  add column peso_max numeric(8, 2) check (peso_max >= 0);

update public.servico_modificadores
set porte = valor
where criterio = 'porte'
  and valor in ('mini', 'pequeno', 'medio', 'grande', 'gigante');

update public.servico_modificadores
set temperamento = valor
where criterio = 'temperamento'
  and valor in ('calmo', 'moderado', 'dificil');

with candidatas as (
  select
    modificador.id as modificador_id,
    raca.id as raca_id,
    count(*) over (partition by modificador.id) as quantidade
  from public.servico_modificadores modificador
  join public.servico_especies especie
    on especie.servico_id = modificador.servico_id
   and especie.ativo
  join public.racas raca
    on raca.especie = especie.especie
   and lower(btrim(raca.nome)) = lower(btrim(modificador.valor))
  where modificador.criterio = 'raca'
), correspondencias as (
  select modificador_id, raca_id
  from candidatas
  where quantidade = 1
)
update public.servico_modificadores modificador
set raca_id = correspondencias.raca_id
from correspondencias
where modificador.id = correspondencias.modificador_id;

alter table public.racas enable row level security;
alter table public.raca_sinonimos enable row level security;
alter table public.servico_especies enable row level security;
alter table public.servico_portes enable row level security;
alter table public.servico_racas_bloqueadas enable row level security;
alter table public.servico_dependencias enable row level security;

grant select on public.racas, public.raca_sinonimos to anon, authenticated;
grant select, insert, update on public.servico_especies, public.servico_portes,
  public.servico_racas_bloqueadas, public.servico_dependencias
  to anon, authenticated;

create policy racas_select_sem_autenticacao
  on public.racas for select to anon, authenticated using (true);
create policy raca_sinonimos_select_sem_autenticacao
  on public.raca_sinonimos for select to anon, authenticated using (true);

do $$
declare
  tabela text;
begin
  foreach tabela in array array[
    'servico_especies', 'servico_portes',
    'servico_racas_bloqueadas', 'servico_dependencias'
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
