-- KAZA PET | Confirmação WhatsApp | preparação + vinculação em duas fases
-- EXCLUSIVO ao projeto HML jgtctzqieyorhvqxjbpk.
-- Sem chamadas à Meta ou a clientes; produção permanece intocada.
begin;

alter table public.mensageria_hml_convites_confirmacao
  alter column meta_message_id drop not null;
alter table public.mensageria_hml_convites_confirmacao
  add column if not exists preparo_idempotencia uuid unique;
alter table public.mensageria_hml_convites_confirmacao
  drop constraint mensageria_hml_convites_confirmacao_estado_check;
alter table public.mensageria_hml_convites_confirmacao
  add constraint mensageria_hml_convites_confirmacao_estado_check
  check (estado in ('preparado','ativo','confirmado','remarcacao_pendente','invalido','expirado','falha'));
alter table public.mensageria_hml_convites_confirmacao
  add constraint mensageria_hml_convite_vinculo_estado_check
  check ((estado='preparado' and meta_message_id is null)
    or (estado in ('ativo','confirmado','remarcacao_pendente','invalido') and meta_message_id is not null)
    or estado in ('expirado','falha'));
create unique index if not exists mensageria_hml_um_convite_pendente_por_agendamento
  on public.mensageria_hml_convites_confirmacao(atendimento_id)
  where estado in ('preparado','ativo');

create or replace function public.mensageria_hml_preparar_convite(
  p_atendimento uuid,
  p_operador uuid,
  p_preparo uuid,
  p_hash_confirmar text,
  p_hash_remarcar text
) returns jsonb
language plpgsql security definer
set search_path=pg_catalog
as $function$
declare
  v record;
  v_existente public.mensageria_hml_convites_confirmacao%rowtype;
  v_novo uuid;
  v_destino text;
  v_inicio timestamptz;
  v_chegada timestamptz;
begin
  if p_atendimento is null or p_operador is null or p_preparo is null
    or p_hash_confirmar !~ '^[0-9a-f]{64}$'
    or p_hash_remarcar !~ '^[0-9a-f]{64}$'
    or p_hash_confirmar=p_hash_remarcar then
    return jsonb_build_object('status','rejeitado','codigo','PARAMETROS_INVALIDOS');
  end if;
  if not exists(select 1 from auth.users u where u.id=p_operador
      and u.raw_app_meta_data->>'role'='internal'
      and u.raw_app_meta_data->>'whatsapp_admin'='true') then
    return jsonb_build_object('status','rejeitado','codigo','OPERADOR_NAO_AUTORIZADO');
  end if;

  -- Mesma ordenação de lock do motor de alterações de status.
  perform pg_advisory_xact_lock(hashtextextended('atendimento:status:'||p_atendimento::text,0));
  select c.* into v_existente from public.mensageria_hml_convites_confirmacao c
  where c.preparo_idempotencia=p_preparo for update;
  if found then
    if v_existente.atendimento_id=p_atendimento
      and v_existente.estado in ('preparado','ativo')
      and v_existente.expira_em>now()
      and exists(select 1 from public.mensageria_hml_convite_acoes ca
        where ca.convite_id=v_existente.id and ca.acao='confirmar'
        and ca.token_sha256=p_hash_confirmar)
      and exists(select 1 from public.mensageria_hml_convite_acoes ca
        where ca.convite_id=v_existente.id and ca.acao='remarcar'
        and ca.token_sha256=p_hash_remarcar) then
      return jsonb_build_object('status','ja_preparado','convite_id',v_existente.id);
    end if;
    return jsonb_build_object('status','conflito','codigo','CHAVE_REUTILIZADA');
  end if;

  select a.status,a.inicio_planejado,a.grupo_agendamento_id,
    g.horario_chegada_comprometido,g.cliente_id,
    ag.empresa_id,ag.unidade_id,c.whatsapp
  into v
  from public.atendimentos a
  join public.grupos_agendamento g on g.id=a.grupo_agendamento_id
  join public.pets pet on pet.id=a.pet_id and pet.cliente_id=g.cliente_id
  join public.clientes c on c.id=g.cliente_id
  join mensageria_interna.agenda_grupos ag on ag.grupo_id=g.id
    and ag.cliente_id=g.cliente_id
  where a.id=p_atendimento and g.cliente_id='CLI-990003'
  for update of a;
  if not found or v.status<>'agendado'
    or v.inicio_planejado is null or v.horario_chegada_comprometido is null
    or v.inicio_planejado<now()+interval '30 minutes' then
    return jsonb_build_object('status','rejeitado','codigo','AGENDAMENTO_NAO_ELEGIVEL');
  end if;
  v_destino:=regexp_replace(coalesce(v.whatsapp,''),'[^0-9]','','g');
  if v_destino !~ '^55[0-9]{11}$' then
    return jsonb_build_object('status','rejeitado','codigo','DESTINATARIO_INVALIDO');
  end if;
  -- Limita à ficha fictícia HML. Números livres NÃO entram pela API.
  v_inicio:=v.inicio_planejado;
  v_chegada:=v.horario_chegada_comprometido;

  update public.mensageria_hml_convites_confirmacao c
    set estado='expirado',atualizado_em=now()
  where c.atendimento_id=p_atendimento and c.estado='preparado' and c.expira_em<=now();

  if exists(select 1 from public.mensageria_hml_convites_confirmacao c
      where c.atendimento_id=p_atendimento and c.estado in ('preparado','ativo')) then
    return jsonb_build_object('status','conflito','codigo','CONVITE_JA_ABERTO');
  end if;

  insert into public.mensageria_hml_convites_confirmacao(
    atendimento_id,grupo_id,empresa_id,unidade_id,
    meta_waba_id,meta_phone_number_id,meta_message_id,destinatario_e164,
    inicio_snapshot,chegada_snapshot,expira_em,estado,preparo_idempotencia)
  values(p_atendimento,v.grupo_agendamento_id,v.empresa_id,v.unidade_id,
    '377176189908880','309132033809134',null,'+'||v_destino,
    v_inicio,v_chegada,now()+interval '10 minutes','preparado',p_preparo)
  returning id into v_novo;
  insert into public.mensageria_hml_convite_acoes(convite_id,acao,token_sha256)
    values(v_novo,'confirmar',p_hash_confirmar),(v_novo,'remarcar',p_hash_remarcar);
  return jsonb_build_object('status','preparado','convite_id',v_novo);
end;
$function$;

create or replace function public.mensageria_hml_vincular_convite_aceito(
  p_preparo uuid,
  p_meta_message_id text,
  p_operador uuid
) returns jsonb
language plpgsql security definer
set search_path=pg_catalog
as $function$
declare
  v_convite public.mensageria_hml_convites_confirmacao%rowtype;
  v_agenda public.atendimentos%rowtype;
  v_grupo public.grupos_agendamento%rowtype;
  v_validade timestamptz;
begin
  if p_preparo is null or p_operador is null
    or p_meta_message_id is null
    or p_meta_message_id !~ '^wamid\.[A-Za-z0-9._\-]{4,290}$' then
    return jsonb_build_object('status','rejeitado','codigo','PARAMETROS_INVALIDOS');
  end if;
  if not exists(select 1 from auth.users u where u.id=p_operador
      and u.raw_app_meta_data->>'role'='internal'
      and u.raw_app_meta_data->>'whatsapp_admin'='true') then
    return jsonb_build_object('status','rejeitado','codigo','OPERADOR_NAO_AUTORIZADO');
  end if;
  select c.* into v_convite from public.mensageria_hml_convites_confirmacao c
   where c.preparo_idempotencia=p_preparo;
  if not found then
    return jsonb_build_object('status','rejeitado','codigo','PREPARO_INEXISTENTE');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('atendimento:status:'||v_convite.atendimento_id::text,0));
  select c.* into v_convite from public.mensageria_hml_convites_confirmacao c
   where c.preparo_idempotencia=p_preparo for update;
  if v_convite.estado='ativo' then
    if v_convite.meta_message_id=p_meta_message_id then
      return jsonb_build_object('status','ja_vinculado','convite_id',v_convite.id);
    end if;
    return jsonb_build_object('status','conflito','codigo','WAMID_DIVERGENTE');
  end if;
  if v_convite.estado<>'preparado' or v_convite.expira_em<=now() then
    return jsonb_build_object('status','rejeitado','codigo','PREPARO_ENCERRADO');
  end if;
  select * into v_agenda from public.atendimentos a
    where a.id=v_convite.atendimento_id for update;
  select * into v_grupo from public.grupos_agendamento g
    where g.id=v_convite.grupo_id for share;
  if not found or v_agenda.status<>'agendado' or
     v_agenda.grupo_agendamento_id is distinct from v_convite.grupo_id or
     v_agenda.inicio_planejado is distinct from v_convite.inicio_snapshot or
     v_grupo.horario_chegada_comprometido is distinct from v_convite.chegada_snapshot then
    update public.mensageria_hml_convites_confirmacao c
    set estado='invalido',atualizado_em=now() where c.id=v_convite.id;
    return jsonb_build_object('status','conflito','codigo','AGENDAMENTO_ALTERADO');
  end if;
  v_validade:=least(now()+interval '24 hours',v_agenda.inicio_planejado-interval '15 minutes');
  if v_validade<=now()+interval '1 minute' then
    return jsonb_build_object('status','rejeitado','codigo','MUITO_PERTO_DO_HORARIO');
  end if;
  update public.mensageria_hml_convites_confirmacao c
    set estado='ativo',meta_message_id=p_meta_message_id,
        expira_em=v_validade,atualizado_em=now()
  where c.id=v_convite.id;
  return jsonb_build_object('status','vinculado','convite_id',v_convite.id);
end;
$function$;

create or replace function public.mensageria_hml_abandonar_preparo(
  p_preparo uuid,p_operador uuid
) returns jsonb
language plpgsql security definer
set search_path=pg_catalog
as $function$
declare v_convite public.mensageria_hml_convites_confirmacao%rowtype;
begin
  if p_preparo is null or p_operador is null or not exists(
    select 1 from auth.users u where u.id=p_operador
     and u.raw_app_meta_data->>'role'='internal'
     and u.raw_app_meta_data->>'whatsapp_admin'='true') then
    return jsonb_build_object('status','rejeitado');
  end if;
  select c.* into v_convite from public.mensageria_hml_convites_confirmacao c
   where c.preparo_idempotencia=p_preparo;
  if not found then return jsonb_build_object('status','inexistente'); end if;
  perform pg_advisory_xact_lock(hashtextextended('atendimento:status:'||v_convite.atendimento_id::text,0));
  select c.* into v_convite from public.mensageria_hml_convites_confirmacao c
   where c.preparo_idempotencia=p_preparo for update;
  if v_convite.estado='falha' then return jsonb_build_object('status','ja_abandonado'); end if;
  if v_convite.estado<>'preparado' then return jsonb_build_object('status','rejeitado','codigo','NAO_E_PREPARO'); end if;
  update public.mensageria_hml_convites_confirmacao set estado='falha',atualizado_em=now()
   where id=v_convite.id;
  return jsonb_build_object('status','abandonado');
end;
$function$;

revoke all on function public.mensageria_hml_preparar_convite(uuid,uuid,uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.mensageria_hml_preparar_convite(uuid,uuid,uuid,text,text)
  to service_role;
revoke all on function public.mensageria_hml_vincular_convite_aceito(uuid,text,uuid)
  from public,anon,authenticated;
grant execute on function public.mensageria_hml_vincular_convite_aceito(uuid,text,uuid)
  to service_role;
revoke all on function public.mensageria_hml_abandonar_preparo(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.mensageria_hml_abandonar_preparo(uuid,uuid)
  to service_role;

commit;
