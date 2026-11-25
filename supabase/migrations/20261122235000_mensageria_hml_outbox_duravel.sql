-- KAZA PET Mensageria | Outbox durável somente na HML jgtctzqieyorhvqxjbpk
-- Não habilita envios e não adiciona worker, cron, webhook ou publicação.
begin;

alter table public.mensageria_hml_respostas_outbox
  add column if not exists modelo_versao_id uuid
  references public.mensageria_modelo_versoes(id) on delete restrict;
alter table public.mensageria_hml_respostas_outbox
  drop constraint mensageria_hml_respostas_outbox_estado_check;
alter table public.mensageria_hml_respostas_outbox
  add constraint mensageria_hml_respostas_outbox_estado_check
  check (estado in (
    'aguardando_integracao','pronto','reservado',
    'aceito_meta','recusado_meta','indeterminado',
    'enviado','falha'
  ));

create table if not exists public.mensageria_hml_respostas_tentativas (
  id uuid primary key default gen_random_uuid(),
  outbox_id uuid not null unique
    references public.mensageria_hml_respostas_outbox(id) on delete restrict,
  chave_idempotencia uuid not null unique,
  operador_id uuid not null,
  estado text not null default 'reservado'
    check (estado in ('reservado','aceito_meta','recusado_meta','indeterminado')),
  meta_message_id text unique,
  codigo_resultado text,
  reservado_em timestamptz not null default now(),
  concluido_em timestamptz,
  check (estado <> 'aceito_meta' or meta_message_id is not null),
  check (meta_message_id is null or (
    length(meta_message_id) between 10 and 300
    and meta_message_id ~ '^wamid\.[A-Za-z0-9._-]+$')),
  check (codigo_resultado is null or codigo_resultado ~ '^[A-Z][A-Z0-9_]{1,63}$')
);

alter table public.mensageria_hml_respostas_tentativas enable row level security;
revoke all on public.mensageria_hml_respostas_tentativas
  from public, anon, authenticated, service_role;
create index if not exists mensageria_hml_respostas_tentativas_estado_idx
  on public.mensageria_hml_respostas_tentativas(estado,reservado_em);

create or replace function public.mensageria_hml_outbox_preparar(
 p_outbox uuid, p_versao uuid, p_operador uuid
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog
as $body$
declare
  o public.mensageria_hml_respostas_outbox%rowtype;
  m record;
  c public.mensageria_hml_convites_confirmacao%rowtype;
  a public.atendimentos%rowtype;
begin
  if p_outbox is null or p_versao is null or p_operador is null
    or not exists (select 1 from auth.users u where u.id=p_operador
      and u.raw_app_meta_data->>'role'='internal'
      and u.raw_app_meta_data->>'whatsapp_admin'='true') then
    return jsonb_build_object('status','rejeitado');
  end if;

  select * into o from public.mensageria_hml_respostas_outbox
    where id=p_outbox for update;
  if not found then return jsonb_build_object('status','nao_encontrado'); end if;
  if o.estado='pronto' and o.modelo_versao_id=p_versao then
    return jsonb_build_object('status','ja_preparado');
  end if;
  if o.estado<>'aguardando_integracao' then
    return jsonb_build_object('status','conflito');
  end if;

  select v.id, v.estado, v.texto, mo.ativo, mo.codigo, mo.contexto into m
    from public.mensageria_modelo_versoes v
    join public.mensageria_modelos mo on mo.id=v.modelo_id
    where v.id=p_versao;
  if not found or m.estado<>'publicada' or m.ativo is distinct from true
    or m.codigo<>o.evento_codigo or m.contexto<>'agenda'
    or length(btrim(m.texto))=0 then
    return jsonb_build_object('status','modelo_nao_publicado');
  end if;
  if o.evento_codigo<>'AGENDAMENTO_CONFIRMADO_WHATSAPP' then
    return jsonb_build_object('status','evento_ainda_nao_habilitado');
  end if;
  select * into c from public.mensageria_hml_convites_confirmacao
    where id=o.convite_id;
  select * into a from public.atendimentos where id=o.atendimento_id;
  if c.id is null or a.id is null or c.atendimento_id<>o.atendimento_id
    or c.estado<>'confirmado' or a.status<>'confirmado'
    or a.inicio_planejado is distinct from c.inicio_snapshot
    or a.inicio_planejado<=now() then
    return jsonb_build_object('status','agenda_invalida');
  end if;
  if not exists(select 1 from public.mensageria_hml_convite_processamentos proc
    where proc.convite_id=c.id and proc.acao='confirmar' and proc.resultado='confirmado') then
    return jsonb_build_object('status','clique_nao_processado');
  end if;

  update public.mensageria_hml_respostas_outbox
    set modelo_versao_id=p_versao,estado='pronto'
    where id=o.id;
  return jsonb_build_object('status','pronto','outbox_id',o.id);
end;
$body$;

create or replace function public.mensageria_hml_outbox_reservar(
 p_outbox uuid, p_chave uuid, p_operador uuid
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog
as $body$
declare
  o public.mensageria_hml_respostas_outbox%rowtype;
  c public.mensageria_hml_convites_confirmacao%rowtype;
  a public.atendimentos%rowtype;
  tentativa uuid;
begin
  if p_outbox is null or p_chave is null or p_operador is null
     or not exists (select 1 from auth.users u where u.id=p_operador
       and u.raw_app_meta_data->>'role'='internal'
       and u.raw_app_meta_data->>'whatsapp_admin'='true') then
    return jsonb_build_object('status','rejeitado');
  end if;
  select * into o from public.mensageria_hml_respostas_outbox
    where id=p_outbox for update;
  if not found then return jsonb_build_object('status','nao_encontrado'); end if;

  -- Um outbox só pode ser reservado UMA VEZ, inclusive entre workers ou retries.
  if exists(select 1 from public.mensageria_hml_respostas_tentativas t
    where t.outbox_id=p_outbox) then
    return jsonb_build_object('status','ja_reservado');
  end if;
  if o.estado<>'pronto' or o.modelo_versao_id is null then
    return jsonb_build_object('status','nao_pronto');
  end if;
  if not exists(select 1 from public.mensageria_modelo_versoes v
    join public.mensageria_modelos m on m.id=v.modelo_id
    where v.id=o.modelo_versao_id and v.estado='publicada'
      and m.ativo and m.codigo=o.evento_codigo and m.contexto='agenda') then
    return jsonb_build_object('status','modelo_despublicado');
  end if;
  select * into c from public.mensageria_hml_convites_confirmacao
    where id=o.convite_id;
  select * into a from public.atendimentos where id=o.atendimento_id;
  if c.id is null or a.id is null or c.atendimento_id<>o.atendimento_id
    or c.estado<>'confirmado' or a.status<>'confirmado'
    or a.inicio_planejado is distinct from c.inicio_snapshot
    or a.inicio_planejado<=now() then
    return jsonb_build_object('status','agenda_invalida');
  end if;
  if not exists(select 1 from public.mensageria_hml_convite_processamentos proc
    where proc.convite_id=c.id and proc.acao='confirmar'
      and proc.resultado='confirmado'
      and proc.criado_em>now()-interval '23 hours 55 minutes') then
    return jsonb_build_object('status','janela_inbound_indisponivel');
  end if;

  insert into public.mensageria_hml_respostas_tentativas
    (outbox_id,chave_idempotencia,operador_id)
  values (p_outbox,p_chave,p_operador) returning id into tentativa;
  update public.mensageria_hml_respostas_outbox
    set estado='reservado' where id=p_outbox;
  return jsonb_build_object('status','reservado','tentativa_id',tentativa);
end;
$body$;

create or replace function public.mensageria_hml_outbox_finalizar(
 p_outbox uuid,p_chave uuid,p_operador uuid,p_resultado text,
 p_wamid text default null,p_codigo text default null
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog
as $body$
declare
  o public.mensageria_hml_respostas_outbox%rowtype;
  t public.mensageria_hml_respostas_tentativas%rowtype;
begin
  if p_outbox is null or p_chave is null or p_operador is null
    or not exists(select 1 from auth.users u where u.id=p_operador
      and u.raw_app_meta_data->>'role'='internal'
      and u.raw_app_meta_data->>'whatsapp_admin'='true') then
    return jsonb_build_object('status','rejeitado');
  end if;
  if p_resultado not in ('aceito_meta','recusado_meta','indeterminado')
     or p_resultado is null then
    return jsonb_build_object('status','resultado_invalido');
  end if;
  if p_resultado='aceito_meta' then
    if p_wamid is null or length(p_wamid) not between 10 and 300
      or p_wamid !~ '^wamid\.[A-Za-z0-9._-]+$' or p_codigo is not null then
      return jsonb_build_object('status','aceite_invalido');
    end if;
  else
    if p_wamid is not null or p_codigo is null
      or p_codigo !~ '^[A-Z][A-Z0-9_]{1,63}$' then
      return jsonb_build_object('status','motivo_invalido');
    end if;
  end if;

  select * into o from public.mensageria_hml_respostas_outbox
    where id=p_outbox for update;
  if not found then return jsonb_build_object('status','nao_encontrado'); end if;
  select * into t from public.mensageria_hml_respostas_tentativas
    where outbox_id=p_outbox for update;
  if not found or t.chave_idempotencia<>p_chave or t.operador_id<>p_operador then
    return jsonb_build_object('status','tentativa_nao_corresponde');
  end if;
  if t.estado<>'reservado' then
    if t.estado=p_resultado
      and t.meta_message_id is not distinct from p_wamid
      and t.codigo_resultado is not distinct from p_codigo then
      return jsonb_build_object('status','ja_registrado');
    end if;
    return jsonb_build_object('status','resultado_ja_fechado');
  end if;
  if o.estado<>'reservado' then
    return jsonb_build_object('status','outbox_nao_reservada');
  end if;

  update public.mensageria_hml_respostas_tentativas
    set estado=p_resultado,meta_message_id=p_wamid,codigo_resultado=p_codigo,
      concluido_em=now()
    where id=t.id;
  update public.mensageria_hml_respostas_outbox
    set estado=p_resultado where id=p_outbox;
  return jsonb_build_object('status',p_resultado,'tentativa_id',t.id);
end;
$body$;

revoke all on function public.mensageria_hml_outbox_preparar(uuid,uuid,uuid)
 from public,anon,authenticated;
grant execute on function public.mensageria_hml_outbox_preparar(uuid,uuid,uuid)
 to service_role;
revoke all on function public.mensageria_hml_outbox_reservar(uuid,uuid,uuid)
 from public,anon,authenticated;
grant execute on function public.mensageria_hml_outbox_reservar(uuid,uuid,uuid)
 to service_role;
revoke all on function public.mensageria_hml_outbox_finalizar(uuid,uuid,uuid,text,text,text)
 from public,anon,authenticated;
grant execute on function public.mensageria_hml_outbox_finalizar(uuid,uuid,uuid,text,text,text)
 to service_role;
commit;
