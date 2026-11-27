-- HML: permitir apenas as leituras exigidas pelo backend comercial.
DO $guard$ BEGIN
 IF (SELECT count(*) FROM public.clientes)<>3 OR (SELECT count(*) FROM public.pets)<>3 OR (SELECT count(*) FROM public.atendimentos)<>6 OR EXISTS(SELECT 1 FROM public.contratos) OR EXISTS(SELECT 1 FROM public.atendimento_recebimentos) THEN RAISE EXCEPTION 'HML_PRECONDICAO'; END IF;
 IF EXISTS(SELECT 1 FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN ('atendimento_esperas','atendimento_etapa_equipamento_supervisoes','atendimento_etapa_equipamentos','atendimento_etapa_funcionarios','atendimento_status_eventos','clientes','contrato_credito_eventos','pets') AND (NOT relrowsecurity OR has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE'))) THEN RAISE EXCEPTION 'HML_PROTECAO'; END IF;
 IF has_function_privilege('anon','public.alterar_status_atendimento_com_creditos(jsonb)','EXECUTE') OR has_function_privilege('authenticated','public.alterar_status_atendimento_com_creditos(jsonb)','EXECUTE') THEN RAISE EXCEPTION 'HML_RPC_EXPOSTA'; END IF;
END $guard$;
GRANT SELECT ON public.atendimento_esperas,public.atendimento_etapa_equipamento_supervisoes,public.atendimento_etapa_equipamentos,public.atendimento_etapa_funcionarios,public.atendimento_status_eventos,public.clientes,public.contrato_credito_eventos,public.pets TO service_role;
GRANT EXECUTE ON FUNCTION public.alterar_status_atendimento_com_creditos(jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
