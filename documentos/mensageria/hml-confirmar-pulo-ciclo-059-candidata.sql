-- 059: RPC de confirmação do pulo. Recebe exclusivamente planos construídos pelo motor no backend.
CREATE OR REPLACE FUNCTION public.remarcar_atendimento_pulo_interno_059(p_plano jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_atendimento_id uuid;
  v_grupo_esperado uuid;
  v_status_esperado text;
  v_inicio_esperado timestamptz;
  v_responsavel_esperado uuid;
  v_responsavel uuid;
  v_chave uuid;
  v_hash text;
  v_configuracao bigint;
  v_configuracao_atual bigint;
  v_grupo jsonb;
  v_atendimento jsonb;
  v_etapas jsonb;
  v_contribuicoes jsonb;
  v_funcionarios jsonb;
  v_equipamentos jsonb;
  v_supervisoes jsonb;
  v_esperas jsonb;
  v_atual public.atendimentos%rowtype;
  v_grupo_atual public.grupos_agendamento%rowtype;
  v_novo_grupo_id uuid;
  v_quantidade_grupo integer;
  v_existente public.atendimento_remarcacoes%rowtype;
  v_resposta jsonb;
  v_lock bigint;
begin

 -- F044_ENTRY_LOCK_BEGIN
 perform public.bloquear_contratos_comerciais_043(ARRAY(select distinct c.contrato_id from public.contrato_credito_vinculos_044 v join public.contrato_ciclos c on c.id=v.ciclo_id where v.atendimento_id=nullif(p_plano->>'atendimentoId','')::uuid or v.atendimento_anterior_id=nullif(p_plano->>'atendimentoId','')::uuid),false);
 perform public.bloquear_contratos_comerciais_043(ARRAY(select distinct c.contrato_id from public.contrato_credito_vinculos_044 v join public.contrato_ciclos c on c.id=v.ciclo_id where v.atendimento_id=nullif(p_plano->>'atendimentoId','')::uuid or v.atendimento_anterior_id=nullif(p_plano->>'atendimentoId','')::uuid),true);
 -- F044_ENTRY_LOCK_END
 -- F043_ENTRY_LOCK_BEGIN
 perform public.bloquear_contratos_comerciais_043(ARRAY(select distinct c.contrato_id from public.contrato_ciclo_ocorrencias o join public.contrato_ciclos c on c.id=o.ciclo_id where o.atendimento_id=nullif(p_plano->>'atendimentoId','')::uuid),false);
 -- Reconsulta apos eventual espera: vinculo que mudou nao fica sem protecao.
 perform public.bloquear_contratos_comerciais_043(ARRAY(select distinct c.contrato_id from public.contrato_ciclo_ocorrencias o join public.contrato_ciclos c on c.id=o.ciclo_id where o.atendimento_id=nullif(p_plano->>'atendimentoId','')::uuid),true);
 -- F043_ENTRY_LOCK_END

  if jsonb_typeof(p_plano) <> 'object' then
    return jsonb_build_object('status','erro','codigo','PLANO_INVALIDO','mensagem','Plano de remarcacao invalido.');
  end if;
  begin
    v_atendimento_id := (p_plano ->> 'atendimentoId')::uuid;
    v_grupo_esperado := (p_plano ->> 'grupoAgendamentoIdEsperado')::uuid;
    v_status_esperado := p_plano ->> 'statusEsperado';
    v_inicio_esperado := (p_plano ->> 'inicioOperacionalEsperado')::timestamptz;
    v_responsavel_esperado := nullif(p_plano ->> 'funcionarioResponsavelIdEsperado','')::uuid;
    v_responsavel := nullif(p_plano ->> 'funcionarioResponsavelId','')::uuid;
    v_chave := (p_plano ->> 'chaveIdempotencia')::uuid;
    v_hash := p_plano ->> 'hashRequisicao';
    v_configuracao := (p_plano ->> 'configuracaoVersao')::bigint;
    v_grupo := p_plano -> 'grupo'; v_atendimento := p_plano -> 'atendimento';
    v_etapas := p_plano -> 'etapas'; v_contribuicoes := p_plano -> 'contribuicoes';
    v_funcionarios := p_plano -> 'funcionarios'; v_equipamentos := p_plano -> 'equipamentos';
    v_supervisoes := p_plano -> 'supervisoes'; v_esperas := p_plano -> 'esperas';
  exception when others then
    return jsonb_build_object('status','erro','codigo','PLANO_INVALIDO','mensagem','Campos basicos invalidos.');
  end;
  if v_hash !~ '^[0-9a-f]{64}$' or v_status_esperado not in ('agendado','confirmado')
    or jsonb_typeof(v_grupo) <> 'object' or jsonb_typeof(v_atendimento) <> 'object'
    or jsonb_typeof(v_etapas) <> 'array' or jsonb_array_length(v_etapas) = 0
    or jsonb_typeof(v_contribuicoes) <> 'array' or jsonb_typeof(v_funcionarios) <> 'array'
    or jsonb_typeof(v_equipamentos) <> 'array' or jsonb_typeof(v_supervisoes) <> 'array'
    or jsonb_typeof(v_esperas) <> 'array' then
    return jsonb_build_object('status','erro','codigo','PLANO_INVALIDO','mensagem','Estrutura do plano invalida.');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('remarcacao:' || v_chave::text, 0));
  select item.* into v_existente from public.atendimento_remarcacoes item where item.chave_idempotencia = v_chave;
  if found then
    if v_existente.hash_requisicao <> v_hash then
      return jsonb_build_object('status','erro','codigo','IDEMPOTENCIA_CONFLITANTE','mensagem','A chave ja foi usada em outra remarcacao.');
    end if;
    return v_existente.resposta || jsonb_build_object('reutilizadoPorIdempotencia', true);
  end if;

  select item.* into v_atual from public.atendimentos item where item.id = v_atendimento_id for update;
  if not found or v_atual.grupo_agendamento_id <> v_grupo_esperado
    or v_atual.status <> v_status_esperado
    or v_atual.inicio_operacional_planejado is distinct from v_inicio_esperado
    or ((p_plano ? 'funcionarioResponsavelIdEsperado')
      and v_atual.funcionario_responsavel_id is distinct from v_responsavel_esperado) then
    return jsonb_build_object('status','erro','codigo','ATENDIMENTO_ALTERADO','mensagem','O atendimento foi alterado por outra operacao.');
  end if;
  if v_atual.status not in ('agendado','confirmado') then
    return jsonb_build_object('status','erro','codigo','STATUS_NAO_PERMITE_REMARCACAO','mensagem','O status atual nao permite remarcacao.');
  end if;
  -- Mantém compatibilidade durante a janela entre aplicar a migration e publicar a Edge nova.
  v_responsavel := coalesce(v_responsavel, v_atual.funcionario_responsavel_id);
  if not exists(select 1 from public.funcionarios where id = v_responsavel and ativo) then
    return jsonb_build_object('status','erro','codigo','PLANO_INVALIDO','mensagem','Escolha um funcionário responsável ativo.');
  end if;
  select versao into v_configuracao_atual from public.agenda_versao_configuracao where id for share;
  if v_configuracao_atual <> v_configuracao then
    return jsonb_build_object('status','erro','codigo','CONFIGURACAO_ALTERADA','mensagem','A configuracao mudou durante a remarcacao.','versaoConfiguracaoAtual',v_configuracao_atual);
  end if;
  select item.* into v_grupo_atual from public.grupos_agendamento item where item.id = v_grupo_esperado for update;

  select count(*)::integer into v_quantidade_grupo from public.atendimentos item where item.grupo_agendamento_id = v_grupo_esperado;

  begin
    perform pg_advisory_xact_lock(hashtextextended(v_responsavel::text, 0));
    for v_lock in select distinct lock_id from (
      select hashtextextended(item.funcionario_id::text, 0) lock_id from jsonb_to_recordset(v_funcionarios) item(funcionario_id uuid)
      union select hashtextextended(item.equipamento_unidade_id::text, 0) from jsonb_to_recordset(v_equipamentos) item(equipamento_unidade_id uuid)
    ) locks order by lock_id loop perform pg_advisory_xact_lock(v_lock); end loop;

    if v_quantidade_grupo = 1 then
      v_novo_grupo_id := v_grupo_esperado;
      update public.grupos_agendamento set
        data_operacional = (v_grupo ->> 'dataOperacional')::date,
        horario_chegada_comprometido = (v_grupo ->> 'horarioChegadaComprometido')::timestamptz,
        retirada_prevista = (v_grupo ->> 'retiradaPrevista')::timestamptz,
        janela_transporte_id = null, janela_nome_snapshot = null,
        coleta_inicio_snapshot = null, coleta_fim_snapshot = null,
        operacao_inicio_snapshot = null, operacao_fim_snapshot = null,
        taxidog_ciclo_id = (v_grupo ->> 'taxidogCicloId')::uuid,
        taxidog_ciclo_nome_snapshot = v_grupo ->> 'taxidogCicloNomeSnapshot',
        taxidog_ciclo_ordem_snapshot = (v_grupo ->> 'taxidogCicloOrdemSnapshot')::integer,
        taxidog_coleta_inicio_snapshot = (v_grupo ->> 'taxidogColetaInicioSnapshot')::time,
        taxidog_coleta_fim_snapshot = (v_grupo ->> 'taxidogColetaFimSnapshot')::time,
        taxidog_conclusao_limite_snapshot = (v_grupo ->> 'taxidogConclusaoLimiteSnapshot')::time,
        updated_at = now()
      where id = v_novo_grupo_id;
    else
      v_novo_grupo_id := gen_random_uuid();
      insert into public.grupos_agendamento (
        id, cliente_id, modalidade, origem, data_operacional,
        horario_chegada_comprometido, retirada_prevista, observacoes,
        taxidog_ciclo_id, taxidog_ciclo_nome_snapshot, taxidog_ciclo_ordem_snapshot,
        taxidog_coleta_inicio_snapshot, taxidog_coleta_fim_snapshot,
        taxidog_conclusao_limite_snapshot
      ) values (
        v_novo_grupo_id, v_grupo_atual.cliente_id, v_grupo_atual.modalidade,
        v_grupo_atual.origem, (v_grupo ->> 'dataOperacional')::date,
        (v_grupo ->> 'horarioChegadaComprometido')::timestamptz,
        (v_grupo ->> 'retiradaPrevista')::timestamptz, v_grupo_atual.observacoes,
        (v_grupo ->> 'taxidogCicloId')::uuid, v_grupo ->> 'taxidogCicloNomeSnapshot',
        (v_grupo ->> 'taxidogCicloOrdemSnapshot')::integer,
        (v_grupo ->> 'taxidogColetaInicioSnapshot')::time,
        (v_grupo ->> 'taxidogColetaFimSnapshot')::time,
        (v_grupo ->> 'taxidogConclusaoLimiteSnapshot')::time
      );
    end if;

    delete from public.atendimento_esperas where atendimento_id = v_atendimento_id;
    delete from public.atendimento_etapas where atendimento_id = v_atendimento_id;
    update public.atendimentos set grupo_agendamento_id = v_novo_grupo_id,
      janela_transporte_id = null,
      funcionario_responsavel_id = v_responsavel,
      inicio_planejado = (v_atendimento ->> 'inicioOperacionalPlanejado')::timestamptz,
      inicio_operacional_planejado = (v_atendimento ->> 'inicioOperacionalPlanejado')::timestamptz,
      conclusao_operacional_prevista = (v_atendimento ->> 'conclusaoOperacionalPrevista')::timestamptz,
      horario_chegada_comprometido = (v_grupo ->> 'horarioChegadaComprometido')::timestamptz,
      retirada_prevista = (v_grupo ->> 'retiradaPrevista')::timestamptz,
      updated_at = now() where id = v_atendimento_id;

    insert into public.atendimento_etapas (id, atendimento_id, servico_etapa_id, inicio_planejado, fim_planejado, atendimento_servico_id, nome_snapshot, ordem_snapshot, duracao_minutos_snapshot, recursos_snapshot)
    select item.id, v_atendimento_id, item.servico_etapa_id, item.inicio_planejado, item.fim_planejado, item.atendimento_servico_id, item.nome_snapshot, item.ordem_snapshot, item.duracao_minutos_snapshot, item.recursos_snapshot
    from jsonb_to_recordset(v_etapas) item(id uuid, servico_etapa_id uuid, inicio_planejado timestamptz, fim_planejado timestamptz, atendimento_servico_id uuid, nome_snapshot text, ordem_snapshot integer, duracao_minutos_snapshot integer, recursos_snapshot jsonb);
    insert into public.atendimento_etapa_contribuicoes (id, atendimento_id, atendimento_etapa_id, atendimento_servico_id, servico_etapa_origem_id, ordem, etapa_nome_snapshot, duracao_base_snapshot, duracao_calculada_snapshot, recursos_snapshot, habilitacoes_snapshot)
    select item.id, v_atendimento_id, item.atendimento_etapa_id, item.atendimento_servico_id, item.servico_etapa_origem_id, item.ordem, item.etapa_nome_snapshot, item.duracao_base_snapshot, item.duracao_calculada_snapshot, item.recursos_snapshot, item.habilitacoes_snapshot
    from jsonb_to_recordset(v_contribuicoes) item(id uuid, atendimento_etapa_id uuid, atendimento_servico_id uuid, servico_etapa_origem_id uuid, ordem integer, etapa_nome_snapshot text, duracao_base_snapshot integer, duracao_calculada_snapshot integer, recursos_snapshot jsonb, habilitacoes_snapshot jsonb);
    begin
      insert into public.atendimento_etapa_funcionarios (id, atendimento_etapa_id, funcionario_id, inicio_planejado, fim_planejado)
      select item.id, item.atendimento_etapa_id, item.funcionario_id, item.inicio_planejado, item.fim_planejado from jsonb_to_recordset(v_funcionarios) item(id uuid, atendimento_etapa_id uuid, funcionario_id uuid, inicio_planejado timestamptz, fim_planejado timestamptz);
    exception when raise_exception then
      raise exception using errcode = 'PFR01', message = 'Conflito ao reservar funcionario.';
    end;
    begin
      insert into public.atendimento_etapa_equipamentos (id, atendimento_etapa_id, equipamento_unidade_id, inicio_planejado, fim_planejado, porte_snapshot, sexo_snapshot)
      select item.id, item.atendimento_etapa_id, item.equipamento_unidade_id, item.inicio_planejado, item.fim_planejado, v_atual.pet_porte_snapshot, v_atual.pet_sexo_snapshot from jsonb_to_recordset(v_equipamentos) item(id uuid, atendimento_etapa_id uuid, equipamento_unidade_id uuid, inicio_planejado timestamptz, fim_planejado timestamptz);
    exception when raise_exception then
      raise exception using errcode = 'PFR01', message = 'Conflito ao reservar equipamento.';
    end;
    insert into public.atendimento_etapa_equipamento_supervisoes (id, atendimento_etapa_equipamento_id, funcionario_id, inicio, fim)
    select item.id, item.atendimento_etapa_equipamento_id, item.funcionario_id, item.inicio, item.fim from jsonb_to_recordset(v_supervisoes) item(id uuid, atendimento_etapa_equipamento_id uuid, funcionario_id uuid, inicio timestamptz, fim timestamptz);
    insert into public.atendimento_esperas (id, atendimento_id, etapa_anterior_id, etapa_seguinte_id, inicio, fim, motivo)
    select item.id, v_atendimento_id, item.etapa_anterior_id, item.etapa_seguinte_id, item.inicio, item.fim, item.motivo from jsonb_to_recordset(v_esperas) item(id uuid, etapa_anterior_id uuid, etapa_seguinte_id uuid, inicio timestamptz, fim timestamptz, motivo text);
    set constraints public.atend_equip_validar_cobertura_supervisao, public.atend_equip_supervisao_validar_cobertura immediate;
    set constraints public.atend_equip_validar_cobertura_supervisao, public.atend_equip_supervisao_validar_cobertura deferred;

    v_resposta := jsonb_build_object('status','remarcado','codigo','REMARCADO','atendimentoId',v_atendimento_id,'grupoAgendamentoId',v_novo_grupo_id,'funcionarioResponsavelId',v_responsavel,'dataOperacional',v_grupo ->> 'dataOperacional','horarioConfirmado',(p_plano ->> 'horarioConfirmado')::integer,'conclusaoPrevista',(p_plano ->> 'conclusaoPrevista')::integer,'versaoOcupacao',(select versao from public.agenda_versao_ocupacao where id),'reutilizadoPorIdempotencia',false);
    insert into public.atendimento_remarcacoes(chave_idempotencia, atendimento_id, hash_requisicao, grupo_agendamento_id, data_operacional, resposta)
    values(v_chave, v_atendimento_id, v_hash, v_novo_grupo_id, (v_grupo ->> 'dataOperacional')::date, v_resposta);
  exception when sqlstate 'PFR01' or exclusion_violation or unique_violation then
    return jsonb_build_object('status','erro','codigo','CONFLITO_RECURSO','mensagem','A nova programacao deixou de estar disponivel.','versaoOcupacaoAtual',(select versao from public.agenda_versao_ocupacao where id));
  when foreign_key_violation or check_violation or not_null_violation or invalid_text_representation or raise_exception then
    return jsonb_build_object('status','erro','codigo','PLANO_INVALIDO','mensagem','O plano de remarcacao nao passou pela validacao transacional.');
  end;
  return v_resposta;
end;
$function$
;
REVOKE ALL ON FUNCTION public.remarcar_atendimento_pulo_interno_059(jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.confirmar_pulo_ciclo_059(p_atendimento_id uuid,p_usuario_id uuid,p_inicio_esperado timestamptz,p_chave uuid,p_motivo text,p_autorizado boolean,p_contexto jsonb,p_planos jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog' AS $fn$
DECLARE ctx jsonb; alvo jsonb; plano jsonb; resultado jsonb; anterior jsonb; contrato uuid; ciclo uuid; o uuid; at uuid; n int; v bigint; resposta jsonb; a public.atendimentos%rowtype;
BEGIN
 IF p_chave IS NULL OR p_inicio_esperado IS NULL OR nullif(btrim(p_motivo),'') IS NULL OR length(p_motivo)>500 OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_usuario_id AND raw_app_meta_data->>'role'='internal') THEN
   RETURN jsonb_build_object('status','invalido','codigo','INTENCAO_INVALIDA','mensagem','Intenção de pulo inválida.');
 END IF;
 SELECT c.contrato_id INTO contrato FROM public.contrato_ciclo_ocorrencias o1 JOIN public.contrato_ciclos c ON c.id=o1.ciclo_id WHERE o1.atendimento_id=p_atendimento_id;
 IF contrato IS NULL THEN RETURN jsonb_build_object('status','invalido','codigo','PULO_INDISPONIVEL','mensagem','Atendimento não pertence à rotina de um pacote.'); END IF;
 PERFORM public.bloquear_contratos_comerciais_043(ARRAY[contrato],false);
 PERFORM public.bloquear_contratos_comerciais_043(ARRAY[contrato],true);
 PERFORM pg_advisory_xact_lock(hashtextextended('pulo:059:'||p_chave::text,0));
 SELECT detalhes INTO anterior FROM public.contrato_eventos WHERE contrato_id=contrato AND tipo='banho_pulado' AND detalhes->>'chaveIdempotencia'=p_chave::text;
 IF FOUND THEN
   IF anterior->>'atendimentoId'<>p_atendimento_id::text OR (anterior->>'inicioEsperado')::timestamptz IS DISTINCT FROM p_inicio_esperado OR anterior->>'usuarioId'<>p_usuario_id::text OR anterior->>'motivo'<>btrim(p_motivo) THEN RETURN jsonb_build_object('status','invalido','codigo','INTENCAO_INVALIDA','mensagem','Chave de pulo já utilizada.'); END IF;
   RETURN (anterior->'resposta')||jsonb_build_object('reutilizado',true);
 END IF;
 -- Travar as versões antes de conferir o planejamento: alteração concorrente invalida tudo.
 PERFORM pg_advisory_xact_lock(hashtextextended('agenda:ocupacao',0));
 PERFORM 1 FROM public.agenda_versao_configuracao WHERE id FOR SHARE;
 PERFORM 1 FROM public.agenda_versao_ocupacao WHERE id FOR UPDATE;
 ctx:=public.planejar_pulo_ciclo_059(p_atendimento_id,p_usuario_id,p_inicio_esperado,p_autorizado);
 IF ctx->>'status'<>'planejado' THEN RETURN ctx; END IF;
 IF ctx IS DISTINCT FROM p_contexto OR jsonb_typeof(p_planos) IS DISTINCT FROM 'array' OR jsonb_array_length(p_planos)<>jsonb_array_length(ctx->'alvos') THEN
   RETURN jsonb_build_object('status','invalido','codigo','PULO_INDISPONIVEL','mensagem','Agenda alterada ou plano incompleto. Nenhum atendimento foi movido.');
 END IF;
 ciclo:=(ctx->>'cicloId')::uuid;
 n:=(ctx->>'numeroPulo')::int;
 -- A ordem inversa libera os horários dos próprios atendimentos que ainda serão movidos.
 FOR alvo IN SELECT value FROM jsonb_array_elements(ctx->'alvos') ORDER BY (value->>'ordem')::int DESC LOOP
   at:=(alvo->>'atendimentoId')::uuid; o:=(alvo->>'ocorrenciaId')::uuid;
   SELECT value INTO STRICT plano FROM jsonb_array_elements(p_planos) WHERE value->>'atendimentoId'=at::text;
   IF plano->>'grupoAgendamentoIdEsperado' IS DISTINCT FROM alvo->>'grupoId'
     OR plano->>'statusEsperado' IS DISTINCT FROM alvo->>'status'
     OR (plano->>'inicioOperacionalEsperado')::timestamptz IS DISTINCT FROM (alvo->>'inicioEsperado')::timestamptz
     OR plano#>>'{grupo,dataOperacional}' IS DISTINCT FROM alvo->>'dataNova'
     OR plano->>'funcionarioResponsavelId' IS DISTINCT FROM ctx->>'responsavelPadrao'
     OR (plano->>'configuracaoVersao')::bigint IS DISTINCT FROM (ctx->>'configuracaoVersao')::bigint
     OR plano#>>'{grupo,taxidogCicloId}' IS DISTINCT FROM ctx->>'cicloTaxidogId'
     OR jsonb_typeof(plano->'planoMotor') IS DISTINCT FROM 'object'
     OR NOT EXISTS(SELECT 1 FROM public.atendimento_servicos WHERE atendimento_id=at AND ativo)
     OR EXISTS(SELECT 1 FROM jsonb_array_elements(plano->'etapas') e WHERE NOT EXISTS(SELECT 1 FROM public.atendimento_servicos s WHERE s.id=(e->>'atendimento_servico_id')::uuid AND s.atendimento_id=at AND s.ativo))
     OR EXISTS(SELECT 1 FROM jsonb_array_elements(plano->'contribuicoes') e WHERE NOT EXISTS(SELECT 1 FROM public.atendimento_servicos s WHERE s.id=(e->>'atendimento_servico_id')::uuid AND s.atendimento_id=at AND s.ativo))
     OR (ctx->>'modalidade'='taxidog' AND (plano#>>'{grupo,taxidogColetaInicioSnapshot}')::time IS DISTINCT FROM (ctx->>'horarioFixo')::time)
     OR (ctx->>'modalidade'='sem_transporte' AND (plano->>'horarioConfirmado')::int IS DISTINCT FROM (extract(hour from (ctx->>'horarioFixo')::time)*60+extract(minute from (ctx->>'horarioFixo')::time))::int)
   THEN RAISE EXCEPTION 'PLANO_PULO_INVALIDO'; END IF;
   resultado:=public.remarcar_atendimento_pulo_interno_059(plano);
   IF resultado->>'status'<>'remarcado' OR coalesce((resultado->>'reutilizadoPorIdempotencia')::boolean,false) THEN RAISE EXCEPTION 'PULO_CONFLITO'; END IF;
   UPDATE public.contrato_ciclo_ocorrencias SET data_operacional=(alvo->>'dataNova')::date,
     horario_apresentado=make_time((plano->>'horarioConfirmado')::int/60,(plano->>'horarioConfirmado')::int%60,0),
     inicio_operacional=(plano#>>'{atendimento,inicioOperacionalPlanejado}')::timestamptz,
     conclusao_prevista=(plano#>>'{atendimento,conclusaoOperacionalPrevista}')::timestamptz,
     taxidog_ciclo_id=nullif(plano#>>'{grupo,taxidogCicloId}','')::uuid,
     plano_operacional=plano->'planoMotor'
   WHERE id=o AND ciclo_id=ciclo AND atendimento_id=at;
   IF NOT FOUND THEN RAISE EXCEPTION 'PULO_OCORRENCIA_ALTERADA'; END IF;
 END LOOP;
 SELECT versao INTO v FROM public.agenda_versao_ocupacao WHERE id;
 UPDATE public.contrato_ciclos SET data_ancora_pretendida=(SELECT data_operacional FROM public.contrato_ciclo_ocorrencias WHERE ciclo_id=ciclo ORDER BY ordem LIMIT 1),ocupacao_agenda_versao=v WHERE id=ciclo;
 SELECT * INTO a FROM public.atendimentos WHERE id=p_atendimento_id;
 resposta:=jsonb_build_object('status','atualizado','atendimentoId',a.id,'statusAnterior',a.status,'statusAtual',a.status,'reutilizado',false,'atendimentosMovidos',jsonb_array_length(ctx->'alvos'),'dataFinal',(SELECT max(data_operacional) FROM public.contrato_ciclo_ocorrencias WHERE ciclo_id=ciclo));
 INSERT INTO public.contrato_eventos(contrato_id,tipo,detalhes,registrado_por) VALUES(contrato,'banho_pulado',jsonb_build_object('atendimentoId',p_atendimento_id,'cicloId',ciclo,'numeroPulo',n,'motivo',btrim(p_motivo),'usuarioId',p_usuario_id,'inicioEsperado',p_inicio_esperado,'chaveIdempotencia',p_chave,'autorizadoPor',CASE WHEN n>=3 THEN p_usuario_id END,'alvos',ctx->'alvos','resposta',resposta),p_usuario_id);
 RETURN resposta;
EXCEPTION WHEN OTHERS THEN
 -- Subtransação PL/pgSQL: erro em qualquer plano desfaz a sequência inteira.
 RETURN jsonb_build_object('status','invalido','codigo','PULO_INDISPONIVEL','mensagem','Não foi possível reprogramar todos os atendimentos. Nenhuma reserva ou crédito foi alterado.');
END;$fn$;
REVOKE ALL ON FUNCTION public.confirmar_pulo_ciclo_059(uuid,uuid,timestamptz,uuid,text,boolean,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.confirmar_pulo_ciclo_059(uuid,uuid,timestamptz,uuid,text,boolean,jsonb,jsonb) TO service_role;
