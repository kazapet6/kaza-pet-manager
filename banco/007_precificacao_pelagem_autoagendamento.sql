begin;

alter table public.pets
  add column pelagem text not null default 'curta'
  check (pelagem in ('curta', 'media', 'longa'));

alter table public.servicos
  add column agendamento_cliente boolean not null default false;

alter table public.servico_modificadores
  drop constraint if exists servico_modificadores_criterio_check;

alter table public.servico_modificadores
  add constraint servico_modificadores_criterio_check
  check (criterio in ('porte', 'pelagem', 'raca', 'peso', 'temperamento'));

alter table public.servico_modificadores
  add column pelagem text
  check (pelagem in ('curta', 'media', 'longa'));

create table public.servico_regras_preco (
  id uuid primary key default gen_random_uuid(),
  servico_id uuid not null references public.servicos(id) on delete cascade,
  criterio text not null
    check (criterio in ('porte', 'pelagem', 'raca', 'peso', 'temperamento')),
  porte text check (porte in ('mini', 'pequeno', 'medio', 'grande', 'gigante')),
  pelagem text check (pelagem in ('curta', 'media', 'longa')),
  raca_id uuid references public.racas(id) on delete restrict,
  peso_min numeric(8, 2) check (peso_min >= 0),
  peso_max numeric(8, 2) check (peso_max >= 0),
  temperamento text check (temperamento in ('calmo', 'moderado', 'dificil')),
  acrescimo_valor numeric(10, 2) not null check (acrescimo_valor >= 0),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  constraint servico_regra_preco_peso_intervalo_check
    check (peso_max is null or peso_min is null or peso_max >= peso_min),
  constraint servico_regra_preco_criterio_check check (
    (criterio = 'porte' and porte is not null and pelagem is null
      and raca_id is null and peso_min is null and peso_max is null
      and temperamento is null)
    or
    (criterio = 'pelagem' and porte is null and pelagem is not null
      and raca_id is null and peso_min is null and peso_max is null
      and temperamento is null)
    or
    (criterio = 'raca' and porte is null and pelagem is null
      and raca_id is not null and peso_min is null and peso_max is null
      and temperamento is null)
    or
    (criterio = 'peso' and porte is null and pelagem is null
      and raca_id is null and (peso_min is not null or peso_max is not null)
      and temperamento is null)
    or
    (criterio = 'temperamento' and porte is null and pelagem is null
      and raca_id is null and peso_min is null and peso_max is null
      and temperamento is not null)
  )
);

create index servico_regras_preco_servico_idx
  on public.servico_regras_preco (servico_id, ativo);
create index servico_regras_preco_raca_idx
  on public.servico_regras_preco (raca_id)
  where raca_id is not null;

alter table public.servico_regras_preco enable row level security;

grant select, insert, update on public.servico_regras_preco
  to anon, authenticated;

create policy servico_regras_preco_select_sem_autenticacao
  on public.servico_regras_preco
  for select to anon, authenticated using (true);
create policy servico_regras_preco_insert_sem_autenticacao
  on public.servico_regras_preco
  for insert to anon, authenticated with check (true);
create policy servico_regras_preco_update_sem_autenticacao
  on public.servico_regras_preco
  for update to anon, authenticated using (true) with check (true);

commit;
