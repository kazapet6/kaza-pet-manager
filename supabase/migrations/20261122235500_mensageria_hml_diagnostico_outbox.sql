-- Exclusivamente HML: acrescenta contadores agregados de outbox sem PII, sem envio.
CREATE OR REPLACE FUNCTION public.mensageria_hml_diagnostico_confirmacoes(p_operador uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  if p_operador is null or not exists (
    select 1 from auth.users u where u.id=p_operador
      and u.raw_app_meta_data->>'role'='internal'
      and u.raw_app_meta_data->>'whatsapp_admin'='true'
  ) then
    return jsonb_build_object('status','nao_autorizado');
  end if;
  return jsonb_build_object(
    'status','ok',
    'convites_ativos',(select count(*) from public.mensageria_hml_convites_confirmacao where estado='ativo'),
    'convites_confirmados',(select count(*) from public.mensageria_hml_convites_confirmacao where estado='confirmado'),
    'convites_expirados',(select count(*) from public.mensageria_hml_convites_confirmacao where estado='expirado'),
    'cliques_processados',(select count(*) from public.mensageria_hml_convite_processamentos),
    'remarcacoes_pendentes',(select count(*) from public.mensageria_hml_pedidos_remarcacao where estado='pendente'),
    'respostas_aguardando',(select count(*) from public.mensageria_hml_respostas_outbox where estado='aguardando_integracao'),
    'respostas_prontas',(select count(*) from public.mensageria_hml_respostas_outbox where estado='pronto'),
    'respostas_reservadas',(select count(*) from public.mensageria_hml_respostas_outbox where estado='reservado'),
    'respostas_aceitas_meta',(select count(*) from public.mensageria_hml_respostas_outbox where estado='aceito_meta'),
    'respostas_recusadas_meta',(select count(*) from public.mensageria_hml_respostas_outbox where estado='recusado_meta'),
    'respostas_indeterminadas',(select count(*) from public.mensageria_hml_respostas_outbox where estado='indeterminado'),
    'templates_meta_cadastrados',(select count(*) from public.mensageria_templates_meta),
    'agendamentos_hml',(select count(*) from public.atendimentos)
  );
end;
$function$
;
