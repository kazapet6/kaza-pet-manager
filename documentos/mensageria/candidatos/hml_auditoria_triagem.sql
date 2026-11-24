-- CANDIDATO HML, NAO E MIGRATION. NAO EXECUTAR EM PRODUCAO.
-- Destino permitido para futura instalacao: jgtctzqieyorhvqxjbpk.
-- Validar primeiro em banco descartavel com schema HML; nenhuma chamada externa.
-- Transacao gerenciada pelo executor; nao inclui COMMIT.
create schema mensageria_hml_auditoria_interna;
revoke all on schema mensageria_hml_auditoria_interna from public,anon,authenticated,service_role;

create table mensageria_hml_auditoria_interna.decisoes (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  tentativa_id uuid not null references public.mensageria_hml_respostas_tentativas(id) on delete restrict,
  operador_id uuid not null,
  categoria text not null check (categoria in (
    'reserva_antiga','resultado_indeterminado','status_contraditorio',
    'status_falhou','aceite_sem_status','entrega_sem_confirmacao')),
  decisao text not null check (decisao in (
    'manter_em_investigacao','solicitar_verificacao_externa','registrar_revisao_sem_reenvio')),
  motivo text not null check (motivo in (
    'evidencia_insuficiente','status_inconsistente','identificador_ausente',
    'aguardando_evidencia','revisao_realizada')),
  chave_idempotencia uuid not null,
  registrado_em timestamptz not null default pg_catalog.clock_timestamp(),
  unique (operador_id,chave_idempotencia)
);
create index on mensageria_hml_auditoria_interna.decisoes(tentativa_id,registrado_em,id);
alter table mensageria_hml_auditoria_interna.decisoes enable row level security;
revoke all on mensageria_hml_auditoria_interna.decisoes from public,anon,authenticated,service_role;
-- Sem grants diretos nem politicas de escrita. O dono administrativo pode
-- alterar o schema: append-only e garantido para os papeis de aplicacao.

create function mensageria_hml_auditoria_interna.operador_valido(p_operador uuid)
returns boolean language sql stable security invoker set search_path=pg_catalog
as $fn$
  select p_operador is not null and exists (
    select 1 from auth.users u where u.id=p_operador
      and u.deleted_at is null
      and (u.banned_until is null or u.banned_until<=now())
      and u.raw_app_meta_data->>'role'='internal'
      and u.raw_app_meta_data->>'whatsapp_admin'='true'
  );
$fn$;
revoke all on function mensageria_hml_auditoria_interna.operador_valido(uuid)
  from public,anon,authenticated,service_role;

-- Extracao literal da classificacao da migration 20261123163000.
-- O parametro filtra uma tentativa antes de aplicar qualquer limite de listagem.
create function mensageria_hml_auditoria_interna.classificar(p_tentativa uuid)
returns table(tentativa_id uuid,reservado_em timestamptz,categoria text)
language sql stable security invoker set search_path=pg_catalog
as $fn$
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
    where (p_tentativa is null or t.id=p_tentativa)
  ) z
  where z.categoria is not null;
$fn$;
revoke all on function mensageria_hml_auditoria_interna.classificar(uuid)
  from public,anon,authenticated,service_role;

-- Mantem assinatura, formato, autorizacao e limite anteriores.
create or replace function public.mensageria_hml_outbox_casos_investigacao(
  p_operador uuid,p_limite integer default 10
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $fn$
declare v_casos jsonb;
begin
  if not mensageria_hml_auditoria_interna.operador_valido(p_operador) then
    return jsonb_build_object('status','nao_autorizado');
  end if;
  if p_limite is null or p_limite not between 1 and 20 then
    return jsonb_build_object('status','limite_invalido');
  end if;
  select coalesce(jsonb_agg(
    jsonb_build_object('tentativa_id',z.tentativa_id,'categoria',z.categoria,
      'reservado_em',z.reservado_em) order by z.reservado_em,z.tentativa_id),'[]'::jsonb)
  into v_casos from (
    select c.* from mensageria_hml_auditoria_interna.classificar(null) c
    order by c.reservado_em,c.tentativa_id limit p_limite
  ) z;
  return jsonb_build_object('status','ok','casos',v_casos,
    'quantidade',jsonb_array_length(v_casos),'reenvio_automatico_autorizado',false);
end;
$fn$;
revoke all on function public.mensageria_hml_outbox_casos_investigacao(uuid,integer)
 from public,anon,authenticated;
grant execute on function public.mensageria_hml_outbox_casos_investigacao(uuid,integer) to service_role;

-- RPC restrita ao backend confiavel. A futura Edge deve obter p_operador
-- do JWT autenticado e revalidar sessao; nunca aceitar esse campo do cliente.
create function public.mensageria_hml_registrar_decisao_auditoria(
  p_operador uuid,p_tentativa uuid,p_categoria text,p_decisao text,
  p_motivo text,p_chave uuid
) returns jsonb language plpgsql volatile security definer set search_path=pg_catalog
as $fn$
declare
  v_evento mensageria_hml_auditoria_interna.decisoes%rowtype;
  v_categoria text;
  v_status text := 'registrado';
begin
  if not mensageria_hml_auditoria_interna.operador_valido(p_operador) then
    return jsonb_build_object('status','nao_autorizado','reenvio_automatico_autorizado',false);
  end if;
  if p_tentativa is null or p_chave is null
    or p_categoria is null or p_categoria not in (
      'reserva_antiga','resultado_indeterminado','status_contraditorio',
      'status_falhou','aceite_sem_status','entrega_sem_confirmacao')
    or p_decisao is null or p_decisao not in (
      'manter_em_investigacao','solicitar_verificacao_externa','registrar_revisao_sem_reenvio')
    or p_motivo is null or p_motivo not in (
      'evidencia_insuficiente','status_inconsistente','identificador_ausente',
      'aguardando_evidencia','revisao_realizada') then
    return jsonb_build_object('status','entrada_invalida','reenvio_automatico_autorizado',false);
  end if;

  -- Serializa a mesma chave no READ COMMITTED, sem bloquear a outbox para escrita.
  -- Uma colisao de hash apenas serializa chaves independentes.
  perform pg_advisory_xact_lock(hashtextextended(
    'kaza.hml.auditoria:'||p_operador::text||':'||p_chave::text,0));
  -- Revalidar autorizacao apos uma possivel espera.
  if not mensageria_hml_auditoria_interna.operador_valido(p_operador) then
    return jsonb_build_object('status','nao_autorizado','reenvio_automatico_autorizado',false);
  end if;
  select d.* into v_evento from mensageria_hml_auditoria_interna.decisoes d
    where d.operador_id=p_operador and d.chave_idempotencia=p_chave;
  if found then
    if (v_evento.tentativa_id,v_evento.categoria,v_evento.decisao,v_evento.motivo)
      is distinct from (p_tentativa,p_categoria,p_decisao,p_motivo) then
      return jsonb_build_object('status','conflito_idempotencia','reenvio_automatico_autorizado',false);
    end if;
    v_status:='ja_registrado';
  else
    select c.categoria into v_categoria from mensageria_hml_auditoria_interna.classificar(p_tentativa) c;
    if not found then
      return jsonb_build_object('status','caso_nao_elegivel','reenvio_automatico_autorizado',false);
    end if;
    if v_categoria is distinct from p_categoria then
      return jsonb_build_object('status','categoria_desatualizada','reenvio_automatico_autorizado',false);
    end if;
    insert into mensageria_hml_auditoria_interna.decisoes(tentativa_id,operador_id,categoria,decisao,motivo,chave_idempotencia)
      values(p_tentativa,p_operador,p_categoria,p_decisao,p_motivo,p_chave)
      returning * into v_evento;
  end if;
  -- A classificacao e a evidencia observada na leitura, nao garantia de
  -- que um webhook posterior nao mude o estado tecnico.
  return jsonb_build_object('status',v_status,'evento_id',v_evento.id,
    'tentativa_id',v_evento.tentativa_id,'categoria',v_evento.categoria,
    'decisao',v_evento.decisao,'motivo',v_evento.motivo,
    'registrado_em',v_evento.registrado_em,'reenvio_automatico_autorizado',false);
end;
$fn$;
revoke all on function public.mensageria_hml_registrar_decisao_auditoria(uuid,uuid,text,text,text,uuid)
 from public,anon,authenticated;
grant execute on function public.mensageria_hml_registrar_decisao_auditoria(uuid,uuid,text,text,text,uuid) to service_role;
