-- Somente HML: diagnostico agregado, sem PII, sem leitura de payload nem envio
create or replace function public.mensageria_hml_diagnostico_confirmacoes(p_operador uuid)
returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog
as $body$
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
    'templates_meta_cadastrados',(select count(*) from public.mensageria_templates_meta),
    'agendamentos_hml',(select count(*) from public.atendimentos)
  );
end;
$body$;
revoke all on function public.mensageria_hml_diagnostico_confirmacoes(uuid) from public,anon,authenticated;
grant execute on function public.mensageria_hml_diagnostico_confirmacoes(uuid) to service_role;
