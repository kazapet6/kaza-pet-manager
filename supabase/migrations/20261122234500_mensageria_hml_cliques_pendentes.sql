-- Somente HML | leitura restrita de cliques verificáveis, sem processar nem enviar.
-- O receptor existente valida HMAC do corpo bruto e grava a inbox.
-- Esta função só devolve IDs de eventos já vinculados a convites ativos,
-- sem expor payload, números, tokens ou nomes.
create or replace function public.mensageria_hml_listar_cliques_pendentes(
  p_operador uuid, p_limite integer default 10
) returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog
as $body$
declare v_itens jsonb;
begin
  if p_operador is null or not exists (
    select 1 from auth.users u where u.id=p_operador
      and u.raw_app_meta_data->>'role'='internal'
      and u.raw_app_meta_data->>'whatsapp_admin'='true'
  ) then return jsonb_build_object('status','nao_autorizado'); end if;
  if p_limite is null or p_limite not between 1 and 10 then
    return jsonb_build_object('status','limite_invalido');
  end if;
  with candidatos as (
    select distinct i.id, i.created_at
    from public.mensageria_webhook_itens_meta i
    join public.mensageria_webhooks_meta w on w.id=i.webhook_id
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(w.payload->'entry')='array'
        then w.payload->'entry' else '[]'::jsonb end
    ) e(entrada)
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(e.entrada->'changes')='array'
        then e.entrada->'changes' else '[]'::jsonb end
    ) ch(alteracao)
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(ch.alteracao->'value'->'messages')='array'
        then ch.alteracao->'value'->'messages' else '[]'::jsonb end
    ) m(mensagem)
    join public.mensageria_hml_convites_confirmacao c on
      c.meta_message_id=m.mensagem->'context'->>'id'
      and c.meta_waba_id=e.entrada->>'id'
      and c.meta_phone_number_id=ch.alteracao->'value'->'metadata'->>'phone_number_id'
      and c.estado='ativo' and c.expira_em>now()
    join public.mensageria_hml_convite_acoes ac on ac.convite_id=c.id
      and ac.token_sha256=encode(sha256(convert_to(
        case m.mensagem->>'type'
          when 'button' then m.mensagem->'button'->>'payload'
          when 'interactive' then m.mensagem->'interactive'->'button_reply'->>'id'
          else '' end,'UTF8')),'hex')
    where i.tipo='mensagem_inbound'
      and i.tipo_mensagem in ('button','interactive')
      and i.created_at>=now()-interval '7 days'
      and w.assinatura_validada_at is not null
      and w.classificacao='processavel'
      and w.payload->>'object'='whatsapp_business_account'
      and ch.alteracao->>'field'='messages'
      and m.mensagem->>'id'=i.mensagem_externa_id
      and m.mensagem->>'type'=i.tipo_mensagem
      and (case m.mensagem->>'type'
        when 'button' then m.mensagem->'button'->>'payload'
        when 'interactive' then m.mensagem->'interactive'->'button_reply'->>'id'
        else null end) ~* '^KPAG1_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and m.mensagem->>'from' in (
        ltrim(c.destinatario_e164,'+'),
        case when length(ltrim(c.destinatario_e164,'+'))=13
               and substring(ltrim(c.destinatario_e164,'+') from 5 for 1)='9'
          then substring(ltrim(c.destinatario_e164,'+') from 1 for 4)
               ||substring(ltrim(c.destinatario_e164,'+') from 6)
          else ltrim(c.destinatario_e164,'+') end
      )
      and not exists(
        select 1 from public.mensageria_hml_convite_processamentos proc
        where proc.webhook_item_id=i.id or proc.meta_resposta_id=i.mensagem_externa_id
      )
    order by i.created_at,i.id
    limit p_limite
  )
  select coalesce(jsonb_agg(id order by created_at,id),'[]'::jsonb)
  into v_itens
  from candidatos;
  return jsonb_build_object('status','ok','itens',v_itens);
end;
$body$;
revoke all on function public.mensageria_hml_listar_cliques_pendentes(uuid,integer)
  from public,anon,authenticated;
grant execute on function public.mensageria_hml_listar_cliques_pendentes(uuid,integer)
  to service_role;
