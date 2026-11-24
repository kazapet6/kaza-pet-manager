-- Somente PostgreSQL descartavel, sem dados reais e sem rede.
\set ON_ERROR_STOP on
begin;
do $$
begin
  if current_database() <> 'kaza_auditoria_sintetica' or
     to_regclass('public.mensageria_hml_respostas_tentativas') is not null or
     to_regnamespace('auth') is not null then
    raise exception 'BANCO NAO DESCARTAVEL';
  end if;
end $$;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (
 id uuid primary key, deleted_at timestamptz, banned_until timestamptz,
 raw_app_meta_data jsonb not null
);
create table public.mensageria_hml_respostas_outbox (
 id uuid primary key, evento_codigo text not null
);
create table public.mensageria_hml_respostas_tentativas (
 id uuid primary key, outbox_id uuid not null references public.mensageria_hml_respostas_outbox(id),
 estado text not null, meta_message_id text, reservado_em timestamptz not null,
 concluido_em timestamptz
);
create table public.mensageria_webhooks_meta (
 id uuid primary key, provedor text not null, classificacao text not null,
 assinatura_validada_at timestamptz, payload jsonb not null
);
create table public.mensageria_webhook_itens_meta (
 webhook_id uuid references public.mensageria_webhooks_meta(id),
 provedor text not null, mensagem_externa_id text not null, status_meta text not null
);
\ir hml_auditoria_triagem.sql

create temporary table resultados(cenario text primary key);
do $$
declare
 a uuid := '00000000-0000-4000-8000-000000000001';
 b uuid := '00000000-0000-4000-8000-000000000002';
 o uuid := gen_random_uuid();
 outro uuid := gen_random_uuid();
 t uuid := gen_random_uuid();
 t_outro uuid := gen_random_uuid();
 t_reserva uuid := gen_random_uuid();
 t_falhou uuid := gen_random_uuid();
 t_contrad uuid := gen_random_uuid();
 t_sent uuid := gen_random_uuid();
 w uuid;
 v_wamid text;
 v_status text;
 k uuid := gen_random_uuid();
 evento uuid;
 r jsonb;
 antes jsonb;
 depois jsonb;
 papel text;
 priv text;
begin
 insert into auth.users(id,raw_app_meta_data) values
 (a,'{"role":"internal","whatsapp_admin":true}'),
 (b,'{"role":"internal","whatsapp_admin":false}');
 insert into public.mensageria_hml_respostas_outbox values
 (o,'AGENDAMENTO_CONFIRMADO_WHATSAPP'),(outro,'OUTRO_EVENTO');
 insert into public.mensageria_hml_respostas_tentativas values
 (t,o,'aceito_meta','wamid.synthetic.main',now(),now()),
 (t_outro,outro,'indeterminado',null,now(),now()),
 (t_reserva,o,'reservado',null,now()-interval '10 minutes',null),
 (t_falhou,o,'aceito_meta','wamid.synthetic.failed',now(),now()),
 (t_contrad,o,'aceito_meta','wamid.synthetic.contrad',now(),now()),
 (t_sent,o,'aceito_meta','wamid.synthetic.sent',now()-interval '26 hours',now()-interval '25 hours');
 -- Mais de 20 casos anteriores para testar alvo fora da pagina.
 insert into public.mensageria_hml_respostas_tentativas
 select gen_random_uuid(),o,'indeterminado',null,now()-interval '2 days',now()
 from generate_series(1,25);
 for v_wamid,v_status in select * from (values
 ('wamid.synthetic.failed','failed'),('wamid.synthetic.contrad','failed'),
 ('wamid.synthetic.contrad','delivered'),('wamid.synthetic.sent','sent')
 ) as s(wamid,status) loop
  w:=gen_random_uuid();
  insert into public.mensageria_webhooks_meta values(w,'meta','processavel',now(),
    jsonb_build_object('object','whatsapp_business_account','entry',jsonb_build_array(
      jsonb_build_object('id','377176189908880','changes',jsonb_build_array(
        jsonb_build_object('field','messages','value',jsonb_build_object(
          'metadata',jsonb_build_object('phone_number_id','309132033809134'),
          'statuses',jsonb_build_array(jsonb_build_object('id',v_wamid,'status',v_status)))))))));
  insert into public.mensageria_webhook_itens_meta values(w,'meta',v_wamid,v_status);
 end loop;
 if (select count(distinct categoria) from mensageria_hml_auditoria_interna.classificar(null))<>6 then
  raise exception 'CLASSIFICACAO_INCOMPLETA';
 end if;
 insert into resultados values('01_seis_categorias');
 r:=public.mensageria_hml_outbox_casos_investigacao(a,20);
 if r->>'quantidade' is distinct from '20' or exists(select 1 from jsonb_array_elements(r->'casos') c where c->>'tentativa_id'=t::text) then raise exception 'LIMITE'; end if;
 insert into resultados values('02_listagem_limitada');
 select jsonb_build_array(
  (select jsonb_agg(to_jsonb(x) order by id) from public.mensageria_hml_respostas_tentativas x),
  (select jsonb_agg(to_jsonb(x) order by id) from public.mensageria_hml_respostas_outbox x),
  (select jsonb_agg(to_jsonb(x) order by id) from public.mensageria_webhooks_meta x),
  (select jsonb_agg(to_jsonb(x) order by webhook_id) from public.mensageria_webhook_itens_meta x)
 ) into antes;
 r:=public.mensageria_hml_registrar_decisao_auditoria(a,t,'aceite_sem_status','manter_em_investigacao','evidencia_insuficiente',k);
 if r->>'status' is distinct from 'registrado' or r->>'reenvio_automatico_autorizado' is distinct from 'false' or r ?| array['operador_id','wamid','telefone','texto','chave_idempotencia'] then raise exception 'REGISTRO'; end if;
 evento:=(r->>'evento_id')::uuid;
 if evento is null then raise exception 'EVENTO'; end if;
 insert into resultados values('03_registro_fora_da_pagina_sem_pii');
 r:=public.mensageria_hml_registrar_decisao_auditoria(a,t,'aceite_sem_status','manter_em_investigacao','evidencia_insuficiente',k);
 if r->>'status' is distinct from 'ja_registrado' or (r->>'evento_id')::uuid is distinct from evento then raise exception 'REPLAY'; end if;
 insert into resultados values('04_replay');
 r:=public.mensageria_hml_registrar_decisao_auditoria(a,t,'aceite_sem_status','solicitar_verificacao_externa','evidencia_insuficiente',k);
 if r->>'status' is distinct from 'conflito_idempotencia' then raise exception 'CONFLITO'; end if;
 insert into resultados values('05_conflito');
 r:=public.mensageria_hml_registrar_decisao_auditoria(a,t,'status_falhou','manter_em_investigacao','evidencia_insuficiente',gen_random_uuid());
 if r->>'status' is distinct from 'categoria_desatualizada' then raise exception 'CATEGORIA'; end if;
 insert into resultados values('06_categoria_desatualizada');
 foreach t_outro in array array[t_outro,gen_random_uuid()] loop
 r:=public.mensageria_hml_registrar_decisao_auditoria(a,t_outro,'resultado_indeterminado','manter_em_investigacao','evidencia_insuficiente',gen_random_uuid());
 if r->>'status' is distinct from 'caso_nao_elegivel' then raise exception 'ALVO_INVALIDO'; end if;
 end loop;
 insert into resultados values('07_outro_evento_e_inexistente');
 r:=public.mensageria_hml_registrar_decisao_auditoria(a,t,'aceite_sem_status','reenviar','evidencia_insuficiente',gen_random_uuid());
 if r->>'status' is distinct from 'entrada_invalida' then raise exception 'DECISAO_INVALIDA'; end if;
 r:=public.mensageria_hml_registrar_decisao_auditoria(a,t,'aceite_sem_status','manter_em_investigacao',null,gen_random_uuid());
 if r->>'status' is distinct from 'entrada_invalida' then raise exception 'MOTIVO_INVALIDO'; end if;
 insert into resultados values('08_entrada_invalida');
 r:=public.mensageria_hml_registrar_decisao_auditoria(b,t,'aceite_sem_status','manter_em_investigacao','evidencia_insuficiente',k);
 if r->>'status' is distinct from 'nao_autorizado' then raise exception 'NAO_ADMIN'; end if;
 r:=public.mensageria_hml_registrar_decisao_auditoria(null,t,'aceite_sem_status','manter_em_investigacao','evidencia_insuficiente',k);
 if r->>'status' is distinct from 'nao_autorizado' then raise exception 'ANONIMO'; end if;
 insert into resultados values('09_nao_admin_e_anonimo');
 update auth.users set banned_until=now()+interval '1 day' where id=a;
 r:=public.mensageria_hml_registrar_decisao_auditoria(a,t,'aceite_sem_status','manter_em_investigacao','evidencia_insuficiente',k);
 if r->>'status' is distinct from 'nao_autorizado' then raise exception 'BANIDO'; end if;
 update auth.users set banned_until=null,deleted_at=now() where id=a;
 r:=public.mensageria_hml_registrar_decisao_auditoria(a,t,'aceite_sem_status','manter_em_investigacao','evidencia_insuficiente',k);
 if r->>'status' is distinct from 'nao_autorizado' then raise exception 'DELETADO'; end if;
 update auth.users set deleted_at=null where id=a;
 insert into resultados values('10_banido_e_deletado');
 foreach papel in array array['anon','authenticated','service_role'] loop
 foreach priv in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE'] loop
  if has_table_privilege(papel,'mensageria_hml_auditoria_interna.decisoes',priv) then raise exception 'ACL_TABELA'; end if;
 end loop;
 if has_schema_privilege(papel,'mensageria_hml_auditoria_interna','USAGE') then raise exception 'ACL_SCHEMA'; end if;
 if has_function_privilege(papel,'public.mensageria_hml_registrar_decisao_auditoria(uuid,uuid,text,text,text,uuid)','EXECUTE') is distinct from (papel='service_role') then raise exception 'ACL_RPC'; end if;
 end loop;
 if not (select relrowsecurity from pg_class where oid='mensageria_hml_auditoria_interna.decisoes'::regclass) then raise exception 'RLS'; end if;
 insert into resultados values('11_acl_rls');
 r:=public.mensageria_hml_registrar_decisao_auditoria(a,t,'aceite_sem_status','registrar_revisao_sem_reenvio','revisao_realizada',gen_random_uuid());
 if r->>'status' is distinct from 'registrado' or (select count(*) from mensageria_hml_auditoria_interna.decisoes where tentativa_id=t)<>2 or not exists(select 1 from mensageria_hml_auditoria_interna.decisoes where id=evento and decisao='manter_em_investigacao') then raise exception 'APPEND_ONLY'; end if;
 insert into resultados values('12_nova_revisao');
 select jsonb_build_array(
  (select jsonb_agg(to_jsonb(x) order by id) from public.mensageria_hml_respostas_tentativas x),
  (select jsonb_agg(to_jsonb(x) order by id) from public.mensageria_hml_respostas_outbox x),
  (select jsonb_agg(to_jsonb(x) order by id) from public.mensageria_webhooks_meta x),
  (select jsonb_agg(to_jsonb(x) order by webhook_id) from public.mensageria_webhook_itens_meta x)
 ) into depois;
 if antes is distinct from depois or not exists(select 1 from mensageria_hml_auditoria_interna.classificar(t)) then raise exception 'MUTACAO_OPERACIONAL'; end if;
 insert into resultados values('13_sem_mutacao_ou_ocultacao');
 update public.mensageria_hml_respostas_tentativas set estado='reservado',reservado_em=now() where id=t;
 r:=public.mensageria_hml_registrar_decisao_auditoria(a,t,'aceite_sem_status','manter_em_investigacao','evidencia_insuficiente',k);
 if r->>'status' is distinct from 'ja_registrado' or (r->>'evento_id')::uuid is distinct from evento then raise exception 'REPLAY_HISTORICO'; end if;
 r:=public.mensageria_hml_registrar_decisao_auditoria(a,t,'aceite_sem_status','manter_em_investigacao','evidencia_insuficiente',gen_random_uuid());
 if r->>'status' is distinct from 'caso_nao_elegivel' then raise exception 'CASO_INATIVO'; end if;
 insert into resultados values('14_replay_historico_e_caso_inativo');
end $$;
select cenario,'PASS' as resultado from resultados order by cenario;
do $$ begin if (select count(*) from resultados)<>14 then raise exception 'CONTAGEM'; end if; end $$;
rollback;
do $$ begin
 if to_regnamespace('mensageria_hml_auditoria_interna') is not null or to_regnamespace('auth') is not null or to_regclass('public.mensageria_hml_respostas_tentativas') is not null then raise exception 'RESIDUO'; end if;
end $$;
select 'PASS_ROLLBACK_SINTETICO_14_CENARIOS' as resultado;
