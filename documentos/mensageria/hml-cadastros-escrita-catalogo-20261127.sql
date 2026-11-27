-- Exclusivo HML. Nenhuma escrita nos registros existentes.
DO $guard$
BEGIN
 IF (SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN ('clientes','pets','servicos') AND relrowsecurity) <> 3
 OR EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename IN ('clientes','pets','servicos') AND policyname <> 'hml_cadastro_leitura_interna')
 OR EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='servicos' AND column_name IN ('procedimento_incluso_em_servico_id','exige_credito_de_servico_id','procedimentos_inclusos','procedimento_avulso_codigo'))
 THEN RAISE EXCEPTION 'HML_PRECONDICAO_CADASTROS_INVALIDA'; END IF;
END $guard$;
GRANT INSERT, UPDATE ON public.clientes, public.pets TO authenticated;
GRANT USAGE ON SEQUENCE public.clientes_codigo_seq, public.pets_codigo_seq TO authenticated;
DO $pol$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['clientes','pets'] LOOP
  EXECUTE format('CREATE POLICY hml_cadastro_insert_interno ON public.%I FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) IS NOT NULL AND ((SELECT auth.jwt())->''app_metadata''->>''role'') = ''internal'')',t);
  EXECUTE format('CREATE POLICY hml_cadastro_update_interno ON public.%I FOR UPDATE TO authenticated USING ((SELECT auth.uid()) IS NOT NULL AND ((SELECT auth.jwt())->''app_metadata''->>''role'') = ''internal'') WITH CHECK ((SELECT auth.uid()) IS NOT NULL AND ((SELECT auth.jwt())->''app_metadata''->>''role'') = ''internal'')',t);
 END LOOP;
END $pol$;
ALTER TABLE public.servicos
 ADD COLUMN procedimento_incluso_em_servico_id uuid,
 ADD COLUMN exige_credito_de_servico_id uuid,
 ADD COLUMN procedimentos_inclusos text[] NOT NULL DEFAULT '{}',
 ADD COLUMN procedimento_avulso_codigo text,
 ADD CONSTRAINT servicos_procedimento_incluso_em_servico_id_fkey FOREIGN KEY (procedimento_incluso_em_servico_id) REFERENCES public.servicos(id) ON DELETE RESTRICT,
 ADD CONSTRAINT servicos_exige_credito_de_servico_id_fkey FOREIGN KEY (exige_credito_de_servico_id) REFERENCES public.servicos(id) ON DELETE RESTRICT,
 ADD CONSTRAINT servico_credito_distinto CHECK (exige_credito_de_servico_id <> id),
 ADD CONSTRAINT servico_procedimento_incluso_distinto CHECK (procedimento_incluso_em_servico_id <> id),
 ADD CONSTRAINT servicos_procedimentos_inclusos_057 CHECK (array_position(procedimentos_inclusos,NULL::text) IS NULL AND procedimentos_inclusos <@ ARRAY['tosa_higienica','limpeza_ouvidos','corte_unhas']::text[]),
 ADD CONSTRAINT servicos_procedimento_avulso_057 CHECK (procedimento_avulso_codigo IS NULL OR (procedimento_avulso_codigo = ANY(ARRAY['tosa_higienica','limpeza_ouvidos','corte_unhas']::text[]) AND NOT (procedimento_avulso_codigo = ANY(procedimentos_inclusos))));
GRANT SELECT ON public.servicos TO authenticated;
CREATE POLICY hml_servicos_leitura_interna ON public.servicos FOR SELECT TO authenticated USING ((SELECT auth.uid()) IS NOT NULL AND ((SELECT auth.jwt())->'app_metadata'->>'role')='internal');
NOTIFY pgrst, 'reload schema';
-- Rollback: revoke new grants, drop the three policy types created here.
-- Remove added columns only after verifying absence of dependent objects/data.
