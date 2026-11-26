CREATE OR REPLACE FUNCTION mensageria_interna.invocar_cron_lembrete_hml()
 RETURNS bigint
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE k text; token text; chamada uuid; req bigint;
BEGIN
 -- Fail closed if untrusted roles can inspect or tamper with the HTTP queue.
 IF EXISTS(SELECT 1 FROM (VALUES ('anon'),('authenticated')) AS roles(rol)
 WHERE has_schema_privilege(rol,'net','USAGE') AND
 (has_table_privilege(rol,'net.http_request_queue','SELECT') OR has_table_privilege(rol,'net.http_request_queue','INSERT') OR
 has_table_privilege(rol,'net.http_request_queue','UPDATE') OR has_table_privilege(rol,'net.http_request_queue','DELETE') OR
 has_table_privilege(rol,'net.http_request_queue','TRUNCATE'))) THEN
 RAISE EXCEPTION 'FILA_HTTP_INSEGURA';
 END IF;
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
END $function$
;
REVOKE ALL ON FUNCTION mensageria_interna.invocar_cron_lembrete_hml() FROM PUBLIC,anon,authenticated,service_role;