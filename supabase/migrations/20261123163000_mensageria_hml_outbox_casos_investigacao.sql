-- KAZA PET • HML | triagem de resultados incertos por tentativa.
-- Somente leitura. Nao envia, nao reclassifica, nao associa wamid nem libera retry.
create or replace function public.mensageria_hml_outbox_casos_investigacao(
  p_operador uuid, p_limite integer default 10
) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog
as $fn$
declare
  v_casos jsonb;
begin
  if p_operador is null or not exists (
    select 1 from auth.users u
    where u.id=p_operador
      and u.deleted_at is null
      and (u.banned_until is null or u.banned_until<=now())
      and u.raw_app_meta_data->>'role'='internal'
      and u.raw_app_meta_data->>'whatsapp_admin'='true'
  ) then
    return jsonb_build_object('status','nao_autorizado');
  end if;
  if p_limite is null or p_limite not between 1 and 20 then
    return jsonb_build_object('status','limite_invalido');
  end if;
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'tentativa_id',z.tentativa_id,
      'categoria',z.categoria,
      'reservado_em',z.reservado_em
    ) order by z.reservado_em,z.tentativa_id
  ),'[]'::jsonb) into v_casos
  from (
    select z.tentativa_id,z.reservado_em,z.categoria
    from (
    select
      t.id as tentativa_id,
      t.reservado_em,
      case
        when t.estado='reservado' and t.reservado_em < now()-interval '5 minutes'
          then 'reserva_antiga'
        when t.estado='indeterminado'
          then 'resultado_indeterminado'
        when t.estado='aceito_meta' and e.falhou and (e.entregou or e.leu)
          then 'status_contraditorio'
        when t.estado='aceito_meta' and e.falhou and not (e.entregou or e.leu)
          then 'status_falhou'
        when t.estado='aceito_meta' and not e.tem_status
          then 'aceite_sem_status'
        when t.estado='aceito_meta'
          and t.concluido_em < now()-interval '24 hours'
          and not(e.entregou or e.leu or e.falhou)
          then 'entrega_sem_confirmacao'
        else null
      end as categoria
    from public.mensageria_hml_respostas_tentativas t
    join public.mensageria_hml_respostas_outbox o
      on o.id=t.outbox_id and o.evento_codigo='AGENDAMENTO_CONFIRMADO_WHATSAPP'
    left join lateral (
      select
        count(*)>0 as tem_status,
        coalesce(bool_or(i.status_meta='failed'),false) as falhou,
        coalesce(bool_or(i.status_meta='delivered'),false) as entregou,
        coalesce(bool_or(i.status_meta='read'),false) as leu
      from public.mensageria_webhook_itens_meta i
      join public.mensageria_webhooks_meta w on w.id=i.webhook_id
      where t.meta_message_id is not null
        and i.provedor='meta' and w.provedor='meta'
        and i.mensagem_externa_id=t.meta_message_id
        and i.status_meta in ('sent','delivered','read','failed')
        and w.classificacao='processavel'
        and w.assinatura_validada_at is not null
        and w.payload->>'object'='whatsapp_business_account'
        and exists (
          select 1
          from jsonb_array_elements(
            case when jsonb_typeof(w.payload->'entry')='array'
              then w.payload->'entry' else '[]'::jsonb end
          ) entry
          cross join lateral jsonb_array_elements(
            case when jsonb_typeof(entry->'changes')='array'
              then entry->'changes' else '[]'::jsonb end
          ) change
          cross join lateral jsonb_array_elements(
            case when jsonb_typeof(change->'value'->'statuses')='array'
              then change->'value'->'statuses' else '[]'::jsonb end
          ) st
          where entry->>'id'='377176189908880'
            and change->>'field'='messages'
            and change->'value'->'metadata'->>'phone_number_id'='309132033809134'
            and st->>'id'=i.mensagem_externa_id
            and st->>'status'=i.status_meta
        )
    ) e on true
    ) z
    where z.categoria is not null
    order by z.reservado_em,z.tentativa_id
    limit p_limite
  ) z;

  -- Nenhum UUID de cliente/agenda, texto, telefone ou wamid sai da RPC.
  return jsonb_build_object(
    'status','ok',
    'casos',v_casos,
    'quantidade',jsonb_array_length(v_casos),
    'reenvio_automatico_autorizado',false
  );
end;
$fn$;
revoke all on function public.mensageria_hml_outbox_casos_investigacao(uuid,integer)
  from public,anon,authenticated;
grant execute on function public.mensageria_hml_outbox_casos_investigacao(uuid,integer)
  to service_role;
