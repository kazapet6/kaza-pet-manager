-- Exclusivo HML: configurações comerciais não pessoais; sem agendamentos reais.
DO $guard$ BEGIN
 IF to_regclass('public.configuracao_agenda') IS NOT NULL OR to_regclass('public.estabelecimento_blocos') IS NOT NULL OR to_regclass('public.estabelecimento_excecoes') IS NOT NULL OR to_regclass('public.estabelecimento_excecao_blocos') IS NOT NULL
 OR (SELECT count(*) FROM public.agenda_versao_configuracao WHERE id) <> 1
 OR EXISTS (SELECT 1 FROM public.unidades_periodo)
 OR EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename IN ('agenda_versao_configuracao','agenda_versao_ocupacao','unidades_periodo'))
 THEN RAISE EXCEPTION 'HML_AGENDA_PRECONDICAO_INVALIDA'; END IF;
END $guard$;
CREATE TABLE public.configuracao_agenda(
 id boolean PRIMARY KEY DEFAULT true CHECK(id),
 timezone text NOT NULL DEFAULT 'America/Sao_Paulo' CHECK(length(btrim(timezone))>0),
 granularidade_minutos integer NOT NULL DEFAULT 5 CHECK(granularidade_minutos BETWEEN 1 AND 60),
 horizonte_dias integer NOT NULL DEFAULT 90 CHECK(horizonte_dias>0),
 antecedencia_minutos integer NOT NULL DEFAULT 0 CHECK(antecedencia_minutos>=0),
 espera_encaixe_minutos integer NOT NULL DEFAULT 15 CHECK(espera_encaixe_minutos>=0),
 espera_pos_secagem_minutos integer NOT NULL DEFAULT 60 CHECK(espera_pos_secagem_minutos>=0),
 concluir_no_mesmo_bloco boolean NOT NULL DEFAULT true,
 encaixe_interno_ativo boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 espera_normal_minutos integer NOT NULL DEFAULT 15 CHECK(espera_normal_minutos>=0)
);
CREATE TABLE public.estabelecimento_blocos(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 dia_semana smallint NOT NULL CHECK(dia_semana BETWEEN 0 AND 6),
 inicio time NOT NULL, fim time NOT NULL,
 ativo boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT estabelecimento_bloco_horario_check CHECK(fim>inicio), UNIQUE(dia_semana,inicio,fim)
);
CREATE INDEX estabelecimento_blocos_dia_idx ON public.estabelecimento_blocos(dia_semana,ativo,inicio,fim);
CREATE TABLE public.estabelecimento_excecoes(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), data date NOT NULL UNIQUE,
 fechado boolean NOT NULL DEFAULT true, descricao text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX estabelecimento_excecoes_data_idx ON public.estabelecimento_excecoes(data);
CREATE TABLE public.estabelecimento_excecao_blocos(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), excecao_id uuid NOT NULL REFERENCES public.estabelecimento_excecoes(id) ON DELETE CASCADE,
 inicio time NOT NULL, fim time NOT NULL,
 CONSTRAINT estabelecimento_excecao_bloco_horario_check CHECK(fim>inicio), UNIQUE(excecao_id,inicio,fim)
);
DO $pol$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['configuracao_agenda','estabelecimento_blocos','estabelecimento_excecoes','estabelecimento_excecao_blocos','agenda_versao_configuracao','agenda_versao_ocupacao','unidades_periodo'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
 EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
 EXECUTE format('CREATE POLICY hml_agenda_leitura_interna ON public.%I FOR SELECT TO authenticated USING ((SELECT auth.uid()) IS NOT NULL AND ((SELECT auth.jwt())->''app_metadata''->>''role'') = ''internal'')',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['configuracao_agenda','estabelecimento_blocos','estabelecimento_excecoes','estabelecimento_excecao_blocos'] LOOP
 EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR DELETE OR UPDATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.incrementar_agenda_versao_configuracao()',t||'_incrementar_agenda_versao',t);
 END LOOP;
END $pol$;
CREATE TRIGGER configuracao_agenda_updated_at BEFORE UPDATE ON public.configuracao_agenda FOR EACH ROW EXECUTE FUNCTION public.atualizar_updated_at();
INSERT INTO public.configuracao_agenda(id) VALUES (true);
INSERT INTO public.estabelecimento_blocos(dia_semana,inicio,fim) SELECT d,'09:00'::time,'18:00'::time FROM generate_series(2,6) d;
INSERT INTO public.unidades_periodo(codigo,nome,natureza,ordem,ativo) VALUES ('dia','Dia','duracao_exata',1,true),('semana','Semana','duracao_exata',2,true),('mes','Mes','calendario',3,true),('ano','Ano','calendario',4,true);
NOTIFY pgrst,'reload schema';
