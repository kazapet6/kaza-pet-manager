CREATE OR REPLACE FUNCTION public.mensageria_hml_processar_clique_operacao(p_item uuid, p_operador uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog' AS $function$
DECLARE v_aberto boolean; v_resultado jsonb; v_versoes uuid[]; v_preparo jsonb;
BEGIN
 SELECT processamento INTO v_aberto FROM mensageria_interna.whatsapp_hml_operacao WHERE singleton FOR SHARE;
 IF v_aberto IS DISTINCT FROM true THEN RETURN jsonb_build_object('status','desativado'); END IF;
 IF NOT EXISTS(
   SELECT 1 FROM public.mensageria_webhook_itens_meta i JOIN public.mensageria_webhooks_meta w ON w.id=i.webhook_id
   CROSS JOIN LATERAL jsonb_path_query(w.payload,
    '$.entry[*] ? (@.id == "1015974281467105").changes[*].value ? (@.metadata.phone_number_id == "1273206002548859").messages[*]') m
   WHERE i.id=p_item AND w.assinatura_validada_at IS NOT NULL AND i.tipo='mensagem_inbound'
     AND m->>'id'=i.mensagem_externa_id AND m->>'type' IN ('button','interactive')
 ) THEN RETURN jsonb_build_object('status','ignorado'); END IF;
 v_resultado:=public.mensageria_hml_processar_confirmacao(p_item,p_operador);
 IF v_resultado->>'status'='confirmado' THEN
   BEGIN
     SELECT array_agg(v.id) INTO v_versoes
     FROM public.mensageria_modelo_versoes v JOIN public.mensageria_modelos mo ON mo.id=v.modelo_id
     WHERE v.estado='publicada' AND mo.ativo AND mo.codigo='AGENDAMENTO_CONFIRMADO_WHATSAPP'
       AND mo.contexto='agenda' AND length(btrim(v.texto))>0;
     IF cardinality(v_versoes)=1 THEN
       v_preparo:=public.mensageria_hml_outbox_preparar((v_resultado->>'outboxId')::uuid,v_versoes[1],p_operador);
       v_resultado:=v_resultado||jsonb_build_object('preparo_outbox',v_preparo->>'status');
     ELSE
       v_resultado:=v_resultado||jsonb_build_object('preparo_outbox','modelo_ausente_ou_ambiguo');
     END IF;
   EXCEPTION WHEN OTHERS THEN
     v_resultado:=v_resultado||jsonb_build_object('preparo_outbox','falha_preparo');
   END;
 END IF;
 RETURN v_resultado;
END $function$;
REVOKE EXECUTE ON FUNCTION public.mensageria_hml_processar_clique_operacao(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mensageria_hml_processar_clique_operacao(uuid,uuid) TO service_role;