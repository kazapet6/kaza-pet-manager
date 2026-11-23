-- Testes fictícios SOMENTE na HML. Executar com BEGIN/ROLLBACK.
begin;
create temporary table hml_publicacao_casos(nome text,resultado text);
do $teste$
declare
 v_op uuid;
 v_doc uuid:=gen_random_uuid();
 v_doc_ruim uuid:=gen_random_uuid();
 v_chave uuid:=gen_random_uuid();
 v_chave2 uuid:=gen_random_uuid();
 v_res jsonb;
 v_publicada1 uuid;
 v_publicada2 uuid;
 v_status text;
 v_texto text:='Obrigado, {{NOME_TUTOR}}! {{NOME_PET}} confirmado para {{DATA_AGENDAMENTO}} às {{HORARIO_AGENDAMENTO}}. Equipe {{NOME_EMPRESA}}';
begin
 select id into v_op from auth.users
 where raw_app_meta_data->>'role'='internal'
  and raw_app_meta_data->>'whatsapp_admin'='true' limit 1;
 if v_op is null then raise exception 'SEM_OPERADOR_HML'; end if;
 insert into public.mensageria_hml_editor_rascunhos
  (id,operador_id,nome,evento_codigo,contexto,texto,versao)
 values(v_doc,v_op,'Rascunho fictício HML agradecer',
  'AGENDAMENTO_CONFIRMADO_WHATSAPP','agenda',v_texto,1);
 insert into public.mensageria_hml_editor_rascunhos
  (id,operador_id,nome,evento_codigo,contexto,texto,versao)
 values(v_doc_ruim,v_op,'Rascunho de tag não permitida',
  'AGENDAMENTO_CONFIRMADO_WHATSAPP','agenda',
  'Olá {{NOME_TUTOR}}, {{NOME_PET}} na {{NOME_EMPRESA}}: {{LINK_REMARCACAO}}',1);

 v_res:=public.mensageria_hml_publicar_modelo(gen_random_uuid(),v_doc,1,v_chave);
 if v_res->>'status'<>'operador_nao_autorizado' then raise exception 'ADMIN %',v_res; end if;
 insert into hml_publicacao_casos values('operador_não_autorizado','PASS');

 v_res:=public.mensageria_hml_publicar_modelo(v_op,v_doc,2,v_chave);
 if v_res->>'status'<>'rascunho_indisponivel_ou_versao_alterada' then raise exception 'VERSAO %',v_res; end if;
 insert into hml_publicacao_casos values('versão_divergente','PASS');

 v_res:=public.mensageria_hml_publicar_modelo(v_op,v_doc_ruim,1,v_chave2);
 if v_res->>'status'<>'tag_nao_suportada' then raise exception 'TAG %',v_res; end if;
 insert into hml_publicacao_casos values('tag_futura_bloqueada','PASS');

 v_res:=public.mensageria_hml_publicar_modelo(v_op,v_doc,1,v_chave);
 if v_res->>'status'<>'publicado' then raise exception 'PUBLICACAO %',v_res; end if;
 v_publicada1:=(v_res->>'modelo_versao_id')::uuid;
 insert into hml_publicacao_casos values('publicação_de_versão_1','PASS');

 v_res:=public.mensageria_hml_publicar_modelo(v_op,v_doc,1,v_chave);
 if v_res->>'status'<>'ja_publicado' or
    (v_res->>'modelo_versao_id')::uuid<>v_publicada1 then raise exception 'REPETICAO %',v_res; end if;
 insert into hml_publicacao_casos values('repetição_idempotente','PASS');

 v_res:=public.mensageria_hml_publicar_modelo(v_op,v_doc,1,v_chave2);
 if v_res->>'status'<>'versao_ja_publicada' then raise exception 'OUTRA_CHAVE %',v_res; end if;
 insert into hml_publicacao_casos values('versão_única_por_rascunho','PASS');

 v_res:=public.mensageria_hml_publicar_modelo(v_op,v_doc,2,v_chave);
 if v_res->>'status'<>'chave_reutilizada' then raise exception 'CHAVE_REUSADA %',v_res; end if;
 insert into hml_publicacao_casos values('chave_reutilizada_bloqueada','PASS');

 update public.mensageria_hml_editor_rascunhos
   set versao=2,texto=v_texto||' Agradecemos a confiança.'
 where id=v_doc;
 v_res:=public.mensageria_hml_publicar_modelo(v_op,v_doc,2,v_chave2);
 if v_res->>'status'<>'publicado' then raise exception 'PUBLICACAO_V2 %',v_res; end if;
 v_publicada2:=(v_res->>'modelo_versao_id')::uuid;
 insert into hml_publicacao_casos values('publicação_de_versão_2','PASS');

 select estado into v_status from public.mensageria_modelo_versoes where id=v_publicada1;
 if v_status<>'arquivada' then raise exception 'ARQUIVAMENTO_V1 %',v_status; end if;
 select estado into v_status from public.mensageria_modelo_versoes where id=v_publicada2;
 if v_status<>'publicada' then raise exception 'PUBLICACAO_V2_ESTADO %',v_status; end if;
 if (select count(*) from public.mensageria_hml_publicacoes where rascunho_id=v_doc)<>2
   then raise exception 'AUDITORIA_NAO_REGISTRADA'; end if;
 insert into hml_publicacao_casos values('histórico_arquivado_e_auditado','PASS');
end;
$teste$;
select * from hml_publicacao_casos order by nome;
rollback;