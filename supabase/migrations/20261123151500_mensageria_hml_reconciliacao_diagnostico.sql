-- KAZA PET | HML somente leitura: diagnóstico de reconciliação sem reenvio.
-- Nenhuma decisão automática de entregar, reenviar ou vincular WAMID desconhecido.
create or replace function public.mensageria_hml_outbox_diagnosticar_reconciliacao(
 p_operador uuid
) returns jsonb
language plpgsql stable security definer
set search_path=pg_catalog
as $body$
declare
 v_metrics record;
 v_orfaos bigint;
begin
 if p_operador is null or not exists (
   select 1 from auth.users u where u.id=p_operador
   and u.deleted_at is null
   and (u.banned_until is null or u.banned_until<=now())
   and u.raw_app_meta_data->>'role'='internal'
   and u.raw_app_meta_data->>'whatsapp_admin'='true'
 ) then
   return jsonb_build_object('status','nao_autorizado');
 end if;

 with evidencias as (
   select distinct
      i.mensagem_externa_id as wamid,
      i.status_meta as estado
   from public.mensageria_webhook_itens_meta i
   join public.mensageria_webhooks_meta w on w.id=i.webhook_id
   where i.provedor='meta' and w.provedor='meta'
     and w.classificacao='processavel'
     and w.assinatura_validada_at is not null
     and i.status_meta in ('sent','delivered','read','failed')
     and i.mensagem_externa_id is not null
     and w.payload->>'object'='whatsapp_business_account'
     and exists (
       select 1
       from jsonb_array_elements(case when jsonb_typeof(w.payload->'entry')='array'
            then w.payload->'entry' else '[]'::jsonb end) entrada
       cross join lateral jsonb_array_elements(
          case when jsonb_typeof(entrada->'changes')='array'
             then entrada->'changes' else '[]'::jsonb end
       ) alteracao
       cross join lateral jsonb_array_elements(
          case when jsonb_typeof(alteracao->'value'->'statuses')='array'
             then alteracao->'value'->'statuses' else '[]'::jsonb end
       ) st
       where entrada->>'id'='377176189908880'
         and alteracao->>'field'='messages'
         and alteracao->'value'->'metadata'->>'phone_number_id'='309132033809134'
         and st->>'id'=i.mensagem_externa_id
         and st->>'status'=i.status_meta
     )
 ), evidencias_por_wamid as (
   select wamid,
      bool_or(estado='sent') enviou,
      bool_or(estado='delivered') entregou,
      bool_or(estado='read') leu,
      bool_or(estado='failed') falhou
   from evidencias group by wamid
 )
 select
   count(*) filter(where t.estado='reservado'
     and t.reservado_em<now()-interval '5 minutes') as reservas_antigas,
   count(*) filter(where t.estado='indeterminado') as indeterminadas,
   count(*) filter(where t.estado='recusado_meta') as recusadas,
   count(*) filter(where t.estado='aceito_meta') as aceitas,
   count(*) filter(where t.estado='aceito_meta' and e.wamid is null) as aceitas_sem_status,
   count(*) filter(where t.estado='aceito_meta' and e.leu) as status_lido,
   count(*) filter(where t.estado='aceito_meta' and e.entregou and not e.leu) as status_entregue,
   count(*) filter(where t.estado='aceito_meta'
     and e.falhou and not e.entregou and not e.leu) as status_falha,
   count(*) filter(where t.estado='aceito_meta'
     and e.enviou and not e.falhou and not e.entregou and not e.leu) as status_enviado,
   count(*) filter(where t.estado='aceito_meta'
     and e.falhou and (e.entregou or e.leu)) as status_contraditorio
 into v_metrics
 from public.mensageria_hml_respostas_tentativas t
 left join evidencias_por_wamid e on e.wamid=t.meta_message_id
 join public.mensageria_hml_respostas_outbox o on o.id=t.outbox_id
 where o.evento_codigo='AGENDAMENTO_CONFIRMADO_WHATSAPP';

 with evidencias as (
   select distinct i.mensagem_externa_id as wamid
   from public.mensageria_webhook_itens_meta i
   join public.mensageria_webhooks_meta w on w.id=i.webhook_id
   where i.provedor='meta' and w.provedor='meta'
     and i.status_meta in ('sent','delivered','read','failed')
     and i.mensagem_externa_id is not null
     and w.classificacao='processavel'
     and w.assinatura_validada_at is not null
     and w.payload->>'object'='whatsapp_business_account'
     and exists (
       select 1 from jsonb_array_elements(
         case when jsonb_typeof(w.payload->'entry')='array'
          then w.payload->'entry' else '[]'::jsonb end
       ) entrada
       cross join lateral jsonb_array_elements(
         case when jsonb_typeof(entrada->'changes')='array'
           then entrada->'changes' else '[]'::jsonb end
       ) alteracao
       cross join lateral jsonb_array_elements(
         case when jsonb_typeof(alteracao->'value'->'statuses')='array'
           then alteracao->'value'->'statuses' else '[]'::jsonb end
       ) st
       where entrada->>'id'='377176189908880'
        and alteracao->>'field'='messages'
        and alteracao->'value'->'metadata'->>'phone_number_id'='309132033809134'
        and st->>'id'=i.mensagem_externa_id
        and st->>'status'=i.status_meta
     )
 )
 select count(*) into v_orfaos from evidencias e
 where not exists (
   select 1 from public.mensageria_hml_respostas_tentativas t
   join public.mensageria_hml_respostas_outbox o on o.id=t.outbox_id
   where t.meta_message_id=e.wamid
     and o.evento_codigo='AGENDAMENTO_CONFIRMADO_WHATSAPP'
 );

 return jsonb_build_object(
  'status','ok',
  'reservas_antigas',v_metrics.reservas_antigas,
  'indeterminadas',v_metrics.indeterminadas,
  'recusadas',v_metrics.recusadas,
  'aceitas',v_metrics.aceitas,
  'aceitas_sem_status',v_metrics.aceitas_sem_status,
  'status_enviado',v_metrics.status_enviado,
  'status_entregue',v_metrics.status_entregue,
  'status_lido',v_metrics.status_lido,
  'status_falha',v_metrics.status_falha,
  'status_contraditorio',v_metrics.status_contraditorio,
  'webhooks_sem_vinculo_outbox',v_orfaos,
  'reenvio_automatico_autorizado',false
 );
end;
$body$;

revoke all on function public.mensageria_hml_outbox_diagnosticar_reconciliacao(uuid)
 from public,anon,authenticated;
grant execute on function public.mensageria_hml_outbox_diagnosticar_reconciliacao(uuid)
 to service_role;
