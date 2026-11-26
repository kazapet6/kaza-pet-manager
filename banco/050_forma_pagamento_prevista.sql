begin;

alter table public.atendimento_financeiro
  add column forma_pagamento_prevista text
  check (forma_pagamento_prevista in ('dinheiro', 'pix', 'cartao'));

create function public.confirmar_agendamento_com_forma_prevista(
  p_plano jsonb, p_operador uuid, p_forma_prevista text, p_valores jsonb default null
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  resultado jsonb;
begin
  if p_forma_prevista is null or p_forma_prevista not in ('dinheiro', 'pix', 'cartao') then
    raise exception 'Forma de pagamento prevista inválida' using errcode = '22023';
  end if;

  if p_valores is null then
    resultado := public.mensageria_confirmar_agendamento(p_plano, p_operador);
  else
    resultado := public.confirmar_agendamento_com_valores_negociados(p_plano, p_operador, p_valores);
  end if;

  if resultado->>'status' = 'confirmado' and resultado->>'reutilizadoPorIdempotencia' = 'false' then
    insert into public.atendimento_financeiro (atendimento_id, forma_pagamento_prevista)
    values ((resultado->>'atendimentoId')::uuid, p_forma_prevista)
    on conflict (atendimento_id) do update
      set forma_pagamento_prevista = excluded.forma_pagamento_prevista;
  end if;

  return resultado;
end;
$$;

revoke all on function public.confirmar_agendamento_com_forma_prevista(jsonb, uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.confirmar_agendamento_com_forma_prevista(jsonb, uuid, text, jsonb)
  to service_role;

notify pgrst, 'reload schema';
commit;
