-- HML only. The live scheduler is disabled by default.
CREATE TABLE mensageria_interna.lembrete_agendamento_hml_despachos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 atendimento_id uuid NOT NULL REFERENCES public.atendimentos(id) ON DELETE RESTRICT,
 compromisso timestamptz NOT NULL,
 inicio_snapshot timestamptz NOT NULL,
 criado_snapshot timestamptz NOT NULL,
 envio_previsto timestamptz NOT NULL,
 revisao bigint NOT NULL,
 revisao_operacao bigint NOT NULL,
 estado text NOT NULL DEFAULT 'reservado' CHECK(estado IN ('reservado','vinculado','bloqueado','indeterminado','recusado')),
 reservado_em timestamptz NOT NULL DEFAULT clock_timestamp(),
 finalizado_em timestamptz,
 codigo text CHECK(codigo ~ '^[A-Z_0-9]{1,80}$'),
 UNIQUE(atendimento_id,compromisso,inicio_snapshot)
);
ALTER TABLE mensageria_interna.lembrete_agendamento_hml_despachos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON mensageria_interna.lembrete_agendamento_hml_despachos FROM PUBLIC,anon,authenticated,service_role;
-- One source of eligibility for reservation and revalidation.
CREATE FUNCTION mensageria_interna.lembrete_hml_elegiveis()
RETURNS TABLE(atendimento_id uuid,compromisso timestamptz,inicio_snapshot timestamptz,criado_snapshot timestamptz,envio_previsto timestamptz,revisao bigint,revisao_operacao bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'pg_catalog' AS $$
 SELECT a.id, b.compromisso,a.inicio_planejado,a.created_at,x.envio,c.revisao,op.revisao
 FROM public.atendimentos a
 JOIN public.grupos_agendamento g ON g.id=a.grupo_agendamento_id
 JOIN public.pets pet ON pet.id=a.pet_id AND pet.cliente_id=g.cliente_id
 JOIN public.clientes cli ON cli.id=g.cliente_id AND cli.id='CLI-990003'
 JOIN mensageria_interna.agenda_grupos ag ON ag.grupo_id=g.id AND ag.cliente_id=g.cliente_id
 JOIN mensageria_interna.unidades un ON un.empresa_id=ag.empresa_id AND un.unidade_id=ag.unidade_id AND un.confirmacao_ativa
 CROSS JOIN mensageria_interna.lembrete_agendamento_hml_config c
 CROSS JOIN mensageria_interna.whatsapp_hml_operacao op
 CROSS JOIN LATERAL (SELECT CASE WHEN a.transporte THEN (g.data_operacional+coalesce(g.taxidog_coleta_inicio_snapshot,g.coleta_inicio_snapshot)) AT TIME ZONE 'America/Sao_Paulo' ELSE least(g.horario_chegada_comprometido,a.inicio_planejado) END compromisso) b
 CROSS JOIN LATERAL (SELECT (mensageria_interna.calcular_lembrete_agendamento(a.created_at,b.compromisso,c.antecedencia_minima_horas,c.horario_vespera,c.antecedencia_mesmo_dia_horas)->>'enviar_em')::timestamptz envio) x
 WHERE c.singleton AND c.ativo AND op.receptor AND op.processamento
 AND a.status='agendado' AND a.inicio_planejado>=statement_timestamp()+interval '30 minutes'
 AND g.horario_chegada_comprometido IS NOT NULL AND b.compromisso>statement_timestamp()
 AND regexp_replace(coalesce(cli.whatsapp,''),'[^0-9]','','g') ~ '^55[0-9]{11}$'
 AND x.envio<=statement_timestamp() AND x.envio>statement_timestamp()-interval '60 seconds'
$$;
REVOKE ALL ON FUNCTION mensageria_interna.lembrete_hml_elegiveis() FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.mensageria_hml_reservar_lembrete(p_operador uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog' AS $$
DECLARE e record; d mensageria_interna.lembrete_agendamento_hml_despachos%ROWTYPE;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=p_operador AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=now()) AND u.raw_app_meta_data->>'role'='internal' AND u.raw_app_meta_data->>'whatsapp_admin'='true') THEN RETURN jsonb_build_object('status','nao_autorizado'); END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('hml:reserva:lembrete',0)) THEN RETURN jsonb_build_object('status','ocupado'); END IF;
 FOR e IN SELECT * FROM mensageria_interna.lembrete_hml_elegiveis() q WHERE NOT EXISTS(SELECT 1 FROM mensageria_interna.lembrete_agendamento_hml_despachos z WHERE z.atendimento_id=q.atendimento_id AND z.compromisso=q.compromisso AND z.inicio_snapshot=q.inicio_snapshot)
 ORDER BY q.envio_previsto,q.atendimento_id LIMIT 20 LOOP
 IF NOT pg_try_advisory_xact_lock(hashtextextended('atendimento:status:'||e.atendimento_id::text,0)) THEN CONTINUE; END IF;
 IF EXISTS(SELECT 1 FROM public.mensageria_hml_convites_confirmacao cv WHERE cv.atendimento_id=e.atendimento_id AND cv.estado IN ('ativo','confirmado','remarcacao_pendente','preparado','falha')) THEN CONTINUE; END IF;
 INSERT INTO mensageria_interna.lembrete_agendamento_hml_despachos(atendimento_id,compromisso,inicio_snapshot,criado_snapshot,envio_previsto,revisao,revisao_operacao)
 VALUES(e.atendimento_id,e.compromisso,e.inicio_snapshot,e.criado_snapshot,e.envio_previsto,e.revisao,e.revisao_operacao)
 ON CONFLICT(atendimento_id,compromisso,inicio_snapshot) DO NOTHING RETURNING * INTO d;
 IF FOUND THEN RETURN jsonb_build_object('status','reservado','id',d.id,'atendimento_id',d.atendimento_id); END IF;
 END LOOP;
 RETURN jsonb_build_object('status','fila_vazia');
END $$;
CREATE FUNCTION public.mensageria_hml_validar_lembrete(p_operador uuid,p_reserva uuid,p_preparo uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=p_operador AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=now()) AND u.raw_app_meta_data->>'role'='internal' AND u.raw_app_meta_data->>'whatsapp_admin'='true') THEN RETURN jsonb_build_object('status','nao_autorizado'); END IF;
 RETURN jsonb_build_object('status',CASE WHEN EXISTS(
 SELECT 1 FROM mensageria_interna.lembrete_agendamento_hml_despachos d JOIN mensageria_interna.lembrete_hml_elegiveis() e USING(atendimento_id,compromisso,inicio_snapshot,criado_snapshot,envio_previsto,revisao,revisao_operacao)
 WHERE d.id=p_reserva AND d.estado='reservado' AND d.reservado_em>clock_timestamp()-interval '60 seconds'
 AND EXISTS(SELECT 1 FROM public.mensageria_hml_convites_confirmacao cv WHERE cv.atendimento_id=d.atendimento_id AND cv.preparo_idempotencia=p_preparo AND cv.estado='preparado' AND cv.expira_em>clock_timestamp())
 ) THEN 'ok' ELSE 'bloqueado' END);
END $$;
CREATE FUNCTION public.mensageria_hml_finalizar_lembrete(p_operador uuid,p_reserva uuid,p_estado text,p_codigo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=p_operador AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=now()) AND u.raw_app_meta_data->>'role'='internal' AND u.raw_app_meta_data->>'whatsapp_admin'='true') THEN RETURN jsonb_build_object('status','nao_autorizado'); END IF;
 IF p_estado IS NULL OR p_estado NOT IN ('vinculado','bloqueado','indeterminado','recusado') OR p_codigo IS NULL OR p_codigo !~ '^[A-Z_0-9]{1,80}$' THEN RETURN jsonb_build_object('status','dados_invalidos'); END IF;
 UPDATE mensageria_interna.lembrete_agendamento_hml_despachos SET estado=p_estado,codigo=p_codigo,finalizado_em=clock_timestamp() WHERE id=p_reserva AND estado='reservado';
 RETURN jsonb_build_object('status',CASE WHEN FOUND THEN 'ok' ELSE 'ja_encerrado' END);
END $$;
REVOKE ALL ON FUNCTION public.mensageria_hml_reservar_lembrete(uuid),public.mensageria_hml_validar_lembrete(uuid,uuid,uuid),public.mensageria_hml_finalizar_lembrete(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mensageria_hml_reservar_lembrete(uuid),public.mensageria_hml_validar_lembrete(uuid,uuid,uuid),public.mensageria_hml_finalizar_lembrete(uuid,uuid,text,text) TO service_role;