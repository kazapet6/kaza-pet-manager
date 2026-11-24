-- CANDIDATO: executar SOMENTE em clone HML descartavel, apos instalar o candidato SQL.
-- Derivado da fixture de 31 cenarios de triagem; nao testa concorrencia em duas sessoes.
-- A fixture altera temporariamente a conta administrativa do clone para testar autorizacao.
-- SOMENTE HML / SQL sintético com assinatura MARCADA como validada, NÃO é teste HMAC.
-- Deve ser executado APÓS instalar a função listar_cliques_pendentes.
-- BEGIN/ROLLBACK: não deixa pets, agendamentos, convites, webhooks ou respostas.
\set ON_ERROR_STOP on
begin;
-- Segunda barreira: o executor deve provar isolamento Docker antes de rodar.
-- Nunca executar esta fixture em HML remota, mesmo com ROLLBACK.
do $guard$
begin
 if current_database() is distinct from 'kaza_hml_auditoria_integracao' then
   raise exception 'BANCO_INCORRETO_PARA_FIXTURE';
 end if;
end $guard$;
create temporary table hml_resultados_selector (
 cenario text primary key, resultado text not null check (resultado='PASS'));

do $teste$
declare
 v_admin uuid := '00000000-0000-4000-8000-000000001171';
 v_empresa uuid := '9fe00000-0000-4000-8000-000000000001';
 v_unidade uuid := '9fc00000-0000-4000-8000-000000000001';
 v_grupo uuid;
 v_atendimento uuid;
 v_chave uuid := gen_random_uuid();
 v_token text := 'KPAG1_'||gen_random_uuid()::text;
 v_hash text;
 v_inicio timestamptz := date_trunc('day',now())+interval '4 days 9 hours';
 v_numero text;
 v_wamid text := 'wamid.hml.selector.'||gen_random_uuid()::text;
 v_retorno jsonb;
 v_lista jsonb;
 v_item_valido uuid;
 v_id_externo text;
 v_payload jsonb;
 v_wh uuid;
 v_item uuid;
 v_variante text;
 v_tipo text;
 v_status text;
 v_modelo uuid;
 v_versao uuid;
 v_outbox uuid;
 v_chave_tentativa uuid := gen_random_uuid();
 v_tentativa uuid;
 v_aud_chave uuid := gen_random_uuid();
 v_aud_evento uuid;
 v_antes jsonb;
 v_depois jsonb;
 v_papel text;
 v_priv text;
 v_role_antes jsonb;
 v_ban_antes timestamptz;
 v_deleted_antes timestamptz;
begin
 if not exists(select 1 from auth.users
   where id=v_admin and raw_app_meta_data->>'whatsapp_admin'='true'
   and raw_app_meta_data->>'role'='internal' and deleted_at is null
   and (banned_until is null or banned_until<=now())) then
   raise exception 'ADMIN_SINTETICO_AUSENTE';
 end if;
 select regexp_replace(whatsapp,'[^0-9]','','g') into v_numero
 from public.clientes where id='CLI-990003';
 if v_numero is null or length(v_numero) is distinct from 13 then
   raise exception 'DADOS_HML_INSUFICIENTES';
 end if;
 v_hash:=encode(sha256(convert_to(v_token,'UTF8')),'hex');

 insert into mensageria_interna.clientes_empresas(cliente_id,empresa_id)
 values('CLI-990003',v_empresa) on conflict do nothing;
 insert into mensageria_interna.clientes_unidades(cliente_id,empresa_id,unidade_id)
 values('CLI-990003',v_empresa,v_unidade) on conflict do nothing;
 insert into public.pets(id,cliente_id,nome,especie,porte)
 values('PET-990017','CLI-990003','Pet teste seletor HML','cao','pequeno');
 insert into public.grupos_agendamento(cliente_id,data_operacional,horario_chegada_comprometido)
 values('CLI-990003',v_inicio::date,v_inicio) returning id into v_grupo;
 insert into public.atendimentos(pet_id,servico_id,grupo_agendamento_id,inicio_planejado)
 values('PET-990017','9fa00000-0000-4000-8000-000000000002',v_grupo,v_inicio)
 returning id into v_atendimento;
 insert into mensageria_interna.agenda_grupos(grupo_id,cliente_id,empresa_id,unidade_id)
 values(v_grupo,'CLI-990003',v_empresa,v_unidade);

 v_retorno:=public.mensageria_hml_preparar_convite(
   v_atendimento,v_admin,v_chave,v_hash,repeat('b',64));
 if (v_retorno->'status') is distinct from to_jsonb('preparado'::text) then raise exception 'NAO_PREPAROU %',v_retorno; end if;
 v_retorno:=public.mensageria_hml_vincular_convite_aceito(v_chave,v_wamid,v_admin);
 if (v_retorno->'status') is distinct from to_jsonb('vinculado'::text) then raise exception 'NAO_VINCULOU %',v_retorno; end if;

 for v_variante in select unnest(array['valido','token_invalido','remetente_errado']) loop
   v_id_externo:='wamid.hml.selector-click.'||gen_random_uuid()::text;
   v_payload:=jsonb_build_object('object','whatsapp_business_account',
      'entry',jsonb_build_array(jsonb_build_object(
      'id','377176189908880',
      'changes',jsonb_build_array(jsonb_build_object('field','messages',
        'value',jsonb_build_object(
          'metadata',jsonb_build_object('phone_number_id','309132033809134'),
          'messages',jsonb_build_array(jsonb_build_object(
            'id',v_id_externo,
            'type','button',
            'from',case when v_variante='remetente_errado' then '5599999999999' else v_numero end,
            'context',jsonb_build_object('id',v_wamid),
            'button',jsonb_build_object(
              'payload',case when v_variante='token_invalido' then 'KPAG1_'||gen_random_uuid()::text else v_token end,
              'text','Confirmar')
          ))
        )
      )))));
   insert into public.mensageria_webhooks_meta(
      payload_sha256,payload,classificacao,assinatura_validada_at,
      primeiro_recebimento_at,ultimo_recebimento_at,payload_expires_at,created_at,updated_at)
   values(encode(sha256(convert_to(v_payload::text,'UTF8')),'hex'),
      v_payload,'processavel',now(),now(),now(),now()+interval '30 days',now(),now())
   returning id into v_wh;
   insert into public.mensageria_webhook_itens_meta(
      webhook_id,dedupe_key,tipo,mensagem_externa_id,tipo_mensagem,created_at,updated_at)
   values(v_wh,'message:'||v_id_externo,'mensagem_inbound',v_id_externo,'button',now(),now())
   returning id into v_item;
   if v_variante='valido' then v_item_valido:=v_item; end if;
 end loop;
 v_lista:=public.mensageria_hml_listar_cliques_pendentes(v_admin,10);
 if (v_lista->'status') is distinct from to_jsonb('ok'::text) or jsonb_typeof(v_lista->'itens') is distinct from 'array' or jsonb_array_length(v_lista->'itens') is distinct from 1
     or (v_lista->'itens'->0) is distinct from to_jsonb(v_item_valido) then
   raise exception 'FILA_INCORRETA %',v_lista;
 end if;
 insert into hml_resultados_selector values('um_unico_clique_assinado_e_vinculado','PASS');

 v_retorno:=public.mensageria_hml_processar_confirmacao(v_item_valido,v_admin);
 if (v_retorno->'status') is distinct from to_jsonb('confirmado'::text) then
   raise exception 'CONFIRMACAO_INCORRETA %',v_retorno;
 end if;
 select status into v_status from public.atendimentos where id=v_atendimento;
 if v_status is distinct from 'confirmado' then raise exception 'AGENDA_NAO_CONFIRMADA'; end if;
 insert into hml_resultados_selector values('agendamento_confirmado','PASS');

 v_lista:=public.mensageria_hml_listar_cliques_pendentes(v_admin,10);
 if (v_lista->'status') is distinct from to_jsonb('ok'::text) or jsonb_typeof(v_lista->'itens') is distinct from 'array' or jsonb_array_length(v_lista->'itens') is distinct from 0 then
   raise exception 'CLIQUES_REPETIDOS_NA_FILA %',v_lista;
 end if;
 insert into hml_resultados_selector values('remover_clique_ja_processado','PASS');

 if (select count(*) from public.mensageria_hml_respostas_outbox where atendimento_id=v_atendimento) is distinct from 1 then
   raise exception 'AGRADECIMENTO_DUPLICADO';
 end if;
 insert into hml_resultados_selector values('agradecimento_unico_pendente','PASS');

 -- Verifica que outbox não pode ser enviada só por ter sido criada.
 select id into v_outbox from public.mensageria_hml_respostas_outbox
 where atendimento_id=v_atendimento;
 v_retorno:=public.mensageria_hml_outbox_reservar(v_outbox,v_chave_tentativa,v_admin);
 if (v_retorno->'status') is distinct from to_jsonb('nao_pronto'::text) then raise exception 'ENVIO_PREMATURO %',v_retorno; end if;
 insert into hml_resultados_selector values('bloqueio_sem_modelo_publicado','PASS');

 insert into public.mensageria_modelos(codigo,nome,contexto,ativo)
 values('AGENDAMENTO_CONFIRMADO_WHATSAPP','Agradecimento pós-confirmação HML','agenda',true)
 returning id into v_modelo;
 insert into public.mensageria_modelo_versoes(modelo_id,numero,estado,texto,criado_por)
 values(v_modelo,1,'rascunho_personalizado',
   'Obrigado {{NOME_TUTOR}}! Confirmamos {{NOME_PET}} para {{DATA_AGENDAMENTO}} às {{HORARIO_AGENDAMENTO}}. {{NOME_EMPRESA}}',
   v_admin) returning id into v_versao;

 v_retorno:=public.mensageria_hml_outbox_preparar(v_outbox,v_versao,v_admin);
 if (v_retorno->'status') is distinct from to_jsonb('modelo_nao_publicado'::text) then raise exception 'RASCUNHO_ACEITO %',v_retorno; end if;
 insert into hml_resultados_selector values('rascunho_nao_habilita_envio','PASS');

 update public.mensageria_modelo_versoes set estado='publicada' where id=v_versao;
 v_retorno:=public.mensageria_hml_outbox_preparar(v_outbox,v_versao,v_admin);
 if (v_retorno->'status') is distinct from to_jsonb('pronto'::text) then raise exception 'PREPARO_OUTBOX %',v_retorno; end if;
 insert into hml_resultados_selector values('vinculo_modelo_publicado','PASS');
 v_retorno:=public.mensageria_hml_outbox_preparar(v_outbox,v_versao,v_admin);
 if (v_retorno->'status') is distinct from to_jsonb('ja_preparado'::text) then raise exception 'PREPARO_DUPLICADO %',v_retorno; end if;
 insert into hml_resultados_selector values('preparo_idempotente','PASS');

 v_retorno:=public.mensageria_hml_outbox_reservar(v_outbox,v_chave_tentativa,gen_random_uuid());
 if (v_retorno->'status') is distinct from to_jsonb('rejeitado'::text) then raise exception 'OPERADOR_NAO_AUTORIZADO %',v_retorno; end if;
 insert into hml_resultados_selector values('reserva_admin_obrigatoria','PASS');

 v_retorno:=public.mensageria_hml_outbox_reservar(v_outbox,v_chave_tentativa,v_admin);
 if (v_retorno->'status') is distinct from to_jsonb('reservado'::text) then raise exception 'RESERVA_OUTBOX %',v_retorno; end if;
 v_tentativa:=(v_retorno->>'tentativa_id')::uuid;
 if jsonb_typeof(v_retorno->'tentativa_id') is distinct from 'string' or v_tentativa is null then raise exception 'TENTATIVA_ID_INVALIDO'; end if;
 insert into hml_resultados_selector values('reserva_unica','PASS');
 v_retorno:=public.mensageria_hml_outbox_reservar(v_outbox,v_chave_tentativa,v_admin);
 if (v_retorno->'status') is distinct from to_jsonb('ja_reservado'::text) then raise exception 'RESERVA_DUPLICADA %',v_retorno; end if;
 v_retorno:=public.mensageria_hml_outbox_reservar(v_outbox,gen_random_uuid(),v_admin);
 if (v_retorno->'status') is distinct from to_jsonb('ja_reservado'::text) then raise exception 'REPOST_OUTBOX %',v_retorno; end if;
 insert into hml_resultados_selector values('deduplicacao_reenvio','PASS');

 v_retorno:=public.mensageria_hml_outbox_finalizar(
   v_outbox,v_chave_tentativa,v_admin,'aceito_meta','invalido',null);
 if (v_retorno->'status') is distinct from to_jsonb('aceite_invalido'::text) then raise exception 'WAMID_INVALIDO_NAO_REJEITADO %',v_retorno; end if;
 insert into hml_resultados_selector values('wamid_invalido_bloqueado','PASS');

 v_retorno:=public.mensageria_hml_outbox_finalizar(
   v_outbox,v_chave_tentativa,v_admin,'aceito_meta','wamid.hml.agradecimento-12345',null);
 if (v_retorno->'status') is distinct from to_jsonb('aceito_meta'::text) then raise exception 'ACEITE_NAO_REGISTRADO %',v_retorno; end if;
 insert into hml_resultados_selector values('aceite_meta_auditado','PASS');
 v_retorno:=public.mensageria_hml_outbox_finalizar(
   v_outbox,v_chave_tentativa,v_admin,'aceito_meta','wamid.hml.agradecimento-12345',null);
 if (v_retorno->'status') is distinct from to_jsonb('ja_registrado'::text) then raise exception 'ACEITE_DUPLICADO %',v_retorno; end if;
 insert into hml_resultados_selector values('aceite_idempotente','PASS');

 v_retorno:=public.mensageria_hml_outbox_finalizar(
   v_outbox,v_chave_tentativa,v_admin,'indeterminado',null,'META_TIMEOUT');
 if (v_retorno->'status') is distinct from to_jsonb('resultado_ja_fechado'::text) then raise exception 'REENVIO_NAO_BLOQUEADO %',v_retorno; end if;
 insert into hml_resultados_selector values('nao_reabrir_envio','PASS');

 if (select count(*) from public.mensageria_hml_respostas_tentativas where outbox_id=v_outbox) is distinct from 1
   or not exists(select 1 from public.mensageria_hml_respostas_outbox o
     where o.id=v_outbox and o.estado='aceito_meta' and o.modelo_versao_id=v_versao) then
   raise exception 'AUDITORIA_INCONSISTENTE';
 end if;
 insert into hml_resultados_selector values('auditoria_duravel_uma_tentativa','PASS');


 -- RECONCILIACAO: status aceito sem webhook NÃO prova entrega.
 v_retorno:=public.mensageria_hml_outbox_diagnosticar_reconciliacao(v_admin);
 if (v_retorno->'status') is distinct from to_jsonb('ok'::text) or (v_retorno->'aceitas') is distinct from '1'::jsonb
   or (v_retorno->'aceitas_sem_status') is distinct from '1'::jsonb
   or (v_retorno->'reenvio_automatico_autorizado') is distinct from 'false'::jsonb then
   raise exception 'ACEITE_SEM_ENTREGA %',v_retorno;
 end if;
 insert into hml_resultados_selector values('reconciliacao_aceite_nao_e_entrega','PASS');

 v_lista:=public.mensageria_hml_outbox_casos_investigacao(v_admin,10);
 if (v_lista->'status') is distinct from to_jsonb('ok'::text)
   or (v_lista->'quantidade') is distinct from '1'::jsonb
   or jsonb_typeof(v_lista->'casos') is distinct from 'array'
   or jsonb_array_length(v_lista->'casos') is distinct from 1
   or (v_lista->'casos'->0->'categoria') is distinct from to_jsonb('aceite_sem_status'::text)
   or (v_lista->'casos'->0->'tentativa_id') is distinct from to_jsonb(v_tentativa)
   or (v_lista->'reenvio_automatico_autorizado') is distinct from 'false'::jsonb then
   raise exception 'TRIAGEM_ACEITE_SEM_STATUS %',v_lista;
 end if;
 insert into hml_resultados_selector values('triagem_aceite_sem_status','PASS');

 -- AUDITORIA: testes adicionais, exclusivamente em clone descartavel.
 select jsonb_build_array(
   (select to_jsonb(t) from public.mensageria_hml_respostas_tentativas t where id=v_tentativa),
   (select to_jsonb(o) from public.mensageria_hml_respostas_outbox o where id=v_outbox),
   (select to_jsonb(a) from public.atendimentos a where id=v_atendimento),
   (select count(*) from public.mensageria_webhooks_meta),
   (select count(*) from public.mensageria_webhook_itens_meta)) into v_antes;
 v_retorno:=public.mensageria_hml_registrar_decisao_auditoria(v_admin,v_tentativa,'aceite_sem_status','manter_em_investigacao','evidencia_insuficiente',v_aud_chave);
 if (v_retorno->'status') is distinct from to_jsonb('registrado'::text)
   or (v_retorno->'reenvio_automatico_autorizado') is distinct from 'false'::jsonb
   or v_retorno ?| array['operador_id','telefone','wamid','texto','chave_idempotencia'] then
   raise exception 'AUDITORIA_REGISTRO_INVALIDO';
 end if;
 v_aud_evento:=(v_retorno->>'evento_id')::uuid;
 if jsonb_typeof(v_retorno->'evento_id') is distinct from 'string' or v_aud_evento is null then raise exception 'EVENTO_AUSENTE'; end if;
 insert into hml_resultados_selector values('auditoria_registro_minimo_sem_reenvio','PASS');

 v_retorno:=public.mensageria_hml_registrar_decisao_auditoria(v_admin,v_tentativa,'aceite_sem_status','manter_em_investigacao','evidencia_insuficiente',v_aud_chave);
 if (v_retorno->'status') is distinct from to_jsonb('ja_registrado'::text) or
   (v_retorno->'evento_id') is distinct from to_jsonb(v_aud_evento) then
   raise exception 'AUDITORIA_REPLAY_INVALIDO';
 end if;
 insert into hml_resultados_selector values('auditoria_replay_exato','PASS');

 v_retorno:=public.mensageria_hml_registrar_decisao_auditoria(v_admin,v_tentativa,'aceite_sem_status','solicitar_verificacao_externa','evidencia_insuficiente',v_aud_chave);
 if (v_retorno->'status') is distinct from to_jsonb('conflito_idempotencia'::text) then raise exception 'AUDITORIA_CONFLITO'; end if;
 insert into hml_resultados_selector values('auditoria_conflito_chave','PASS');

 v_retorno:=public.mensageria_hml_registrar_decisao_auditoria(v_admin,v_tentativa,'status_falhou','manter_em_investigacao','evidencia_insuficiente',gen_random_uuid());
 if (v_retorno->'status') is distinct from to_jsonb('categoria_desatualizada'::text) then raise exception 'AUDITORIA_CATEGORIA'; end if;
 insert into hml_resultados_selector values('auditoria_categoria_desatualizada','PASS');

 v_retorno:=public.mensageria_hml_registrar_decisao_auditoria(v_admin,gen_random_uuid(),'aceite_sem_status','manter_em_investigacao','evidencia_insuficiente',gen_random_uuid());
 if (v_retorno->'status') is distinct from to_jsonb('caso_nao_elegivel'::text) then raise exception 'AUDITORIA_INEXISTENTE'; end if;
 insert into hml_resultados_selector values('auditoria_tentativa_inexistente','PASS');

 v_retorno:=public.mensageria_hml_registrar_decisao_auditoria(v_admin,v_tentativa,'aceite_sem_status','reenviar','evidencia_insuficiente',gen_random_uuid());
 if (v_retorno->'status') is distinct from to_jsonb('entrada_invalida'::text) then raise exception 'AUDITORIA_DECISAO_INVALIDA'; end if;
 insert into hml_resultados_selector values('auditoria_decisao_invalida','PASS');

 v_retorno:=public.mensageria_hml_registrar_decisao_auditoria(null,v_tentativa,'aceite_sem_status','manter_em_investigacao','evidencia_insuficiente',v_aud_chave);
 if (v_retorno->'status') is distinct from to_jsonb('nao_autorizado'::text) then raise exception 'AUDITORIA_ANONIMO'; end if;
 v_retorno:=public.mensageria_hml_registrar_decisao_auditoria(gen_random_uuid(),v_tentativa,'aceite_sem_status','manter_em_investigacao','evidencia_insuficiente',v_aud_chave);
 if (v_retorno->'status') is distinct from to_jsonb('nao_autorizado'::text) then raise exception 'AUDITORIA_OPERADOR_DESCONHECIDO'; end if;
 insert into hml_resultados_selector values('auditoria_operador_ausente_ou_desconhecido','PASS');

 select raw_app_meta_data,banned_until,deleted_at into v_role_antes,v_ban_antes,v_deleted_antes from auth.users where id=v_admin;
 update auth.users set raw_app_meta_data=raw_app_meta_data||'{"whatsapp_admin":false}'::jsonb where id=v_admin;
 v_retorno:=public.mensageria_hml_registrar_decisao_auditoria(v_admin,v_tentativa,'aceite_sem_status','manter_em_investigacao','evidencia_insuficiente',v_aud_chave);
 if (v_retorno->'status') is distinct from to_jsonb('nao_autorizado'::text) then raise exception 'AUDITORIA_NAO_ADMIN'; end if;
 update auth.users set raw_app_meta_data=v_role_antes,banned_until=now()+interval '1 day' where id=v_admin;
 v_retorno:=public.mensageria_hml_registrar_decisao_auditoria(v_admin,v_tentativa,'aceite_sem_status','manter_em_investigacao','evidencia_insuficiente',v_aud_chave);
 if (v_retorno->'status') is distinct from to_jsonb('nao_autorizado'::text) then raise exception 'AUDITORIA_BANIDO'; end if;
 update auth.users set banned_until=v_ban_antes,deleted_at=now() where id=v_admin;
 v_retorno:=public.mensageria_hml_registrar_decisao_auditoria(v_admin,v_tentativa,'aceite_sem_status','manter_em_investigacao','evidencia_insuficiente',v_aud_chave);
 if (v_retorno->'status') is distinct from to_jsonb('nao_autorizado'::text) then raise exception 'AUDITORIA_DELETADO'; end if;
 update auth.users set deleted_at=v_deleted_antes where id=v_admin;
 insert into hml_resultados_selector values('auditoria_revogacao_admin_banimento_exclusao','PASS');

 foreach v_papel in array array['anon','authenticated','service_role'] loop
   foreach v_priv in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE'] loop
     if has_table_privilege(v_papel,'mensageria_hml_auditoria_interna.decisoes',v_priv) then raise exception 'AUDITORIA_GRANT_INDEVIDO % %',v_papel,v_priv; end if;
   end loop;
   if has_schema_privilege(v_papel,'mensageria_hml_auditoria_interna','USAGE') then raise exception 'AUDITORIA_SCHEMA_EXPOSTO'; end if;
   if has_function_privilege(v_papel,'public.mensageria_hml_registrar_decisao_auditoria(uuid,uuid,text,text,text,uuid)','EXECUTE') is distinct from (v_papel='service_role') then raise exception 'AUDITORIA_RPC_GRANT'; end if;
 end loop;
 if (select relrowsecurity from pg_class where oid='mensageria_hml_auditoria_interna.decisoes'::regclass) is distinct from true then raise exception 'AUDITORIA_RLS'; end if;
 insert into hml_resultados_selector values('auditoria_acl_append_only_rls','PASS');

 v_retorno:=public.mensageria_hml_registrar_decisao_auditoria(v_admin,v_tentativa,'aceite_sem_status','registrar_revisao_sem_reenvio','revisao_realizada',gen_random_uuid());
 if (v_retorno->'status') is distinct from to_jsonb('registrado'::text) or jsonb_typeof(v_retorno->'evento_id') is distinct from 'string' or (v_retorno->>'evento_id')::uuid is null or (v_retorno->>'evento_id')::uuid=v_aud_evento then raise exception 'AUDITORIA_NOVA_REVISAO'; end if;
 if (select count(*) from mensageria_hml_auditoria_interna.decisoes where tentativa_id=v_tentativa) is distinct from 2 then raise exception 'AUDITORIA_CONTAGEM'; end if;
 if not exists(select 1 from mensageria_hml_auditoria_interna.decisoes where id=v_aud_evento and decisao='manter_em_investigacao') then raise exception 'AUDITORIA_EVENTO_ORIGINAL_ALTERADO'; end if;
 insert into hml_resultados_selector values('auditoria_nova_revisao_preserva_anterior','PASS');

 select jsonb_build_array(
   (select to_jsonb(t) from public.mensageria_hml_respostas_tentativas t where id=v_tentativa),
   (select to_jsonb(o) from public.mensageria_hml_respostas_outbox o where id=v_outbox),
   (select to_jsonb(a) from public.atendimentos a where id=v_atendimento),
   (select count(*) from public.mensageria_webhooks_meta),
   (select count(*) from public.mensageria_webhook_itens_meta)) into v_depois;
 if v_depois is distinct from v_antes then raise exception 'AUDITORIA_MUDOU_ESTADO_OPERACIONAL'; end if;
 v_lista:=public.mensageria_hml_outbox_casos_investigacao(v_admin,10);
 if (v_lista->'quantidade') is distinct from '1'::jsonb
   or jsonb_typeof(v_lista->'casos') is distinct from 'array'
   or jsonb_array_length(v_lista->'casos') is distinct from 1 then raise exception 'AUDITORIA_OCULTOU_CASO'; end if;
 insert into hml_resultados_selector values('auditoria_sem_mutacao_operacional_ou_ocultacao','PASS');


 v_lista:=public.mensageria_hml_outbox_casos_investigacao(gen_random_uuid(),10);
 if (v_lista->'status') is distinct from to_jsonb('nao_autorizado'::text) then
   raise exception 'TRIAGEM_SEM_ADMIN %',v_lista;
 end if;
 insert into hml_resultados_selector values('triagem_bloqueia_operador_estranho','PASS');

 v_lista:=public.mensageria_hml_outbox_casos_investigacao(v_admin,21);
 if (v_lista->'status') is distinct from to_jsonb('limite_invalido'::text) then
   raise exception 'TRIAGEM_LIMITE_EXCEDIDO %',v_lista;
 end if;
 insert into hml_resultados_selector values('triagem_limite_20','PASS');


 v_retorno:=public.mensageria_hml_outbox_diagnosticar_reconciliacao(gen_random_uuid());
 if (v_retorno->'status') is distinct from to_jsonb('nao_autorizado'::text) then
   raise exception 'RECONCILIACAO_ADMIN_OBRIGATORIO %',v_retorno;
 end if;
 insert into hml_resultados_selector values('reconciliacao_admin_obrigatorio','PASS');

 -- Evento de status simulado (assinatura apenas MARCADA no teste!).
 v_payload:=jsonb_build_object('object','whatsapp_business_account',
    'entry',jsonb_build_array(jsonb_build_object(
      'id','377176189908880',
      'changes',jsonb_build_array(jsonb_build_object('field','messages',
        'value',jsonb_build_object(
          'metadata',jsonb_build_object('phone_number_id','309132033809134'),
          'statuses',jsonb_build_array(
             jsonb_build_object('id','wamid.hml.agradecimento-12345','status','sent'),
             jsonb_build_object('id','wamid.hml.agradecimento-12345','status','delivered'),
             jsonb_build_object('id','wamid.hml.orfa-0123456789','status','sent')
          )
        )
      ))
    )));
 insert into public.mensageria_webhooks_meta(
   payload_sha256,payload,classificacao,assinatura_validada_at,
   primeiro_recebimento_at,ultimo_recebimento_at,payload_expires_at,
   created_at,updated_at)
 values(encode(sha256(convert_to(v_payload::text,'UTF8')),'hex'),v_payload,
  'processavel',now(),now(),now(),now()+interval '30 days',now(),now())
 returning id into v_wh;
 insert into public.mensageria_webhook_itens_meta(
  webhook_id,dedupe_key,tipo,mensagem_externa_id,status_meta,created_at,updated_at)
 values
 (v_wh,'status:sent:'||gen_random_uuid()::text,'status',
    'wamid.hml.agradecimento-12345','sent',now(),now()),
 (v_wh,'status:delivered:'||gen_random_uuid()::text,'status',
    'wamid.hml.agradecimento-12345','delivered',now(),now()),
 (v_wh,'status:orphan:'||gen_random_uuid()::text,'status',
    'wamid.hml.orfa-0123456789','sent',now(),now());

 v_retorno:=public.mensageria_hml_outbox_diagnosticar_reconciliacao(v_admin);
 if (v_retorno->'status_entregue') is distinct from '1'::jsonb
   or (v_retorno->'status_enviado') is distinct from '0'::jsonb
   or (v_retorno->'aceitas_sem_status') is distinct from '0'::jsonb
   or (v_retorno->'webhooks_sem_vinculo_outbox') is distinct from '1'::jsonb then
   raise exception 'DELIVERY_OUTBOX_SEGURO %',v_retorno;
 end if;
 insert into hml_resultados_selector values('reconciliacao_entrega_e_orfao_separados','PASS');

 -- Repetição exata de status assinado não pode inflar contagens.
 insert into public.mensageria_webhook_itens_meta(
  webhook_id,dedupe_key,tipo,mensagem_externa_id,status_meta,created_at,updated_at)
 values(v_wh,'status:duplicate:'||gen_random_uuid()::text,'status',
    'wamid.hml.agradecimento-12345','delivered',now(),now());
 v_retorno:=public.mensageria_hml_outbox_diagnosticar_reconciliacao(v_admin);
 if (v_retorno->'status_entregue') is distinct from '1'::jsonb then
   raise exception 'DUPLICATA_INFLA_ENTREGA %',v_retorno;
 end if;
 insert into hml_resultados_selector values('reconciliacao_status_idempotente','PASS');

 -- Um webhook de status classificado como irrelevante não tem efeito.
 v_payload:=jsonb_build_object('object','whatsapp_business_account',
   'entry',jsonb_build_array(jsonb_build_object(
     'id','377176189908880',
     'changes',jsonb_build_array(jsonb_build_object('field','messages',
       'value',jsonb_build_object(
         'metadata',jsonb_build_object('phone_number_id','309132033809134'),
         'statuses',jsonb_build_array(jsonb_build_object(
           'id','wamid.hml.agradecimento-12345','status','failed'))
       )
     ))
   )));
 insert into public.mensageria_webhooks_meta(
   payload_sha256,payload,classificacao,assinatura_validada_at,
   primeiro_recebimento_at,ultimo_recebimento_at,payload_expires_at,
   created_at,updated_at)
 values(encode(sha256(convert_to(v_payload::text,'UTF8')),'hex'),v_payload,
  'irrelevante',now(),now(),now(),now()+interval '30 days',now(),now())
 returning id into v_wh;
 insert into public.mensageria_webhook_itens_meta(
  webhook_id,dedupe_key,tipo,mensagem_externa_id,status_meta,created_at,updated_at)
 values(v_wh,'status:irrelevant:'||gen_random_uuid()::text,'status',
  'wamid.hml.agradecimento-12345','failed',now(),now());
 v_retorno:=public.mensageria_hml_outbox_diagnosticar_reconciliacao(v_admin);
 if (v_retorno->'status_contraditorio') is distinct from '0'::jsonb
   or (v_retorno->'status_entregue') is distinct from '1'::jsonb then
   raise exception 'CLASSIFICACAO_IRRELEVANTE_APROVEITADA %',v_retorno;
 end if;
 insert into hml_resultados_selector values('reconciliacao_webhook_irrelevante_ignorado','PASS');

 -- Leitura autenticada supera entrega simples sem ampliar contagem.
 v_payload:=jsonb_build_object('object','whatsapp_business_account',
   'entry',jsonb_build_array(jsonb_build_object(
     'id','377176189908880',
     'changes',jsonb_build_array(jsonb_build_object('field','messages',
       'value',jsonb_build_object(
         'metadata',jsonb_build_object('phone_number_id','309132033809134'),
         'statuses',jsonb_build_array(jsonb_build_object(
           'id','wamid.hml.agradecimento-12345','status','read'))
       )
     ))
   )));
 insert into public.mensageria_webhooks_meta(
   payload_sha256,payload,classificacao,assinatura_validada_at,
   primeiro_recebimento_at,ultimo_recebimento_at,payload_expires_at,
   created_at,updated_at)
 values(encode(sha256(convert_to(v_payload::text,'UTF8')),'hex'),v_payload,
  'processavel',now(),now(),now(),now()+interval '30 days',now(),now())
 returning id into v_wh;
 insert into public.mensageria_webhook_itens_meta(
  webhook_id,dedupe_key,tipo,mensagem_externa_id,status_meta,created_at,updated_at)
 values(v_wh,'status:read:'||gen_random_uuid()::text,'status',
  'wamid.hml.agradecimento-12345','read',now(),now());
 v_retorno:=public.mensageria_hml_outbox_diagnosticar_reconciliacao(v_admin);
 if (v_retorno->'status_lido') is distinct from '1'::jsonb
   or (v_retorno->'status_entregue') is distinct from '0'::jsonb then
   raise exception 'LIDO_SEM_PRIORIDADE %',v_retorno;
 end if;
 insert into hml_resultados_selector values('reconciliacao_read_prioritario','PASS');

 v_lista:=public.mensageria_hml_outbox_casos_investigacao(v_admin,10);
 if (v_lista->'status') is distinct from to_jsonb('ok'::text) or (v_lista->'quantidade') is distinct from '0'::jsonb
   or jsonb_typeof(v_lista->'casos') is distinct from 'array'
   or jsonb_array_length(v_lista->'casos') is distinct from 0 then
   raise exception 'TRIAGEM_NAO_DEVE_CONSIDERAR_LIDO_PENDENTE %',v_lista;
 end if;
 insert into hml_resultados_selector values('triagem_lido_nao_e_pendente','PASS');
 v_retorno:=public.mensageria_hml_registrar_decisao_auditoria(v_admin,v_tentativa,'aceite_sem_status','manter_em_investigacao','evidencia_insuficiente',v_aud_chave);
 if (v_retorno->'status') is distinct from to_jsonb('ja_registrado'::text) or (v_retorno->'evento_id') is distinct from to_jsonb(v_aud_evento) then raise exception 'AUDITORIA_REPLAY_APOS_ENTREGA'; end if;
 v_retorno:=public.mensageria_hml_registrar_decisao_auditoria(v_admin,v_tentativa,'aceite_sem_status','manter_em_investigacao','evidencia_insuficiente',gen_random_uuid());
 if (v_retorno->'status') is distinct from to_jsonb('caso_nao_elegivel'::text) then raise exception 'AUDITORIA_CASO_ENCERRADO'; end if;
 insert into hml_resultados_selector values('auditoria_replay_historico_e_nova_decisao_rejeitada','PASS');



 -- Um status com WABA diferente, mesmo WAMID, não pode servir de prova.
 v_payload:=jsonb_build_object('object','whatsapp_business_account',
   'entry',jsonb_build_array(jsonb_build_object(
     'id','999999999998887777',
     'changes',jsonb_build_array(jsonb_build_object('field','messages',
       'value',jsonb_build_object(
         'metadata',jsonb_build_object('phone_number_id','309132033809134'),
         'statuses',jsonb_build_array(jsonb_build_object(
           'id','wamid.hml.agradecimento-12345','status','failed'))
       )
     ))
   )));
 insert into public.mensageria_webhooks_meta(
   payload_sha256,payload,classificacao,assinatura_validada_at,
   primeiro_recebimento_at,ultimo_recebimento_at,payload_expires_at,
   created_at,updated_at)
 values(encode(sha256(convert_to(v_payload::text,'UTF8')),'hex'),v_payload,
  'processavel',now(),now(),now(),now()+interval '30 days',now(),now())
 returning id into v_wh;
 insert into public.mensageria_webhook_itens_meta(
  webhook_id,dedupe_key,tipo,mensagem_externa_id,status_meta,created_at,updated_at)
 values(v_wh,'status:other-waba:'||gen_random_uuid()::text,'status',
  'wamid.hml.agradecimento-12345','failed',now(),now());
 v_retorno:=public.mensageria_hml_outbox_diagnosticar_reconciliacao(v_admin);
 if (v_retorno->'status_contraditorio') is distinct from '0'::jsonb
  or (v_retorno->'status_lido') is distinct from '1'::jsonb then
  raise exception 'OUTRA_WABA_CONSIDERADA %',v_retorno;
 end if;
 insert into hml_resultados_selector values('reconciliacao_outra_waba_ignorada','PASS');

 -- Mesmo WABA e WAMID com delivery e failed: evidência contraditória,
 -- nunca reabrir a fila nem concluir que a entrega não ocorreu.
 v_payload:=jsonb_build_object('object','whatsapp_business_account',
   'entry',jsonb_build_array(jsonb_build_object(
     'id','377176189908880',
     'changes',jsonb_build_array(jsonb_build_object('field','messages',
       'value',jsonb_build_object(
         'metadata',jsonb_build_object('phone_number_id','309132033809134'),
         'statuses',jsonb_build_array(jsonb_build_object(
           'id','wamid.hml.agradecimento-12345','status','failed',
           'timestamp',floor(extract(epoch from now()))::bigint::text))
       )
     ))
   )));
 insert into public.mensageria_webhooks_meta(
   payload_sha256,payload,classificacao,assinatura_validada_at,
   primeiro_recebimento_at,ultimo_recebimento_at,payload_expires_at,
   created_at,updated_at)
 values(encode(sha256(convert_to(v_payload::text,'UTF8')),'hex'),v_payload,
  'processavel',now(),now(),now(),now()+interval '30 days',now(),now())
 returning id into v_wh;
 insert into public.mensageria_webhook_itens_meta(
  webhook_id,dedupe_key,tipo,mensagem_externa_id,status_meta,created_at,updated_at)
 values(v_wh,'status:conflicting:'||gen_random_uuid()::text,'status',
  'wamid.hml.agradecimento-12345','failed',now(),now());
 v_retorno:=public.mensageria_hml_outbox_diagnosticar_reconciliacao(v_admin);
 if (v_retorno->'status_contraditorio') is distinct from '1'::jsonb
   or (v_retorno->'reenvio_automatico_autorizado') is distinct from 'false'::jsonb then
   raise exception 'CONTRADICAO_NAO_MARCADA %',v_retorno;
 end if;
 insert into hml_resultados_selector values('reconciliacao_status_contraditorio_sem_reenvio','PASS');

 v_lista:=public.mensageria_hml_outbox_casos_investigacao(v_admin,10);
 if (v_lista->'status') is distinct from to_jsonb('ok'::text) or (v_lista->'quantidade') is distinct from '1'::jsonb
   or jsonb_typeof(v_lista->'casos') is distinct from 'array'
   or jsonb_array_length(v_lista->'casos') is distinct from 1
    or (v_lista->'casos'->0->'categoria') is distinct from to_jsonb('status_contraditorio'::text) then
   raise exception 'TRIAGEM_CONTRADITORIO %',v_lista;
 end if;
 insert into hml_resultados_selector values('triagem_status_contraditorio','PASS');



 -- Resultado indeterminado sem WAMID permanece NÃO CORRELACIONÁVEL,
 -- mesmo quando existe webhook órfão com o mesmo destino de teste.
 update public.mensageria_hml_respostas_tentativas
 set estado='indeterminado',meta_message_id=null,
     codigo_resultado='META_TIMEOUT',concluido_em=now()
 where outbox_id=v_outbox;
 update public.mensageria_hml_respostas_outbox
 set estado='indeterminado' where id=v_outbox;
 v_retorno:=public.mensageria_hml_outbox_diagnosticar_reconciliacao(v_admin);
 if (v_retorno->'indeterminadas') is distinct from '1'::jsonb
   or (v_retorno->'aceitas') is distinct from '0'::jsonb
   or (v_retorno->'webhooks_sem_vinculo_outbox') is distinct from '2'::jsonb
   or (v_retorno->'reenvio_automatico_autorizado') is distinct from 'false'::jsonb then
   raise exception 'TIMEOUT_CONCILIADO_SEM_WAMID %',v_retorno;
 end if;
 insert into hml_resultados_selector values('reconciliacao_timeout_sem_wamid_sem_auto_vinculo','PASS');

 v_lista:=public.mensageria_hml_outbox_casos_investigacao(v_admin,10);
 if (v_lista->'status') is distinct from to_jsonb('ok'::text) or (v_lista->'quantidade') is distinct from '1'::jsonb
   or jsonb_typeof(v_lista->'casos') is distinct from 'array'
   or jsonb_array_length(v_lista->'casos') is distinct from 1
   or (v_lista->'casos'->0->'categoria') is distinct from to_jsonb('resultado_indeterminado'::text)
   or (v_lista->'casos'->0->'tentativa_id') is distinct from to_jsonb(v_tentativa) then
   raise exception 'TRIAGEM_TIMEOUT %',v_lista;
 end if;
 insert into hml_resultados_selector values('triagem_indeterminado_sem_wamid','PASS');


end;
$teste$;
do $contagem$
begin
 if (select count(*) from hml_resultados_selector) is distinct from 43::bigint then
   raise exception 'CONTAGEM_INCORRETA';
 end if;
end $contagem$;
select * from hml_resultados_selector order by cenario;
rollback;
