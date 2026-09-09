begin;

-- A proveniencia completa e formada por arestas diretas entre os servicos
-- materializados do mesmo atendimento. O servico filho continua unico em
-- atendimento_servicos, mesmo quando possui mais de um pai.
create table public.atendimento_servico_origens (
  atendimento_id uuid not null,
  atendimento_servico_id uuid not null,
  originado_por_atendimento_servico_id uuid not null,
  created_at timestamptz not null default now(),
  constraint atendimento_servico_origens_pkey
    primary key (
      atendimento_servico_id,
      originado_por_atendimento_servico_id
    ),
  constraint atendimento_servico_origens_distintos_check
    check (
      atendimento_servico_id <> originado_por_atendimento_servico_id
    ),
  constraint atendimento_servico_origens_filho_fkey
    foreign key (atendimento_servico_id, atendimento_id)
    references public.atendimento_servicos (id, atendimento_id)
    on delete cascade,
  constraint atendimento_servico_origens_pai_fkey
    foreign key (originado_por_atendimento_servico_id, atendimento_id)
    references public.atendimento_servicos (id, atendimento_id)
    on delete cascade
);

-- A PK ja atende consultas pelos pais de um filho. Estes indices cobrem o
-- grafo por atendimento e a navegacao inversa, do pai para seus filhos.
create index atendimento_servico_origens_atendimento_filho_idx
  on public.atendimento_servico_origens
  (atendimento_id, atendimento_servico_id);

create index atendimento_servico_origens_pai_filho_idx
  on public.atendimento_servico_origens
  (originado_por_atendimento_servico_id, atendimento_servico_id);

-- Nao ha backfill: na 008, a coluna singular recebeu a raiz solicitada para
-- dependencias legadas, inclusive transitivas. Ela nao comprova o pai direto
-- exigido por esta tabela e permanece intacta apenas para compatibilidade.

alter table public.atendimento_servico_origens enable row level security;

grant select on public.atendimento_servico_origens
  to anon, authenticated;

create policy atendimento_servico_origens_select
  on public.atendimento_servico_origens
  for select to anon, authenticated using (true);

commit;
