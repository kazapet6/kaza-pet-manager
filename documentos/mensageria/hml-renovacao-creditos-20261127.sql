-- HML only. Restore commercial functions from read-only production metadata; no data copied.
DO $guard$ BEGIN
 IF (SELECT count(*) FROM public.clientes)<>3 OR (SELECT count(*) FROM public.pets)<>3 OR (SELECT count(*) FROM public.atendimentos)<>6 OR EXISTS(SELECT 1 FROM public.contratos) OR EXISTS(SELECT 1 FROM public.contrato_ciclos) THEN RAISE EXCEPTION 'HML_PRECONDICAO'; END IF;
 IF EXISTS(SELECT 1 FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN ('contrato_credito_operacoes_idempotentes','contrato_reaproveitamento_desfechos_044','contrato_renovacoes_idempotentes_043')) OR EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('atendimento_credito_044','evento_liberacao_credito_044','contexto_creditos_ciclo_044','decidir_credito_contrato','executar_reaproveitamento_i1_044','resolver_desfecho_reaproveitamento_044','consultar_desfecho_reaproveitamento_044','reaproveitar_credito_contrato_044','resumo_comercial_contrato_043','renovar_ciclo_contrato','pular_banho_046','receber_pacote_045')) THEN RAISE EXCEPTION 'HML_OBJETO_EXISTENTE'; END IF;
END $guard$;
CREATE TABLE public."contrato_credito_operacoes_idempotentes" (
 "chave_idempotencia" uuid NOT NULL,
 "usuario_id" uuid NOT NULL,
 "operacao" text NOT NULL,
 "hash_intencao" text NOT NULL,
 "resposta" jsonb NOT NULL,
 "created_at" timestamp with time zone NOT NULL DEFAULT now(),
 CONSTRAINT "contrato_credito_operacoes_idempotentes_pkey" PRIMARY KEY (chave_idempotencia),
 CONSTRAINT "contrato_credito_operacoes_idempotentes_resposta_check" CHECK ((jsonb_typeof(resposta) = 'object'::text))
);
ALTER TABLE public."contrato_credito_operacoes_idempotentes" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."contrato_credito_operacoes_idempotentes" FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON public."contrato_credito_operacoes_idempotentes" TO service_role;
CREATE TABLE public."contrato_reaproveitamento_desfechos_044" (
 "chave_idempotencia" uuid NOT NULL,
 "contrato_id" uuid NOT NULL,
 "ciclo_id" uuid NOT NULL,
 "usuario_id" uuid NOT NULL,
 "hash_intencao" text NOT NULL,
 "intencao" jsonb NOT NULL,
 "plano" jsonb NOT NULL,
 "creditos" jsonb NOT NULL,
 "desfecho" text NOT NULL,
 "codigo" text NOT NULL,
 "resposta" jsonb NOT NULL,
 "criado_em" timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
 CONSTRAINT "contrato_reaproveitamento_desfechos_044_check" CHECK (((resposta ->> 'desfecho'::text) = desfecho)),
 CONSTRAINT "contrato_reaproveitamento_desfechos_044_check1" CHECK ((((resposta ->> 'chaveIdempotencia'::text))::uuid = chave_idempotencia)),
 CONSTRAINT "contrato_reaproveitamento_desfechos_044_creditos_check" CHECK ((jsonb_typeof(creditos) = 'array'::text)),
 CONSTRAINT "contrato_reaproveitamento_desfechos_044_desfecho_check" CHECK ((desfecho = ANY (ARRAY['sucesso_confirmado'::text, 'recusa_definitiva'::text]))),
 CONSTRAINT "contrato_reaproveitamento_desfechos_044_intencao_check" CHECK ((jsonb_typeof(intencao) = 'object'::text)),
 CONSTRAINT "contrato_reaproveitamento_desfechos_044_pkey" PRIMARY KEY (chave_idempotencia),
 CONSTRAINT "contrato_reaproveitamento_desfechos_044_plano_check" CHECK ((jsonb_typeof(plano) = 'object'::text))
);
ALTER TABLE public."contrato_reaproveitamento_desfechos_044" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."contrato_reaproveitamento_desfechos_044" FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON public."contrato_reaproveitamento_desfechos_044" TO service_role;
CREATE TABLE public."contrato_renovacoes_idempotentes_043" (
 "chave_idempotencia" uuid NOT NULL,
 "ciclo_anterior_id" uuid NOT NULL,
 "ciclo_sucessor_id" uuid NOT NULL,
 "hash_intencao" text NOT NULL,
 "resposta" jsonb NOT NULL,
 CONSTRAINT "contrato_renovacoes_idempotentes_043_ciclo_anterior_id_fkey" FOREIGN KEY (ciclo_anterior_id) REFERENCES public.contrato_ciclos(id),
 CONSTRAINT "contrato_renovacoes_idempotentes_043_ciclo_anterior_id_key" UNIQUE (ciclo_anterior_id),
 CONSTRAINT "contrato_renovacoes_idempotentes_043_ciclo_sucessor_id_fkey" FOREIGN KEY (ciclo_sucessor_id) REFERENCES public.contrato_ciclos(id),
 CONSTRAINT "contrato_renovacoes_idempotentes_043_ciclo_sucessor_id_key" UNIQUE (ciclo_sucessor_id),
 CONSTRAINT "contrato_renovacoes_idempotentes_043_pkey" PRIMARY KEY (chave_idempotencia)
);
ALTER TABLE public."contrato_renovacoes_idempotentes_043" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."contrato_renovacoes_idempotentes_043" FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON public."contrato_renovacoes_idempotentes_043" TO service_role;
CREATE INDEX reaproveitamento_desfechos_contrato_044 ON public.contrato_reaproveitamento_desfechos_044 USING btree (contrato_id, ciclo_id, criado_em);
CREATE TRIGGER reaproveitamento_desfecho_imutavel_044 BEFORE DELETE OR UPDATE ON public.contrato_reaproveitamento_desfechos_044 FOR EACH ROW EXECUTE FUNCTION public.bloquear_historico_reaproveitamento_044();
CREATE TRIGGER a043_lock_contrato_renovacoes_idempotentes_043 BEFORE INSERT OR DELETE OR UPDATE ON public.contrato_renovacoes_idempotentes_043 FOR EACH ROW EXECUTE FUNCTION public.serializar_linha_comercial_043();
CREATE OR REPLACE FUNCTION public.atendimento_credito_044(p_ocorrencia_id uuid, p_item_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
 select atendimento_atual_id from public.contrato_creditos_contexto_044 where ocorrencia_id=p_ocorrencia_id and contrato_item_id=p_item_id
$function$;
REVOKE ALL ON FUNCTION public.atendimento_credito_044(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.atendimento_credito_044(uuid,uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.evento_liberacao_credito_044(p_ocorrencia_id uuid, p_item_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
 select e.id from public.contrato_creditos_contexto_044 u join public.contrato_credito_eventos e
 on e.ocorrencia_id=u.ocorrencia_id and e.contrato_item_id=u.contrato_item_id and e.ciclo_id=u.ciclo_id
 and e.atendimento_id=u.atendimento_atual_id
 where u.ocorrencia_id=p_ocorrencia_id and u.contrato_item_id=p_item_id and u.estado_comercial='disponivel' and u.contrato_item_contrato_id=u.contrato_id
 and u.status_atendimento in ('cancelado','faltou') and e.estado_novo='disponivel' and e.responsavel_id is not null
 and ((e.tipo='atendimento_cancelado_credito_liberado' and e.estado_anterior='reservado' and u.status_atendimento='cancelado')
 or (e.tipo='credito_preservado_falta' and e.estado_anterior='aguardando_decisao' and u.status_atendimento='faltou' and nullif(btrim(e.motivo),'') is not null)
 or (e.tipo='credito_preservado_encerramento' and e.estado_anterior='disponivel' and nullif(btrim(e.motivo),'') is not null)
 or (e.tipo='credito_corrigido_admin' and e.estado_anterior='perdido' and nullif(btrim(e.motivo),'') is not null and exists(
 select 1 from public.contrato_credito_eventos ant where ant.ocorrencia_id=e.ocorrencia_id and ant.contrato_item_id=e.contrato_item_id
 and ant.ocorrido_em<e.ocorrido_em and ant.ciclo_id=e.ciclo_id and ant.atendimento_id is not distinct from e.atendimento_id and ant.responsavel_id is not null and nullif(btrim(ant.motivo),'') is not null
 and ant.tipo in ('credito_perdido_falta','credito_perdido_encerramento'))))
 and not exists(select 1 from public.contrato_credito_eventos posterior where posterior.ocorrencia_id=e.ocorrencia_id and posterior.contrato_item_id=e.contrato_item_id
 and (posterior.ocorrido_em>e.ocorrido_em or (posterior.ocorrido_em=e.ocorrido_em and posterior.id<>e.id)))
$function$;
REVOKE ALL ON FUNCTION public.evento_liberacao_credito_044(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.evento_liberacao_credito_044(uuid,uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.contexto_creditos_ciclo_044(p_ciclo_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
 select coalesce(jsonb_agg(jsonb_build_object(
 'ocorrenciaId',u.ocorrencia_id,'contratoItemId',u.contrato_item_id,'cicloId',u.ciclo_id,'servicoId',u.servico_id,'servicoNome',u.servico_nome_snapshot,
 'ordinal',u.ordinal_no_item,'ocorrenciaOrdem',u.ocorrencia_ordem,'data',u.data_atual,'horarioInicio',left(u.horario_atual,5),
 'horarioFim',to_char(u.conclusao_operacional_prevista at time zone ct.timezone_snapshot,'HH24:MI'),
 'atendimentoId',u.atendimento_atual_id,'atendimentoOriginalId',u.atendimento_original_id,'statusAtendimento',u.status_atendimento,
 'estadoComercial',u.estado_comercial,'versao',u.estado_comercial_versao,'sequenciaVinculo',u.sequencia_vinculo,
 'eventoLiberacaoId',public.evento_liberacao_credito_044(u.ocorrencia_id,u.contrato_item_id),
 'reaproveitavel',u.estado_comercial='disponivel' and public.evento_liberacao_credito_044(u.ocorrencia_id,u.contrato_item_id) is not null
 and ct.status='ativo' and c.estado in ('reservado','em_andamento') and not exists(select 1 from public.contrato_ciclos s where s.contrato_id=c.contrato_id and s.numero>c.numero)
 ) order by u.ocorrencia_ordem,u.contrato_item_id), '[]'::jsonb)
 from public.contrato_creditos_contexto_044 u join public.contrato_ciclos c on c.id=u.ciclo_id join public.contratos ct on ct.id=c.contrato_id where u.ciclo_id=p_ciclo_id
$function$;
REVOKE ALL ON FUNCTION public.contexto_creditos_ciclo_044(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.contexto_creditos_ciclo_044(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.decidir_credito_contrato(p_intencao jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_credito public.contrato_ciclo_ocorrencia_itens%rowtype;
  v_ocorrencia public.contrato_ciclo_ocorrencias%rowtype;
  v_ciclo public.contrato_ciclos%rowtype;
  v_chave uuid; v_usuario uuid; v_ocorrencia_id uuid; v_item_id uuid; v_versao bigint;
  v_operacao text; v_decisao text; v_motivo text; v_hash text; v_novo text; v_tipo text; v_resposta jsonb;
  v_existente public.contrato_credito_operacoes_idempotentes%rowtype;
begin
 -- F043_ENTRY_LOCK_BEGIN
 perform public.bloquear_contratos_comerciais_043(ARRAY(select c.contrato_id from public.contrato_ciclo_ocorrencias o join public.contrato_ciclos c on c.id=o.ciclo_id where o.id=nullif(p_intencao->>'ocorrenciaId','')::uuid union select i.contrato_id from public.contrato_itens i where i.id=nullif(p_intencao->>'contratoItemId','')::uuid),false);
 -- Reconsulta apos eventual espera: vinculo que mudou nao fica sem protecao.
 perform public.bloquear_contratos_comerciais_043(ARRAY(select c.contrato_id from public.contrato_ciclo_ocorrencias o join public.contrato_ciclos c on c.id=o.ciclo_id where o.id=nullif(p_intencao->>'ocorrenciaId','')::uuid union select i.contrato_id from public.contrato_itens i where i.id=nullif(p_intencao->>'contratoItemId','')::uuid),true);
 -- F043_ENTRY_LOCK_END

  v_chave:=(p_intencao->>'chaveIdempotencia')::uuid; v_usuario:=(p_intencao->>'usuarioId')::uuid;
  v_ocorrencia_id:=(p_intencao->>'ocorrenciaId')::uuid; v_item_id:=(p_intencao->>'contratoItemId')::uuid;
  v_versao:=(p_intencao->>'versaoEsperada')::bigint; v_operacao:=p_intencao->>'operacao';
  v_decisao:=p_intencao->>'decisao'; v_motivo:=nullif(btrim(p_intencao->>'motivo'),'');
  if v_chave is null or v_usuario is null or v_ocorrencia_id is null or v_item_id is null or v_versao is null
    or v_operacao not in ('decidir_falta','corrigir_decisao','decidir_encerramento')
    or v_decisao not in ('perder','preservar') or v_motivo is null then
    return jsonb_build_object('status','invalido','codigo','INTENCAO_INVALIDA','mensagem','Decisão administrativa inválida.');
  end if;
  v_hash:=md5((p_intencao-'chaveIdempotencia')::text);
  perform pg_advisory_xact_lock(hashtextextended('credito:operacao:'||v_chave::text,0));
  select * into v_existente from public.contrato_credito_operacoes_idempotentes where chave_idempotencia=v_chave;
  if found then
    if v_existente.hash_intencao<>v_hash then return jsonb_build_object('status','invalido','codigo','IDEMPOTENCIA_CONFLITANTE','mensagem','A chave pertence a outra operação.'); end if;
    return v_existente.resposta;
  end if;
  select * into v_credito from public.contrato_ciclo_ocorrencia_itens
  where ocorrencia_id=v_ocorrencia_id and contrato_item_id=v_item_id for update;
  if not found then return jsonb_build_object('status','invalido','codigo','CREDITO_NAO_ENCONTRADO','mensagem','Crédito não encontrado.'); end if;
  if v_credito.estado_comercial_versao<>v_versao then
    return jsonb_build_object('status','conflito','codigo','VERSAO_DIVERGENTE','mensagem','O crédito foi alterado por outra sessão.');
  end if;
  select * into v_ocorrencia from public.contrato_ciclo_ocorrencias where id=v_ocorrencia_id;
  select * into v_ciclo from public.contrato_ciclos where id=v_credito.ciclo_id for update;
  if v_operacao='decidir_falta' and (v_credito.estado_comercial<>'aguardando_decisao'
    or not exists(select 1 from public.atendimentos where id=public.atendimento_credito_044(v_ocorrencia_id,v_item_id) and status='faltou')) then
    return jsonb_build_object('status','invalido','codigo','DECISAO_FALTA_INDISPONIVEL','mensagem','Este crédito não aguarda decisão de falta.');
  elsif v_operacao='corrigir_decisao' and v_credito.estado_comercial not in ('perdido','disponivel') then
    return jsonb_build_object('status','invalido','codigo','CORRECAO_INDISPONIVEL','mensagem','O estado atual não permite corrigir a decisão.');
  elsif v_operacao='corrigir_decisao' and not exists(
    select 1 from public.contrato_credito_eventos evento
    where evento.ocorrencia_id=v_ocorrencia_id and evento.contrato_item_id=v_item_id
      and evento.tipo in ('credito_perdido_falta','credito_preservado_falta',
        'credito_perdido_encerramento','credito_preservado_encerramento','credito_corrigido_admin')
  ) then
    return jsonb_build_object('status','invalido','codigo','CORRECAO_INDISPONIVEL','mensagem','Não existe decisão administrativa anterior para corrigir.');
  elsif v_operacao='decidir_encerramento' and (not v_ciclo.encerramento_pendente or v_credito.estado_comercial<>'disponivel') then
    return jsonb_build_object('status','invalido','codigo','ENCERRAMENTO_INDISPONIVEL','mensagem','Este crédito não pertence a um encerramento pendente.');
  elsif v_operacao='decidir_encerramento' and exists(
    select 1 from public.contrato_credito_eventos evento
    where evento.ocorrencia_id=v_ocorrencia_id and evento.contrato_item_id=v_item_id
      and evento.tipo in ('credito_perdido_encerramento','credito_preservado_encerramento')
  ) then
    return jsonb_build_object('status','invalido','codigo','DECISAO_JA_REGISTRADA','mensagem','Este crédito já recebeu uma decisão de encerramento; use a correção administrativa.');
  end if;
  v_novo:=case v_decisao when 'perder' then 'perdido' else 'disponivel' end;
  if v_operacao='corrigir_decisao' and v_novo=v_credito.estado_comercial then
    return jsonb_build_object('status','invalido','codigo','DECISAO_SEM_ALTERACAO','mensagem','Escolha um destino diferente do estado atual.');
  end if;
  v_tipo:=case v_operacao
    when 'decidir_falta' then case v_decisao when 'perder' then 'credito_perdido_falta' else 'credito_preservado_falta' end
    when 'corrigir_decisao' then 'credito_corrigido_admin'
    else case v_decisao when 'perder' then 'credito_perdido_encerramento' else 'credito_preservado_encerramento' end end;
  update public.contrato_ciclo_ocorrencia_itens set estado_comercial=v_novo,
    estado_comercial_versao=estado_comercial_versao+1,estado_comercial_atualizado_em=statement_timestamp()
  where ocorrencia_id=v_ocorrencia_id and contrato_item_id=v_item_id;
  insert into public.contrato_credito_eventos(
    ocorrencia_id,contrato_item_id,ciclo_id,atendimento_id,estado_anterior,estado_novo,tipo,responsavel_id,motivo)
  values(v_ocorrencia_id,v_item_id,v_credito.ciclo_id,public.atendimento_credito_044(v_ocorrencia_id,v_item_id),
    v_credito.estado_comercial,v_novo,v_tipo,v_usuario,v_motivo);
  perform public.recalcular_encerramento_ciclo_032(v_credito.ciclo_id,v_usuario);
  v_resposta:=jsonb_build_object('status','atualizado','ocorrenciaId',v_ocorrencia_id,
    'contratoItemId',v_item_id,'estadoComercial',v_novo,'versao',v_versao+1);
  insert into public.contrato_credito_operacoes_idempotentes(chave_idempotencia,usuario_id,operacao,hash_intencao,resposta)
  values(v_chave,v_usuario,v_operacao,v_hash,v_resposta);
  return v_resposta;
exception when invalid_text_representation or numeric_value_out_of_range then
  return jsonb_build_object('status','invalido','codigo','INTENCAO_INVALIDA','mensagem','Decisão administrativa inválida.');
end;$function$;
REVOKE ALL ON FUNCTION public.decidir_credito_contrato(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.decidir_credito_contrato(jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.executar_reaproveitamento_i1_044(p_intencao jsonb, p_plano jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
 v_chave uuid; v_usuario uuid; v_contrato_id uuid; v_ciclo_id uuid; v_hash text; v_motivo text;
 v_contrato public.contratos%rowtype; v_ciclo public.contrato_ciclos%rowtype;
 v_recibo public.contrato_reaproveitamentos_044%rowtype; v_credito public.contrato_ciclo_ocorrencia_itens%rowtype;
 v_ref record; v_evento uuid; v_anterior uuid; v_atendimento uuid; v_resultado jsonb; v_falha jsonb; v_seq integer; v_agora timestamptz; v_versao bigint; v_config bigint;
begin
 if jsonb_typeof(p_intencao) is distinct from 'object' or jsonb_typeof(p_plano) is distinct from 'object'
 or jsonb_typeof(p_intencao->'creditos') is distinct from 'array' then return jsonb_build_object('status','invalido','codigo','INTENCAO_INVALIDA'); end if;
 if jsonb_array_length(p_intencao->'creditos') not between 1 and 20 then return jsonb_build_object('status','invalido','codigo','QUANTIDADE_INVALIDA'); end if;
 v_chave:=nullif(p_intencao->>'chaveIdempotencia','')::uuid; v_usuario:=nullif(p_intencao->>'usuarioId','')::uuid;
 v_contrato_id:=nullif(p_intencao->>'contratoId','')::uuid; v_ciclo_id:=nullif(p_intencao->>'cicloId','')::uuid; v_motivo:=nullif(btrim(p_intencao->>'motivo'),'');
 if v_chave is null or v_usuario is null or v_contrato_id is null or v_ciclo_id is null or v_motivo is null then return jsonb_build_object('status','invalido','codigo','IDENTIDADE_OBRIGATORIA'); end if;
 perform public.bloquear_contratos_comerciais_043(ARRAY[v_contrato_id],false);
 perform pg_advisory_xact_lock(hashtextextended('credito:reaproveitar:044:'||v_chave::text,0));
 v_hash:=md5(jsonb_build_object('intencao',p_intencao-'chaveIdempotencia','plano',p_plano)::text);
 select * into v_recibo from public.contrato_reaproveitamentos_044 where chave_idempotencia=v_chave;
 if found then
  if v_recibo.hash_intencao<>v_hash or v_recibo.usuario_id<>v_usuario then return jsonb_build_object('status','conflito','codigo','IDEMPOTENCIA_CONFLITANTE'); end if;
  return v_recibo.resposta;
 end if;
 select * into v_contrato from public.contratos where id=v_contrato_id;
 select * into v_ciclo from public.contrato_ciclos where id=v_ciclo_id for update;
 if v_contrato.id is null or v_contrato.status<>'ativo' or v_ciclo.contrato_id is distinct from v_contrato_id
 or v_ciclo.estado not in ('reservado','em_andamento') or exists(select 1 from public.contrato_ciclos where contrato_id=v_contrato_id and numero>v_ciclo.numero) then return jsonb_build_object('status','invalido','codigo','CICLO_NAO_ELEGIVEL'); end if;
 if (p_plano->'atendimento'->>'petId') is distinct from v_contrato.pet_id::text
 or (p_plano->'grupo'->>'clienteId') is distinct from v_contrato.cliente_id::text
 or (p_plano->'grupo'->>'chaveIdempotencia')::uuid is distinct from v_chave then return jsonb_build_object('status','invalido','codigo','VINCULO_INCOMPATIVEL'); end if;
 if exists(select 1 from jsonb_to_recordset(p_intencao->'creditos') x("ocorrenciaId" uuid,"contratoItemId" uuid,"versaoEsperada" bigint,"eventoLiberacaoId" uuid)
 where x."ocorrenciaId" is null or x."contratoItemId" is null or x."versaoEsperada" is null or x."eventoLiberacaoId" is null)
 or (select count(distinct (x."ocorrenciaId",x."contratoItemId")) from jsonb_to_recordset(p_intencao->'creditos') x("ocorrenciaId" uuid,"contratoItemId" uuid))<>jsonb_array_length(p_intencao->'creditos') then return jsonb_build_object('status','invalido','codigo','UNIDADE_DUPLICADA_OU_INVALIDA'); end if;
 if (select count(distinct x."ocorrenciaId") from jsonb_to_recordset(p_intencao->'creditos') x("ocorrenciaId" uuid))<>1 then return jsonb_build_object('status','invalido','codigo','OCORRENCIAS_DIFERENTES'); end if;
 if (p_plano->'grupo'->>'modalidade') is distinct from (case when v_ciclo.modalidade_transporte_pretendida='taxidog' then 'taxidog' else 'normal' end) then return jsonb_build_object('status','invalido','codigo','MODALIDADE_INCOMPATIVEL'); end if;
 for v_ref in select * from jsonb_to_recordset(p_intencao->'creditos') x("ocorrenciaId" uuid,"contratoItemId" uuid,"versaoEsperada" bigint,"eventoLiberacaoId" uuid) order by x."ocorrenciaId",x."contratoItemId" loop
  select * into v_credito from public.contrato_ciclo_ocorrencia_itens where ocorrencia_id=v_ref."ocorrenciaId" and contrato_item_id=v_ref."contratoItemId" for update;
  if not found or v_credito.ciclo_id<>v_ciclo_id then return jsonb_build_object('status','invalido','codigo','CREDITO_DE_OUTRO_CICLO'); end if;
  if v_credito.estado_comercial<>'disponivel' or v_credito.estado_comercial_versao<>v_ref."versaoEsperada" then return jsonb_build_object('status','conflito','codigo','CREDITO_NAO_DISPONIVEL'); end if;
  v_evento:=public.evento_liberacao_credito_044(v_credito.ocorrencia_id,v_credito.contrato_item_id);
  if v_evento is null or v_evento<>v_ref."eventoLiberacaoId" then return jsonb_build_object('status','invalido','codigo','LIBERACAO_NAO_COMPROVADA'); end if;
 end loop;
 -- Exatamente uma unidade de cada servico solicitado; dependencias operacionais nao criam credito.
 if exists(select 1 from jsonb_to_recordset(p_intencao->'creditos') x("contratoItemId" uuid) join public.contrato_itens i on i.id=x."contratoItemId" group by i.servico_id having count(*)>1)
 or exists(select 1 from jsonb_to_recordset(p_intencao->'creditos') x("contratoItemId" uuid) join public.contrato_itens i on i.id=x."contratoItemId"
 where i.contrato_id<>v_contrato_id or not exists(select 1 from jsonb_to_recordset(p_plano->'servicos') s(servico_id uuid,origem text) where s.servico_id=i.servico_id and s.origem='solicitado'))
 or (select count(*) from jsonb_to_recordset(p_plano->'servicos') s(servico_id uuid,origem text) where s.origem='solicitado')<>jsonb_array_length(p_intencao->'creditos') then return jsonb_build_object('status','invalido','codigo','SERVICOS_DIVERGENTES'); end if;
 select versao into v_versao from public.agenda_versao_ocupacao where id=true;
 select versao into v_config from public.agenda_versao_configuracao where id=true;
 if v_versao is distinct from (p_intencao->>'ocupacaoAgendaVersao')::bigint or v_config is distinct from (p_plano->'grupo'->>'configuracaoVersao')::bigint then return jsonb_build_object('status','conflito','codigo','DISPONIBILIDADE_ALTERADA'); end if;
 begin
  v_resultado:=public.confirmar_agendamento_transacional(p_plano);
  if v_resultado->>'status' is distinct from 'confirmado' or coalesce((v_resultado->>'reutilizadoPorIdempotencia')::boolean,false) then
   v_falha:=jsonb_build_object('status','conflito','codigo',case when v_resultado->>'status'='confirmado' then 'CHAVE_JA_UTILIZADA_NA_AGENDA' else coalesce(v_resultado->>'codigo','RESERVA_NAO_CONFIRMADA') end); raise exception using errcode='P4401',message='reaproveitamento abortado';
  end if;
  v_atendimento:=(v_resultado->>'atendimentoId')::uuid;
  if v_atendimento is null then raise exception 'ATENDIMENTO_NAO_CONFIRMADO' using errcode='23514'; end if;
  for v_ref in select * from jsonb_to_recordset(p_intencao->'creditos') x("ocorrenciaId" uuid,"contratoItemId" uuid,"eventoLiberacaoId" uuid) order by x."ocorrenciaId",x."contratoItemId" loop
   v_anterior:=public.atendimento_credito_044(v_ref."ocorrenciaId",v_ref."contratoItemId");
   select coalesce(max(sequencia),0)+1 into v_seq from public.contrato_credito_vinculos_044 where ocorrencia_id=v_ref."ocorrenciaId" and contrato_item_id=v_ref."contratoItemId";
   insert into public.contrato_credito_vinculos_044(chave_idempotencia,ocorrencia_id,contrato_item_id,ciclo_id,sequencia,atendimento_anterior_id,atendimento_id,evento_liberacao_id,snapshot_anterior,plano_novo,criado_por)
   select v_chave,v_ref."ocorrenciaId",v_ref."contratoItemId",v_ciclo_id,v_seq,v_anterior,v_atendimento,v_ref."eventoLiberacaoId",
    jsonb_build_object('atendimento',to_jsonb(a),'grupo',to_jsonb(g),'ocorrencia',to_jsonb(o)),p_plano,v_usuario
   from public.atendimentos a join public.grupos_agendamento g on g.id=a.grupo_agendamento_id join public.contrato_ciclo_ocorrencias o on o.id=v_ref."ocorrenciaId" where a.id=v_anterior;
   if not found then raise exception 'HISTORICO_ANTERIOR_AUSENTE' using errcode='23514'; end if;
   v_agora:=clock_timestamp();
   if exists(select 1 from public.contrato_credito_eventos where ocorrencia_id=v_ref."ocorrenciaId" and contrato_item_id=v_ref."contratoItemId" and ocorrido_em>=v_agora) then raise exception 'ORDEM_TEMPORAL_EXIGE_REVISAO' using errcode='23514'; end if;
   update public.contrato_ciclo_ocorrencia_itens set estado_comercial='reservado',estado_comercial_versao=estado_comercial_versao+1,estado_comercial_atualizado_em=v_agora where ocorrencia_id=v_ref."ocorrenciaId" and contrato_item_id=v_ref."contratoItemId";
   insert into public.contrato_credito_eventos(ocorrencia_id,contrato_item_id,ciclo_id,atendimento_id,estado_anterior,estado_novo,tipo,responsavel_id,motivo,ocorrido_em)
   values(v_ref."ocorrenciaId",v_ref."contratoItemId",v_ciclo_id,v_atendimento,'disponivel','reservado','credito_reaproveitado_044',v_usuario,v_motivo,v_agora);
  end loop;
  perform public.recalcular_encerramento_ciclo_032(v_ciclo_id,v_usuario);
  v_resultado:=jsonb_build_object('status','reservado','contratoId',v_contrato_id,'cicloId',v_ciclo_id,'atendimentoId',v_atendimento,'grupoAgendamentoId',v_resultado->>'grupoAgendamentoId','creditos',p_intencao->'creditos','chaveIdempotencia',v_chave);
  insert into public.contrato_reaproveitamentos_044(chave_idempotencia,contrato_id,ciclo_id,usuario_id,hash_intencao,resposta) values(v_chave,v_contrato_id,v_ciclo_id,v_usuario,v_hash,v_resultado);
  return v_resultado;
 exception when sqlstate 'P4401' then return v_falha;
 when exclusion_violation or check_violation or unique_violation then return jsonb_build_object('status','conflito','codigo','RESERVA_NAO_CONFIRMADA','sqlstate',SQLSTATE);
 end;
exception when invalid_text_representation or numeric_value_out_of_range or sqlstate '22023' then return jsonb_build_object('status','invalido','codigo','INTENCAO_INVALIDA');
end;$function$;
REVOKE ALL ON FUNCTION public.executar_reaproveitamento_i1_044(jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.resolver_desfecho_reaproveitamento_044(p_intencao jsonb, p_plano jsonb, p_consultar boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
 v_chave uuid; v_usuario uuid; v_contrato uuid; v_ciclo uuid; v_hash text; v_resultado jsonb; v_resposta jsonb; v_codigo text;
 v_desfecho public.contrato_reaproveitamento_desfechos_044%rowtype;
 v_positivo public.contrato_reaproveitamentos_044%rowtype;
begin
 if jsonb_typeof(p_intencao) is distinct from 'object' or jsonb_typeof(p_plano) is distinct from 'object'
 or jsonb_typeof(p_intencao->'creditos') is distinct from 'array' or p_consultar is null then
  return jsonb_build_object('status','invalido','codigo','INTENCAO_INVALIDA','desfechoPersistido',false);
 end if;
 v_chave:=nullif(p_intencao->>'chaveIdempotencia','')::uuid;
 v_usuario:=nullif(p_intencao->>'usuarioId','')::uuid;
 v_contrato:=nullif(p_intencao->>'contratoId','')::uuid;
 v_ciclo:=nullif(p_intencao->>'cicloId','')::uuid;
 if v_chave is null or v_usuario is null or v_contrato is null or v_ciclo is null then
  return jsonb_build_object('status','invalido','codigo','IDENTIDADE_OBRIGATORIA','desfechoPersistido',false);
 end if;
 -- Mesma ordem e mesma identidade de lock da 044: contrato primeiro, chave depois.
 perform public.bloquear_contratos_comerciais_043(ARRAY[v_contrato],false);
 perform pg_advisory_xact_lock(hashtextextended('credito:reaproveitar:044:'||v_chave::text,0));
 v_hash:=md5(jsonb_build_object('intencao',p_intencao-'chaveIdempotencia','plano',p_plano)::text);
 select * into v_desfecho from public.contrato_reaproveitamento_desfechos_044 where chave_idempotencia=v_chave;
 if found then
  -- JSONB exato adicional ao hash impede tratar colisao de fingerprint como igualdade.
  if v_desfecho.hash_intencao<>v_hash or v_desfecho.usuario_id<>v_usuario
   or v_desfecho.intencao is distinct from p_intencao or v_desfecho.plano is distinct from p_plano then
   return jsonb_build_object('status','conflito','codigo','IDEMPOTENCIA_CONFLITANTE','desfechoPersistido',false);
  end if;
  return v_desfecho.resposta;
 end if;
 -- Compatibilidade com sucesso i1 anterior a extensao. Consulta NAO chama o executor.
 select * into v_positivo from public.contrato_reaproveitamentos_044 where chave_idempotencia=v_chave;
 if found then
  if v_positivo.hash_intencao<>v_hash or v_positivo.usuario_id<>v_usuario
   or v_positivo.contrato_id<>v_contrato or v_positivo.ciclo_id<>v_ciclo then
   return jsonb_build_object('status','conflito','codigo','IDEMPOTENCIA_CONFLITANTE','desfechoPersistido',false);
  end if;
  return v_positivo.resposta||jsonb_build_object('desfecho','sucesso_confirmado','desfechoPersistido',true,'versaoDesfecho',2,'reciboId',v_chave);
 end if;
 if p_consultar then
  -- Ausencia nunca autoriza descartar a chave: pode haver requisicao ainda em transito.
  return jsonb_build_object('status','desconhecido','codigo','SEM_DESFECHO_PERSISTIDO','desfechoPersistido',false,
   'contratoId',v_contrato,'cicloId',v_ciclo,'chaveIdempotencia',v_chave);
 end if;
 -- Executor i1 preservado integralmente. Falhas transitórias/excecoes nao viram recibo negativo.
 v_resultado:=public.executar_reaproveitamento_i1_044(p_intencao,p_plano);
 v_codigo:=v_resultado->>'codigo';
 if v_resultado->>'status'='reservado' then
  v_resposta:=v_resultado||jsonb_build_object('desfecho','sucesso_confirmado','desfechoPersistido',true,'versaoDesfecho',2,'reciboId',v_chave);
  insert into public.contrato_reaproveitamento_desfechos_044(chave_idempotencia,contrato_id,ciclo_id,usuario_id,hash_intencao,intencao,plano,creditos,desfecho,codigo,resposta)
   values(v_chave,v_contrato,v_ciclo,v_usuario,v_hash,p_intencao,p_plano,p_intencao->'creditos','sucesso_confirmado','RESERVADO',v_resposta);
  return v_resposta;
 end if;
 -- Allowlist de recusas estruturadas de negocio/plano. Nunca ERRO_INTERNO, timeout,
 -- 55P03, 40P01, erro generico RESERVA_NAO_CONFIRMADA ou codigo desconhecido.
 if v_resultado->>'status' in ('invalido','conflito') and v_codigo in (
  'INTENCAO_INVALIDA','QUANTIDADE_INVALIDA','IDENTIDADE_OBRIGATORIA','CICLO_NAO_ELEGIVEL',
  'VINCULO_INCOMPATIVEL','UNIDADE_DUPLICADA_OU_INVALIDA','OCORRENCIAS_DIFERENTES',
  'MODALIDADE_INCOMPATIVEL','CREDITO_DE_OUTRO_CICLO','CREDITO_NAO_DISPONIVEL',
  'LIBERACAO_NAO_COMPROVADA','SERVICOS_DIVERGENTES','DISPONIBILIDADE_ALTERADA',
  'CHAVE_JA_UTILIZADA_NA_AGENDA','CONFIGURACAO_ALTERADA','CONFLITO_RECURSO','PLANO_INVALIDO'
 ) then
  -- Defesa contra qualquer retorno improprio com efeitos positivos. Nao esconder inconsistencias.
  if exists(select 1 from public.contrato_reaproveitamentos_044 where chave_idempotencia=v_chave)
   or exists(select 1 from public.contrato_credito_vinculos_044 where chave_idempotencia=v_chave) then
   raise exception 'RECUSA_COM_EFEITO_POSITIVO' using errcode='23514';
  end if;
  v_resposta:=jsonb_build_object('status','recusado','codigo',v_codigo,'desfecho','recusa_definitiva',
   'desfechoPersistido',true,'versaoDesfecho',2,'reciboId',v_chave,
   'contratoId',v_contrato,'cicloId',v_ciclo,'chaveIdempotencia',v_chave);
  insert into public.contrato_reaproveitamento_desfechos_044(chave_idempotencia,contrato_id,ciclo_id,usuario_id,hash_intencao,intencao,plano,creditos,desfecho,codigo,resposta)
   values(v_chave,v_contrato,v_ciclo,v_usuario,v_hash,p_intencao,p_plano,p_intencao->'creditos','recusa_definitiva',v_codigo,v_resposta);
  return v_resposta;
 end if;
 return jsonb_build_object('status','transitorio','codigo',coalesce(v_codigo,'RESULTADO_NAO_CONFIRMADO'),'desfechoPersistido',false,
  'contratoId',v_contrato,'cicloId',v_ciclo,'chaveIdempotencia',v_chave);
 -- Se qualquer insert de desfecho falhar, a chamada inteira aborta, inclusive sucesso do executor.
 -- Nao capturar erros genericos e nao persistir fora da transacao do chamador.
end;$function$;
REVOKE ALL ON FUNCTION public.resolver_desfecho_reaproveitamento_044(jsonb,jsonb,boolean) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.consultar_desfecho_reaproveitamento_044(p_intencao jsonb, p_plano jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
 return public.resolver_desfecho_reaproveitamento_044(p_intencao,p_plano,true);
end;$function$;
REVOKE ALL ON FUNCTION public.consultar_desfecho_reaproveitamento_044(jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.consultar_desfecho_reaproveitamento_044(jsonb,jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.reaproveitar_credito_contrato_044(p_intencao jsonb, p_plano jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
 return public.resolver_desfecho_reaproveitamento_044(p_intencao,p_plano,false);
end;$function$;
REVOKE ALL ON FUNCTION public.reaproveitar_credito_contrato_044(jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.reaproveitar_credito_contrato_044(jsonb,jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.resumo_comercial_contrato_043(p_contrato_id uuid)
 RETURNS TABLE(ciclo_id uuid, comercialmente_concluido boolean, elegivel_renovacao boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
 select c.id,public.ciclo_comercial_concluido_043(c.id),
 c.estado='concluido' and not c.encerramento_pendente and ct.status='ativo' and public.ciclo_comercial_concluido_043(c.id)
 and not exists(select 1 from public.contrato_ciclos s where s.contrato_id=c.contrato_id and s.numero>c.numero)
 and not exists(select 1 from public.contrato_ciclos h where h.contrato_id=c.contrato_id and h.numero<c.numero
 and (h.estado<>'concluido' or h.encerramento_pendente or not public.ciclo_comercial_concluido_043(h.id)))
 from public.contrato_ciclos c join public.contratos ct on ct.id=c.contrato_id where c.contrato_id=p_contrato_id
$function$;
REVOKE ALL ON FUNCTION public.resumo_comercial_contrato_043(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.resumo_comercial_contrato_043(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.renovar_ciclo_contrato(p_intencao jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare v_contrato public.contratos%rowtype;v_atual public.contrato_ciclos%rowtype;v_novo uuid;v_numero int;v_usuario uuid;v_disponivel boolean;v_manual boolean;v_responsavel uuid;v_ocupacao bigint;v_o jsonb;v_oid uuid;v_ref jsonb; v_chave uuid; v_anterior uuid; v_hash text; v_retry public.contrato_renovacoes_idempotentes_043%rowtype; v_resultado jsonb;
begin
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'COMERCIAL_EXIGE_READ_COMMITTED'; end if;

 -- F043_ENTRY_LOCK_BEGIN
 perform public.bloquear_contratos_comerciais_043(ARRAY(select id from public.contratos where id=nullif(p_intencao->>'contratoId','')::uuid),false);
 -- Reconsulta apos eventual espera: vinculo que mudou nao fica sem protecao.
 perform public.bloquear_contratos_comerciais_043(ARRAY(select id from public.contratos where id=nullif(p_intencao->>'contratoId','')::uuid),true);
 -- F043_ENTRY_LOCK_END

 v_chave:=nullif(p_intencao->>'chaveIdempotencia','')::uuid; v_anterior:=nullif(p_intencao->>'cicloAnteriorId','')::uuid;
 if v_chave is null or v_anterior is null or nullif(p_intencao->>'usuarioId','') is null then return jsonb_build_object('status','invalido','codigo','RENOVACAO_EXIGE_IDENTIDADE'); end if;
 perform pg_advisory_xact_lock(hashtextextended('renovacao:chave:'||v_chave::text,0));
 v_hash:=md5((p_intencao-'chaveIdempotencia')::text);
 select * into v_retry from public.contrato_renovacoes_idempotentes_043 where chave_idempotencia=v_chave or ciclo_anterior_id=v_anterior order by chave_idempotencia limit 1;
 if found then
 if v_retry.hash_intencao<>v_hash or v_retry.ciclo_anterior_id<>v_anterior then return jsonb_build_object('status','conflito','codigo','IDEMPOTENCIA_CONFLITANTE'); end if;
 return v_retry.resposta;
 end if;
 v_usuario=(p_intencao->>'usuarioId')::uuid;v_disponivel=(p_intencao->>'disponivel')::boolean;
 if v_disponivel then perform pg_advisory_xact_lock(hashtextextended('agenda:ocupacao',0)); end if;
 select * into v_contrato from public.contratos where id=(p_intencao->>'contratoId')::uuid for update;
 if not found then return jsonb_build_object('status','invalido','codigo','CONTRATO_NAO_ENCONTRADO');end if;
 select * into v_atual from public.contrato_ciclos where contrato_id=v_contrato.id order by numero desc limit 1 for update;
 if not found or v_atual.estado<>'concluido' then return jsonb_build_object('status','invalido','codigo','CICLO_ATUAL_NAO_CONCLUIDO');end if;
 if v_contrato.status<>'ativo' or v_atual.id<>v_anterior or v_atual.encerramento_pendente or not public.ciclo_comercial_concluido_043(v_atual.id) then
 return jsonb_build_object('status','invalido','codigo','CICLO_NAO_ELEGIVEL_COMERCIALMENTE'); end if;
 if exists(select 1 from public.contrato_ciclos h where h.contrato_id=v_contrato.id and h.numero<v_atual.numero
 and (h.estado<>'concluido' or h.encerramento_pendente or not public.ciclo_comercial_concluido_043(h.id))) then
 return jsonb_build_object('status','invalido','codigo','HISTORICO_EXIGE_REVISAO'); end if;
 if exists(select 1 from public.contrato_ciclos where contrato_id=v_contrato.id and estado in('reservado','requer_revisao','em_andamento')) then return jsonb_build_object('status','conflito','codigo','CICLO_ABERTO_EXISTENTE');end if;
 if not v_contrato.renovacao_automatica and coalesce((p_intencao->>'renovacaoManual')::boolean,false)=false then return jsonb_build_object('status','sem_renovacao');end if;
 v_manual=coalesce((p_intencao->>'renovacaoManual')::boolean,false);
 v_responsavel=case when v_manual and nullif(p_intencao->>'funcionarioResponsavelId','') is not null then (p_intencao->>'funcionarioResponsavelId')::uuid else v_atual.funcionario_responsavel_padrao_id end;
 if nullif(p_intencao->>'funcionarioResponsavelId','')::uuid is distinct from v_responsavel then return jsonb_build_object('status','invalido','codigo','RESPONSAVEL_NAO_REVALIDADO');end if;
 v_disponivel=v_disponivel and v_responsavel is not null;v_numero=v_atual.numero+1;if v_disponivel then select versao into v_ocupacao from public.agenda_versao_ocupacao where id=true for update; end if;
 if v_disponivel and v_ocupacao<>(p_intencao->>'ocupacaoAgendaVersao')::bigint then return jsonb_build_object('status','conflito','codigo','DISPONIBILIDADE_ALTERADA');end if;
 insert into public.contrato_ciclos(contrato_id,numero,estado,situacao_financeira,data_ancora_pretendida,dia_semana_pretendido,horario_pretendido,modalidade_transporte_pretendida,taxidog_ciclo_id_pretendido,funcionario_responsavel_padrao_id,configuracao_agenda_versao,ocupacao_agenda_versao,motivo_revisao,criado_por)
 values(v_contrato.id,v_numero,case when v_disponivel then 'reservado' else 'requer_revisao' end,'pendente',(p_intencao->>'dataAncora')::date,(p_intencao->>'diaSemanaFixo')::smallint,(p_intencao->>'horarioFixo')::time,p_intencao->>'modalidadeTransporte',nullif(p_intencao->>'taxidogCicloId','')::uuid,v_responsavel,nullif(p_intencao->>'configuracaoAgendaVersao','')::bigint,case when v_disponivel then v_ocupacao else null end,case when v_disponivel then null else coalesce(nullif(btrim(p_intencao->>'motivoRevisao'),''),'A rotina anterior não possui mais capacidade.') end,v_usuario) returning id into v_novo;
 if v_disponivel then
  if jsonb_typeof(p_intencao->'ocorrencias')<>'array' or jsonb_array_length(p_intencao->'ocorrencias')=0 then raise exception 'CICLO_SEM_RESERVAS';end if;
  for v_o in select value from jsonb_array_elements(p_intencao->'ocorrencias') loop
   insert into public.contrato_ciclo_ocorrencias(ciclo_id,ordem,data_operacional,horario_apresentado,inicio_operacional,conclusao_prevista,taxidog_ciclo_id,plano_operacional)
   values(v_novo,(v_o->>'ordem')::int,(v_o->>'data')::date,(v_o->>'horarioApresentado')::time,(((v_o->>'data')::date+(v_o->>'inicioOperacional')::time) at time zone v_contrato.timezone_snapshot),(((v_o->>'data')::date+(v_o->>'conclusaoPrevista')::time) at time zone v_contrato.timezone_snapshot),nullif(v_o->>'taxidogCicloId','')::uuid,v_o->'plano') returning id into v_oid;
   for v_ref in select value from jsonb_array_elements(v_o->'itens') loop insert into public.contrato_ciclo_ocorrencia_itens(ocorrencia_id,ciclo_id,contrato_item_id,ordinal_no_item)select v_oid,v_novo,id,(v_ref->>'ordinal')::int from public.contrato_itens where contrato_id=v_contrato.id and servico_id=(v_ref->>'servicoId')::uuid;end loop;
  end loop;
  update public.agenda_versao_ocupacao set versao=versao+1,updated_at=statement_timestamp() where id=true;
 end if;
 insert into public.contrato_eventos(contrato_id,tipo,detalhes,registrado_por)values(v_contrato.id,case when v_disponivel then 'ciclo_renovado' else 'renovacao_requer_revisao' end,jsonb_build_object('cicloId',v_novo,'numero',v_numero),v_usuario);
 v_resultado:=jsonb_build_object('status',case when v_disponivel then 'reservado' else 'requer_revisao' end,'cicloId',v_novo,'numero',v_numero);
 insert into public.contrato_renovacoes_idempotentes_043 values(v_chave,v_anterior,v_novo,v_hash,v_resultado);
 return v_resultado;
end;$function$;
REVOKE ALL ON FUNCTION public.renovar_ciclo_contrato(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.renovar_ciclo_contrato(jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.pular_banho_046(p_atendimento_id uuid, p_usuario_id uuid, p_motivo text, p_autorizado boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  ciclo public.contrato_ciclos%rowtype;
  atendimento public.atendimentos%rowtype;
  resultado jsonb;
  quantidade integer;
  evento jsonb;
begin
  if p_usuario_id is null or nullif(btrim(p_motivo),'') is null or length(p_motivo)>500 then
    return jsonb_build_object('status','invalido','codigo','INTENCAO_INVALIDA','mensagem','Informe o motivo do pulo.');
  end if;
  select c.* into ciclo from public.contrato_ciclos c
  where c.id=(
    select u.ciclo_id from public.contrato_creditos_contexto_044 u
      where p_atendimento_id in (u.atendimento_atual_id,u.atendimento_original_id)
    union
    select v.ciclo_id from public.contrato_credito_vinculos_044 v
      where v.atendimento_id=p_atendimento_id
  );
  if not found then
    return jsonb_build_object('status','invalido','codigo','PULO_INDISPONIVEL','mensagem','O atendimento não pertence a um ciclo de pacote.');
  end if;
  perform public.bloquear_contratos_comerciais_043(array[ciclo.contrato_id],false);
  perform public.bloquear_contratos_comerciais_043(array[ciclo.contrato_id],true);
  select * into ciclo from public.contrato_ciclos where id=ciclo.id;
  select detalhes into evento from public.contrato_eventos where contrato_id=ciclo.contrato_id
    and tipo='banho_pulado' and detalhes->>'atendimentoId'=p_atendimento_id::text;
  if found then
    return jsonb_build_object('status','atualizado','atendimentoId',p_atendimento_id,
      'statusAnterior',evento->>'statusAnterior','statusAtual','cancelado','reutilizado',true);
  end if;
  select * into atendimento from public.atendimentos where id=p_atendimento_id;
  if ciclo.estado not in ('reservado','em_andamento') or atendimento.status not in ('agendado','confirmado')
    or not exists(select 1 from public.contratos where id=ciclo.contrato_id and status='ativo')
    or exists(select 1 from public.contrato_ciclos c where c.contrato_id=ciclo.contrato_id and c.numero>ciclo.numero)
    or not exists(select 1 from public.contrato_creditos_contexto_044 u where u.ciclo_id=ciclo.id
       and u.atendimento_atual_id=p_atendimento_id and u.estado_comercial='reservado') then
    return jsonb_build_object('status','invalido','codigo','PULO_INDISPONIVEL','mensagem','O pulo exige um banho agendado no ciclo vigente.');
  end if;
  select count(*) into quantidade from public.contrato_eventos where contrato_id=ciclo.contrato_id
    and tipo='banho_pulado' and detalhes->>'cicloId'=ciclo.id::text;
  if quantidade>=2 and not (coalesce(p_autorizado,false) and exists(
    select 1 from auth.users where id=p_usuario_id and raw_app_meta_data->>'role'='internal'
      and raw_app_meta_data->'creditos_admin'='true'::jsonb
  )) then
    return jsonb_build_object('status','invalido','codigo','PULO_EXIGE_ADMIN','mensagem','A partir do terceiro pulo, é necessária autorização administrativa.');
  end if;
  -- Libera a reserva pelo fluxo autoritativo existente. O evento comercial distingue o pulo.
  resultado:=public.alterar_status_atendimento_com_creditos(jsonb_build_object(
    'atendimentoId',p_atendimento_id,'usuarioId',p_usuario_id,'statusEsperado',atendimento.status,'acao','cancelar'));
  if resultado->>'status'<>'atualizado' or coalesce((resultado->>'reutilizado')::boolean,false) then
    return jsonb_build_object('status','invalido','codigo','PULO_INDISPONIVEL','mensagem','O atendimento mudou antes de confirmar o pulo.');
  end if;
  insert into public.contrato_eventos(contrato_id,tipo,detalhes,registrado_por)
    values(ciclo.contrato_id,'banho_pulado',jsonb_build_object('atendimentoId',p_atendimento_id,
      'cicloId',ciclo.id,'numeroPulo',quantidade+1,'motivo',btrim(p_motivo),'statusAnterior',atendimento.status,
      'autorizadoPor',case when quantidade>=2 then p_usuario_id end),p_usuario_id);
  return resultado;
end;
$function$;
REVOKE ALL ON FUNCTION public.pular_banho_046(uuid,uuid,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.pular_banho_046(uuid,uuid,text,boolean) TO service_role;
CREATE OR REPLACE FUNCTION public.receber_pacote_045(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  atendimento uuid := (p_payload->>'atendimentoId')::uuid;
  usuario uuid := (p_payload->>'usuarioId')::uuid;
  chave uuid := (p_payload->>'chaveIdempotencia')::uuid;
  valor numeric := (p_payload->>'valor')::numeric;
  forma text := p_payload->>'formaPagamento';
  financeiro jsonb;
  ciclo public.contrato_ciclos%rowtype;
  recibo public.contrato_eventos%rowtype;
begin
  if usuario is null or chave is null or valor is null or valor <= 0
    or forma is null or forma not in ('pix','dinheiro','debito','credito','outro') then
    return jsonb_build_object('status','invalido','codigo','PAGAMENTO_INVALIDO','mensagem','Dados de pagamento inválidos.');
  end if;
  financeiro := public.financeiro_pacote_045(atendimento);
  select * into ciclo from public.contrato_ciclos where id=(financeiro->>'cicloId')::uuid for update;
  if not found then
    return jsonb_build_object('status','invalido','codigo','CICLO_NAO_ENCONTRADO','mensagem','Ciclo do atendimento não encontrado.');
  end if;
  select * into recibo from public.contrato_eventos where contrato_id=ciclo.contrato_id
    and tipo='pagamento_integral_ciclo' and detalhes->>'cicloId'=ciclo.id::text;
  if found and recibo.detalhes->>'chaveIdempotencia'=chave::text then
    if recibo.detalhes->>'atendimentoId'=atendimento::text
      and (recibo.detalhes->>'valor')::numeric=valor and recibo.detalhes->>'formaPagamento'=forma then
      return jsonb_build_object('status','registrado','recebimentoId',recibo.id,'reutilizado',true);
    end if;
    return jsonb_build_object('status','conflito','codigo','IDEMPOTENCIA_CONFLITANTE','mensagem','Os dados do pagamento já registrado são diferentes.');
  end if;
  if ciclo.situacao_financeira <> 'pendente' or recibo.id is not null then
    return jsonb_build_object('status','invalido','codigo','PAGAMENTO_JA_REGISTRADO_OU_EM_REVISAO','mensagem','Este ciclo já está pago ou exige revisão financeira.');
  end if;
  if ciclo.estado not in ('reservado','em_andamento') or not exists (
    select 1 from public.contrato_creditos_contexto_044 u where u.ciclo_id=ciclo.id
      and u.atendimento_atual_id=atendimento and u.status_atendimento in
      ('recebido','em_atendimento','aguardando_retirada','aguardando_entrega')
  ) then
    return jsonb_build_object('status','invalido','codigo','ATENDIMENTO_FORA_DO_PAGAMENTO','mensagem','Registre o pagamento durante um atendimento em andamento deste ciclo.');
  end if;
  if valor <> (financeiro->>'valor')::numeric then
    return jsonb_build_object('status','invalido','codigo','VALOR_INTEGRAL_OBRIGATORIO','mensagem','Informe o valor integral do pacote.');
  end if;
  insert into public.contrato_eventos(contrato_id,tipo,detalhes,registrado_por)
    values(ciclo.contrato_id,'pagamento_integral_ciclo',jsonb_build_object(
      'cicloId',ciclo.id,'atendimentoId',atendimento,'chaveIdempotencia',chave,'valor',valor,'formaPagamento',forma),usuario)
    returning id into recibo.id;
  update public.contrato_ciclos set situacao_financeira='pago' where id=ciclo.id;
  return jsonb_build_object('status','registrado','recebimentoId',recibo.id,'reutilizado',false);
end;
$function$;
REVOKE ALL ON FUNCTION public.receber_pacote_045(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.receber_pacote_045(jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
