-- HML: configuration and pure timing policy only. No cron, no HTTP, no dispatch.
CREATE TABLE mensageria_interna.lembrete_agendamento_hml_config (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 ativo boolean NOT NULL DEFAULT false,
 antecedencia_minima_horas integer NOT NULL DEFAULT 24 CHECK(antecedencia_minima_horas BETWEEN 24 AND 720),
 horario_vespera time(0) NOT NULL DEFAULT '18:00' CHECK(horario_vespera < '24:00'::time AND extract(second from horario_vespera)=0),
 antecedencia_mesmo_dia_horas integer NOT NULL DEFAULT 3 CHECK(antecedencia_mesmo_dia_horas BETWEEN 1 AND 23),
 revisao bigint NOT NULL DEFAULT 1 CHECK(revisao>0),
 atualizado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE mensageria_interna.lembrete_agendamento_hml_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON mensageria_interna.lembrete_agendamento_hml_config FROM PUBLIC,anon,authenticated;
INSERT INTO mensageria_interna.lembrete_agendamento_hml_config(singleton) VALUES(true);

CREATE FUNCTION mensageria_interna.calcular_lembrete_agendamento(
 p_criado timestamptz,p_compromisso timestamptz,p_antecedencia integer,
 p_vespera time,p_mesmo_dia integer
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path TO 'pg_catalog' AS $$
DECLARE d_criado date; d_compromisso date; v_envio timestamptz; v_regra text;
BEGIN
 IF p_criado IS NULL OR p_compromisso IS NULL OR NOT isfinite(p_criado) OR NOT isfinite(p_compromisso)
 OR p_antecedencia IS NULL OR p_antecedencia NOT BETWEEN 24 AND 720 OR p_vespera IS NULL OR p_vespera >= '24:00'::time
 OR p_mesmo_dia IS NULL OR p_mesmo_dia NOT BETWEEN 1 AND 23 OR p_compromisso<=p_criado THEN
 RETURN jsonb_build_object('regra','dados_invalidos','enviar_em',null); END IF;
 d_criado:=(p_criado AT TIME ZONE 'America/Sao_Paulo')::date;
 d_compromisso:=(p_compromisso AT TIME ZONE 'America/Sao_Paulo')::date;
 IF d_criado=d_compromisso AND p_compromisso-p_criado>=make_interval(hours=>p_mesmo_dia) THEN
 v_regra:='mesmo_dia'; v_envio:=p_compromisso-make_interval(hours=>p_mesmo_dia);
 ELSIF d_criado<d_compromisso AND p_compromisso-p_criado>=make_interval(hours=>p_antecedencia) THEN
 v_regra:='vespera'; v_envio:=((d_compromisso-1)+p_vespera) AT TIME ZONE 'America/Sao_Paulo';
 ELSE RETURN jsonb_build_object('regra','antecedencia_insuficiente','enviar_em',null); END IF;
 IF v_envio<p_criado OR v_envio>=p_compromisso THEN RETURN jsonb_build_object('regra','horario_inaplicavel','enviar_em',null); END IF;
 RETURN jsonb_build_object('regra',v_regra,'enviar_em',v_envio);
END $$;
REVOKE ALL ON FUNCTION mensageria_interna.calcular_lembrete_agendamento(timestamptz,timestamptz,integer,time,integer) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.mensageria_hml_configurar_lembrete(
 p_operador uuid,p_acao text,p_revisao bigint DEFAULT NULL,p_ativo boolean DEFAULT NULL,
 p_antecedencia integer DEFAULT NULL,p_vespera time DEFAULT NULL,p_mesmo_dia integer DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog' AS $$
DECLARE c mensageria_interna.lembrete_agendamento_hml_config%ROWTYPE;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=p_operador AND u.deleted_at IS NULL
 AND (u.banned_until IS NULL OR u.banned_until<=now()) AND u.raw_app_meta_data->>'role'='internal'
 AND u.raw_app_meta_data->>'whatsapp_admin'='true') THEN RETURN jsonb_build_object('status','nao_autorizado'); END IF;
 IF p_acao='salvar' THEN
 IF p_revisao IS NULL OR p_ativo IS NULL OR p_antecedencia IS NULL OR p_antecedencia NOT BETWEEN 24 AND 720
 OR p_vespera IS NULL OR p_vespera >= '24:00'::time OR extract(second from p_vespera)<>0
 OR p_mesmo_dia IS NULL OR p_mesmo_dia NOT BETWEEN 1 AND 23 THEN RETURN jsonb_build_object('status','dados_invalidos'); END IF;
 UPDATE mensageria_interna.lembrete_agendamento_hml_config SET ativo=p_ativo,antecedencia_minima_horas=p_antecedencia,
 horario_vespera=p_vespera,antecedencia_mesmo_dia_horas=p_mesmo_dia,revisao=revisao+1,atualizado_em=now()
 WHERE singleton AND revisao=p_revisao RETURNING * INTO c;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','revisao_conflitante'); END IF;
 ELSIF p_acao='status' THEN SELECT * INTO c FROM mensageria_interna.lembrete_agendamento_hml_config WHERE singleton;
 ELSE RETURN jsonb_build_object('status','acao_invalida'); END IF;
 RETURN jsonb_build_object('status','ok','ativo',c.ativo,'antecedencia_minima_horas',c.antecedencia_minima_horas,
 'horario_vespera',to_char(c.horario_vespera,'HH24:MI'),'antecedencia_mesmo_dia_horas',c.antecedencia_mesmo_dia_horas,
 'revisao',c.revisao,'fuso','America/Sao_Paulo','despacho_instalado',false);
END $$;
REVOKE ALL ON FUNCTION public.mensageria_hml_configurar_lembrete(uuid,text,bigint,boolean,integer,time,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mensageria_hml_configurar_lembrete(uuid,text,bigint,boolean,integer,time,integer) TO service_role;