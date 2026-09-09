begin;

-- Mantem o vinculo do funcionario com o servico enquanto existir ao menos
-- uma etapa ativa desse mesmo servico para o funcionario.
create or replace function public.sincronizar_funcionario_servico_por_etapas(
  p_funcionario_id uuid,
  p_servico_id uuid
)
returns void
language plpgsql
as $$
declare
  possui_etapa_ativa boolean;
begin
  if p_funcionario_id is null or p_servico_id is null then
    return;
  end if;

  select exists (
    select 1
    from public.funcionario_etapas funcionario_etapa
    join public.servico_etapas etapa
      on etapa.id = funcionario_etapa.servico_etapa_id
    where funcionario_etapa.funcionario_id = p_funcionario_id
      and etapa.servico_id = p_servico_id
      and funcionario_etapa.ativo
  )
  into possui_etapa_ativa;

  if possui_etapa_ativa then
    insert into public.funcionario_servicos (
      funcionario_id, servico_id, ativo
    )
    values (p_funcionario_id, p_servico_id, true)
    on conflict (funcionario_id, servico_id) do update
    set ativo = true;
  else
    update public.funcionario_servicos
    set ativo = false
    where funcionario_id = p_funcionario_id
      and servico_id = p_servico_id
      and ativo;
  end if;
end;
$$;

create or replace function public.sincronizar_servico_ao_alterar_funcionario_etapa()
returns trigger
language plpgsql
as $$
declare
  servico_anterior_id uuid;
  servico_atual_id uuid;
begin
  if tg_op <> 'INSERT' then
    select etapa.servico_id
    into servico_anterior_id
    from public.servico_etapas etapa
    where etapa.id = old.servico_etapa_id;
  end if;

  if tg_op <> 'DELETE' then
    select etapa.servico_id
    into servico_atual_id
    from public.servico_etapas etapa
    where etapa.id = new.servico_etapa_id;
  end if;

  if tg_op <> 'INSERT'
    and (
      tg_op = 'DELETE'
      or old.funcionario_id is distinct from new.funcionario_id
      or servico_anterior_id is distinct from servico_atual_id
    )
  then
    perform public.sincronizar_funcionario_servico_por_etapas(
      old.funcionario_id, servico_anterior_id
    );
  end if;

  if tg_op <> 'DELETE' then
    perform public.sincronizar_funcionario_servico_por_etapas(
      new.funcionario_id, servico_atual_id
    );
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- Impede que outro CRUD desative o vinculo pai enquanto etapas ativas ainda
-- dependem dele. Para desabilitar o servico, as etapas devem ser desativadas.
create or replace function public.validar_desativacao_funcionario_servico()
returns trigger
language plpgsql
as $$
begin
  if not new.ativo and exists (
    select 1
    from public.funcionario_etapas funcionario_etapa
    join public.servico_etapas etapa
      on etapa.id = funcionario_etapa.servico_etapa_id
    where funcionario_etapa.funcionario_id = new.funcionario_id
      and etapa.servico_id = new.servico_id
      and funcionario_etapa.ativo
  ) then
    raise exception 'Existem etapas ativas para este funcionario e servico. Desative as etapas primeiro.';
  end if;
  return new;
end;
$$;

drop trigger if exists funcionario_etapas_sincronizar_servico
  on public.funcionario_etapas;
create trigger funcionario_etapas_sincronizar_servico
after insert or update of funcionario_id, servico_etapa_id, ativo or delete
on public.funcionario_etapas
for each row execute function public.sincronizar_servico_ao_alterar_funcionario_etapa();

drop trigger if exists funcionario_servicos_validar_desativacao
  on public.funcionario_servicos;
create trigger funcionario_servicos_validar_desativacao
before insert or update of funcionario_id, servico_id, ativo
on public.funcionario_servicos
for each row execute function public.validar_desativacao_funcionario_servico();

-- Backfill aditivo: cria ou reativa somente os vinculos comprovados pelas
-- etapas atualmente ativas. Nenhum vinculo existente e removido.
insert into public.funcionario_servicos (
  funcionario_id, servico_id, ativo
)
select distinct
  funcionario_etapa.funcionario_id,
  etapa.servico_id,
  true
from public.funcionario_etapas funcionario_etapa
join public.servico_etapas etapa
  on etapa.id = funcionario_etapa.servico_etapa_id
where funcionario_etapa.ativo
on conflict (funcionario_id, servico_id) do update
set ativo = true;

commit;
