CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE TABLE mensageria_interna.lembrete_hml_chamadas_cron (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 token_hash bytea NOT NULL UNIQUE,
 criado_em timestamptz NOT NULL DEFAULT clock_timestamp(),
 expira_em timestamptz NOT NULL,
 consumido_em timestamptz,
 request_id bigint UNIQUE
);
ALTER TABLE mensageria_interna.lembrete_hml_chamadas_cron ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON mensageria_interna.lembrete_hml_chamadas_cron FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON net.http_request_queue FROM PUBLIC,anon,authenticated;
REVOKE ALL ON vault.decrypted_secrets FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.mensageria_hml_autenticar_cron_lembrete(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog' AS $$
BEGIN
 IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' THEN RETURN jsonb_build_object('status','negado'); END IF;
 UPDATE mensageria_interna.lembrete_hml_chamadas_cron SET consumido_em=clock_timestamp()
 WHERE token_hash=sha256(convert_to(p_token,'UTF8')) AND consumido_em IS NULL AND expira_em>clock_timestamp();
 RETURN jsonb_build_object('status',CASE WHEN FOUND THEN 'ok' ELSE 'negado' END);
END $$;
REVOKE ALL ON FUNCTION public.mensageria_hml_autenticar_cron_lembrete(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mensageria_hml_autenticar_cron_lembrete(text) TO service_role;
CREATE FUNCTION mensageria_interna.invocar_cron_lembrete_hml()
RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'pg_catalog' AS $$
DECLARE k text; token text; chamada uuid; req bigint;
BEGIN
 IF NOT pg_try_advisory_xact_lock(hashtextextended('hml:cron:lembrete:http',0)) THEN RETURN NULL; END IF;
 SELECT decrypted_secret INTO STRICT k FROM vault.decrypted_secrets WHERE name='hml_lembretes_anon_jwt';
 IF k IS NULL OR k !~ '^eyJ[A-Za-z0-9_.-]+$' THEN RAISE EXCEPTION 'JWT público HML indisponível'; END IF;
 DELETE FROM mensageria_interna.lembrete_hml_chamadas_cron WHERE criado_em<clock_timestamp()-interval '7 days';
 token:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
 INSERT INTO mensageria_interna.lembrete_hml_chamadas_cron(token_hash,expira_em)
 VALUES(sha256(convert_to(token,'UTF8')),clock_timestamp()+interval '60 seconds') RETURNING id INTO chamada;
 SELECT net.http_post(url:='https://jgtctzqieyorhvqxjbpk.supabase.co/functions/v1/mensageria-lembretes-hml',
 body:='{}'::jsonb,headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||k,'x-hml-cron-token',token),timeout_milliseconds:=55000) INTO req;
 UPDATE mensageria_interna.lembrete_hml_chamadas_cron SET request_id=req WHERE id=chamada;
 RETURN req;
END $$;
REVOKE ALL ON FUNCTION mensageria_interna.invocar_cron_lembrete_hml() FROM PUBLIC,anon,authenticated,service_role;