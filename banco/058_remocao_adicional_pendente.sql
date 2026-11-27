-- Remoção comercial de adicional ainda não recebido, com replanejamento atômico.
-- Não executa estorno nem altera recebimentos ou créditos. Homologar após 057.
begin;

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
commit;
