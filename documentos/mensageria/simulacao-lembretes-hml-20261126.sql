CREATE FUNCTION public.mensageria_hml_simular_lembretes(p_operador uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog' AS $$
DECLARE c mensageria_interna.lembrete_agendamento_hml_config%ROWTYPE; itens jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=p_operador AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=now()) AND u.raw_app_meta_data->>'role'='internal' AND u.raw_app_meta_data->>'whatsapp_admin'='true') THEN RETURN jsonb_build_object('status','nao_autorizado'); END IF;
 SELECT * INTO c FROM mensageria_interna.lembrete_agendamento_hml_config WHERE singleton;
 WITH base AS (
 SELECT a.id,a.status,a.created_at,pet.nome AS pet,
 CASE WHEN a.transporte THEN (g.data_operacional+coalesce(g.taxidog_coleta_inicio_snapshot,g.coleta_inicio_snapshot)) AT TIME ZONE 'America/Sao_Paulo' ELSE g.horario_chegada_comprometido END AS compromisso,
 EXISTS(SELECT 1 FROM public.mensageria_hml_convites_confirmacao cv WHERE cv.atendimento_id=a.id AND cv.estado IN ('ativo','confirmado','remarcacao_pendente','preparado')) AS convite_existente
 FROM public.atendimentos a JOIN public.grupos_agendamento g ON g.id=a.grupo_agendamento_id
 JOIN public.pets pet ON pet.id=a.pet_id AND pet.cliente_id=g.cliente_id
 JOIN mensageria_interna.agenda_grupos ag ON ag.grupo_id=g.id AND ag.cliente_id=g.cliente_id
 JOIN mensageria_interna.unidades un ON un.empresa_id=ag.empresa_id AND un.unidade_id=ag.unidade_id AND un.confirmacao_ativa
 WHERE g.cliente_id='CLI-990003' AND a.inicio_planejado>now()
 ORDER BY a.inicio_planejado LIMIT 100
 ), calc AS (
 SELECT b.*,r->>'regra' AS regra,(r->>'enviar_em')::timestamptz AS enviar_em
 FROM base b CROSS JOIN LATERAL mensageria_interna.calcular_lembrete_agendamento(b.created_at,b.compromisso,c.antecedencia_minima_horas,c.horario_vespera,c.antecedencia_mesmo_dia_horas) r
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'pet',pet,'compromisso',compromisso,'enviar_em',enviar_em,'regra',regra,'situacao',
 CASE WHEN status<>'agendado' THEN 'status_inelegivel' WHEN convite_existente THEN 'convite_existente' WHEN enviar_em IS NULL THEN 'sem_envio' WHEN enviar_em<date_trunc('minute',now()) THEN 'horario_passado' WHEN enviar_em<date_trunc('minute',now())+interval '1 minute' AND enviar_em<=now() THEN 'devido' ELSE 'programavel' END) ORDER BY compromisso),'[]'::jsonb) INTO itens FROM calc;
 RETURN jsonb_build_object('status','ok','simulacao',true,'despachos',0,'revisao',c.revisao,'itens',itens);
END $$;
REVOKE ALL ON FUNCTION public.mensageria_hml_simular_lembretes(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mensageria_hml_simular_lembretes(uuid) TO service_role;