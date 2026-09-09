begin;

create or replace function public.validar_transicao_status_atendimento()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_status_operacionais constant text[] := array[
    'agendado', 'confirmado', 'recebido', 'em_atendimento',
    'aguardando_retirada', 'aguardando_entrega', 'concluido'
  ];
  v_origens_cancelamento constant text[] := array[
    'agendado', 'confirmado', 'recebido', 'em_atendimento',
    'aguardando_retirada', 'aguardando_entrega'
  ];
begin
  if new.status = old.status then
    return new;
  end if;

  if old.status in ('cancelado', 'faltou') then
    raise exception 'Status terminal nao pode ser alterado.'
      using errcode = '23514';
  elsif new.status = 'cancelado' then
    if old.status <> all(v_origens_cancelamento) then
      raise exception 'Cancelamento nao permitido para o status atual.'
        using errcode = '23514';
    end if;
  elsif new.status = 'faltou' then
    if old.status not in ('agendado', 'confirmado') then
      raise exception 'Falta nao permitida para o status atual.'
        using errcode = '23514';
    end if;
  elsif old.status <> all(v_status_operacionais)
    or new.status <> all(v_status_operacionais)
  then
    raise exception 'Alteracao fora do fluxo operacional de status.'
      using errcode = '23514';
  end if;

  if new.status = 'recebido' then
    new.recebido_em := coalesce(old.recebido_em, statement_timestamp());
  elsif new.status = 'em_atendimento' then
    new.iniciado_em := coalesce(old.iniciado_em, statement_timestamp());
  elsif new.status in ('aguardando_retirada', 'aguardando_entrega') then
    new.finalizado_em := coalesce(old.finalizado_em, statement_timestamp());
  elsif new.status = 'concluido' then
    new.concluido_em := coalesce(old.concluido_em, statement_timestamp());
  end if;

  return new;
end;
$$;

revoke all on function public.validar_transicao_status_atendimento()
  from public, anon, authenticated;

commit;
