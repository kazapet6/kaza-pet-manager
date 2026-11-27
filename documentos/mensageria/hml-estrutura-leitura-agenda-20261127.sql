-- Exclusivo HML. Estrutura de leitura da agenda; sem dados reais, sem escrita pelo frontend.
DO $guard$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['funcionario_servicos','funcionario_etapas','funcionario_jornadas','funcionario_intervalos','servico_especies','servico_etapa_recursos','servico_portes','servico_racas_bloqueadas','taxidog_ciclo_dias'] LOOP IF to_regclass('public.'||t) IS NOT NULL THEN RAISE EXCEPTION 'HML_TABLE_EXISTS: %',t; END IF; END LOOP;
 FOREACH t IN ARRAY ARRAY['servico_etapas','servico_modificadores','servico_regras_preco','servico_dependencias','servico_acoplamentos','equipamento_perfis_capacidade','equipamento_perfil_itens','janelas_transporte','taxidog_ciclos'] LOOP IF NOT EXISTS(SELECT 1 FROM pg_class WHERE relnamespace='public'::regnamespace AND relname=t AND relrowsecurity) OR EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t) OR has_table_privilege('authenticated','public.'||t,'SELECT,INSERT,UPDATE,DELETE') OR has_table_privilege('anon','public.'||t,'SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'HML_PRECONDITION: %',t; END IF; END LOOP;
END $guard$;
CREATE TABLE public."funcionario_servicos"(
 "funcionario_id" uuid NOT NULL,
 "servico_id" uuid NOT NULL,
 "ativo" boolean NOT NULL DEFAULT true,
 CONSTRAINT "funcionario_servicos_servico_id_fkey" FOREIGN KEY (servico_id) REFERENCES public.servicos(id) ON DELETE CASCADE,
 CONSTRAINT "funcionario_servicos_funcionario_id_fkey" FOREIGN KEY (funcionario_id) REFERENCES public.funcionarios(id) ON DELETE CASCADE,
 CONSTRAINT "funcionario_servicos_pkey" PRIMARY KEY (funcionario_id, servico_id)
);
ALTER TABLE public."funcionario_servicos" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."funcionario_servicos" FROM PUBLIC,anon,authenticated;
CREATE TRIGGER "funcionario_servicos_incrementar_agenda_versao" AFTER INSERT OR DELETE OR UPDATE ON public."funcionario_servicos" FOR EACH STATEMENT EXECUTE FUNCTION public.incrementar_agenda_versao_configuracao();
CREATE TABLE public."funcionario_etapas"(
 "funcionario_id" uuid NOT NULL,
 "servico_etapa_id" uuid NOT NULL,
 "ativo" boolean NOT NULL DEFAULT true,
 CONSTRAINT "funcionario_etapas_funcionario_id_fkey" FOREIGN KEY (funcionario_id) REFERENCES public.funcionarios(id) ON DELETE CASCADE,
 CONSTRAINT "funcionario_etapas_servico_etapa_id_fkey" FOREIGN KEY (servico_etapa_id) REFERENCES public.servico_etapas(id) ON DELETE CASCADE,
 CONSTRAINT "funcionario_etapas_pkey" PRIMARY KEY (funcionario_id, servico_etapa_id)
);
ALTER TABLE public."funcionario_etapas" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."funcionario_etapas" FROM PUBLIC,anon,authenticated;
CREATE TRIGGER "funcionario_etapas_incrementar_agenda_versao" AFTER INSERT OR DELETE OR UPDATE ON public."funcionario_etapas" FOR EACH STATEMENT EXECUTE FUNCTION public.incrementar_agenda_versao_configuracao();
CREATE TABLE public."funcionario_jornadas"(
 "id" uuid NOT NULL DEFAULT gen_random_uuid(),
 "funcionario_id" uuid NOT NULL,
 "dia_semana" smallint NOT NULL,
 "inicio" time without time zone NOT NULL,
 "fim" time without time zone NOT NULL,
 "ativo" boolean NOT NULL DEFAULT true,
 CONSTRAINT "funcionario_jornadas_dia_semana_check" CHECK (((dia_semana >= 0) AND (dia_semana <= 6))),
 CONSTRAINT "funcionario_jornada_horario_check" CHECK ((fim > inicio)),
 CONSTRAINT "funcionario_jornadas_funcionario_id_fkey" FOREIGN KEY (funcionario_id) REFERENCES public.funcionarios(id) ON DELETE CASCADE,
 CONSTRAINT "funcionario_jornadas_pkey" PRIMARY KEY (id),
 CONSTRAINT "funcionario_jornadas_funcionario_id_dia_semana_key" UNIQUE (funcionario_id, dia_semana)
);
ALTER TABLE public."funcionario_jornadas" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."funcionario_jornadas" FROM PUBLIC,anon,authenticated;
CREATE TRIGGER "funcionario_jornadas_incrementar_agenda_versao" AFTER INSERT OR DELETE OR UPDATE ON public."funcionario_jornadas" FOR EACH STATEMENT EXECUTE FUNCTION public.incrementar_agenda_versao_configuracao();
CREATE TABLE public."funcionario_intervalos"(
 "id" uuid NOT NULL DEFAULT gen_random_uuid(),
 "funcionario_id" uuid NOT NULL,
 "dia_semana" smallint NOT NULL,
 "inicio" time without time zone NOT NULL,
 "fim" time without time zone NOT NULL,
 "descricao" text NOT NULL DEFAULT ''::text,
 "ativo" boolean NOT NULL DEFAULT true,
 CONSTRAINT "funcionario_intervalo_horario_check" CHECK ((fim > inicio)),
 CONSTRAINT "funcionario_intervalos_dia_semana_check" CHECK (((dia_semana >= 0) AND (dia_semana <= 6))),
 CONSTRAINT "funcionario_intervalos_funcionario_id_fkey" FOREIGN KEY (funcionario_id) REFERENCES public.funcionarios(id) ON DELETE CASCADE,
 CONSTRAINT "funcionario_intervalos_pkey" PRIMARY KEY (id)
);
ALTER TABLE public."funcionario_intervalos" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."funcionario_intervalos" FROM PUBLIC,anon,authenticated;
CREATE TRIGGER "funcionario_intervalos_incrementar_agenda_versao" AFTER INSERT OR DELETE OR UPDATE ON public."funcionario_intervalos" FOR EACH STATEMENT EXECUTE FUNCTION public.incrementar_agenda_versao_configuracao();
CREATE TABLE public."servico_especies"(
 "servico_id" uuid NOT NULL,
 "especie" text NOT NULL,
 "ativo" boolean NOT NULL DEFAULT true,
 CONSTRAINT "servico_especies_especie_check" CHECK ((especie = ANY (ARRAY['cao'::text, 'gato'::text]))),
 CONSTRAINT "servico_especies_servico_id_fkey" FOREIGN KEY (servico_id) REFERENCES public.servicos(id) ON DELETE CASCADE,
 CONSTRAINT "servico_especies_pkey" PRIMARY KEY (servico_id, especie)
);
ALTER TABLE public."servico_especies" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."servico_especies" FROM PUBLIC,anon,authenticated;
CREATE TRIGGER "servico_especies_incrementar_agenda_versao" AFTER INSERT OR DELETE OR UPDATE ON public."servico_especies" FOR EACH STATEMENT EXECUTE FUNCTION public.incrementar_agenda_versao_configuracao();
CREATE TABLE public."servico_etapa_recursos"(
 "id" uuid NOT NULL DEFAULT gen_random_uuid(),
 "servico_etapa_id" uuid NOT NULL,
 "tipo" text NOT NULL,
 "equipamento_id" uuid,
 "quantidade" integer NOT NULL DEFAULT 1,
 "ativo" boolean NOT NULL DEFAULT true,
 "created_at" timestamp with time zone NOT NULL DEFAULT now(),
 CONSTRAINT "servico_etapa_recurso_tipo_check" CHECK ((((tipo = 'funcionario'::text) AND (equipamento_id IS NULL)) OR ((tipo = 'equipamento'::text) AND (equipamento_id IS NOT NULL)))),
 CONSTRAINT "servico_etapa_recursos_quantidade_check" CHECK ((quantidade > 0)),
 CONSTRAINT "servico_etapa_recursos_tipo_check" CHECK ((tipo = ANY (ARRAY['funcionario'::text, 'equipamento'::text]))),
 CONSTRAINT "servico_etapa_recursos_equipamento_id_fkey" FOREIGN KEY (equipamento_id) REFERENCES public.equipamentos(id) ON DELETE RESTRICT,
 CONSTRAINT "servico_etapa_recursos_servico_etapa_id_fkey" FOREIGN KEY (servico_etapa_id) REFERENCES public.servico_etapas(id) ON DELETE CASCADE,
 CONSTRAINT "servico_etapa_recursos_pkey" PRIMARY KEY (id)
);
ALTER TABLE public."servico_etapa_recursos" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."servico_etapa_recursos" FROM PUBLIC,anon,authenticated;
CREATE TRIGGER "servico_etapa_recursos_incrementar_agenda_versao" AFTER INSERT OR DELETE OR UPDATE ON public."servico_etapa_recursos" FOR EACH STATEMENT EXECUTE FUNCTION public.incrementar_agenda_versao_configuracao();
CREATE TABLE public."servico_portes"(
 "servico_id" uuid NOT NULL,
 "porte" text NOT NULL,
 "ativo" boolean NOT NULL DEFAULT true,
 CONSTRAINT "servico_portes_porte_check" CHECK ((porte = ANY (ARRAY['mini'::text, 'pequeno'::text, 'medio'::text, 'grande'::text, 'gigante'::text]))),
 CONSTRAINT "servico_portes_servico_id_fkey" FOREIGN KEY (servico_id) REFERENCES public.servicos(id) ON DELETE CASCADE,
 CONSTRAINT "servico_portes_pkey" PRIMARY KEY (servico_id, porte)
);
ALTER TABLE public."servico_portes" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."servico_portes" FROM PUBLIC,anon,authenticated;
CREATE TRIGGER "servico_portes_incrementar_agenda_versao" AFTER INSERT OR DELETE OR UPDATE ON public."servico_portes" FOR EACH STATEMENT EXECUTE FUNCTION public.incrementar_agenda_versao_configuracao();
CREATE TABLE public."servico_racas_bloqueadas"(
 "servico_id" uuid NOT NULL,
 "raca_id" uuid NOT NULL,
 "ativo" boolean NOT NULL DEFAULT true,
 "created_at" timestamp with time zone NOT NULL DEFAULT now(),
 CONSTRAINT "servico_racas_bloqueadas_servico_id_fkey" FOREIGN KEY (servico_id) REFERENCES public.servicos(id) ON DELETE CASCADE,
 CONSTRAINT "servico_racas_bloqueadas_raca_id_fkey" FOREIGN KEY (raca_id) REFERENCES public.racas(id) ON DELETE RESTRICT,
 CONSTRAINT "servico_racas_bloqueadas_pkey" PRIMARY KEY (servico_id, raca_id)
);
ALTER TABLE public."servico_racas_bloqueadas" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."servico_racas_bloqueadas" FROM PUBLIC,anon,authenticated;
CREATE TRIGGER "servico_racas_bloqueadas_incrementar_agenda_versao" AFTER INSERT OR DELETE OR UPDATE ON public."servico_racas_bloqueadas" FOR EACH STATEMENT EXECUTE FUNCTION public.incrementar_agenda_versao_configuracao();
CREATE TABLE public."taxidog_ciclo_dias"(
 "ciclo_id" uuid NOT NULL,
 "dia_semana" smallint NOT NULL,
 "ativo" boolean NOT NULL DEFAULT true,
 CONSTRAINT "taxidog_ciclo_dias_dia_semana_check" CHECK (((dia_semana >= 0) AND (dia_semana <= 6))),
 CONSTRAINT "taxidog_ciclo_dias_ciclo_id_fkey" FOREIGN KEY (ciclo_id) REFERENCES public.taxidog_ciclos(id) ON DELETE CASCADE,
 CONSTRAINT "taxidog_ciclo_dias_pkey" PRIMARY KEY (ciclo_id, dia_semana)
);
ALTER TABLE public."taxidog_ciclo_dias" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."taxidog_ciclo_dias" FROM PUBLIC,anon,authenticated;
CREATE TRIGGER "taxidog_ciclo_dias_incrementar_agenda_versao" AFTER INSERT OR DELETE OR UPDATE ON public."taxidog_ciclo_dias" FOR EACH STATEMENT EXECUTE FUNCTION public.incrementar_agenda_versao_configuracao();
DO $pol$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['funcionario_servicos','funcionario_etapas','funcionario_jornadas','funcionario_intervalos','servico_especies','servico_etapa_recursos','servico_portes','servico_racas_bloqueadas','taxidog_ciclo_dias','servico_etapas','servico_modificadores','servico_regras_preco','servico_dependencias','servico_acoplamentos','equipamento_perfis_capacidade','equipamento_perfil_itens','janelas_transporte','taxidog_ciclos'] LOOP EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t); EXECUTE format('CREATE POLICY hml_estrutura_agenda_leitura_interna ON public.%I FOR SELECT TO authenticated USING ((SELECT auth.uid()) IS NOT NULL AND ((SELECT auth.jwt())->''app_metadata''->>''role'')=''internal'')',t); END LOOP; END $pol$;
NOTIFY pgrst,'reload schema';
-- A sincronizacao de habilidades e validacao de desativacao nao foram instaladas: escrita permanece bloqueada para authenticated.
