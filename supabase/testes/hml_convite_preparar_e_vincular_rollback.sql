-- Apenas HML: E2E SQL de convite sem disparo Meta; TODO revertido com ROLLBACK
begin;
create temporary table hml_valida_convites(cenario text,resultado text);
do $fixture$
declare
 v_operador uuid;
 v_empresa uuid := '9fe00000-0000-4000-8000-000000000001';
 v_unidade uuid := '9fc00000-0000-4000-8000-000000000001';
 v_pet text := 'PET-990005';
 v_grupo uuid;
 v_atendimento uuid;
 v_chave uuid := gen_random_uuid();
 v_chave2 uuid := gen_random_uuid();
 v_resultado jsonb;
 v_id uuid;
 v_inicio timestamptz := date_trunc('day',now())+interval '4 days 9 hours';
begin
 select id into v_operador from auth.users where raw_app_meta_data->>'whatsapp_admin'='true' and raw_app_meta_data->>'role'='internal' limit 1;
 if v_operador is null then raise exception 'ADMIN_INEXISTENTE'; end if;
 insert into mensageria_interna.clientes_empresas(cliente_id,empresa_id)
 values('CLI-990003',v_empresa) on conflict do nothing;
 insert into mensageria_interna.clientes_unidades(cliente_id,empresa_id,unidade_id)
 values('CLI-990003',v_empresa,v_unidade) on conflict do nothing;
 insert into public.pets(id,cliente_id,nome,especie,porte)
 values(v_pet,'CLI-990003','Pet fictício HML Preparo','cao','pequeno');
 insert into public.grupos_agendamento(cliente_id,data_operacional,horario_chegada_comprometido)
 values('CLI-990003',v_inicio::date,v_inicio) returning id into v_grupo;
 insert into public.atendimentos(pet_id,servico_id,grupo_agendamento_id,inicio_planejado)
 values(v_pet,'9fa00000-0000-4000-8000-000000000002',v_grupo,v_inicio) returning id into v_atendimento;
 insert into mensageria_interna.agenda_grupos(grupo_id,cliente_id,empresa_id,unidade_id)
 values(v_grupo,'CLI-990003',v_empresa,v_unidade);

 v_resultado:=public.mensageria_hml_preparar_convite(v_atendimento,v_operador,v_chave,repeat('a',64),repeat('b',64));
 if v_resultado->>'status'<>'preparado' then raise exception 'PREPARO_FALHOU %',v_resultado; end if;
 insert into hml_valida_convites values('preparar',v_resultado->>'status');
 v_id:=(v_resultado->>'convite_id')::uuid;

 v_resultado:=public.mensageria_hml_preparar_convite(v_atendimento,v_operador,v_chave,repeat('a',64),repeat('b',64));
 if v_resultado->>'status'<>'ja_preparado' then raise exception 'IDEMPOTENCIA_PREPARO_FALHOU %',v_resultado; end if;
 insert into hml_valida_convites values('repetir_mesma_chave',v_resultado->>'status');

 v_resultado:=public.mensageria_hml_preparar_convite(v_atendimento,v_operador,v_chave,repeat('c',64),repeat('b',64));
 if v_resultado->>'status'<>'conflito' then raise exception 'CHAVE_INDEVIDA %',v_resultado; end if;
 insert into hml_valida_convites values('reutilizar_chave_trocando_hash',v_resultado->>'status');

 v_resultado:=public.mensageria_hml_preparar_convite(v_atendimento,v_operador,v_chave2,repeat('c',64),repeat('d',64));
 if v_resultado->>'status'<>'conflito' then raise exception 'CONVITE_DUPLICADO %',v_resultado; end if;
 insert into hml_valida_convites values('segundo_convite_ativo',v_resultado->>'status');

 v_resultado:=public.mensageria_hml_vincular_convite_aceito(v_chave,'wamid.hml.convite-aceito-123456',v_operador);
 if v_resultado->>'status'<>'vinculado' then raise exception 'VINCULO_FALHOU %',v_resultado; end if;
 insert into hml_valida_convites values('vincular_wamid',v_resultado->>'status');

 v_resultado:=public.mensageria_hml_vincular_convite_aceito(v_chave,'wamid.hml.convite-aceito-123456',v_operador);
 if v_resultado->>'status'<>'ja_vinculado' then raise exception 'IDEMPOTENCIA_WAMID_FALHOU %',v_resultado; end if;
 insert into hml_valida_convites values('vincular_novamente',v_resultado->>'status');

 v_resultado:=public.mensageria_hml_vincular_convite_aceito(v_chave,'wamid.hml.diferente-123456',v_operador);
 if v_resultado->>'status'<>'conflito' then raise exception 'WAMID_DIVERGENTE_NAO_BLOQUEADO %',v_resultado; end if;
 insert into hml_valida_convites values('vincular_wamid_divergente',v_resultado->>'status');

 v_resultado:=public.mensageria_hml_abandonar_preparo(v_chave,v_operador);
 if v_resultado->>'status'<>'rejeitado' then raise exception 'ABANDONO_TARDIO_INDEVIDO %',v_resultado; end if;
 insert into hml_valida_convites values('abandonar_convite_ativo',v_resultado->>'status');

 if not exists(select 1 from public.mensageria_hml_convites_confirmacao
    where id=v_id and estado='ativo' and meta_message_id='wamid.hml.convite-aceito-123456') then
   raise exception 'VINCULO_INCORRETO';
 end if;
end;
$fixture$;
select * from hml_valida_convites order by cenario;
rollback;
