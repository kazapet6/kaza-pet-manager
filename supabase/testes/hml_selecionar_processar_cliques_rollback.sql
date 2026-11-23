-- SOMENTE HML / SQL sintético com assinatura MARCADA como validada, NÃO é teste HMAC.
-- Deve ser executado APÓS instalar a função listar_cliques_pendentes.
-- BEGIN/ROLLBACK: não deixa pets, agendamentos, convites, webhooks ou respostas.
begin;
create temporary table hml_resultados_selector (cenario text,resultado text);

do $teste$
declare
 v_admin uuid;
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
begin
 select id into v_admin from auth.users
 where raw_app_meta_data->>'whatsapp_admin'='true'
   and raw_app_meta_data->>'role'='internal' limit 1;
 select regexp_replace(whatsapp,'[^0-9]','','g') into v_numero
 from public.clientes where id='CLI-990003';
 if v_admin is null or length(v_numero)<>13 then
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
 if v_retorno->>'status'<>'preparado' then raise exception 'NAO_PREPAROU %',v_retorno; end if;
 v_retorno:=public.mensageria_hml_vincular_convite_aceito(v_chave,v_wamid,v_admin);
 if v_retorno->>'status'<>'vinculado' then raise exception 'NAO_VINCULOU %',v_retorno; end if;

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
 if v_lista->>'status'<>'ok' or jsonb_array_length(v_lista->'itens')<>1
     or (v_lista->'itens'->>0)::uuid<>v_item_valido then
   raise exception 'FILA_INCORRETA %',v_lista;
 end if;
 insert into hml_resultados_selector values('um_unico_clique_assinado_e_vinculado','PASS');

 v_retorno:=public.mensageria_hml_processar_confirmacao(v_item_valido,v_admin);
 if v_retorno->>'status'<>'confirmado' then
   raise exception 'CONFIRMACAO_INCORRETA %',v_retorno;
 end if;
 select status into v_status from public.atendimentos where id=v_atendimento;
 if v_status<>'confirmado' then raise exception 'AGENDA_NAO_CONFIRMADA'; end if;
 insert into hml_resultados_selector values('agendamento_confirmado','PASS');

 v_lista:=public.mensageria_hml_listar_cliques_pendentes(v_admin,10);
 if v_lista->>'status'<>'ok' or jsonb_array_length(v_lista->'itens')<>0 then
   raise exception 'CLIQUES_REPETIDOS_NA_FILA %',v_lista;
 end if;
 insert into hml_resultados_selector values('remover_clique_ja_processado','PASS');

 if (select count(*) from public.mensageria_hml_respostas_outbox where atendimento_id=v_atendimento)<>1 then
   raise exception 'AGRADECIMENTO_DUPLICADO';
 end if;
 insert into hml_resultados_selector values('agradecimento_unico_pendente','PASS');
end;
$teste$;
select * from hml_resultados_selector order by cenario;
rollback;
