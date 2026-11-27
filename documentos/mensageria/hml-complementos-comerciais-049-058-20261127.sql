-- Exclusivo HML. 053 e colunas de 054/057 já instaladas; não reaplicar.
DO $guard$ BEGIN
 IF (SELECT count(*) FROM public.clientes)<>3 OR (SELECT count(*) FROM public.pets)<>3 OR (SELECT count(*) FROM public.atendimentos)<>6 OR EXISTS(SELECT 1 FROM public.contratos) OR EXISTS(SELECT 1 FROM public.atendimento_recebimentos) THEN RAISE EXCEPTION 'HML_PRECONDICAO'; END IF;
 IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name||'.'||column_name IN ('atendimento_financeiro.forma_pagamento_prevista','atendimento_recebimentos.data_efetiva_recebimento','atendimento_recebimentos.registrado_por','atendimento_servicos.adicional_pacote','atendimento_servicos.procedimentos_inclusos_snapshot','contrato_eventos.data_efetiva_recebimento','pacote_servicos.preco_unitario_fixo','pacotes.especie_elegivel','pacotes.porte_elegivel','servico_etapas.especie_aplicavel','servico_etapas.porte_aplicavel','servico_etapas.habilitacao_explicita')) OR to_regclass('public.atendimento_adicional_remocoes_058') IS NOT NULL THEN RAISE EXCEPTION 'HML_OBJETO_EXISTENTE'; END IF;
 IF (SELECT count(*) FROM pg_constraint WHERE conrelid='public.servicos'::regclass AND conname IN ('servico_credito_distinto','servico_procedimento_incluso_distinto','servicos_procedimento_avulso_057','servicos_procedimentos_inclusos_057'))<>4 THEN RAISE EXCEPTION 'HML_SERVICOS_INCOMPLETOS'; END IF;
END $guard$;
-- Privilégios estritamente do backend, para as funções invoker 049/050/056/058.
GRANT EXECUTE ON FUNCTION public.mensageria_confirmar_agendamento(jsonb,uuid),mensageria_interna.confirmar_agendamento(jsonb,uuid),public.remarcar_atendimento_transacional(jsonb),public.financeiro_pacote_045(uuid),public.bloquear_contratos_comerciais_043(uuid[],boolean) TO service_role;
GRANT SELECT,UPDATE ON public.atendimentos,public.contrato_ciclos TO service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.atendimento_servicos TO service_role;
GRANT SELECT,INSERT ON public.atendimento_servico_acrescimos,public.contrato_eventos TO service_role;
GRANT SELECT ON public.atendimento_remarcacoes,public.contrato_creditos_contexto_044,public.contrato_credito_vinculos_044,public.contratos,public.contrato_itens,public.contrato_ciclo_ocorrencias,public.contrato_ciclo_ocorrencia_itens,public.grupos_agendamento,public.servicos,public.atendimento_etapas,public.atendimento_etapa_contribuicoes,public.atendimento_servico_origens TO service_role;
-- Source 049_valores_negociados_agendamento
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

-- Source 050_forma_pagamento_prevista
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

-- Source 051_editar_forma_pagamento_prevista
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

-- Source 052_preco_e_elegibilidade_de_oferta
alter table public.pacotes
  add column especie_elegivel text check (especie_elegivel in ('cao', 'gato')),
  add column porte_elegivel text check (porte_elegivel in ('mini','pequeno','medio','grande','gigante'));

alter table public.pacote_servicos
  add column preco_unitario_fixo numeric(10,2) check (preco_unitario_fixo >= 0);

notify pgrst, 'reload schema';

-- Source 054_adicional_com_credito_de_pacote
create function public.validar_adicional_com_credito_054()
returns trigger language plpgsql security invoker set search_path = pg_catalog as $$
declare
  requisito uuid;
  preco numeric;
begin
  if not new.ativo then return new; end if;
  select exige_credito_de_servico_id, preco_base into requisito, preco
    from public.servicos where id = new.servico_id;
  if requisito is null then return new; end if;
  if not new.adicional_pacote or not exists (
    select 1 from public.contrato_creditos_contexto_044 c
    where c.atendimento_atual_id = new.atendimento_id
      and c.servico_id = requisito and c.estado_comercial = 'reservado'
      and c.status_atendimento in ('agendado','confirmado')
  ) then
    raise exception 'Este adicional exige um crédito do serviço de pacote reservado para o atendimento.' using errcode = 'P0054';
  end if;
  if new.valor_final is distinct from preco then
    raise exception 'O valor do adicional difere do preço configurado.' using errcode = 'P0054';
  end if;
  return new;
end;
$$;
revoke all on function public.validar_adicional_com_credito_054() from public, anon, authenticated;
grant execute on function public.validar_adicional_com_credito_054() to service_role;
create trigger validar_adicional_com_credito_054
before insert or update of servico_id, atendimento_id, ativo, adicional_pacote, valor_final
on public.atendimento_servicos for each row execute function public.validar_adicional_com_credito_054();
notify pgrst, 'reload schema';

-- Source 055_etapa_operacional_por_perfil
alter table public.servico_etapas
  add column especie_aplicavel text check (especie_aplicavel in ('cao','gato')),
  add column porte_aplicavel text check (porte_aplicavel in ('mini','pequeno','medio','grande','gigante')),
  add column habilitacao_explicita boolean not null default false;
notify pgrst, 'reload schema';

-- Source 056_recebimento_data_efetiva
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

-- Source 057_procedimentos_inclusos_snapshot
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

-- Source 058_remocao_adicional_pendente
create table public.atendimento_adicional_remocoes_058 (
  chave_idempotencia uuid primary key references public.atendimento_remarcacoes(chave_idempotencia) on delete restrict,
  atendimento_id uuid not null references public.atendimentos(id) on delete restrict,
  atendimento_servico_id uuid not null,
  snapshot_servico jsonb not null,
  snapshot_acrescimos jsonb not null,
  registrado_por uuid not null,
  registrado_em timestamptz not null default statement_timestamp()
);
alter table public.atendimento_adicional_remocoes_058 enable row level security;
revoke all on public.atendimento_adicional_remocoes_058 from public, anon, authenticated, service_role;
grant select, insert on public.atendimento_adicional_remocoes_058 to service_role;

create function public.remover_adicional_pacote_058(p_plano jsonb, p_adicional_id uuid, p_servicos_esperados uuid[], p_operador uuid)
returns jsonb language plpgsql security invoker set search_path = pg_catalog as $$
declare
  atendimento uuid := (p_plano->>'atendimentoId')::uuid;
  chave uuid := (p_plano->>'chaveIdempotencia')::uuid;
  extra public.atendimento_servicos%rowtype;
  ativos uuid[];
  anterior public.atendimento_remarcacoes%rowtype;
  resultado jsonb;
  acrescimos jsonb;
  contratos uuid[];
begin
  if atendimento is null or chave is null or p_adicional_id is null or p_operador is null
    or p_servicos_esperados is null or jsonb_typeof(p_plano->'etapas') is distinct from 'array'
    or jsonb_typeof(p_plano->'contribuicoes') is distinct from 'array' then
    return jsonb_build_object('status','erro','codigo','PLANO_INVALIDO','mensagem','Dados da retirada inválidos.');
  end if;
  -- A ordem de bloqueio acompanha a RPC de remarcação. Revalidar após espera.
  select array_agg(distinct c.contrato_id order by c.contrato_id) into contratos
    from public.contrato_creditos_contexto_044 u join public.contrato_ciclos c on c.id=u.ciclo_id
    where atendimento in (u.atendimento_atual_id,u.atendimento_original_id);
  perform public.bloquear_contratos_comerciais_043(contratos,false);
  perform pg_advisory_xact_lock(hashtextextended('remarcacao:' || chave::text, 0));
  select * into anterior from public.atendimento_remarcacoes where chave_idempotencia=chave;
  if found then
    if anterior.hash_requisicao is distinct from p_plano->>'hashRequisicao' or anterior.atendimento_id is distinct from atendimento
      or not exists(select 1 from public.atendimento_adicional_remocoes_058 a where a.chave_idempotencia=chave and a.atendimento_servico_id=p_adicional_id) then
      return jsonb_build_object('status','erro','codigo','IDEMPOTENCIA_CONFLITANTE','mensagem','A chave já foi usada em outra operação.');
    end if;
    return anterior.resposta || jsonb_build_object('reutilizadoPorIdempotencia',true);
  end if;
  perform 1 from public.atendimentos where id=atendimento and status in ('agendado','confirmado') for update;
  if not found or public.financeiro_pacote_045(atendimento) is null then
    return jsonb_build_object('status','erro','codigo','ATENDIMENTO_ALTERADO','mensagem','Escolha um atendimento de pacote agendado ou confirmado.');
  end if;
  select array_agg(id order by id) into ativos from public.atendimento_servicos where atendimento_id=atendimento and ativo;
  if ativos is distinct from array(select id from unnest(p_servicos_esperados) x(id) order by id) then
    return jsonb_build_object('status','erro','codigo','ATENDIMENTO_ALTERADO','mensagem','Os serviços mudaram. Reabra o atendimento.');
  end if;
  select * into extra from public.atendimento_servicos where id=p_adicional_id and atendimento_id=atendimento and ativo and adicional_pacote and origem='solicitado';
  if not found or exists(select 1 from public.contrato_creditos_contexto_044 u where u.atendimento_atual_id=atendimento and u.servico_id=extra.servico_id) then
    return jsonb_build_object('status','erro','codigo','PLANO_INVALIDO','mensagem','Somente um adicional não contratado pode ser retirado.');
  end if;
  -- Recebimentos são por atendimento, não por serviço: não presumir alocação.
  -- O mesmo bloqueio do atendimento serializa a cobrança 049/056 e a retirada.
  if exists(select 1 from public.atendimento_recebimentos where atendimento_id=atendimento) then
    return jsonb_build_object('status','erro','codigo','PLANO_INVALIDO','mensagem','Existem recebimentos de adicionais neste atendimento. Resolva o estorno antes da retirada.');
  end if;
  if extra.originado_por_atendimento_servico_id is not null
    or exists(select 1 from public.atendimento_servicos where originado_por_atendimento_servico_id=extra.id)
    or exists(select 1 from public.atendimento_servico_origens where atendimento_servico_id=extra.id or originado_por_atendimento_servico_id=extra.id)
    or exists(select 1 from public.atendimento_recomendacoes_retorno where atendimento_servico_id=extra.id) then
    return jsonb_build_object('status','erro','codigo','PLANO_INVALIDO','mensagem','O adicional tem vínculos que exigem revisão. Nenhum serviço foi retirado.');
  end if;
  if exists(select 1 from jsonb_array_elements(p_plano->'etapas') x where x->>'atendimento_servico_id'=extra.id::text)
    or exists(select 1 from jsonb_array_elements(p_plano->'contribuicoes') x where x->>'atendimento_servico_id'=extra.id::text) then
    return jsonb_build_object('status','erro','codigo','PLANO_INVALIDO','mensagem','O plano ainda utiliza o adicional selecionado.');
  end if;
  -- A RPC existente recria reservas e conserva o atendimento/contrato. Só depois
  -- do sucesso arquivamos integralmente a linha e seus acréscimos, sem afetar
  -- a chave única dos serviços ativos; uma contratação posterior pode ser nova.
  begin
    resultado := public.remarcar_atendimento_transacional(p_plano);
    if resultado->>'status' is distinct from 'remarcado' then raise exception using errcode='P0058'; end if;
    if exists(select 1 from public.atendimento_etapas where atendimento_servico_id=extra.id)
      or exists(select 1 from public.atendimento_etapa_contribuicoes where atendimento_servico_id=extra.id) then
      raise exception 'PLANO_AINDA_REFERENCIA_ADICIONAL';
    end if;
    select coalesce(jsonb_agg(to_jsonb(a) order by a.id),'[]'::jsonb) into acrescimos from public.atendimento_servico_acrescimos a where a.atendimento_servico_id=extra.id;
    insert into public.atendimento_adicional_remocoes_058(chave_idempotencia,atendimento_id,atendimento_servico_id,snapshot_servico,snapshot_acrescimos,registrado_por)
      values(chave,atendimento,extra.id,to_jsonb(extra),acrescimos,p_operador);
    delete from public.atendimento_servicos where id=extra.id and atendimento_id=atendimento and ativo and adicional_pacote;
    if not found then raise exception 'ADICIONAL_NAO_RETIRADO'; end if;
  exception when sqlstate 'P0058' then return resultado;
  end;
  return resultado;
exception when lock_not_available or deadlock_detected then
  return jsonb_build_object('status','erro','codigo','ATENDIMENTO_ALTERADO','mensagem','Outra operação está atualizando o atendimento. Consulte novamente.');
end;
$$;
revoke all on function public.remover_adicional_pacote_058(jsonb,uuid,uuid[],uuid) from public,anon,authenticated;
grant execute on function public.remover_adicional_pacote_058(jsonb,uuid,uuid[],uuid) to service_role;
notify pgrst, 'reload schema';
NOTIFY pgrst,'reload schema';
