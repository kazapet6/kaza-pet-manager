-- 026 — Catálogo autoritativo de Pacotes
-- Pacote é um modelo comercial reutilizável. Contratos por pet ficam fora desta migration.

create table public.pacotes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo text not null check (tipo in ('semanal', 'quinzenal')),
  quantidade_banhos_ciclo integer generated always as (
    case tipo when 'semanal' then 4 when 'quinzenal' then 2 end
  ) stored,
  intervalo_semanas integer generated always as (
    case tipo when 'semanal' then 1 when 'quinzenal' then 2 end
  ) stored,
  transporte_incluido boolean not null default true,
  ativo boolean not null default true,
  versao bigint not null default 0 check (versao >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pacotes_nome_valido check (
    nome = btrim(nome)
    and char_length(nome) between 1 and 120
  )
);

create unique index pacotes_nome_unico_ci
  on public.pacotes (lower(nome));

create trigger pacotes_atualizar_updated_at
before update on public.pacotes
for each row execute function public.atualizar_updated_at();

alter table public.pacotes enable row level security;

revoke all on table public.pacotes from public, anon, authenticated;
grant select on table public.pacotes to authenticated;
grant select, insert, update on table public.pacotes to service_role;

create policy pacotes_select_internal
on public.pacotes
for select
to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'internal');

comment on table public.pacotes is
  'Modelos comerciais reutilizáveis; não representa aquisição/contrato de um pet.';
comment on column public.pacotes.tipo is
  'Regra autoritativa que determina quantidade_banhos_ciclo e intervalo_semanas.';
comment on column public.pacotes.versao is
  'Controle de concorrência otimista das alterações administrativas.';
