-- Exclusivo HML: leitura inicial do cadastro operacional; sem dados reais ou escrita.
-- Precondicoes: ambiente HML verificado fora do SQL, tabelas existentes sem politicas.
DO $guard$
BEGIN
 IF to_regclass('public.raca_sinonimos') IS NOT NULL OR
 EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename IN ('clientes','pets','racas')) OR
 EXISTS (SELECT 1 FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN ('clientes','pets','racas') AND NOT relrowsecurity) THEN
   RAISE EXCEPTION 'HML_CADASTROS_PRECONDICAO_INVALIDA';
 END IF;
END $guard$;
CREATE TABLE public.raca_sinonimos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 raca_id uuid NOT NULL,
 especie text NOT NULL CHECK (especie IN ('cao','gato')),
 nome text NOT NULL CHECK (length(btrim(nome)) > 0),
 ativo boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT raca_sinonimos_raca_especie_fkey FOREIGN KEY (raca_id,especie) REFERENCES public.racas(id,especie) ON DELETE CASCADE
);
CREATE UNIQUE INDEX raca_sinonimos_especie_nome_uidx ON public.raca_sinonimos (especie,lower(btrim(nome)));
CREATE INDEX raca_sinonimos_raca_idx ON public.raca_sinonimos (raca_id,ativo);
ALTER TABLE public.raca_sinonimos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.raca_sinonimos FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.clientes,public.pets,public.racas,public.raca_sinonimos TO authenticated;
DO $pol$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['clientes','pets','racas','raca_sinonimos'] LOOP
  EXECUTE format('CREATE POLICY hml_cadastro_leitura_interna ON public.%I FOR SELECT TO authenticated USING ((SELECT auth.uid()) IS NOT NULL AND ((SELECT auth.jwt())->''app_metadata''->>''role'') = ''internal'')',t);
 END LOOP;
END $pol$;
NOTIFY pgrst, 'reload schema';
-- Rollback: revoke SELECT on four tables from authenticated; drop hml_cadastro_leitura_interna
-- policies; remove raca_sinonimos only after verifying it has no data or dependencies.
