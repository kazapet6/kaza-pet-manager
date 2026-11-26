-- Candidata para homologacao. Nao executar em producao sem validar 043/044/045/049.
-- Novos caminhos, mantendo as RPCs antigas para compatibilidade durante rollback.
begin;

alter table public.contrato_eventos add column data_efetiva_recebimento date;
alter table public.atendimento_recebimentos
  add column data_efetiva_recebimento date,
  add column registrado_por uuid;

-- Unicidade da chave de recebimentos de pacote inclusive no caminho legado.
-- Se houver duplicidade historica, abortar a migration sem alterar nenhum registro.
create unique index contrato_pagamento_chave_056
  on public.contrato_eventos ((detalhes->>'chaveIdempotencia'))
  where tipo='pagamento_integral_ciclo' and detalhes->>'chaveIdempotencia' is not null;

-- Nao preencher datas ou operadores historicos por inferencia.
create function public.data_efetiva_recebimento_056(p_data text)
returns date language plpgsql stable security invoker set search_path = pg_catalog as $$
declare d date;
begin
  if p_data is null or p_data !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return null; end if;
  begin
    d := p_data::date;
  exception when invalid_datetime_format or datetime_field_overflow then return null;
  end;
  if to_char(d, 'YYYY-MM-DD') <> p_data or d > (statement_timestamp() at time zone 'America/Sao_Paulo')::date then
    return null;
  end if;
  return d;
end;
$$;

-- Preserva o contrato da consulta anterior, expondo o dia efetivo e o momento de registro separadamente.
create function public.financeiro_pacote_056(p_atendimento_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = pg_catalog as $$
declare f jsonb; e public.contrato_eventos%rowtype;
begin
  f := public.financeiro_pacote_045(p_atendimento_id);
  if f is null or f->>'recebimento' is null then return f; end if;
  select * into strict e from public.contrato_eventos where id=(f->'recebimento'->>'id')::uuid;
  return jsonb_set(f, '{recebimento}', (f->'recebimento') || jsonb_build_object(
    'dataEfetiva', e.data_efetiva_recebimento, 'registradoEm', e.created_at, 'registradoPor', e.registrado_por));
end;
$$;

-- Pagamento antecipado somente de ciclo existente com vinculo atual de credito reservado.
-- Utiliza a mesma ordem de bloqueio comercial 043 e o mesmo evento contabil da RPC 045.
create function public.receber_pacote_056(p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path = pg_catalog as $$
declare
  atendimento uuid := (p_payload->>'atendimentoId')::uuid;
  usuario uuid := (p_payload->>'usuarioId')::uuid;
  chave uuid := (p_payload->>'chaveIdempotencia')::uuid;
  valor numeric := (p_payload->>'valor')::numeric;
  forma text := p_payload->>'formaPagamento';
  dia date := public.data_efetiva_recebimento_056(p_payload->>'dataEfetiva');
  financeiro jsonb;
  contrato uuid;
  ciclo public.contrato_ciclos%rowtype;
  recibo public.contrato_eventos%rowtype;
begin
  if atendimento is null or usuario is null or chave is null or valor is null or valor <= 0
    or forma is null or forma not in ('pix','dinheiro','debito','credito','outro') or dia is null then
    return jsonb_build_object('status','invalido','codigo','PAGAMENTO_INVALIDO','mensagem','Informe valor, forma e data efetiva válida, não futura.');
  end if;
  financeiro := public.financeiro_pacote_045(atendimento);
  select c.contrato_id into contrato from public.contrato_ciclos c where c.id=(financeiro->>'cicloId')::uuid;
  if not found then
    return jsonb_build_object('status','invalido','codigo','CICLO_NAO_ENCONTRADO','mensagem','Ciclo do atendimento não encontrado.');
  end if;
  perform public.bloquear_contratos_comerciais_043(array[contrato],false);
  -- Releitura sob bloqueio: nao reaproveitar uma associacao desatualizada.
  financeiro := public.financeiro_pacote_045(atendimento);
  select * into ciclo from public.contrato_ciclos where id=(financeiro->>'cicloId')::uuid and contrato_id=contrato for update;
  if not found then
    return jsonb_build_object('status','conflito','codigo','CICLO_ALTERADO','mensagem','O ciclo mudou. Reabra o atendimento.');
  end if;
  -- A mesma chave nao pode representar pagamento de outro ciclo, inclusive
  -- quando o evento anterior for legado. O indice protege as corridas entre ambos os caminhos.
  if exists (select 1 from public.contrato_eventos e where e.tipo='pagamento_integral_ciclo'
    and e.detalhes->>'chaveIdempotencia'=chave::text
    and (e.contrato_id is distinct from ciclo.contrato_id or e.detalhes->>'cicloId' is distinct from ciclo.id::text)) then
    return jsonb_build_object('status','conflito','codigo','IDEMPOTENCIA_CONFLITANTE','mensagem','A chave de pagamento já foi usada em outro ciclo.');
  end if;
  select * into recibo from public.contrato_eventos where contrato_id=ciclo.contrato_id
    and tipo='pagamento_integral_ciclo' and detalhes->>'cicloId'=ciclo.id::text;
  if found and recibo.detalhes->>'chaveIdempotencia'=chave::text then
    if recibo.detalhes->>'atendimentoId'=atendimento::text
      and (recibo.detalhes->>'valor')::numeric=valor and recibo.detalhes->>'formaPagamento'=forma
      and recibo.data_efetiva_recebimento is not distinct from dia then
      return jsonb_build_object('status','registrado','recebimentoId',recibo.id,'reutilizado',true);
    end if;
    return jsonb_build_object('status','conflito','codigo','IDEMPOTENCIA_CONFLITANTE','mensagem','Os dados do pagamento já registrado são diferentes.');
  end if;
  if ciclo.situacao_financeira <> 'pendente' or recibo.id is not null then
    return jsonb_build_object('status','invalido','codigo','PAGAMENTO_JA_REGISTRADO_OU_EM_REVISAO','mensagem','Este ciclo já está pago ou exige revisão financeira.');
  end if;
  if ciclo.estado not in ('reservado','em_andamento') or not exists (
    select 1 from public.contrato_creditos_contexto_044 u where u.ciclo_id=ciclo.id
      and u.atendimento_atual_id=atendimento and (
        u.status_atendimento in ('recebido','em_atendimento','aguardando_retirada','aguardando_entrega')
        or (u.status_atendimento in ('agendado','confirmado') and u.estado_comercial='reservado')
      )
  ) then
    return jsonb_build_object('status','invalido','codigo','ATENDIMENTO_FORA_DO_PAGAMENTO','mensagem','O atendimento não está elegível para pagamento do ciclo.');
  end if;
  if valor is distinct from (financeiro->>'valor')::numeric then
    return jsonb_build_object('status','invalido','codigo','VALOR_INTEGRAL_OBRIGATORIO','mensagem','Informe o valor integral do pacote.');
  end if;
  insert into public.contrato_eventos(contrato_id,tipo,detalhes,registrado_por,data_efetiva_recebimento)
    values(ciclo.contrato_id,'pagamento_integral_ciclo',jsonb_build_object(
      'cicloId',ciclo.id,'atendimentoId',atendimento,'chaveIdempotencia',chave,'valor',valor,'formaPagamento',forma),usuario,dia)
    returning id into recibo.id;
  update public.contrato_ciclos set situacao_financeira='pago' where id=ciclo.id;
  return jsonb_build_object('status','registrado','recebimentoId',recibo.id,'reutilizado',false);
exception when lock_not_available or deadlock_detected or unique_violation then
  return jsonb_build_object('status','conflito','codigo','FINANCEIRO_CONCORRENTE','mensagem','O financeiro está sendo atualizado ou a chave já foi registrada. Consulte o saldo e tente novamente.');
end;
$$;

-- Avulsos/adicionais: delega valor, teto, isencao e idempotencia a RPC 049.
-- Metadados somente no recebimento NOVO, na mesma transacao. Reenvio jamais redata um recibo antigo.
create function public.registrar_recebimento_atendimento_056(p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path = pg_catalog as $$
declare
  dia date := public.data_efetiva_recebimento_056(p_payload->>'dataEfetiva');
  usuario uuid := (p_payload->>'usuarioId')::uuid;
  resultado jsonb;
  recibo public.atendimento_recebimentos%rowtype;
begin
  if dia is null or usuario is null then
    return jsonb_build_object('status','invalido','codigo','DATA_EFETIVA_INVALIDA','mensagem','Informe a data efetiva válida, não futura.');
  end if;
  -- Serializar a consulta idempotente da RPC antiga com as novas chamadas.
  -- Sem este bloqueio, um reenvio simultaneo pode consultar a chave antes do
  -- primeiro commit e depois receber erroneamente VALOR_SUPERA_SALDO.
  perform a.id from public.atendimentos a
    where a.id=(p_payload->>'atendimentoId')::uuid for update;
  resultado := public.registrar_recebimento_atendimento(p_payload);
  if resultado->>'status' is distinct from 'registrado' then return resultado; end if;
  if resultado->>'reutilizado' = 'true' then
    select * into strict recibo from public.atendimento_recebimentos where id=(resultado->>'recebimentoId')::uuid;
    if recibo.data_efetiva_recebimento is distinct from dia then
      return jsonb_build_object('status','conflito','codigo','IDEMPOTENCIA_CONFLITANTE','mensagem','A data efetiva não corresponde ao recebimento original.');
    end if;
    return resultado;
  end if;
  if resultado->>'reutilizado' is distinct from 'false' then raise exception 'RESULTADO_FINANCEIRO_INESPERADO'; end if;
  update public.atendimento_recebimentos
    set data_efetiva_recebimento=dia, registrado_por=usuario
    where id=(resultado->>'recebimentoId')::uuid and chave_idempotencia=(p_payload->>'chaveIdempotencia')::uuid
      and data_efetiva_recebimento is null and registrado_por is null;
  if not found then raise exception 'METADADOS_FINANCEIROS_NAO_GRAVADOS'; end if;
  return resultado;
end;
$$;

revoke all on function public.data_efetiva_recebimento_056(text), public.financeiro_pacote_056(uuid),
  public.receber_pacote_056(jsonb), public.registrar_recebimento_atendimento_056(jsonb) from public, anon, authenticated;
grant execute on function public.data_efetiva_recebimento_056(text), public.financeiro_pacote_056(uuid),
  public.receber_pacote_056(jsonb), public.registrar_recebimento_atendimento_056(jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
