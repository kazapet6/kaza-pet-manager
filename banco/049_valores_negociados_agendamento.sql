begin;

do $$
begin
  if to_regprocedure('public.mensageria_confirmar_agendamento(jsonb,uuid)') is null then
    raise exception 'A confirmação integrada da Agenda precisa estar instalada antes da migration 049';
  end if;
  if not has_function_privilege('service_role', 'public.mensageria_confirmar_agendamento(jsonb,uuid)', 'EXECUTE')
    or not has_table_privilege('service_role', 'public.atendimentos', 'SELECT')
    or not has_table_privilege('service_role', 'public.atendimentos', 'UPDATE')
    or not has_table_privilege('service_role', 'public.atendimento_servicos', 'SELECT')
    or not has_table_privilege('service_role', 'public.atendimento_servicos', 'UPDATE') then
    raise exception 'A migration 049 exige a rota e os privilégios atuais da Edge de Agenda';
  end if;
end;
$$;

create function public.confirmar_agendamento_com_valores_negociados(
  p_plano jsonb,
  p_operador uuid,
  p_valores jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  resultado jsonb;
  atendimento uuid;
  total_original numeric;
  total_final numeric;
  quantidade integer;
begin
  if jsonb_typeof(p_valores) is distinct from 'array' or jsonb_array_length(p_valores) = 0 then
    raise exception 'Valores negociados ausentes ou inválidos';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_valores) as ajuste("servicoId" uuid, original numeric, final numeric)
    where ajuste."servicoId" is null or ajuste.original is null or ajuste.final is null
      or ajuste.original < 0 or ajuste.final < 0 or ajuste.final > 99999999.99
      or ajuste.final <> round(ajuste.final, 2) or ajuste.original = ajuste.final
  ) or (
    select count(distinct ajuste."servicoId")
    from jsonb_to_recordset(p_valores) as ajuste("servicoId" uuid)
  ) <> jsonb_array_length(p_valores) then
    raise exception 'Valores negociados inválidos ou duplicados';
  end if;

  resultado := public.mensageria_confirmar_agendamento(p_plano, p_operador);
  if resultado->>'status' is distinct from 'confirmado'
    or resultado->>'reutilizadoPorIdempotencia' is distinct from 'false' then
    return resultado;
  end if;

  atendimento := (resultado->>'atendimentoId')::uuid;
  update public.atendimento_servicos as servico
  set valor_manual = ajuste.final,
      valor_final = ajuste.final,
      alteracao_valor_autorizada = true,
      motivo_alteracao_valor = 'Negociação comercial'
  from jsonb_to_recordset(p_valores) as ajuste("servicoId" uuid, original numeric, final numeric)
  where servico.atendimento_id = atendimento and servico.servico_id = ajuste."servicoId"
    and servico.ativo and servico.origem = 'solicitado'
    and servico.valor_calculado = ajuste.original;
  get diagnostics quantidade = row_count;
  if quantidade <> jsonb_array_length(p_valores) then
    raise exception 'A composição ou o preço original dos serviços mudou';
  end if;

  select valor_calculado into strict total_original from public.atendimentos where id = atendimento;
  select sum(valor_final) into total_final
  from public.atendimento_servicos where atendimento_id = atendimento and ativo;

  if total_final = total_original then
    return resultado;
  end if;

  update public.atendimentos
  set valor_manual = total_final,
      valor_final = total_final,
      alteracao_valor_autorizada = true,
      motivo_alteracao_valor = 'Negociação comercial'
  where id = atendimento;
  return jsonb_set(resultado, '{valorFinal}', to_jsonb(total_final));
end;
$$;

revoke all on function public.confirmar_agendamento_com_valores_negociados(jsonb, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.confirmar_agendamento_com_valores_negociados(jsonb, uuid, jsonb)
  to service_role;

-- O teto de recebimento do atendimento de pacote é somente o total dos adicionais.
alter table public.atendimento_servicos add column adicional_pacote boolean not null default false;

create or replace function public.registrar_recebimento_atendimento(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_atendimento_id uuid := (p_payload->>'atendimentoId')::uuid;
  v_chave uuid := (p_payload->>'chaveIdempotencia')::uuid;
  v_valor numeric(10,2) := (p_payload->>'valor')::numeric;
  v_forma text := p_payload->>'formaPagamento';
  v_atendimento public.atendimentos%rowtype;
  v_financeiro public.atendimento_financeiro%rowtype;
  v_existente public.atendimento_recebimentos%rowtype;
  v_total numeric(10,2);
  v_limite numeric(10,2);
begin
  select item.* into v_existente from public.atendimento_recebimentos item where item.chave_idempotencia = v_chave;
  if found then
    if v_existente.atendimento_id <> v_atendimento_id or v_existente.valor <> v_valor or v_existente.forma_pagamento <> v_forma then
      return jsonb_build_object('status','conflito','codigo','IDEMPOTENCIA_CONFLITANTE','mensagem','A chave de recebimento ja foi usada com outros dados.');
    end if;
    return jsonb_build_object('status','registrado','recebimentoId',v_existente.id,'reutilizado',true);
  end if;
  if v_valor <= 0 or v_forma not in ('pix','dinheiro','debito','credito','outro') then
    return jsonb_build_object('status','invalido','codigo','RECEBIMENTO_INVALIDO','mensagem','Valor ou forma de pagamento invalida.');
  end if;
  select item.* into v_atendimento from public.atendimentos item where item.id = v_atendimento_id for update;
  if not found then return jsonb_build_object('status','invalido','codigo','ATENDIMENTO_NAO_ENCONTRADO','mensagem','Atendimento nao encontrado.'); end if;
  v_limite := v_atendimento.valor_final;
  if public.financeiro_pacote_045(v_atendimento_id) is not null then
    if v_atendimento.status in ('cancelado','faltou') then
      return jsonb_build_object('status','invalido','codigo','ATENDIMENTO_INDISPONIVEL','mensagem','O atendimento do pacote não aceita novos recebimentos.');
    end if;
    select coalesce(sum(valor_final),0) into v_limite
      from public.atendimento_servicos where atendimento_id=v_atendimento_id and ativo and adicional_pacote;
  end if;
  insert into public.atendimento_financeiro(atendimento_id) values(v_atendimento_id) on conflict do nothing;
  select item.* into v_financeiro from public.atendimento_financeiro item where item.atendimento_id = v_atendimento_id for update;
  if v_financeiro.isento then return jsonb_build_object('status','invalido','codigo','ATENDIMENTO_ISENTO','mensagem','Atendimento isento nao aceita recebimentos.'); end if;
  select coalesce(sum(item.valor),0)::numeric(10,2) into v_total from public.atendimento_recebimentos item where item.atendimento_id = v_atendimento_id;
  if v_total + v_valor > v_limite then return jsonb_build_object('status','invalido','codigo','VALOR_SUPERA_SALDO','mensagem','O recebimento supera o saldo disponivel.'); end if;
  insert into public.atendimento_recebimentos(atendimento_id,valor,forma_pagamento,chave_idempotencia)
  values(v_atendimento_id,v_valor,v_forma,v_chave) returning * into v_existente;
  update public.atendimento_financeiro item set versao=item.versao+1,updated_at=statement_timestamp() where item.atendimento_id=v_atendimento_id;
  return jsonb_build_object('status','registrado','recebimentoId',v_existente.id,'reutilizado',false);
exception when unique_violation then
  return public.registrar_recebimento_atendimento(p_payload);
end; $$;

create function public.incluir_adicional_pacote_049(p_plano jsonb, p_adicional jsonb, p_servicos_esperados uuid[])
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare
  v_atendimento uuid := (p_plano->>'atendimentoId')::uuid;
  v_chave uuid := (p_plano->>'chaveIdempotencia')::uuid;
  v_id uuid := (p_adicional->>'id')::uuid;
  v_servico uuid := (p_adicional->>'servicoId')::uuid;
  v_original numeric := (p_adicional->>'original')::numeric;
  v_valor numeric := (p_adicional->>'valor')::numeric;
  v_resultado jsonb;
  v_existentes uuid[];
begin
  perform pg_advisory_xact_lock(hashtextextended('remarcacao:' || v_chave::text, 0));
  if exists (select from public.atendimento_remarcacoes where chave_idempotencia=v_chave) then
    return public.remarcar_atendimento_transacional(p_plano);
  end if;

  perform 1 from public.atendimentos where id=v_atendimento and status in ('agendado','confirmado') for update;
  if not found or public.financeiro_pacote_045(v_atendimento) is null then
    return jsonb_build_object('status','erro','codigo','ATENDIMENTO_ALTERADO','mensagem','Escolha um atendimento de pacote agendado ou confirmado.');
  end if;
  select array_agg(id order by id) into v_existentes
  from public.atendimento_servicos where atendimento_id=v_atendimento and ativo;
  if v_existentes is distinct from array(select id from unnest(p_servicos_esperados) as item(id) order by id)
    or exists (select from public.atendimento_servicos where atendimento_id=v_atendimento and servico_id=v_servico and ativo) then
    return jsonb_build_object('status','erro','codigo','ATENDIMENTO_ALTERADO','mensagem','Os serviços deste atendimento mudaram. Reabra o atendimento.');
  end if;
  if v_original is null or v_valor is null or v_original not between 0 and 99999999.99
    or v_valor not between 0 and 99999999.99 or v_valor<>round(v_valor,2) then
    return jsonb_build_object('status','erro','codigo','PLANO_INVALIDO','mensagem','Valor inválido para o serviço adicional.');
  end if;

  begin
    insert into public.atendimento_servicos(id,atendimento_id,servico_id,ordem,origem,nome_snapshot,
      preco_base_snapshot,valor_calculado,desconto_valor,valor_manual,valor_final,
      alteracao_valor_autorizada,motivo_alteracao_valor,ativo,adicional_pacote)
    values(v_id,v_atendimento,v_servico,
      (select coalesce(max(ordem),0)+1 from public.atendimento_servicos where atendimento_id=v_atendimento),
      'solicitado',p_adicional->>'nome',(p_adicional->>'precoBase')::numeric,v_original,0,
      case when v_valor<>v_original then v_valor end,v_valor,v_valor<>v_original,
      case when v_valor<>v_original then 'Negociação comercial' end,true,true);
    insert into public.atendimento_servico_acrescimos(id,atendimento_servico_id,tipo,criterio,regra_preco_id,
      descricao_snapshot,valor_referencia_snapshot,acrescimo_valor,acrescimo_minutos)
    select gen_random_uuid(),v_id,'preco',a.criterio,a."regraPrecoId",a."descricaoSnapshot",
      a."valorReferenciaSnapshot",a."acrescimoValor",0
    from jsonb_to_recordset(p_adicional->'acrescimos') as a(criterio text,"regraPrecoId" uuid,
      "descricaoSnapshot" text,"valorReferenciaSnapshot" text,"acrescimoValor" numeric);
    v_resultado := public.remarcar_atendimento_transacional(p_plano);
    if v_resultado->>'status' is distinct from 'remarcado' then raise exception using errcode='P0049'; end if;
  exception when sqlstate 'P0049' then
    return v_resultado;
  end;
  return v_resultado;
end;
$$;

revoke all on function public.incluir_adicional_pacote_049(jsonb,jsonb,uuid[]) from public,anon,authenticated;
grant execute on function public.incluir_adicional_pacote_049(jsonb,jsonb,uuid[]) to service_role;

create function public.preserva_recebimento_adicional_049()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
  if new.status in ('cancelado','faltou') and new.status is distinct from old.status
    and exists (select from public.atendimento_servicos where atendimento_id=old.id and ativo and adicional_pacote)
    and exists (select from public.atendimento_recebimentos where atendimento_id=old.id) then
    raise exception using errcode='P0049', message='O atendimento tem adicional recebido. Resolva o pagamento antes de cancelar ou pular o banho.';
  end if;
  return new;
end;
$$;
revoke all on function public.preserva_recebimento_adicional_049() from public,anon,authenticated;
create trigger preservar_recebimento_adicional_049 before update of status on public.atendimentos
  for each row execute function public.preserva_recebimento_adicional_049();

commit;
