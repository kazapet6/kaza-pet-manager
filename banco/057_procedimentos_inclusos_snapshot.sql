-- Apenas candidata; executar depois das migrations 049, 053 e 056 em homologação.
-- Preserva preços, etapas, créditos, recebimentos e snapshots históricos.
begin;

alter table public.servicos
  add column procedimentos_inclusos text[] not null default '{}'::text[],
  add column procedimento_avulso_codigo text,
  add constraint servicos_procedimentos_inclusos_057 check (
    array_position(procedimentos_inclusos, null) is null
    and procedimentos_inclusos <@ array['tosa_higienica','limpeza_ouvidos','corte_unhas']::text[]
  ),
  add constraint servicos_procedimento_avulso_057 check (
    procedimento_avulso_codigo is null or (
      procedimento_avulso_codigo in ('tosa_higienica','limpeza_ouvidos','corte_unhas')
      and not (procedimento_avulso_codigo = any(procedimentos_inclusos))
    )
  );

alter table public.atendimento_servicos
  add column procedimentos_inclusos_snapshot text[],
  add constraint atendimento_procedimentos_snapshot_057 check (
    procedimentos_inclusos_snapshot is null or (
      array_position(procedimentos_inclusos_snapshot, null) is null
      and procedimentos_inclusos_snapshot <@ array['tosa_higienica','limpeza_ouvidos','corte_unhas']::text[]
    )
  );

-- Em registros anteriores, NULL significa que os procedimentos não foram registrados.
-- Não inferir retrospectivamente a composição nem marcar procedimento realizado.
create function public.capturar_procedimentos_inclusos_057()
returns trigger language plpgsql security invoker set search_path = pg_catalog as $$
begin
  if tg_op = 'UPDATE' and new.servico_id is not distinct from old.servico_id then
    new.procedimentos_inclusos_snapshot := old.procedimentos_inclusos_snapshot;
    return new;
  end if;
  select procedimentos_inclusos into strict new.procedimentos_inclusos_snapshot
    from public.servicos where id = new.servico_id;
  return new;
end;
$$;
revoke all on function public.capturar_procedimentos_inclusos_057() from public, anon, authenticated;
grant execute on function public.capturar_procedimentos_inclusos_057() to service_role;
create trigger capturar_procedimentos_inclusos_057
before insert or update of servico_id, procedimentos_inclusos_snapshot
on public.atendimento_servicos for each row
execute function public.capturar_procedimentos_inclusos_057();
notify pgrst, 'reload schema';
commit;
