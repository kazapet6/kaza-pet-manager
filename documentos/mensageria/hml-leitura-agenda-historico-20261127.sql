-- HML: leitura operacional da agenda e histórico, sem preparação, envio ou mutação.
CREATE OR REPLACE FUNCTION public.mensageria_hml_agenda_comercial(p_operador uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog' AS $fn$
DECLARE itens jsonb; permitidos jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=p_operador AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=now()) AND u.raw_app_meta_data->>'role'='internal' AND u.raw_app_meta_data->>'whatsapp_admin'='true') THEN
  RETURN jsonb_build_object('status','nao_autorizado'); END IF;
 permitidos:=public.mensageria_hml_contexto_convite(NULL,NULL,p_operador);
 IF permitidos->>'status' IS DISTINCT FROM 'ok' THEN RETURN jsonb_build_object('status','indisponivel'); END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.inicio,q.id),'[]'::jsonb) INTO itens FROM (
  SELECT a.id,cli.nome tutor,pet.nome pet,g.data_operacional data,g.modalidade,
   a.inicio_operacional_planejado inicio,
   CASE WHEN g.modalidade='taxidog' THEN (g.data_operacional+g.taxidog_coleta_inicio_snapshot) AT TIME ZONE 'America/Sao_Paulo' ELSE g.horario_chegada_comprometido END compromisso,
   a.status,
   coalesce((SELECT string_agg(s.nome_snapshot,' + ' ORDER BY s.nome_snapshot) FROM public.atendimento_servicos s WHERE s.atendimento_id=a.id AND s.ativo AND s.origem='solicitado'),'Serviço não informado') servicos,
   cv.estado convite_estado,
   CASE WHEN a.status='confirmado' THEN 'ja_confirmado'
     WHEN ag.grupo_id IS NULL THEN 'sem_vinculo_mensageria'
     WHEN NOT un.confirmacao_ativa THEN 'unidade_desativada'
     WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(permitidos->'itens') j WHERE j->>'id'=a.id::text) THEN 'elegivel_piloto'
     ELSE 'fora_do_escopo_de_envio' END elegibilidade
  FROM public.atendimentos a JOIN public.grupos_agendamento g ON g.id=a.grupo_agendamento_id
  JOIN public.clientes cli ON cli.id=g.cliente_id JOIN public.pets pet ON pet.id=a.pet_id AND pet.cliente_id=cli.id
  JOIN mensageria_interna.clientes_unidades cu ON cu.cliente_id=cli.id
  JOIN mensageria_interna.acessos_unidades au ON au.usuario_id=p_operador AND au.empresa_id=cu.empresa_id AND au.unidade_id=cu.unidade_id
  JOIN mensageria_interna.unidades un ON un.empresa_id=cu.empresa_id AND un.unidade_id=cu.unidade_id
  LEFT JOIN mensageria_interna.agenda_grupos ag ON ag.grupo_id=g.id
  LEFT JOIN LATERAL (SELECT c.estado FROM public.mensageria_hml_convites_confirmacao c WHERE c.atendimento_id=a.id AND c.empresa_id=cu.empresa_id AND c.unidade_id=cu.unidade_id ORDER BY c.criado_em DESC,c.id DESC LIMIT 1) cv ON true
  WHERE a.status IN ('agendado','confirmado') AND a.inicio_operacional_planejado>=now()
   AND ((ag.grupo_id IS NOT NULL AND ag.cliente_id=cli.id AND ag.empresa_id=cu.empresa_id AND ag.unidade_id=cu.unidade_id)
     OR (ag.grupo_id IS NULL AND (SELECT count(*) FROM mensageria_interna.clientes_unidades z WHERE z.cliente_id=cli.id)=1))
  ORDER BY a.inicio_operacional_planejado,a.id LIMIT 100
 ) q;
 RETURN jsonb_build_object('status','ok','itens',itens,'limite',100,'somente_leitura',true);
END $fn$;
REVOKE ALL ON FUNCTION public.mensageria_hml_agenda_comercial(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mensageria_hml_agenda_comercial(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.mensageria_hml_historico_mensagens(p_operador uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog' AS $fn$
DECLARE itens jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=p_operador AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=now()) AND u.raw_app_meta_data->>'role'='internal' AND u.raw_app_meta_data->>'whatsapp_admin'='true') THEN
  RETURN jsonb_build_object('status','nao_autorizado'); END IF;
 WITH convites AS (
  SELECT c.id,c.atendimento_id,c.empresa_id,c.unidade_id,c.meta_waba_id,c.meta_phone_number_id,c.meta_message_id,c.estado,c.criado_em,c.destinatario_e164,cli.nome tutor,pet.nome pet,c.chegada_snapshot compromisso
  FROM public.mensageria_hml_convites_confirmacao c
  JOIN mensageria_interna.acessos_unidades au ON au.usuario_id=p_operador AND au.empresa_id=c.empresa_id AND au.unidade_id=c.unidade_id
  JOIN public.atendimentos a ON a.id=c.atendimento_id JOIN public.pets pet ON pet.id=a.pet_id JOIN public.clientes cli ON cli.id=pet.cliente_id
 ), linhas AS (
  SELECT c.id,c.atendimento_id,c.tutor,c.pet,c.compromisso,c.criado_em,'convite'::text tipo,c.estado,c.meta_message_id,c.meta_waba_id,c.meta_phone_number_id,right(c.destinatario_e164,4) destino_final,NULL::text codigo,
   (SELECT p.resultado FROM public.mensageria_hml_convite_processamentos p WHERE p.convite_id=c.id ORDER BY p.criado_em DESC,p.id DESC LIMIT 1) resposta
  FROM convites c
  UNION ALL
  SELECT t.id,c.atendimento_id,c.tutor,c.pet,c.compromisso,t.reservado_em,'agradecimento'::text,t.estado,t.meta_message_id,c.meta_waba_id,c.meta_phone_number_id,right(c.destinatario_e164,4),t.codigo_resultado,NULL::text
  FROM public.mensageria_hml_respostas_tentativas t JOIN public.mensageria_hml_respostas_outbox o ON o.id=t.outbox_id JOIN convites c ON c.id=o.convite_id
  UNION ALL
  SELECT m.id,NULL::uuid,cli.nome,NULL::text,NULL::timestamptz,m.criado_em,'manual'::text,m.estado,m.meta_message_id,NULL::text,NULL::text,right(m.telefone,4),m.erro_codigo,NULL::text
  FROM public.whatsapp_hml_envios_manuais m JOIN public.clientes cli ON cli.id=m.cliente_id
  WHERE m.operador_id=p_operador AND EXISTS(SELECT 1 FROM mensageria_interna.clientes_unidades cu JOIN mensageria_interna.acessos_unidades au USING(empresa_id,unidade_id) WHERE cu.cliente_id=m.cliente_id AND au.usuario_id=p_operador)
 )
 SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.criado_em DESC,q.id DESC),'[]'::jsonb) INTO itens FROM (
 SELECT l.id,l.atendimento_id,l.tutor,l.pet,l.compromisso,l.criado_em,l.tipo,l.estado,l.destino_final,l.codigo,l.resposta,
    st.status_meta entrega,st.ocorrido_at entrega_em
 FROM linhas l LEFT JOIN LATERAL (
   SELECT i.status_meta,i.ocorrido_at FROM public.mensageria_webhook_itens_meta i JOIN public.mensageria_webhooks_meta w ON w.id=i.webhook_id
   WHERE i.tipo='status' AND i.mensagem_externa_id=l.meta_message_id AND w.assinatura_validada_at IS NOT NULL
     AND l.meta_waba_id IS NOT NULL AND i.meta_waba_id=l.meta_waba_id AND i.meta_phone_number_id=l.meta_phone_number_id
     AND i.status_meta IN ('sent','delivered','read','failed')
   ORDER BY i.ocorrido_at DESC NULLS LAST,i.created_at DESC,i.id DESC LIMIT 1
 ) st ON true ORDER BY l.criado_em DESC,l.id DESC LIMIT 50
 ) q;
 RETURN jsonb_build_object('status','ok','itens',itens,'limite',50,'somente_leitura',true);
END $fn$;
REVOKE ALL ON FUNCTION public.mensageria_hml_historico_mensagens(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mensageria_hml_historico_mensagens(uuid) TO service_role;
