-- Exclusivo HML: leitura da agenda diaria, sem escrita direta ou alteracao dos dados.
DO $guard$
DECLARE t text; obj oid;
BEGIN
 FOREACH t IN ARRAY ARRAY['grupos_agendamento','atendimentos','atendimento_servicos','atendimento_etapas','atendimento_esperas','contrato_ciclo_ocorrencias','contrato_ciclos','contratos','contrato_ciclo_ocorrencia_itens','contrato_itens','atendimento_etapa_funcionarios','atendimento_etapa_equipamentos','funcionarios','equipamento_unidades','equipamentos'] LOOP
  SELECT c.oid INTO obj FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relname=t AND c.relkind='r' AND c.relrowsecurity;
  IF obj IS NULL OR EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t)
  OR has_table_privilege('anon',obj,'SELECT,INSERT,UPDATE,DELETE')
  OR has_table_privilege('authenticated',obj,'SELECT,INSERT,UPDATE,DELETE')
  THEN RAISE EXCEPTION 'HML_PRECONDICAO_AGENDA: %',t; END IF;
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
  EXECUTE format('CREATE POLICY hml_agenda_diaria_leitura_interna ON public.%I FOR SELECT TO authenticated USING ((SELECT auth.uid()) IS NOT NULL AND ((SELECT auth.jwt())->''app_metadata''->>''role'') = ''internal'')',t);
 END LOOP;
END $guard$;
NOTIFY pgrst,'reload schema';
-- Rollback: drop only hml_agenda_diaria_leitura_interna and revoke SELECT on these 15 tables.
