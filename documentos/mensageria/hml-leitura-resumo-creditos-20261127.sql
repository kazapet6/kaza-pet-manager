-- HML: resumo invoker precisa executar seus três predicados internos.
DO $guard$ BEGIN
 IF (SELECT count(*) FROM public.clientes)<>3 OR (SELECT count(*) FROM public.pets)<>3 OR (SELECT count(*) FROM public.contratos)<>1 OR (SELECT count(*) FROM public.contrato_ciclos)<>1 OR (SELECT count(*) FROM public.atendimentos)<>11 THEN RAISE EXCEPTION 'HML_PRECONDICAO'; END IF;
 IF (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('ciclo_comercial_concluido_043','ciclo_comercial_base_043_044','ciclo_comercial_reaproveitado_044') AND NOT prosecdef AND NOT has_function_privilege('anon',oid,'execute') AND NOT has_function_privilege('authenticated',oid,'execute'))<>3 THEN RAISE EXCEPTION 'HML_RPC_PROTECAO'; END IF;
END $guard$;
GRANT EXECUTE ON FUNCTION public.ciclo_comercial_concluido_043(uuid),public.ciclo_comercial_base_043_044(uuid),public.ciclo_comercial_reaproveitado_044(uuid) TO service_role;
NOTIFY pgrst,'reload schema';
