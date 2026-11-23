-- KAZA PET Manager | WhatsApp confirmação por botão | SOMENTE HML
-- HML project jgtctzqieyorhvqxjbpk. NÃO executar em produção.
-- Não instala despachante, não habilita webhook ou envios, não mexe em clientes reais.
create table if not exists public.mensageria_hml_convites_confirmacao (
  id uuid primary key default gen_random_uuid(),
  atendimento_id uuid not null references public.atendimentos(id) on delete restrict,
  grupo_id uuid not null references public.grupos_agendamento(id) on delete restrict,
  empresa_id uuid not null,
  unidade_id uuid not null,
  meta_waba_id text not null check (meta_waba_id ~ '^[0-9]{5,30}$'),
  meta_phone_number_id text not null check (meta_phone_number_id ~ '^[0-9]{5,30}$'),
  meta_message_id text not null unique check (length(meta_message_id) between 8 and 300),
  destinatario_e164 text not null check (destinatario_e164 ~ '^\+55[0-9]{10,11}$'),
  inicio_snapshot timestamptz,
  chegada_snapshot timestamptz,
  expira_em timestamptz not null,
  estado text not null default 'ativo' check (estado in ('ativo','confirmado','remarcacao_pendente','invalido','expirado')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (expira_em > criado_em),
  unique (atendimento_id, meta_message_id)
);
create table if not exists public.mensageria_hml_convite_acoes (
  convite_id uuid not null references public.mensageria_hml_convites_confirmacao(id) on delete restrict,
  acao text not null check (acao in ('confirmar','remarcar')),
  token_sha256 text not null unique check (token_sha256 ~ '^[0-9a-f]{64}$'),
  primary key (convite_id,acao)
);
create table if not exists public.mensageria_hml_convite_processamentos (
  id uuid primary key default gen_random_uuid(),
  convite_id uuid not null references public.mensageria_hml_convites_confirmacao(id) on delete restrict,
  webhook_item_id uuid not null unique references public.mensageria_webhook_itens_meta(id) on delete restrict,
  meta_resposta_id text not null unique,
  acao text not null check (acao in ('confirmar','remarcar')),
  resultado text not null check (resultado in ('confirmado','remarcacao_pendente')),
  criado_em timestamptz not null default now()
);
create table if not exists public.mensageria_hml_pedidos_remarcacao (
  id uuid primary key default gen_random_uuid(),
  convite_id uuid not null unique references public.mensageria_hml_convites_confirmacao(id) on delete restrict,
  atendimento_id uuid not null references public.atendimentos(id) on delete restrict,
  estado text not null default 'pendente' check (estado in ('pendente','resolvido','cancelado')),
  criado_em timestamptz not null default now()
);
create table if not exists public.mensageria_hml_respostas_outbox (
  id uuid primary key default gen_random_uuid(),
  convite_id uuid not null unique references public.mensageria_hml_convites_confirmacao(id) on delete restrict,
  atendimento_id uuid not null references public.atendimentos(id) on delete restrict,
  evento_codigo text not null check (evento_codigo in ('AGENDAMENTO_CONFIRMADO_WHATSAPP','REMARCACAO_SOLICITADA_WHATSAPP')),
  estado text not null default 'aguardando_integracao' check (estado in ('aguardando_integracao','pronto','reservado','enviado','falha')),
  criado_em timestamptz not null default now()
);
do $$
declare v_rel text;
begin
  foreach v_rel in array array[
    'mensageria_hml_convites_confirmacao',
    'mensageria_hml_convite_acoes',
    'mensageria_hml_convite_processamentos',
    'mensageria_hml_pedidos_remarcacao',
    'mensageria_hml_respostas_outbox'
  ] loop
    execute format('alter table public.%I enable row level security',v_rel);
    execute format('revoke all on table public.%I from public, anon, authenticated',v_rel);
    -- service_role NÃO recebe SELECT nem escrita direta, somente RPC restrita
    execute format('revoke all on table public.%I from service_role',v_rel);
  end loop;
end$$;

create or replace function public.mensageria_hml_processar_confirmacao(p_item uuid,p_operador uuid)
returns jsonb
language plpgsql security definer
set search_path to pg_catalog
as $body$
declare
  v_meta record;
  v_convite public.mensageria_hml_convites_confirmacao%rowtype;
  v_agenda public.atendimentos%rowtype;
  v_grupo public.grupos_agendamento%rowtype;
  v_acao text;
  v_destino text;
  v_alternativo text;
  v_resultado text;
  v_evento text;
  v_outbox uuid;
begin
  -- Este RPC não pode ser chamado pelo browser. Somente service_role da HML.
  -- O webhook externo deve ser recebido por HMAC no receptor já existente.
  if p_item is null or p_operador is null or not exists (
    select 1 from auth.users u where u.id=p_operador
      and u.raw_app_meta_data->>'role'='internal'
      and u.raw_app_meta_data->>'whatsapp_admin'='true'
  ) then return jsonb_build_object('status','rejeitado','codigo','OPERADOR_NAO_AUTORIZADO'); end if;

  perform pg_advisory_xact_lock(hashtextextended('whatsapp_hml_confirmacao_item:'||p_item::text,0));
  if exists(select 1 from public.mensageria_hml_convite_processamentos p where p.webhook_item_id=p_item) then
    return jsonb_build_object('status','ja_processado');
  end if;

  -- Nunca aceitar payload fabricado pelo cliente. Lê somente item persistido
  -- por um webhook Meta cuja assinatura foi validada sobre o corpo bruto.
  select msg.message->>'id' as id_resposta,
         msg.message->>'from' as origem,
         msg.message->'context'->>'id' as id_original,
         case msg.message->>'type'
           when 'button' then msg.message->'button'->>'payload'
           when 'interactive' then msg.message->'interactive'->'button_reply'->>'id'
           else null end as token,
         (entry.obj->>'id') as waba,
         (chg.obj->'value'->'metadata'->>'phone_number_id') as phone_number_id,
         msg.message->>'type' as tipo
  into v_meta
  from public.mensageria_webhook_itens_meta i
  join public.mensageria_webhooks_meta w on w.id=i.webhook_id
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(w.payload->'entry')='array' then w.payload->'entry' else '[]'::jsonb end
  ) entry(obj)
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(entry.obj->'changes')='array' then entry.obj->'changes' else '[]'::jsonb end
  ) chg(obj)
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(chg.obj->'value'->'messages')='array' then chg.obj->'value'->'messages' else '[]'::jsonb end
  ) msg(message)
  where i.id=p_item and i.tipo='mensagem_inbound'
    and w.assinatura_validada_at is not null and w.classificacao='processavel'
    and w.payload->>'object'='whatsapp_business_account'
    and chg.obj->>'field'='messages'
    and msg.message->>'id'=i.mensagem_externa_id
    and msg.message->>'type' in ('button','interactive')
  limit 1;
  if not found then return jsonb_build_object('status','ignorado','codigo','WEBHOOK_NAO_VALIDADO'); end if;
  if v_meta.id_resposta is null or v_meta.id_original is null
     or v_meta.origem !~ '^[0-9]{10,15}$'
     or v_meta.token !~* '^KPAG1_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then return jsonb_build_object('status','ignorado','codigo','CLIQUE_INVALIDO_OU_NAO_VERIFICADO'); end if;
  if exists(select 1 from public.mensageria_hml_convite_processamentos p where p.meta_resposta_id=v_meta.id_resposta) then
    return jsonb_build_object('status','ja_processado');
  end if;

  select c.* into v_convite
  from public.mensageria_hml_convites_confirmacao c
  join public.mensageria_hml_convite_acoes ac on ac.convite_id=c.id
  where ac.token_sha256=encode(sha256(convert_to(v_meta.token,'UTF8')),'hex')
    and c.meta_message_id=v_meta.id_original
    and c.meta_waba_id=v_meta.waba
    and c.meta_phone_number_id=v_meta.phone_number_id
  for update of c;
  if not found then return jsonb_build_object('status','ignorado','codigo','CONVITE_NAO_CORRESPONDE'); end if;
  select ac.acao into v_acao
  from public.mensageria_hml_convite_acoes ac
  where ac.convite_id=v_convite.id
    and ac.token_sha256=encode(sha256(convert_to(v_meta.token,'UTF8')),'hex');
  if not found then return jsonb_build_object('status','ignorado','codigo','ACAO_NAO_CORRESPONDE'); end if;

  v_destino := ltrim(v_convite.destinatario_e164,'+');
  v_alternativo:=case when length(v_destino)=13 and substring(v_destino from 5 for 1)='9'
    then substring(v_destino from 1 for 4)||substring(v_destino from 6)
    else v_destino end;
  if v_meta.origem not in (v_destino,v_alternativo) then
    return jsonb_build_object('status','rejeitado','codigo','REMETENTE_NAO_CORRESPONDE');
  end if;
  if v_convite.estado<>'ativo' then
    return jsonb_build_object('status','ja_resolvido','estado',v_convite.estado);
  end if;
  if v_convite.expira_em<=now() then
    update public.mensageria_hml_convites_confirmacao set estado='expirado',atualizado_em=now() where id=v_convite.id;
    return jsonb_build_object('status','expirado');
  end if;

  select a.* into v_agenda from public.atendimentos a
  join public.grupos_agendamento g on g.id=a.grupo_agendamento_id
  join mensageria_interna.agenda_grupos ag on ag.grupo_id=g.id
  where a.id=v_convite.atendimento_id and g.id=v_convite.grupo_id
    and ag.empresa_id=v_convite.empresa_id and ag.unidade_id=v_convite.unidade_id
    and ag.cliente_id=g.cliente_id and g.cliente_id='CLI-990003'
  for update of a;
  if not found then return jsonb_build_object('status','rejeitado','codigo','AGENDA_HML_FORA_ESCOPO'); end if;

  select * into v_grupo from public.grupos_agendamento g where g.id=v_convite.grupo_id for share;
  if v_agenda.status<>'agendado'
    or v_agenda.inicio_planejado is distinct from v_convite.inicio_snapshot
    or v_grupo.horario_chegada_comprometido is distinct from v_convite.chegada_snapshot
  then
    update public.mensageria_hml_convites_confirmacao set estado='invalido',atualizado_em=now() where id=v_convite.id;
    return jsonb_build_object('status','conflito','codigo','AGENDAMENTO_ALTERADO');
  end if;

  if v_acao='confirmar' then
    -- Respeita o mesmo advisory lock usado pelo RPC de status operacional
    -- e todos os triggers comerciais da tabela atendimentos.
    perform pg_advisory_xact_lock(hashtextextended('atendimento:status:'||v_agenda.id::text,0));
    perform set_config('kaza.credito_usuario_id',p_operador::text,true);
    perform set_config('kaza.credito_origem','whatsapp_meta',true);
    perform set_config('kaza.credito_motivo','Clique no botao Confirmar',true);
    update public.atendimentos set status='confirmado'
    where id=v_agenda.id and status='agendado';
    if not found then
      return jsonb_build_object('status','conflito','codigo','STATUS_ALTERADO');
    end if;

    -- O trigger contratual registra o evento quando há créditos vinculados.
    -- Para avulsos sem créditos, registra o evento uma única vez aqui.
    if not exists(select 1 from public.contrato_ciclo_ocorrencias o where o.atendimento_id=v_agenda.id)
       and not exists(select 1 from public.contrato_credito_vinculos_044 v where v.atendimento_id=v_agenda.id)
    then
      insert into public.atendimento_status_eventos
       (atendimento_id,status_anterior,status_novo,origem,responsavel_id,motivo)
      values(v_agenda.id,'agendado','confirmado','whatsapp_meta',p_operador,'Confirmado pelo botao Meta HML');
    end if;
    v_resultado:='confirmado';
    v_evento:='AGENDAMENTO_CONFIRMADO_WHATSAPP';
  else
    insert into public.mensageria_hml_pedidos_remarcacao (convite_id,atendimento_id)
    values(v_convite.id,v_agenda.id);
    v_resultado:='remarcacao_pendente';
    v_evento:='REMARCACAO_SOLICITADA_WHATSAPP';
  end if;

  insert into public.mensageria_hml_convite_processamentos
    (convite_id,webhook_item_id,meta_resposta_id,acao,resultado)
  values(v_convite.id,p_item,v_meta.id_resposta,v_acao,v_resultado);

  update public.mensageria_hml_convites_confirmacao set estado=v_resultado,atualizado_em=now()
  where id=v_convite.id;

  -- Sem disparo. Futuro consumidor enviará UMA resposta após o COMMIT.
  insert into public.mensageria_hml_respostas_outbox(convite_id,atendimento_id,evento_codigo)
  values(v_convite.id,v_agenda.id,v_evento)
  returning id into v_outbox;

  return jsonb_build_object('status',v_resultado,'atendimentoId',v_agenda.id,'outboxId',v_outbox);
end;
$body$;

revoke all on function public.mensageria_hml_processar_confirmacao(uuid,uuid) from public,anon,authenticated;
grant execute on function public.mensageria_hml_processar_confirmacao(uuid,uuid) to service_role;