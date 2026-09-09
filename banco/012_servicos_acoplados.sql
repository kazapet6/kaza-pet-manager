begin;

create table public.servico_acoplamentos (
  servico_id uuid primary key
    references public.servicos(id) on delete cascade,
  etapa_alvo_id uuid not null
    references public.servico_etapas(id) on delete restrict,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index servico_acoplamentos_etapa_alvo_idx
  on public.servico_acoplamentos (etapa_alvo_id, ativo);

create or replace function public.validar_configuracao_servico_acoplado(
  p_servico_id uuid,
  p_etapa_alvo_id uuid
)
returns void
language plpgsql
as $$
declare
  servico_base_id uuid;
  etapas_ativas integer;
begin
  select etapa.servico_id
  into servico_base_id
  from public.servico_etapas etapa
  where etapa.id = p_etapa_alvo_id
    and etapa.ativo;

  if servico_base_id is null then
    raise exception 'A etapa alvo do acoplamento nao existe ou esta inativa.';
  end if;

  if servico_base_id = p_servico_id then
    raise exception 'Um servico nao pode ser acoplado a uma etapa propria.';
  end if;

  select count(*)
  into etapas_ativas
  from public.servico_etapas etapa
  where etapa.servico_id = p_servico_id
    and etapa.ativo;

  if etapas_ativas <> 1 then
    raise exception 'O servico acoplado deve possuir exatamente uma etapa ativa.';
  end if;

  if exists (
    select 1
    from public.servico_acoplamentos acoplamento
    where acoplamento.servico_id = servico_base_id
      and acoplamento.ativo
  ) then
    raise exception 'A primeira versao nao permite acoplar a um servico que tambem seja acoplado.';
  end if;

  if exists (
    select 1
    from public.servico_acoplamentos acoplamento
    join public.servico_etapas etapa
      on etapa.id = acoplamento.etapa_alvo_id
    where etapa.servico_id = p_servico_id
      and acoplamento.ativo
      and acoplamento.servico_id <> p_servico_id
  ) then
    raise exception 'Um servico acoplado nao pode ser base operacional de outro acoplamento.';
  end if;

  if not exists (
    with recursive cadeia(servico_id) as (
      select dependencia.dependencia_servico_id
      from public.servico_dependencias dependencia
      where dependencia.servico_id = p_servico_id
        and dependencia.ativo

      union

      select dependencia.dependencia_servico_id
      from public.servico_dependencias dependencia
      join cadeia on cadeia.servico_id = dependencia.servico_id
      where dependencia.ativo
    )
    select 1
    from cadeia
    where servico_id = servico_base_id
  ) then
    raise exception 'O servico acoplado deve depender oficialmente do servico base.';
  end if;
end;
$$;

create or replace function public.validar_servico_acoplamento()
returns trigger
language plpgsql
as $$
begin
  if new.ativo then
    perform public.validar_configuracao_servico_acoplado(
      new.servico_id, new.etapa_alvo_id
    );
  end if;
  return new;
end;
$$;

create or replace function public.revalidar_servicos_acoplados()
returns trigger
language plpgsql
as $$
declare
  acoplamento record;
begin
  for acoplamento in
    select item.servico_id, item.etapa_alvo_id
    from public.servico_acoplamentos item
    where item.ativo
  loop
    perform public.validar_configuracao_servico_acoplado(
      acoplamento.servico_id, acoplamento.etapa_alvo_id
    );
  end loop;
  return null;
end;
$$;

create trigger servico_acoplamentos_validar
before insert or update of servico_id, etapa_alvo_id, ativo
on public.servico_acoplamentos
for each row execute function public.validar_servico_acoplamento();

create trigger servico_etapas_revalidar_acoplamentos
after insert or update of servico_id, ativo or delete
on public.servico_etapas
for each statement execute function public.revalidar_servicos_acoplados();

create trigger servico_dependencias_revalidar_acoplamentos
after insert or update of servico_id, dependencia_servico_id, ativo or delete
on public.servico_dependencias
for each statement execute function public.revalidar_servicos_acoplados();

create trigger servico_acoplamentos_updated_at
before update on public.servico_acoplamentos
for each row execute function public.atualizar_updated_at();

-- Configura a Hidratação existente apenas quando todos os elementos esperados
-- forem identificados sem ambiguidade. Caso contrario, preserva o estado atual.
do $$
declare
  hidratacao_id uuid;
  banho_id uuid;
  etapa_banho_id uuid;
begin
  if (select count(*) from public.servicos where nome = 'Hidratação') = 1
    and (select count(*) from public.servicos where nome = 'Banho') = 1
  then
    select id into hidratacao_id
    from public.servicos where nome = 'Hidratação';

    select id into banho_id
    from public.servicos where nome = 'Banho';

    if (
      select count(*)
      from public.servico_etapas etapa
      where etapa.servico_id = banho_id
        and etapa.nome = 'Banho'
        and etapa.ativo
    ) = 1
      and exists (
        select 1
        from public.servico_dependencias dependencia
        where dependencia.servico_id = hidratacao_id
          and dependencia.dependencia_servico_id = banho_id
          and dependencia.ativo
      )
    then
      select etapa.id into etapa_banho_id
      from public.servico_etapas etapa
      where etapa.servico_id = banho_id
        and etapa.nome = 'Banho'
        and etapa.ativo;

      insert into public.servico_acoplamentos (
        servico_id, etapa_alvo_id, ativo
      )
      values (hidratacao_id, etapa_banho_id, true)
      on conflict (servico_id) do nothing;
    end if;
  end if;
end;
$$;

alter table public.servico_acoplamentos enable row level security;

grant select, insert, update on public.servico_acoplamentos
  to anon, authenticated;

create policy servico_acoplamentos_select_sem_autenticacao
  on public.servico_acoplamentos
  for select to anon, authenticated using (true);
create policy servico_acoplamentos_insert_sem_autenticacao
  on public.servico_acoplamentos
  for insert to anon, authenticated with check (true);
create policy servico_acoplamentos_update_sem_autenticacao
  on public.servico_acoplamentos
  for update to anon, authenticated using (true) with check (true);

commit;
