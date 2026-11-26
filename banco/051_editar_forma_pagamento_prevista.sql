begin;

create function public.alterar_forma_pagamento_prevista(
  p_atendimento_id uuid, p_versao_esperada bigint, p_forma_prevista text
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  atendimento_status text;
  financeira public.atendimento_financeiro%rowtype;
begin
  if p_versao_esperada is null or p_versao_esperada < 0
    or (p_forma_prevista is not null and p_forma_prevista not in ('dinheiro', 'pix', 'cartao')) then
    return jsonb_build_object('status', 'invalido', 'codigo', 'PREVISAO_INVALIDA', 'mensagem', 'Previsão inválida.');
  end if;

  select status::text into atendimento_status
    from public.atendimentos where id = p_atendimento_id for update;
  if atendimento_status is null or atendimento_status not in ('agendado', 'confirmado')
    or public.financeiro_pacote_045(p_atendimento_id) is not null then
    return jsonb_build_object('status', 'invalido', 'codigo', 'PREVISAO_INDISPONIVEL',
      'mensagem', 'A previsão só pode ser editada em atendimentos avulsos agendados ou confirmados.');
  end if;

  select * into financeira from public.atendimento_financeiro
    where atendimento_id = p_atendimento_id for update;
  if financeira.forma_pagamento_prevista is not distinct from p_forma_prevista then
    return jsonb_build_object('status', 'atualizado', 'versao', coalesce(financeira.versao, 0));
  end if;
  if coalesce(financeira.versao, 0) <> p_versao_esperada then
    return jsonb_build_object('status', 'conflito', 'codigo', 'VERSAO_FINANCEIRA_ALTERADA',
      'mensagem', 'O financeiro mudou. Reabra o atendimento e tente novamente.');
  end if;

  insert into public.atendimento_financeiro (atendimento_id, forma_pagamento_prevista, versao)
    values (p_atendimento_id, p_forma_prevista, 1)
    on conflict (atendimento_id) do update set
      forma_pagamento_prevista = excluded.forma_pagamento_prevista,
      versao = atendimento_financeiro.versao + 1,
      updated_at = statement_timestamp()
    returning * into financeira;
  return jsonb_build_object('status', 'atualizado', 'versao', financeira.versao);
end;
$$;

revoke all on function public.alterar_forma_pagamento_prevista(uuid, bigint, text) from public, anon, authenticated;
grant execute on function public.alterar_forma_pagamento_prevista(uuid, bigint, text) to service_role;
notify pgrst, 'reload schema';
commit;
