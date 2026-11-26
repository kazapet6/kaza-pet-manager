-- Scheduler rehearsal. No HTTP, no live invite, no secrets, no actual dispatch.
CREATE TABLE mensageria_interna.lembrete_agendamento_hml_simulacoes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 atendimento_id uuid NOT NULL REFERENCES public.atendimentos(id) ON DELETE CASCADE,
 compromisso timestamptz NOT NULL,
 inicio_snapshot timestamptz NOT NULL,
 envio_previsto timestamptz NOT NULL,
 regra text NOT NULL CHECK(regra IN ('vespera','mesmo_dia')),
 revisao bigint NOT NULL,
 registrado_em timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(atendimento_id,compromisso,inicio_snapshot)
);
ALTER TABLE mensageria_interna.lembrete_agendamento_hml_simulacoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON mensageria_interna.lembrete_agendamento_hml_simulacoes FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE mensageria_interna.lembrete_agendamento_hml_ciclos (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 executado_em timestamptz NOT NULL DEFAULT clock_timestamp(),
 revisao bigint NOT NULL,
 simulados integer NOT NULL CHECK(simulados>=0),
 despachos integer NOT NULL DEFAULT 0 CHECK(despachos=0)
);
ALTER TABLE mensageria_interna.lembrete_agendamento_hml_ciclos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON mensageria_interna.lembrete_agendamento_hml_ciclos FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION mensageria_interna.executar_simulacao_lembretes_hml()
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'pg_catalog' AS $$
DECLARE c mensageria_interna.lembrete_agendamento_hml_config%ROWTYPE; v_agora timestamptz:=clock_timestamp(); n integer;
BEGIN
 IF NOT pg_try_advisory_xact_lock(hashtextextended('hml:simulacao:lembrete',0)) THEN
 RETURN jsonb_build_object('status','ocupado','despachos',0); END IF;
 SELECT * INTO STRICT c FROM mensageria_interna.lembrete_agendamento_hml_config WHERE singleton FOR SHARE;
 WITH base AS (
 SELECT a.id,a.inicio_planejado,a.created_at,
 CASE WHEN a.transporte THEN (g.data_operacional+coalesce(g.taxidog_coleta_inicio_snapshot,g.coleta_inicio_snapshot)) AT TIME ZONE 'America/Sao_Paulo'
 ELSE least(g.horario_chegada_comprometido,a.inicio_planejado) END compromisso
 FROM public.atendimentos a
 JOIN public.grupos_agendamento g ON g.id=a.grupo_agendamento_id
 JOIN public.pets pet ON pet.id=a.pet_id AND pet.cliente_id=g.cliente_id
 JOIN public.clientes cli ON cli.id=g.cliente_id AND cli.id='CLI-990003'
 JOIN mensageria_interna.agenda_grupos ag ON ag.grupo_id=g.id AND ag.cliente_id=g.cliente_id
 JOIN mensageria_interna.unidades un ON un.empresa_id=ag.empresa_id AND un.unidade_id=ag.unidade_id AND un.confirmacao_ativa
 WHERE a.status='agendado' AND a.inicio_planejado>=v_agora+interval '30 minutes'
 AND g.horario_chegada_comprometido IS NOT NULL
 AND regexp_replace(coalesce(cli.whatsapp,''),'[^0-9]','','g') ~ '^55[0-9]{11}$'
 AND NOT EXISTS(SELECT 1 FROM public.mensageria_hml_convites_confirmacao cv WHERE cv.atendimento_id=a.id AND cv.estado IN ('ativo','confirmado','remarcacao_pendente','preparado'))
 FOR UPDATE OF a SKIP LOCKED
 ), calc AS (
 SELECT b.*,r->>'regra' AS regra,(r->>'enviar_em')::timestamptz AS envio
 FROM base b CROSS JOIN LATERAL mensageria_interna.calcular_lembrete_agendamento(b.created_at,b.compromisso,c.antecedencia_minima_horas,c.horario_vespera,c.antecedencia_mesmo_dia_horas) r
 )
 INSERT INTO mensageria_interna.lembrete_agendamento_hml_simulacoes(atendimento_id,compromisso,inicio_snapshot,envio_previsto,regra,revisao)
 SELECT id,compromisso,inicio_planejado,envio,regra,c.revisao FROM calc
 WHERE compromisso>v_agora AND envio<=v_agora AND envio>v_agora-interval '60 seconds'
 ON CONFLICT(atendimento_id,compromisso,inicio_snapshot) DO NOTHING;
 GET DIAGNOSTICS n=ROW_COUNT;
 INSERT INTO mensageria_interna.lembrete_agendamento_hml_ciclos(revisao,simulados) VALUES(c.revisao,n);
 -- Retention bounded to 7 days for periodic diagnostic cycles.
 DELETE FROM mensageria_interna.lembrete_agendamento_hml_ciclos WHERE executado_em<v_agora-interval '7 days';
 RETURN jsonb_build_object('status','ok','simulados',n,'despachos',0,'revisao',c.revisao);
END $$;
REVOKE ALL ON FUNCTION mensageria_interna.executar_simulacao_lembretes_hml() FROM PUBLIC,anon,authenticated,service_role;