-- CANDIDATO HML V2, FORA DE MIGRATIONS. NAO EXECUTAR REMOTAMENTE.
-- Depende da migration HML 20261124171859. Executor deve envolver TODO o
-- arquivo em uma transacao com ON_ERROR_STOP. Sem BEGIN/COMMIT internos.
-- A primeira instalacao v2 so e suportada com historico vazio.
lock table mensageria_hml_auditoria_interna.decisoes in access exclusive mode;
do $guard$
begin
  if exists(select 1 from mensageria_hml_auditoria_interna.decisoes) then
    raise exception 'HISTORICO_V1_NAO_VAZIO: exigir plano separado de preservacao';
  end if;
end;
$guard$;

alter table mensageria_hml_auditoria_interna.decisoes
  add column predecessor_id uuid,
  add column versao integer not null,
  add constraint auditoria_v2_versao_positiva check(versao>0),
  add constraint auditoria_v2_raiz check((versao=1)=(predecessor_id is null)),
  add constraint auditoria_v2_sem_auto_referencia check(predecessor_id is distinct from id),
  add constraint auditoria_v2_tentativa_evento unique(tentativa_id,id),
  add constraint auditoria_v2_tentativa_versao unique(tentativa_id,versao),
  add constraint auditoria_v2_sucessor_unico unique nulls not distinct(tentativa_id,predecessor_id),
  add constraint auditoria_v2_predecessor_fk foreign key(tentativa_id,predecessor_id)
    references mensageria_hml_auditoria_interna.decisoes(tentativa_id,id) on delete restrict;

-- Bloqueio da rota antiga: nao aceitar escrita v1 sem predecessor.
-- Preserva assinatura para diagnostico, mas nao concede EXECUTE de aplicacao.
create or replace function public.mensageria_hml_registrar_decisao_auditoria(
  p_operador uuid,p_tentativa uuid,p_categoria text,p_decisao text,p_motivo text,p_chave uuid
) returns jsonb language plpgsql volatile security definer set search_path=pg_catalog
as $fn$
begin
  return jsonb_build_object('status','versao_obsoleta','reenvio_automatico_autorizado',false);
end;
$fn$;
revoke all on function public.mensageria_hml_registrar_decisao_auditoria(uuid,uuid,text,text,text,uuid)
  from public,anon,authenticated,service_role;

create function public.mensageria_hml_registrar_decisao_auditoria_v2(
  p_operador uuid,p_tentativa uuid,p_categoria text,p_decisao text,
  p_motivo text,p_chave uuid,p_predecessor uuid
) returns jsonb language plpgsql volatile security definer set search_path=pg_catalog
as $fn$
declare
  v_evento mensageria_hml_auditoria_interna.decisoes%rowtype;
  v_categoria text;
  v_head uuid;
  v_versao integer;
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

  -- Namespaces de lock distintos; sempre chave primeiro, tentativa depois.
  -- READ COMMITTED garante nova leitura apos espera pelo lock.
  if current_setting('transaction_isolation')<>'read committed' then
    return jsonb_build_object('status','isolamento_invalido','reenvio_automatico_autorizado',false);
  end if;
  perform pg_advisory_xact_lock(202611241,hashtext(p_operador::text||':'||p_chave::text));
  perform pg_advisory_xact_lock(202611242,hashtext(p_tentativa::text));
  -- Revalidar autorizacao apos uma possivel espera.
  if not mensageria_hml_auditoria_interna.operador_valido(p_operador) then
    return jsonb_build_object('status','nao_autorizado','reenvio_automatico_autorizado',false);
  end if;
  select d.* into v_evento from mensageria_hml_auditoria_interna.decisoes d
    where d.operador_id=p_operador and d.chave_idempotencia=p_chave;
  if found then
    if (v_evento.tentativa_id,v_evento.categoria,v_evento.decisao,v_evento.motivo,v_evento.predecessor_id)
      is distinct from (p_tentativa,p_categoria,p_decisao,p_motivo,p_predecessor) then
      return jsonb_build_object('status','conflito_idempotencia','reenvio_automatico_autorizado',false);
    end if;
    v_status:='ja_registrado';
  else
    select d.id,d.versao into v_head,v_versao
      from mensageria_hml_auditoria_interna.decisoes d
      where d.tentativa_id=p_tentativa order by d.versao desc limit 1;
    if v_head is distinct from p_predecessor then
      return jsonb_build_object('status','predecessor_desatualizado','reenvio_automatico_autorizado',false);
    end if;
    select c.categoria into v_categoria from mensageria_hml_auditoria_interna.classificar(p_tentativa) c;
    if not found then
      return jsonb_build_object('status','caso_nao_elegivel','reenvio_automatico_autorizado',false);
    end if;
    if v_categoria is distinct from p_categoria then
      return jsonb_build_object('status','categoria_desatualizada','reenvio_automatico_autorizado',false);
    end if;
    insert into mensageria_hml_auditoria_interna.decisoes(tentativa_id,operador_id,categoria,decisao,motivo,chave_idempotencia,predecessor_id,versao)
      values(p_tentativa,p_operador,p_categoria,p_decisao,p_motivo,p_chave,p_predecessor,coalesce(v_versao,0)+1)
      returning * into v_evento;
  end if;
  -- A classificacao e a evidencia observada na leitura, nao garantia de
  -- que um webhook posterior nao mude o estado tecnico.
  return jsonb_build_object('status',v_status,'evento_id',v_evento.id,
    'tentativa_id',v_evento.tentativa_id,'categoria',v_evento.categoria,
    'decisao',v_evento.decisao,'motivo',v_evento.motivo,
    'registrado_em',v_evento.registrado_em,'predecessor_id',v_evento.predecessor_id,
    'versao',v_evento.versao,'reenvio_automatico_autorizado',false);
end;
$fn$;

revoke all on function public.mensageria_hml_registrar_decisao_auditoria_v2(uuid,uuid,text,text,text,uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.mensageria_hml_registrar_decisao_auditoria_v2(uuid,uuid,text,text,text,uuid,uuid)
  to service_role;

-- Historico por tentativa; nao depende da classificacao ainda estar ativa.
-- Cursor exclusivo de versao. Head e pagina pertencem ao mesmo snapshot
-- da consulta STABLE. Nao retorna operador, chave, telefone, wamid ou payload.
create function public.mensageria_hml_historico_auditoria_v2(
  p_operador uuid,p_tentativa uuid,p_limite integer default 20,p_antes_versao integer default null
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $fn$
declare
  v_head uuid;
  v_versao integer;
  v_categoria text;
  v_eventos jsonb;
  v_proxima integer;
begin
  if not mensageria_hml_auditoria_interna.operador_valido(p_operador) then
    return jsonb_build_object('status','nao_autorizado','reenvio_automatico_autorizado',false);
  end if;
  if p_tentativa is null or p_limite is null or p_limite not between 1 and 20
     or (p_antes_versao is not null and p_antes_versao<1) then
    return jsonb_build_object('status','entrada_invalida','reenvio_automatico_autorizado',false);
  end if;
  if not exists(
    select 1 from public.mensageria_hml_respostas_tentativas t
      join public.mensageria_hml_respostas_outbox o on o.id=t.outbox_id
    where t.id=p_tentativa and o.evento_codigo='AGENDAMENTO_CONFIRMADO_WHATSAPP'
  ) then
    return jsonb_build_object('status','caso_nao_encontrado','reenvio_automatico_autorizado',false);
  end if;
  select d.id,d.versao into v_head,v_versao
    from mensageria_hml_auditoria_interna.decisoes d
    where d.tentativa_id=p_tentativa order by d.versao desc limit 1;
  select c.categoria into v_categoria from mensageria_hml_auditoria_interna.classificar(p_tentativa) c;
  select coalesce(jsonb_agg(jsonb_build_object(
      'evento_id',d.id,'tentativa_id',d.tentativa_id,'predecessor_id',d.predecessor_id,
      'versao',d.versao,'categoria',d.categoria,'decisao',d.decisao,
      'motivo',d.motivo,'registrado_em',d.registrado_em
    ) order by d.versao desc),'[]'::jsonb),min(d.versao)
    into v_eventos,v_proxima
    from (
      select x.* from mensageria_hml_auditoria_interna.decisoes x
      where x.tentativa_id=p_tentativa and (p_antes_versao is null or x.versao<p_antes_versao)
      order by x.versao desc limit p_limite
    ) d;
  if v_proxima is not null and not exists(
    select 1 from mensageria_hml_auditoria_interna.decisoes x
    where x.tentativa_id=p_tentativa and x.versao<v_proxima
  ) then v_proxima:=null; end if;
  return jsonb_build_object('status','ok','tentativa_id',p_tentativa,
    'head_evento_id',v_head,'head_versao',coalesce(v_versao,0),
    'categoria_atual',v_categoria,'eventos',v_eventos,'quantidade',jsonb_array_length(v_eventos),
    'proxima_antes_versao',v_proxima,'reenvio_automatico_autorizado',false);
end;
$fn$;
revoke all on function public.mensageria_hml_historico_auditoria_v2(uuid,uuid,integer,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.mensageria_hml_historico_auditoria_v2(uuid,uuid,integer,integer)
  to service_role;
