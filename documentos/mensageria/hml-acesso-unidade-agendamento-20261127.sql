-- Exclusivo HML. Autorizar somente o administrador interno existente na unidade fictícia.
DO $guard$
DECLARE v_usuario uuid; v_empresa uuid; v_unidade uuid; v_retorno jsonb;
BEGIN
 IF (SELECT count(*) FROM public.clientes)<>3 OR (SELECT count(*) FROM public.pets)<>3 OR (SELECT count(*) FROM public.atendimentos)<>6 OR EXISTS(SELECT 1 FROM public.contratos) OR EXISTS(SELECT 1 FROM public.atendimento_recebimentos) OR EXISTS(SELECT 1 FROM mensageria_interna.acessos_unidades) THEN RAISE EXCEPTION 'HML_PRECONDICAO'; END IF;
 SELECT id INTO STRICT v_usuario FROM auth.users WHERE raw_app_meta_data->>'role'='internal' AND raw_app_meta_data->'whatsapp_admin'='true'::jsonb;
 SELECT cu.empresa_id,cu.unidade_id INTO STRICT v_empresa,v_unidade FROM public.pets p JOIN public.clientes c ON c.id=p.cliente_id JOIN mensageria_interna.clientes_unidades cu ON cu.cliente_id=c.id JOIN mensageria_interna.unidades u ON (u.empresa_id,u.unidade_id)=(cu.empresa_id,cu.unidade_id) WHERE p.id='PET-990017' AND (c.nome ILIKE '%fict%' OR c.nome ILIKE '%hml%') AND (u.nome ILIKE '%fict%' OR u.nome ILIKE '%hml%');
 IF (SELECT count(*) FROM mensageria_interna.clientes_unidades WHERE (empresa_id,unidade_id)=(v_empresa,v_unidade))<>2 OR EXISTS (SELECT 1 FROM mensageria_interna.clientes_unidades cu LEFT JOIN public.clientes c ON c.id=cu.cliente_id WHERE (cu.empresa_id,cu.unidade_id)=(v_empresa,v_unidade) AND (c.id IS NULL OR NOT (c.nome ILIKE '%fict%' OR c.nome ILIKE '%hml%'))) THEN RAISE EXCEPTION 'HML_UNIDADE_NAO_ISOLADA'; END IF;
 v_retorno:=mensageria_interna.confirmar_agendamento(jsonb_build_object('atendimento',jsonb_build_object('petId','PET-990017')),v_usuario);
 IF v_retorno->>'codigo' IS DISTINCT FROM 'SEM_ACESSO_A_UNIDADE' THEN RAISE EXCEPTION 'HML_CAUSA_NAO_REPRODUZIDA'; END IF;
 INSERT INTO mensageria_interna.acessos_unidades(usuario_id,empresa_id,unidade_id) VALUES(v_usuario,v_empresa,v_unidade);
 v_retorno:=mensageria_interna.confirmar_agendamento(jsonb_build_object('atendimento',jsonb_build_object('petId','PET-990017')),v_usuario);
 IF v_retorno->>'codigo' IS DISTINCT FROM 'PLANO_INVALIDO' THEN RAISE EXCEPTION 'HML_ACESSO_NAO_VALIDADO'; END IF;
 v_retorno:=mensageria_interna.confirmar_agendamento(jsonb_build_object('atendimento',jsonb_build_object('petId','PET-990017')),gen_random_uuid());
 IF v_retorno->>'codigo' IS DISTINCT FROM 'SEM_ACESSO_A_UNIDADE' THEN RAISE EXCEPTION 'HML_OPERADOR_INDEVIDO'; END IF;
END $guard$;
