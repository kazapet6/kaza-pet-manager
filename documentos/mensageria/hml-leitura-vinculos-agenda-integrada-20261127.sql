-- HML: a agenda consolidada consulta vínculos de créditos reaproveitados.
DO $guard$ BEGIN
 IF (SELECT count(*) FROM public.clientes)<>3 OR (SELECT count(*) FROM public.pets)<>3 OR (SELECT count(*) FROM public.atendimentos)<>6 OR EXISTS(SELECT 1 FROM public.contratos) THEN RAISE EXCEPTION 'HML_PRECONDICAO'; END IF;
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.contrato_credito_vinculos_044'::regclass) OR EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='contrato_credito_vinculos_044') OR has_table_privilege('anon','public.contrato_credito_vinculos_044','SELECT,INSERT,UPDATE,DELETE') OR has_table_privilege('authenticated','public.contrato_credito_vinculos_044','INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'HML_PROTECAO'; END IF;
END $guard$;
GRANT SELECT ON public.contrato_credito_vinculos_044 TO authenticated;
CREATE POLICY hml_vinculos_leitura_interna ON public.contrato_credito_vinculos_044 FOR SELECT TO authenticated USING ((SELECT auth.uid()) IS NOT NULL AND ((SELECT auth.jwt())->'app_metadata'->>'role')='internal');
NOTIFY pgrst,'reload schema';
