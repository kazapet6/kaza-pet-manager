-- CANDIDATO V3 HML. FORA DE MIGRATIONS. NAO EXECUTAR REMOTAMENTE.
-- Requer SQL v2, barreira e drenagem v2 antes do DDL; executor envolve em
-- transacao unica ON_ERROR_STOP. Historico preexistente exige plano separado.
lock table mensageria_hml_auditoria_interna.decisoes in access exclusive mode;
do $guard$
begin
  if exists(select 1 from mensageria_hml_auditoria_interna.decisoes) then
    raise exception 'HISTORICO_V2_NAO_VAZIO';
  end if;
end;
$guard$;
-- Mecanismo v2 permanece disponivel SOMENTE ao dono privilegiado.
revoke all on function public.mensageria_hml_registrar_decisao_auditoria_v2(uuid,uuid,text,text,text,uuid,uuid)
  from public,anon,authenticated,service_role;
alter table mensageria_hml_auditoria_interna.decisoes
  add constraint auditoria_v3_vinculo_operacao unique(
    id,operador_id,chave_idempotencia,tentativa_id,versao,categoria,decisao,motivo),
  add constraint auditoria_v3_predecessor_versao unique(tentativa_id,id,versao);
create table mensageria_hml_auditoria_interna.operacoes (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  operador_id uuid not null,
  tentativa_id uuid not null references public.mensageria_hml_respostas_tentativas(id) on delete restrict,
  predecessor_id uuid,
  preparo_anterior_id uuid,
  ordem_preparo integer not null check(ordem_preparo>0),
  versao_esperada integer not null check(versao_esperada>0),
  -- Versao do predecessor e ordem anterior derivadas, nao fornecidas pelo cliente.
  versao_predecessor integer generated always as (versao_esperada-1) stored,
  ordem_preparo_anterior integer generated always as (ordem_preparo-1) stored,
  categoria text not null check(categoria in ('reserva_antiga','resultado_indeterminado','status_contraditorio',
    'status_falhou','aceite_sem_status','entrega_sem_confirmacao')),
  decisao text not null check(decisao in ('manter_em_investigacao','solicitar_verificacao_externa','registrar_revisao_sem_reenvio')),
  motivo text not null check(motivo in ('evidencia_insuficiente','status_inconsistente','identificador_ausente',
    'aguardando_evidencia','revisao_realizada')),
  chave_idempotencia uuid not null default pg_catalog.gen_random_uuid(),
  estado text not null default 'preparada' check(estado in ('preparada','registrada','rejeitada','cancelada')),
  evento_id uuid unique,
  rejeicao text check(rejeicao in ('predecessor_desatualizado','categoria_desatualizada','caso_nao_elegivel')),
  preparada_em timestamptz not null default pg_catalog.clock_timestamp(),
  encerrada_em timestamptz,
  unique(operador_id,chave_idempotencia),
  constraint auditoria_v3_preparo_referencia unique(
    id,operador_id,tentativa_id,versao_esperada,ordem_preparo),
  constraint auditoria_v3_ids_distintos check(id<>chave_idempotencia),
  unique nulls not distinct(operador_id,tentativa_id,predecessor_id,ordem_preparo),
  unique nulls not distinct(operador_id,tentativa_id,predecessor_id,preparo_anterior_id),
  check((ordem_preparo=1)=(preparo_anterior_id is null)),
  check(preparo_anterior_id is distinct from id),
  -- A versao esperada identifica a cadeia porque o predecessor abaixo
  -- deve corresponder a versao imediatamente anterior da mesma tentativa.
  -- Na raiz, versao 1 exige predecessor nulo; os demais nao podem ser nulos.
  constraint auditoria_v3_preparo_mesma_cadeia_fk
    foreign key(preparo_anterior_id,operador_id,tentativa_id,versao_esperada,ordem_preparo_anterior)
    references mensageria_hml_auditoria_interna.operacoes(
      id,operador_id,tentativa_id,versao_esperada,ordem_preparo) on delete restrict,
  check((versao_esperada=1)=(predecessor_id is null)),
  check((estado='registrada')=(evento_id is not null)),
  check((estado='rejeitada')=(rejeicao is not null)),
  check((estado='preparada')=(encerrada_em is null)),
  constraint auditoria_v3_predecessor_versao_fk
    foreign key(tentativa_id,predecessor_id,versao_predecessor)
    references mensageria_hml_auditoria_interna.decisoes(tentativa_id,id,versao) on delete restrict,
  -- Evento nulo enquanto nao registrada; quando registrado, todos os
  -- demais campos sao NOT NULL e o vinculo exige versao e intencao exatas.
  constraint auditoria_v3_recibo_exato_fk
    foreign key(evento_id,operador_id,chave_idempotencia,tentativa_id,versao_esperada,categoria,decisao,motivo)
    references mensageria_hml_auditoria_interna.decisoes(
      id,operador_id,chave_idempotencia,tentativa_id,versao,categoria,decisao,motivo) on delete restrict
);
-- Uma intencao ativa ou registrada por operador/revisao logica. Cancelar ou
-- rejeitar definitivamente libera nova preparacao deliberada; nao apaga nada.
create unique index auditoria_v3_intencao_unica
  on mensageria_hml_auditoria_interna.operacoes(operador_id,tentativa_id,predecessor_id)
  nulls not distinct where estado in ('preparada','registrada');
create index auditoria_v3_operador_indice on mensageria_hml_auditoria_interna.operacoes(operador_id,id);
alter table mensageria_hml_auditoria_interna.operacoes enable row level security;
revoke all on mensageria_hml_auditoria_interna.operacoes from public,anon,authenticated,service_role;

-- Projecao interna. Somente chamadores autorizados e com filtro de operador.
create function mensageria_hml_auditoria_interna.projetar_operacao(p_id uuid,p_operador uuid)
returns jsonb language sql stable security invoker set search_path=pg_catalog as $fn$
  select jsonb_build_object(
    'operacao_id',o.id,'tentativa_id',o.tentativa_id,'predecessor_id',o.predecessor_id,
    'preparo_anterior_id',o.preparo_anterior_id,'ordem_preparo',o.ordem_preparo,
    'versao_esperada',o.versao_esperada,'categoria',o.categoria,'decisao',o.decisao,'motivo',o.motivo,
    'estado',o.estado,'preparada_em',o.preparada_em,'encerrada_em',o.encerrada_em,'rejeicao',o.rejeicao,
    'recibo',case when d.id is null then null else jsonb_build_object(
      'status','registrado','evento_id',d.id,'tentativa_id',d.tentativa_id,
      'predecessor_id',d.predecessor_id,'versao',d.versao,'categoria',d.categoria,
      'decisao',d.decisao,'motivo',d.motivo,'registrado_em',d.registrado_em,
      'reenvio_automatico_autorizado',false) end)
  from mensageria_hml_auditoria_interna.operacoes o
  left join mensageria_hml_auditoria_interna.decisoes d
    on d.id=o.evento_id and d.operador_id=o.operador_id and d.chave_idempotencia=o.chave_idempotencia
    and d.tentativa_id=o.tentativa_id
  where o.id=p_id and o.operador_id=p_operador;
$fn$;
revoke all on function mensageria_hml_auditoria_interna.projetar_operacao(uuid,uuid)
  from public,anon,authenticated,service_role;

create function public.mensageria_hml_preparar_operacao_auditoria_v3(
  p_operador uuid,p_tentativa uuid,p_categoria text,p_decisao text,p_motivo text,p_predecessor uuid,
  p_preparo_anterior uuid
) returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $fn$
declare
  o mensageria_hml_auditoria_interna.operacoes%rowtype;
  anterior mensageria_hml_auditoria_interna.operacoes%rowtype;
  v_head uuid;
  v_versao integer;
  v_categoria text;
  v_status text:='preparada';
begin
  if not mensageria_hml_auditoria_interna.operador_valido(p_operador) then
    return jsonb_build_object('status','nao_autorizado','reenvio_automatico_autorizado',false);
  end if;
  if p_tentativa is null or p_categoria is null or p_categoria not in ('reserva_antiga','resultado_indeterminado',
      'status_contraditorio','status_falhou','aceite_sem_status','entrega_sem_confirmacao')
    or p_decisao is null or p_decisao not in ('manter_em_investigacao','solicitar_verificacao_externa','registrar_revisao_sem_reenvio')
    or p_motivo is null or p_motivo not in ('evidencia_insuficiente','status_inconsistente','identificador_ausente','aguardando_evidencia','revisao_realizada') then
    return jsonb_build_object('status','entrada_invalida','reenvio_automatico_autorizado',false);
  end if;
  if current_setting('transaction_isolation')<>'read committed' then
    return jsonb_build_object('status','isolamento_invalido','reenvio_automatico_autorizado',false);
  end if;
  -- Serializa preparacoes para operador/tentativa. Nao toma locks v2.
  perform pg_advisory_xact_lock(202611243,hashtext(p_operador::text||':'||p_tentativa::text));
  select x.* into o from mensageria_hml_auditoria_interna.operacoes x
    where x.operador_id=p_operador and x.tentativa_id=p_tentativa
      and x.predecessor_id is not distinct from p_predecessor
      and x.preparo_anterior_id is not distinct from p_preparo_anterior for update;
  if not mensageria_hml_auditoria_interna.operador_valido(p_operador) then
    return jsonb_build_object('status','nao_autorizado','reenvio_automatico_autorizado',false);
  end if;
  if o.id is not null then
    v_status:=case when (o.categoria,o.decisao,o.motivo) is distinct from (p_categoria,p_decisao,p_motivo)
      then 'conflito_operacao' else 'operacao_existente' end;
  else
    -- Nova preparacao apos cancelamento/rejeicao exige referencia explicita
    -- ao ultimo preparo terminal. Repeticao atrasada recupera o anterior.
    select x.* into anterior from mensageria_hml_auditoria_interna.operacoes x
      where x.operador_id=p_operador and x.tentativa_id=p_tentativa
        and x.predecessor_id is not distinct from p_predecessor
      order by x.ordem_preparo desc limit 1 for update;
    if not mensageria_hml_auditoria_interna.operador_valido(p_operador) then
      return jsonb_build_object('status','nao_autorizado','reenvio_automatico_autorizado',false);
    end if;
    if anterior.id is distinct from p_preparo_anterior or
       (anterior.id is not null and anterior.estado not in ('cancelada','rejeitada')) then
      return jsonb_build_object('status','preparo_desatualizado','reenvio_automatico_autorizado',false);
    end if;
    select d.id,d.versao into v_head,v_versao from mensageria_hml_auditoria_interna.decisoes d
      where d.tentativa_id=p_tentativa order by d.versao desc limit 1;
    if v_head is distinct from p_predecessor then
      return jsonb_build_object('status','predecessor_desatualizado','reenvio_automatico_autorizado',false);
    end if;
    select c.categoria into v_categoria from mensageria_hml_auditoria_interna.classificar(p_tentativa) c;
    if not found then return jsonb_build_object('status','caso_nao_elegivel','reenvio_automatico_autorizado',false); end if;
    if v_categoria is distinct from p_categoria then
      return jsonb_build_object('status','categoria_desatualizada','reenvio_automatico_autorizado',false);
    end if;
    insert into mensageria_hml_auditoria_interna.operacoes
      (operador_id,tentativa_id,predecessor_id,preparo_anterior_id,ordem_preparo,versao_esperada,categoria,decisao,motivo)
      values(p_operador,p_tentativa,p_predecessor,p_preparo_anterior,coalesce(anterior.ordem_preparo,0)+1,
        coalesce(v_versao,0)+1,p_categoria,p_decisao,p_motivo)
      returning * into o;
  end if;
  return jsonb_build_object('status',v_status,'operacao',
    mensageria_hml_auditoria_interna.projetar_operacao(o.id,p_operador),'reenvio_automatico_autorizado',false);
end;
$fn$;

create function public.mensageria_hml_confirmar_operacao_auditoria_v3(
  p_operador uuid,p_operacao uuid,p_confirmar boolean
) returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $fn$
declare
  o mensageria_hml_auditoria_interna.operacoes%rowtype;
  d mensageria_hml_auditoria_interna.decisoes%rowtype;
  r jsonb;
  v_status text;
begin
  if not mensageria_hml_auditoria_interna.operador_valido(p_operador) then
    return jsonb_build_object('status','nao_autorizado','reenvio_automatico_autorizado',false);
  end if;
  if p_operacao is null or p_confirmar is distinct from true then
    return jsonb_build_object('status','entrada_invalida','reenvio_automatico_autorizado',false);
  end if;
  if current_setting('transaction_isolation')<>'read committed' then
    return jsonb_build_object('status','isolamento_invalido','reenvio_automatico_autorizado',false);
  end if;
  select x.* into o from mensageria_hml_auditoria_interna.operacoes x
    where x.id=p_operacao and x.operador_id=p_operador for update;
  if not mensageria_hml_auditoria_interna.operador_valido(p_operador) then
    return jsonb_build_object('status','nao_autorizado','reenvio_automatico_autorizado',false);
  end if;
  if o.id is null then return jsonb_build_object('status','operacao_nao_encontrada','reenvio_automatico_autorizado',false); end if;
  if o.estado='preparada' then
    r:=public.mensageria_hml_registrar_decisao_auditoria_v2(
      p_operador,o.tentativa_id,o.categoria,o.decisao,o.motivo,o.chave_idempotencia,o.predecessor_id);
    if r->>'status' in ('registrado','ja_registrado') and r->'reenvio_automatico_autorizado'='false'::jsonb then
      select x.* into d from mensageria_hml_auditoria_interna.decisoes x
        where x.operador_id=o.operador_id and x.chave_idempotencia=o.chave_idempotencia;
      if d.id is null or (d.tentativa_id,d.predecessor_id,d.versao,d.categoria,d.decisao,d.motivo)
        is distinct from (o.tentativa_id,o.predecessor_id,o.versao_esperada,o.categoria,o.decisao,o.motivo)
        or r->>'evento_id' is distinct from d.id::text then
        raise exception 'RECIBO_NAO_CORRELACIONADO';
      end if;
      update mensageria_hml_auditoria_interna.operacoes set estado='registrada',evento_id=d.id,
        encerrada_em=clock_timestamp() where id=o.id;
      v_status:='registrada';
    elsif r->>'status' in ('predecessor_desatualizado','categoria_desatualizada','caso_nao_elegivel')
      and r->'reenvio_automatico_autorizado'='false'::jsonb then
      update mensageria_hml_auditoria_interna.operacoes set estado='rejeitada',rejeicao=r->>'status',
        encerrada_em=clock_timestamp() where id=o.id;
      v_status:='rejeitada';
    elsif r->>'status'='nao_autorizado' then
      return jsonb_build_object('status','nao_autorizado','reenvio_automatico_autorizado',false);
    else
      -- Rollback conjunto da decisao e transicao em falhas inesperadas.
      raise exception 'OPERACAO_NAO_VERIFICADA';
    end if;
  else
    v_status:='operacao_existente';
  end if;
  return jsonb_build_object('status',v_status,'operacao',
    mensageria_hml_auditoria_interna.projetar_operacao(o.id,p_operador),'reenvio_automatico_autorizado',false);
end;
$fn$;

create function public.mensageria_hml_cancelar_operacao_auditoria_v3(
  p_operador uuid,p_operacao uuid,p_confirmar boolean
) returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $fn$
declare o mensageria_hml_auditoria_interna.operacoes%rowtype; v_status text:='operacao_existente';
begin
  if not mensageria_hml_auditoria_interna.operador_valido(p_operador) then
    return jsonb_build_object('status','nao_autorizado','reenvio_automatico_autorizado',false);
  end if;
  if p_operacao is null or p_confirmar is distinct from true then
    return jsonb_build_object('status','entrada_invalida','reenvio_automatico_autorizado',false);
  end if;
  if current_setting('transaction_isolation')<>'read committed' then
    return jsonb_build_object('status','isolamento_invalido','reenvio_automatico_autorizado',false);
  end if;
  select x.* into o from mensageria_hml_auditoria_interna.operacoes x
    where x.id=p_operacao and x.operador_id=p_operador for update;
  if not mensageria_hml_auditoria_interna.operador_valido(p_operador) then
    return jsonb_build_object('status','nao_autorizado','reenvio_automatico_autorizado',false);
  end if;
  if o.id is null then return jsonb_build_object('status','operacao_nao_encontrada','reenvio_automatico_autorizado',false); end if;
  if o.estado='preparada' then
    update mensageria_hml_auditoria_interna.operacoes set estado='cancelada',encerrada_em=clock_timestamp() where id=o.id;
    v_status:='cancelada';
  end if;
  return jsonb_build_object('status',v_status,'operacao',
    mensageria_hml_auditoria_interna.projetar_operacao(o.id,p_operador),'reenvio_automatico_autorizado',false);
end;
$fn$;

create function public.mensageria_hml_consultar_operacao_auditoria_v3(p_operador uuid,p_operacao uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $fn$
declare v jsonb;
begin
  if not mensageria_hml_auditoria_interna.operador_valido(p_operador) then
    return jsonb_build_object('status','nao_autorizado','reenvio_automatico_autorizado',false);
  end if;
  if p_operacao is null then return jsonb_build_object('status','entrada_invalida','reenvio_automatico_autorizado',false); end if;
  v:=mensageria_hml_auditoria_interna.projetar_operacao(p_operacao,p_operador);
  if v is null then return jsonb_build_object('status','operacao_nao_encontrada','reenvio_automatico_autorizado',false); end if;
  return jsonb_build_object('status','ok','operacao',v,'reenvio_automatico_autorizado',false);
end;
$fn$;

create function public.mensageria_hml_listar_operacoes_auditoria_v3(
  p_operador uuid,p_tentativa uuid default null,p_limite integer default 20,p_depois uuid default null
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $fn$
declare v jsonb; v_ultimo uuid;
begin
  if not mensageria_hml_auditoria_interna.operador_valido(p_operador) then
    return jsonb_build_object('status','nao_autorizado','reenvio_automatico_autorizado',false);
  end if;
  if p_limite is null or p_limite not between 1 and 20 then
    return jsonb_build_object('status','entrada_invalida','reenvio_automatico_autorizado',false);
  end if;
  select coalesce(jsonb_agg(mensageria_hml_auditoria_interna.projetar_operacao(x.id,p_operador)
    order by x.id),'[]'::jsonb) into v from (
    select o.id from mensageria_hml_auditoria_interna.operacoes o
    where o.operador_id=p_operador and (p_tentativa is null or o.tentativa_id=p_tentativa)
      and (p_depois is null or o.id>p_depois) order by o.id limit p_limite
  ) x;
  if jsonb_array_length(v)>0 then
    v_ultimo:=(v->(jsonb_array_length(v)-1)->>'operacao_id')::uuid;
    if not exists(select 1 from mensageria_hml_auditoria_interna.operacoes o
      where o.operador_id=p_operador and (p_tentativa is null or o.tentativa_id=p_tentativa)
        and o.id>v_ultimo) then v_ultimo:=null; end if;
  end if;
  return jsonb_build_object('status','ok','operacoes',v,'quantidade',jsonb_array_length(v),
    'proximo_depois',v_ultimo,'reenvio_automatico_autorizado',false);
end;
$fn$;

revoke all on function public.mensageria_hml_preparar_operacao_auditoria_v3(uuid,uuid,text,text,text,uuid,uuid),
  public.mensageria_hml_confirmar_operacao_auditoria_v3(uuid,uuid,boolean),
  public.mensageria_hml_cancelar_operacao_auditoria_v3(uuid,uuid,boolean),
  public.mensageria_hml_consultar_operacao_auditoria_v3(uuid,uuid),
  public.mensageria_hml_listar_operacoes_auditoria_v3(uuid,uuid,integer,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.mensageria_hml_preparar_operacao_auditoria_v3(uuid,uuid,text,text,text,uuid,uuid),
  public.mensageria_hml_confirmar_operacao_auditoria_v3(uuid,uuid,boolean),
  public.mensageria_hml_cancelar_operacao_auditoria_v3(uuid,uuid,boolean),
  public.mensageria_hml_consultar_operacao_auditoria_v3(uuid,uuid),
  public.mensageria_hml_listar_operacoes_auditoria_v3(uuid,uuid,integer,uuid)
  to service_role;
