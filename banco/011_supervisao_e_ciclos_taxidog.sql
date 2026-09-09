begin;

-- A supervisao e uma caracteristica do equipamento, nao da etapa. Quando
-- ativa, o uso exige cobertura humana durante todo o intervalo, sem tornar o
-- funcionario um recurso exclusivo.
alter table public.equipamentos
  add column exige_supervisao_humana boolean not null default false;

-- Ciclos TaxiDog sao independentes das janelas legadas, preservadas durante
-- a transicao. A primeira versao trabalha com ciclos contidos no mesmo dia.
create table public.taxidog_ciclos (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(btrim(nome)) > 0),
  ordem integer not null check (ordem > 0),
  coleta_inicio time not null,
  coleta_fim time not null,
  conclusao_limite time not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint taxidog_ciclo_coleta_check
    check (coleta_fim > coleta_inicio),
  constraint taxidog_ciclo_conclusao_check
    check (conclusao_limite >= coleta_fim),
  unique (nome),
  unique (ordem)
);

create table public.taxidog_ciclo_dias (
  ciclo_id uuid not null references public.taxidog_ciclos(id) on delete cascade,
  dia_semana smallint not null check (dia_semana between 0 and 6),
  ativo boolean not null default true,
  primary key (ciclo_id, dia_semana)
);

create index taxidog_ciclo_dias_dia_idx
  on public.taxidog_ciclo_dias (dia_semana, ativo, ciclo_id);

create trigger taxidog_ciclos_updated_at
before update on public.taxidog_ciclos
for each row execute function public.atualizar_updated_at();

alter table public.taxidog_ciclos enable row level security;
alter table public.taxidog_ciclo_dias enable row level security;

grant select, insert, update on public.taxidog_ciclos,
  public.taxidog_ciclo_dias to anon, authenticated;

create policy taxidog_ciclos_select_sem_autenticacao
  on public.taxidog_ciclos for select to anon, authenticated using (true);
create policy taxidog_ciclos_insert_sem_autenticacao
  on public.taxidog_ciclos for insert to anon, authenticated with check (true);
create policy taxidog_ciclos_update_sem_autenticacao
  on public.taxidog_ciclos for update to anon, authenticated
  using (true) with check (true);

create policy taxidog_ciclo_dias_select_sem_autenticacao
  on public.taxidog_ciclo_dias for select to anon, authenticated using (true);
create policy taxidog_ciclo_dias_insert_sem_autenticacao
  on public.taxidog_ciclo_dias for insert to anon, authenticated with check (true);
create policy taxidog_ciclo_dias_update_sem_autenticacao
  on public.taxidog_ciclo_dias for update to anon, authenticated
  using (true) with check (true);

commit;
