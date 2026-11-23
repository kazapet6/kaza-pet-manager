-- KAZA PET | HML: contextuar agradecimento pós-confirmação somente pelo banco.
-- Exposição exclusiva para service_role; nenhum envio, cron ou alteração de agenda.
create or replace function public.mensageria_hml_outbox_contexto(
  p_outbox uuid,
  p_chave uuid,
  p_operador uuid,
  p_destinatario_permitido text
) returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog
as $body$
declare
  v record;
  v_tel text;
  v_numero text;
  v_outro text;
begin
  if p_outbox is null or p_chave is null or p_operador is null
      or p_destinatario_permitido is null
      or p_destinatario_permitido !~ '^\+55[0-9]{10,11}$' then
    return jsonb_build_object('status','parametros_invalidos');
  end if;
  if not exists (
    select 1 from auth.users u where u.id=p_operador
      and u.raw_app_meta_data->>'role'='internal'
      and u.raw_app_meta_data->>'whatsapp_admin'='true'
      and u.deleted_at is null
      and (u.banned_until is null or u.banned_until<=now())
  ) then
    return jsonb_build_object('status','operador_nao_autorizado');
  end if;

  select
    o.evento_codigo,o.estado as outbox_estado,
    a.status as atendimento_estado,a.inicio_planejado,
    c.estado as convite_estado,c.inicio_snapshot,c.chegada_snapshot,
    c.destinatario_e164,c.meta_message_id,
    cli.nome as nome_tutor,cli.whatsapp,
    pet.nome as nome_pet,
    emp.nome as nome_empresa,
    ver.texto,
    p.meta_resposta_id as mensagem_clique_id,
    i.created_at as clique_recebido_em,
    msg.mensagem->>'from' as remetente_clique,
    g.horario_chegada_comprometido as chegada_atual
  into v
  from public.mensageria_hml_respostas_outbox o
  join public.mensageria_hml_respostas_tentativas t
    on t.outbox_id=o.id and t.chave_idempotencia=p_chave
    and t.operador_id=p_operador and t.estado='reservado'
  join public.mensageria_hml_convites_confirmacao c
    on c.id=o.convite_id and c.atendimento_id=o.atendimento_id
  join public.atendimentos a
    on a.id=o.atendimento_id and a.grupo_agendamento_id=c.grupo_id
  join public.grupos_agendamento g
    on g.id=c.grupo_id
  join public.pets pet
    on pet.id=a.pet_id and pet.cliente_id=g.cliente_id
  join public.clientes cli
    on cli.id=g.cliente_id and cli.id='CLI-990003'
  join mensageria_interna.agenda_grupos ag
    on ag.grupo_id=g.id and ag.cliente_id=cli.id
    and ag.empresa_id=c.empresa_id and ag.unidade_id=c.unidade_id
  join mensageria_interna.empresas emp
    on emp.id=ag.empresa_id
  join mensageria_interna.unidades un
    on un.empresa_id=ag.empresa_id and un.unidade_id=ag.unidade_id
    and un.confirmacao_ativa=true
  join public.mensageria_modelo_versoes ver
    on ver.id=o.modelo_versao_id and ver.estado='publicada'
  join public.mensageria_modelos mo
    on mo.id=ver.modelo_id and mo.codigo=o.evento_codigo
    and mo.contexto='agenda' and mo.ativo=true
  join public.mensageria_hml_convite_processamentos p
    on p.convite_id=c.id and p.acao='confirmar' and p.resultado='confirmado'
  join public.mensageria_webhook_itens_meta i
    on i.id=p.webhook_item_id
    and i.tipo='mensagem_inbound'
    and i.tipo_mensagem in ('button','interactive')
    and i.mensagem_externa_id=p.meta_resposta_id
  join public.mensageria_webhooks_meta w
    on w.id=i.webhook_id and w.assinatura_validada_at is not null
    and w.classificacao='processavel'
    and w.payload->>'object'='whatsapp_business_account'
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(w.payload->'entry')='array'
      then w.payload->'entry' else '[]'::jsonb end
  ) ent(entrada)
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(ent.entrada->'changes')='array'
      then ent.entrada->'changes' else '[]'::jsonb end
  ) ch(alteracao)
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(ch.alteracao->'value'->'messages')='array'
      then ch.alteracao->'value'->'messages' else '[]'::jsonb end
  ) msg(mensagem)
  where o.id=p_outbox and o.estado='reservado'
    and o.evento_codigo='AGENDAMENTO_CONFIRMADO_WHATSAPP'
    and c.meta_waba_id='377176189908880'
    and c.meta_phone_number_id='309132033809134'
    and c.meta_waba_id=ent.entrada->>'id'
    and c.meta_phone_number_id=ch.alteracao->'value'->'metadata'->>'phone_number_id'
    and ch.alteracao->>'field'='messages'
    and msg.mensagem->>'id'=p.meta_resposta_id
    and msg.mensagem->>'type'=i.tipo_mensagem
    and msg.mensagem->'context'->>'id'=c.meta_message_id
    and c.destinatario_e164=p_destinatario_permitido
  limit 1;

  if not found then
    return jsonb_build_object('status','contexto_nao_elegivel');
  end if;
  v_tel:=regexp_replace(coalesce(v.whatsapp,''),'[^0-9]','','g');
  v_numero:=ltrim(v.destinatario_e164,'+');
  v_outro:=case when length(v_numero)=13 and substring(v_numero from 5 for 1)='9'
    then substring(v_numero from 1 for 4)||substring(v_numero from 6)
    else v_numero end;

  if v_tel<>v_numero
    or v.remetente_clique not in (v_numero,v_outro)
    or v.atendimento_estado<>'confirmado'
    or v.convite_estado<>'confirmado'
    or v.inicio_planejado is distinct from v.inicio_snapshot
    or v.chegada_atual is distinct from v.chegada_snapshot
    or v.inicio_planejado is null or v.inicio_planejado<=now()
    or v.clique_recebido_em>now()+interval '1 minute'
    or v.clique_recebido_em<now()-interval '23 hours 55 minutes'
    or v.mensagem_clique_id !~ '^wamid\.[A-Za-z0-9._-]{4,290}$'
    or length(btrim(v.texto)) not between 1 and 4096
  then
    return jsonb_build_object('status','contexto_nao_elegivel');
  end if;
  return jsonb_build_object(
    'status','pronto',
    'eventoCodigo',v.evento_codigo,
    'statusAtendimento',v.atendimento_estado,
    'statusConvite',v.convite_estado,
    'modeloPublicado',true,
    'textoModelo',v.texto,
    'destinatarioE164',v.destinatario_e164,
    'remetenteClique',v.remetente_clique,
    'mensagemCliqueId',v.mensagem_clique_id,
    'inicioAtualIso',v.inicio_planejado,
    'inicioConviteIso',v.inicio_snapshot,
    'cliqueRecebidoIso',v.clique_recebido_em,
    'agoraIso',now(),
    'nomeTutor',v.nome_tutor,
    'nomePet',v.nome_pet,
    'nomeEmpresa',v.nome_empresa
  );
end;
$body$;

revoke all on function public.mensageria_hml_outbox_contexto(uuid,uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.mensageria_hml_outbox_contexto(uuid,uuid,uuid,text)
  to service_role;
